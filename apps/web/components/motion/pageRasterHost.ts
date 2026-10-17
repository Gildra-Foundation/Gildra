type Job = { resolve: (bitmap: ImageBitmap) => void; reject: (reason: Error) => void; cleanup: () => void };
let helper: ReturnType<typeof createHelper> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;
let unsupported = false;
const cancelled = () => new DOMException("Cancelled", "AbortError");

function createHelper() {
  const frame = document.createElement("iframe"), channel = new MessageChannel(), jobs = new Map<number, Job>();
  frame.src = "/assets/motion/page-raster-v1.html";
  frame.sandbox.add("allow-scripts"); frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1; frame.inert = true;
  frame.dataset.pageRasterHelper = "";
  frame.style.cssText = "position:fixed;width:1px;height:1px;left:-100px;top:-100px;border:0;visibility:hidden;pointer-events:none";
  let resolveReady: () => void, rejectReady: (error: Error) => void, disposed = false, beginLatency = Infinity, probes = 0;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const timeout = setTimeout(() => destroy(new Error("raster helper unavailable")), 1200);
  const destroy = (reason: Error = cancelled()) => {
    if (disposed) return; disposed = true; clearTimeout(timeout); frame.remove(); channel.port1.close();
    rejectReady(reason);
    for (const job of jobs.values()) { job.cleanup(); job.reject(reason); } jobs.clear();
    if (helper?.frame === frame) helper = undefined;
  };
  frame.onload = () => frame.contentWindow?.postMessage("gildra-page-raster-v1", "*", [channel.port2]);
  channel.port1.onmessage = ({ data }) => {
    if (disposed) { data.bitmap?.close(); return; }
    const probe = () => { probes++; channel.port1.postMessage({ type:"probe" }); };
    if (data.type === "connected") requestAnimationFrame(() => setTimeout(probe, 0));
    if (data.type === "probe-begin") beginLatency = performance.timeOrigin + performance.now() - data.epoch;
    if (data.type === "probe-end") {
      if (data.duration < 4 || beginLatency < -2 || beginLatency > data.duration * .85) {
        if (probes < 3) { setTimeout(probe, 30); return; }
        unsupported = true; destroy(new Error(`parallel raster unavailable (${Math.round(beginLatency)}/${Math.round(data.duration)}ms)`)); return;
      }
      clearTimeout(timeout); frame.dataset.parallel = "true"; resolveReady();
    }
    if (data.type === "bitmap" || data.type === "failed") {
      const job = jobs.get(data.id);
      if (!job) { data.bitmap?.close(); return; }
      jobs.delete(data.id); job.cleanup();
      if (data.type === "bitmap") job.resolve(data.bitmap); else job.reject(new Error("raster unavailable"));
      rest();
    }
  };
  document.body.append(frame);
  return {
    frame, ready, destroy,
    async raster(svg: string, width: number, height: number, signal: AbortSignal) {
      await ready;
      if (disposed || signal.aborted) throw cancelled();
      clearTimeout(idle);
      return new Promise<ImageBitmap>((resolve, reject) => {
        const id = ++sequence, abort = () => destroy();
        jobs.set(id, { resolve, reject, cleanup: () => signal.removeEventListener("abort", abort) });
        signal.addEventListener("abort", abort, { once: true });
        channel.port1.postMessage({ type:"raster", id, svg, width, height });
      });
    },
  };
}
function rest() { clearTimeout(idle); idle = setTimeout(() => helper?.destroy(), 15000); }
function getHelper() {
  if (unsupported) throw new Error("parallel raster unavailable");
  clearTimeout(idle); return helper ??= createHelper();
}
/** Warm after critical loading, only for Arthas with motion enabled. */
export function warmPageRaster() {
  try { void getHelper().ready.then(rest).catch(() => {}); } catch { /* Use the lightweight ice fallback. */ }
}
export async function rasterHostReady() { await getHelper().ready; rest(); }
export function renderPageRaster(svg: string, width: number, height: number, signal: AbortSignal) {
  return getHelper().raster(svg, width, height, signal);
}
