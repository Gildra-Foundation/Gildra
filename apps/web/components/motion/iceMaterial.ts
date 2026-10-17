import type { iceFracture } from "./iceFracture";

type Phase = "freezing" | "cracking" | "shattering";
type Frame = { phase: Phase; progress: number };
let renderer: Worker | undefined;
let unavailable = false;
let idle: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

function worker() {
  if (unavailable || typeof Worker === "undefined" || !HTMLCanvasElement.prototype.transferControlToOffscreen) return;
  clearTimeout(idle);
  try { return renderer ??= new Worker("/assets/motion/ice-renderer-v6.js"); }
  catch { unavailable = true; return; }
}

/** Material is prepared away from the UI thread, after critical loading. */
export function warmIceMaterial() {
  worker()?.postMessage({ type: "warm", width: innerWidth, height: innerHeight });
  clearTimeout(idle);
  idle = setTimeout(() => { renderer?.terminate(); renderer = undefined; }, 60000);
}

/** One canvas and at most one queued worker frame, regardless of shard count. */
export function iceMaterial(width: number, height: number, geometry: ReturnType<typeof iceFracture>) {
  let canvas = document.createElement("canvas");
  const scale = Math.min(1, 1024 / Math.max(width, height));
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  canvas.dataset.iceSurface = "";
  const id = ++sequence, engine = worker();
  canvas.dataset.renderer = engine ? "worker" : "fallback";
  let ready = false, busy = false, disposed = false, latest: Frame | undefined, lastRequested: Frame | undefined;
  let program: { phases: { phase: Phase; duration: number }[]; token: number; phase: (value: Phase) => void; complete: () => void } | undefined;
  let playSequence = 0;
  const startProgram = () => {
    if (engine && ready && program && !disposed && !fallback) {
      engine.postMessage({ type: "play", id, phases: program.phases, token: program.token });
    }
  };
  let fallback: CanvasRenderingContext2D | null = null;
  const fallbackFrame = ({ phase, progress }: Frame) => {
    if (!fallback) return;
    fallback.clearRect(0, 0, canvas.width, canvas.height);
    const shade = fallback.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2);
    shade.addColorStop(0, "rgba(183,222,240,.25)"); shade.addColorStop(1, "rgba(228,246,255,.85)");
    fallback.globalAlpha = phase === "freezing" ? progress : phase === "shattering" ? 1 - progress : 1;
    fallback.fillStyle = shade; fallback.fillRect(0, 0, canvas.width, canvas.height);
    if (phase !== "freezing") {
      fallback.save(); fallback.scale(scale, scale); fallback.strokeStyle = "#e7faff"; fallback.lineWidth = 1;
      for (const { points } of geometry.cracks) { fallback.beginPath(); points.forEach(([x, y], i) => i ? fallback!.lineTo(x, y) : fallback!.moveTo(x, y)); fallback.stroke(); }
      fallback.restore();
    }
    canvas.dataset.renderPhase = phase; canvas.dataset.renderProgress = String(progress);
  };
  const activateFallback = () => {
    if (disposed || fallback) return;
    unavailable = true;
    if (engine) {
      const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(replacement); canvas = replacement;
    }
    canvas.dataset.renderer = "fallback";
    delete canvas.dataset.pageContent;
    fallback = canvas.getContext("2d");
    if (lastRequested) fallbackFrame(lastRequested);
    if (program) { const complete = program.complete; program = undefined; complete(); }
  };
  const failure = (event: Event) => { event.preventDefault(); activateFallback(); };
  const flush = () => {
    if (!latest || disposed) return;
    if (fallback) { fallbackFrame(latest); return; }
    if (!engine || !ready || busy) return;
    busy = true;
    const frame = latest; latest = undefined;
    engine.postMessage({ type: "frame", id, ...frame });
  };
  const receive = ({ data }: MessageEvent) => {
    if (data.id !== id || disposed) return;
    if (data.type === "failed") { activateFallback(); return; }
    if (data.type === "content") canvas.dataset.pageContent = "ready";
    if (data.type === "ready") { ready = true; startProgram(); }
    if (data.type === "painted") {
      busy = false;
      if (canvas.dataset.renderPhase !== data.phase) { canvas.dataset.renderPhase = data.phase; program?.phase(data.phase); }
      canvas.dataset.renderProgress = String(data.progress);
    }
    if (data.type === "complete" && program && program.token === data.token) { const complete = program.complete; program = undefined; complete(); }
    flush();
  };
  if (engine) {
    engine.addEventListener("message", receive); engine.addEventListener("error", failure);
    try { const offscreen = canvas.transferControlToOffscreen(); engine.postMessage({ type: "init", id, canvas: offscreen, width, height, geometry }, [offscreen]); }
    catch { activateFallback(); }
  } else activateFallback();
  return {
    get canvas() { return canvas; },
    content(bitmap: ImageBitmap) {
      if (disposed || !engine || fallback) { bitmap.close(); return false; }
      try { engine.postMessage({ type: "content", id, bitmap }, [bitmap]); return true; }
      catch { bitmap.close(); return false; }
    },
    draw(phase: Phase, progress: number) { lastRequested = latest = { phase, progress }; flush(); },
    play(phases: { phase: Phase; duration: number }[], phase: (value: Phase) => void, complete: () => void) {
      if (!engine || fallback || disposed) return false;
      latest = undefined; busy = false;
      program = { phases, token: ++playSequence, phase, complete };
      startProgram(); return true;
    },
    dispose() {
      disposed = true; latest = undefined; lastRequested = undefined; program = undefined;
      if (engine) { engine.postMessage({ type: "dispose", id }); engine.removeEventListener("message", receive); engine.removeEventListener("error", failure); }
      clearTimeout(idle); idle = setTimeout(() => { renderer?.terminate(); renderer = undefined; }, 60000);
    },
  };
}
