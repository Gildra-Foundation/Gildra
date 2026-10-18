type Phase = "freezing" | "cracking" | "shattering";
type Program = { phases: { phase: Phase; duration: number }[]; token: number; phase: (value: Phase) => void; complete: () => void };

export const FEL_SEED_MS = 300;
export const FEL_HOLD_MS = 220;
export const FEL_RELEASE_MS = 1080;
let renderer: Worker | undefined, unavailable = false, sequence = 0;
let idle: ReturnType<typeof setTimeout> | undefined;

function worker() {
  clearTimeout(idle);
  if (unavailable || typeof Worker === "undefined" || !HTMLCanvasElement.prototype.transferControlToOffscreen) return;
  try { return renderer ??= new Worker("/assets/motion/fel-renderer-v1.js"); }
  catch { unavailable = true; return; }
}
function rest() {
  clearTimeout(idle);
  idle = setTimeout(() => { renderer?.terminate(); renderer = undefined; }, 60000);
}
export function warmFelMaterial() {
  const engine = worker();
  if (!engine) return false;
  engine.postMessage({ type: "warm", width: innerWidth, height: innerHeight });
  rest(); return true;
}

/** A single page bitmap and a small corrosion field, never a DOM node per pit. */
export function felMaterial(width: number, height: number) {
  const canvas = document.createElement("canvas"), scale = Math.min(1, 1024 / Math.max(width, height));
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  canvas.dataset.felSurface = "";
  const engine = worker(), id = ++sequence;
  canvas.dataset.renderer = engine ? "worker" : "fallback";
  let ready = false, disposed = false, failed = !engine, token = 0, program: Program | undefined;
  let readyTimeout: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    if (ready && program && !disposed && !failed) engine?.postMessage({ type: "play", id, token: program.token, phases: program.phases });
  };
  const fallback = () => {
    if (disposed || failed) return;
    failed = unavailable = true;
    clearTimeout(readyTimeout);
    engine?.terminate();
    if (renderer === engine) renderer = undefined;
    canvas.dataset.renderer = "fallback";
    delete canvas.dataset.pageContent;
    // A missing worker never prevents routing; the outgoing DOM uses its
    // inexpensive CSS dissolve instead. Never rasterise it on the UI thread.
    const complete = program?.complete; program = undefined; complete?.();
  };
  const failure = (event: Event) => { event.preventDefault(); fallback(); };
  const receive = ({ data }: MessageEvent) => {
    if (data.id !== id || disposed || failed) return;
    if (data.type === "failed") fallback();
    if (data.type === "ready") { clearTimeout(readyTimeout); ready = true; start(); }
    if (data.type === "content") canvas.dataset.pageContent = "ready";
    if (data.type === "painted") {
      if (canvas.dataset.renderPhase !== data.phase) {
        canvas.dataset.renderPhase = data.phase; program?.phase(data.phase);
      }
      canvas.dataset.renderProgress = String(data.progress);
    }
    if (data.type === "complete" && program && program.token === data.token) {
      const complete = program.complete; program = undefined; complete();
    }
  };
  if (engine) {
    engine.addEventListener("message", receive); engine.addEventListener("error", failure);
    try {
      const surface = canvas.transferControlToOffscreen();
      engine.postMessage({ type: "init", id, canvas: surface, width, height }, [surface]);
      readyTimeout = setTimeout(fallback, 1500);
    } catch { fallback(); }
  }
  return {
    get canvas() { return canvas; },
    content(bitmap: ImageBitmap) {
      if (!engine || failed || disposed) { bitmap.close(); return false; }
      try { engine.postMessage({ type: "content", id, bitmap }, [bitmap]); return true; }
      catch { bitmap.close(); return false; }
    },
    // Only the ice fallback needs UI-driven frames. Fel's CSS fallback does
    // not allocate a replacement canvas or perform any pixel work here.
    draw(_phase: Phase, _progress: number) {},
    play(phases: Program["phases"], phase: Program["phase"], complete: Program["complete"]) {
      if (!engine || failed || disposed) return false;
      program = { phases, phase, complete, token: ++token }; start(); return true;
    },
    dispose() {
      disposed = true; program = undefined; clearTimeout(readyTimeout);
      if (engine) {
        engine.postMessage({ type: "dispose", id });
        engine.removeEventListener("message", receive); engine.removeEventListener("error", failure);
      }
      rest();
    },
  };
}
