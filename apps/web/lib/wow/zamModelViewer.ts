import $ from "jquery";

/** Renderer state the Wowhead viewer exposes; camera fields are read and written live. */
export type WowRenderer = {
  distance: number;
  zenith: number;
  azimuth: number;
  actors?: Array<{ setAnimPaused?: (paused: boolean) => void }>;
  downloads?: Record<string, unknown>;
  progressShown?: boolean;
};
export type WowViewer = { renderer: WowRenderer | null; destroy?: () => void };
type WowViewerConstructor = new (options: Record<string, unknown>) => WowViewer;

declare global {
  interface Window {
    $: JQueryStatic;
    jQuery: JQueryStatic;
    WH?: Record<string, unknown>;
    ZamModelViewer?: WowViewerConstructor;
  }
}

/** Model types understood by `ZamModelViewer` (`models.type`). */
export const ZAM_MODEL_TYPE = { item: 1, npc: 8, character: 16 } as const;

const VIEWER_SCRIPT = "https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js";
/** Same-origin proxy of wow.zamimg.com/modelviewer/live/ (app/api/wow-model). */
export const ZAM_CONTENT_PATH = "/api/wow-model/";
let viewerScriptPromise: Promise<void> | null = null;

export function loadZamViewerScript() {
  if (window.ZamModelViewer) return Promise.resolve();
  if (viewerScriptPromise) return viewerScriptPromise;
  viewerScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${VIEWER_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("viewer script unavailable")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = VIEWER_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("viewer script unavailable"));
    document.head.appendChild(script);
  });
  viewerScriptPromise.catch(() => { viewerScriptPromise = null; });
  return viewerScriptPromise;
}

/**
 * A dynamic import("jquery") was tried and reverted: the production chunk loader
 * held the boot for ~10 s, and jQuery already ships in the studio's chunk.
 */
export async function configureZamViewerGlobals() {
  window.$ = $;
  window.jQuery = $;
  window.WH = {
    ...(window.WH ?? {}),
    debug: () => undefined,
    defaultAnimation: "Stand",
    WebP: { getImageExtension: () => ".webp" },
    Wow: { Item: {} },
  };
}

export function createZamViewer(container: HTMLElement, options: Record<string, unknown>) {
  if (!window.ZamModelViewer) throw new Error("viewer script not loaded");
  installFrameGate();
  const gate: LoopGate = { loop: null, parked: null, visible: true, activeUntil: 0, holds: 0, stillAllowed: false, cleanup: () => undefined };
  capturing = gate;
  let viewer: WowViewer;
  try {
    viewer = new window.ZamModelViewer({ type: 2, contentPath: ZAM_CONTENT_PATH, container: $(container), ...options });
  } finally {
    capturing = null;
  }
  if (gate.loop) watchLoop(viewer, gate, container);
  return viewer;
}

/**
 * Render-loop gate. The viewer draws every animation frame for as long as it
 * exists (58 fps with the model standing still, also scrolled out of view).
 * Its loop re-arms itself through window.requestAnimationFrame, so the gate
 * recognises that callback (the one armed inside the constructor) and:
 * - parks it while the stage is off screen;
 * - halves the rate (30 fps) once nobody has touched the page for a while;
 * - parks it when the pose is paused and nothing is loading (a still picture).
 * Any pointer, wheel or key input, a model request or holdViewerLoop() wakes it.
 */
type LoopGate = {
  loop: FrameRequestCallback | null;
  parked: FrameRequestCallback | null;
  visible: boolean;
  activeUntil: number;
  holds: number;
  /** The pose is paused: the picture may freeze once the stage is quiet. */
  stillAllowed: boolean;
  cleanup: () => void;
};
const ACTIVE_MS = 2_500;
const gates = new Map<FrameRequestCallback, LoopGate>();
const viewerGates = new WeakMap<WowViewer, LoopGate>();
let capturing: LoopGate | null = null;
let nativeFrame: ((callback: FrameRequestCallback) => number) | null = null;

function installFrameGate() {
  if (nativeFrame) return;
  const native = window.requestAnimationFrame.bind(window);
  nativeFrame = native;
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    if (capturing && !capturing.loop) {
      capturing.loop = callback;
      gates.set(callback, capturing);
    }
    const gate = gates.get(callback);
    if (!gate) return native(callback);
    const mode = loopMode(gate);
    if (mode === "stop") {
      gate.parked = callback;
      return 0;
    }
    return mode === "slow" ? native(() => { native(callback); }) : native(callback);
  };
}

function loopMode(gate: LoopGate): "run" | "slow" | "stop" {
  if (!gate.visible) return "stop";
  if (gate.holds > 0 || Date.now() < gate.activeUntil || zamRequestsInFlight() > 0) return "run";
  return gate.stillAllowed ? "stop" : "slow";
}

function resumeLoop(gate: LoopGate) {
  const parked = gate.parked;
  if (!parked || !nativeFrame || loopMode(gate) === "stop") return;
  gate.parked = null;
  nativeFrame(parked);
}

function wakeLoop(gate: LoopGate) {
  gate.activeUntil = Date.now() + ACTIVE_MS;
  resumeLoop(gate);
}

function watchLoop(viewer: WowViewer, gate: LoopGate, container: HTMLElement) {
  const loop = gate.loop as FrameRequestCallback;
  viewerGates.set(viewer, gate);
  const wake = () => wakeLoop(gate);
  const stage = container.parentElement ?? container;
  const options = { capture: true, passive: true } as const;
  document.addEventListener("pointerdown", wake, options);
  document.addEventListener("keydown", wake, options);
  document.addEventListener("wheel", wake, options);
  stage.addEventListener("pointermove", wake, options);
  let observer: IntersectionObserver | null = null;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(([entry]) => {
      gate.visible = Boolean(entry?.isIntersecting);
      if (gate.visible) wake();
    }, { rootMargin: "120px 0px" });
    observer.observe(container);
  }
  gate.cleanup = () => {
    document.removeEventListener("pointerdown", wake, options);
    document.removeEventListener("keydown", wake, options);
    document.removeEventListener("wheel", wake, options);
    stage.removeEventListener("pointermove", wake, options);
    observer?.disconnect();
    gates.delete(loop);
  };
  const destroy = viewer.destroy?.bind(viewer);
  viewer.destroy = () => {
    gate.cleanup();
    // A parked loop must run once more to see the viewer is gone.
    const parked = gate.parked;
    gate.parked = null;
    destroy?.();
    if (parked && nativeFrame) nativeFrame(parked);
  };
  wake();
}

/** Keeps the viewer drawing at full rate (model load, screenshot) until the returned release is called. */
export function holdViewerLoop(viewer: WowViewer | null) {
  const gate = viewer ? viewerGates.get(viewer) : undefined;
  if (!gate) return () => undefined;
  gate.holds += 1;
  resumeLoop(gate);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    gate.holds = Math.max(0, gate.holds - 1);
    wakeLoop(gate);
  };
}

/** Wakes the viewer after a change made from code (items, pose, camera, background). */
export function wakeViewerLoop(viewer: WowViewer | null) {
  const gate = viewer ? viewerGates.get(viewer) : undefined;
  if (gate) wakeLoop(gate);
}

/** With the pose paused the viewer may stop drawing once the stage is quiet. */
export function setViewerStill(viewer: WowViewer | null, still: boolean) {
  const gate = viewer ? viewerGates.get(viewer) : undefined;
  if (!gate) return;
  gate.stillAllowed = still;
  wakeLoop(gate);
}

type DownloadEntry = { loaded?: number; total?: number };
type RequestTracker = { pending: Map<string, number>; lastActivity: number };
let requestTracker: RequestTracker | null = null;

/**
 * The mannequin's skeleton and body (10–20 MB each) outgrow the HTTP cache of
 * many browsers (phones above all) and were downloaded again on every visit.
 * They are kept in Cache Storage instead; the newest few stay.
 */
const BIG_MODEL = /\/(skel\/\d+\.skel|m2\/\d+\.m2)$/;
const MODEL_CACHE = "gildra-wow-model-v1";
const MODEL_CACHE_ENTRIES = 12;
const BIG_BYTES = 1_500_000;

async function cachedModel(url: string, fetcher: () => Promise<Response>): Promise<Response> {
  const cache = await caches.open(MODEL_CACHE);
  const hit = await cache.match(url);
  if (hit) return hit;
  const response = await fetcher();
  const size = Number(response.headers.get("Content-Length") ?? 0);
  if (response.ok && (!size || size >= BIG_BYTES)) {
    void cache.put(url, response.clone()).then(async () => {
      const keys = await cache.keys();
      for (const stale of keys.slice(0, Math.max(0, keys.length - MODEL_CACHE_ENTRIES))) await cache.delete(stale);
    }).catch(() => undefined);
  }
  return response;
}

/**
 * Counts model-asset requests in flight. The viewer loads `.m2`/`.skel` with
 * `fetch` (no progress events) and the rest with XHR, so its own `downloads`
 * map misses big files. A request starts when fetch/XHR opens a
 * `ZAM_CONTENT_PATH` URL and ends with its Resource Timing entry (after the
 * body, also on 404). Installed once, pass-through for every other URL.
 */
function trackZamRequests() {
  if (requestTracker) return requestTracker;
  const tracker: RequestTracker = { pending: new Map(), lastActivity: Date.now() };
  requestTracker = tracker;
  const begin = (raw: string) => {
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith(ZAM_CONTENT_PATH)) return;
    tracker.pending.set(url.href, (tracker.pending.get(url.href) ?? 0) + 1);
    tracker.lastActivity = Date.now();
    // A model part on its way: parked loops draw again until it is in.
    for (const gate of gates.values()) resumeLoop(gate);
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let href = "";
    try { href = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href).href; } catch { /* not a URL we track */ }
    if (href && BIG_MODEL.test(href) && typeof caches !== "undefined" && (!init?.method || init.method === "GET")) {
      // A cache hit has no Resource Timing entry, so it is counted only when it goes to the network.
      return cachedModel(href, () => { begin(href); return nativeFetch(input, init); }).catch(() => { begin(href); return nativeFetch(input, init); });
    }
    try { if (href) begin(href); } catch { /* not a URL we track */ }
    return nativeFetch(input, init);
  };
  const nativeOpen = XMLHttpRequest.prototype.open as (this: XMLHttpRequest, ...args: unknown[]) => void;
  XMLHttpRequest.prototype.open = function open(this: XMLHttpRequest, ...args: unknown[]) {
    try { begin(String(args[1])); } catch { /* not a URL we track */ }
    return nativeOpen.apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const count = tracker.pending.get(entry.name);
      if (!count) continue;
      if (count > 1) tracker.pending.set(entry.name, count - 1);
      else tracker.pending.delete(entry.name);
      tracker.lastActivity = Date.now();
    }
  }).observe({ type: "resource" });
  return tracker;
}

/** Call before creating a viewer so its first requests are counted. */
export async function prepareZamViewer() {
  trackZamRequests();
  await configureZamViewerGlobals();
}

/** Model-asset requests in flight right now (items being swapped in). */
export function zamRequestsInFlight() {
  return requestTracker?.pending.size ?? 0;
}

/** Resolves once no model asset has been in flight for `quietMs` (or after `capMs`). */
export function waitForZamQuiet({ quietMs = 400, capMs = 120_000, isCancelled }: { quietMs?: number; capMs?: number; isCancelled?: () => boolean } = {}) {
  const tracker = trackZamRequests();
  return new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (isCancelled?.()) return resolve();
      const now = Date.now();
      if ((tracker.pending.size === 0 && now - tracker.lastActivity >= quietMs) || now - startedAt > capMs) return resolve();
      window.setTimeout(tick, 120);
    };
    window.setTimeout(tick, 120);
  });
}

/**
 * The upstream viewer has no ready event. Ready = an actor exists and no model
 * asset has been in flight for `quietMs`. Slow networks keep loading while a
 * request is open; only an empty, actor-less viewer fails after `stallMs`.
 */
export function waitForZamViewer(
  viewer: WowViewer,
  { quietMs = 1_500, stallMs = 30_000, capMs = 300_000, isCancelled, onProgress }: { quietMs?: number; stallMs?: number; capMs?: number; isCancelled: () => boolean; onProgress?: (fraction: number) => void },
) {
  const tracker = trackZamRequests();
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    let quietSince = 0;
    const tick = () => {
      if (isCancelled()) return;
      const renderer = viewer.renderer;
      const entries = Object.values((renderer?.downloads ?? {}) as Record<string, DownloadEntry>);
      const loaded = entries.reduce((sum, entry) => sum + (entry.loaded ?? 0), 0);
      const total = entries.reduce((sum, entry) => sum + (entry.total ?? 0), 0);
      if (total > 0) onProgress?.(loaded / total);
      const now = Date.now();
      const busy = tracker.pending.size > 0;
      const painted = Boolean(renderer?.actors?.length);
      if (painted && !busy) {
        quietSince ||= now;
        if (now - quietSince >= quietMs) return resolve();
      } else {
        quietSince = 0;
      }
      if (!painted && !busy && now - tracker.lastActivity > stallMs) return reject(new Error("model did not load"));
      if (now - startedAt > capMs) return painted ? resolve() : reject(new Error("model did not load"));
      window.setTimeout(tick, 250);
    };
    tick();
  });
}

export function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
