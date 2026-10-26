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

export function configureZamViewerGlobals() {
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
  return new window.ZamModelViewer({ type: 2, contentPath: ZAM_CONTENT_PATH, container: $(container), ...options });
}

type DownloadEntry = { loaded?: number; total?: number };
type RequestTracker = { pending: Map<string, number>; lastActivity: number };
let requestTracker: RequestTracker | null = null;

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
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try { begin(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); } catch { /* not a URL we track */ }
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
export function prepareZamViewer() {
  configureZamViewerGlobals();
  trackZamRequests();
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
