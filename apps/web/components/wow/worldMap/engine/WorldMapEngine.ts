import type { AtlasMap } from "@/lib/wow/worldMap/bundle";
import type { MapArt } from "@/lib/wow/worldMap/types";
import { clamp, contains, easeInOut, fitBox, flightPath, intersects, smoothstep, toAtlas, toScreen, zoomAt, type Box, type Camera } from "./camera";
import { MapRenderer, type DrawParams } from "./gl";
import { blurGroups, blurKey, blurOf, blurRadiusCss, blurRadiusPx, desatOf, dimOf, radiusOfKey, vignetteOf, featherInsetOf, featherOf, layerScale, levelFor, maskFeatherOf, maxScaleOf, terrainAlphaOf, upscaleOf } from "./lod";
import { wheelKind } from "./input";
import { analysePaper } from "./paper";
import { decorBoxes, labelBoxes, type ArtBox } from "./painted";
import { chainUp, transferCamera, type MapSet } from "./sets";
import { levelSize, levelTiles, TileStore, tileUrl } from "./tiles";

export { composeSet, mapSet, type MapSet } from "./sets";

/**
 * The world map viewer: camera, input (pointer, wheel and trackpad, pinch,
 * keyboard, double click/tap, inertia), level-of-detail tiles and the nested
 * maps that fade in at their places as you zoom — continent → zones → cities,
 * Cosmic → worlds through a round portal. The map in focus is drawn crisp;
 * the maps around it (neighbours, the continent, the world) are blended in by
 * their own-area masks (or a soft edge) and, once magnified past their own
 * detail, drawn out of focus like depth of field. A continent's terrain takes
 * over past the painted maps' detail. Eras swap the maps with a cross-fade once
 * the new picture has loaded; the compare mode splits the view at a divider.
 */
export type Insets = { top: number; right: number; bottom: number; left: number };
/**
 * A map in this frame: its art rect on screen and the part of it inside its
 * parents (children may overhang); `upscale` CSS px per art texel; `blur`
 * 0 (in focus) … 1 (a soft backdrop).
 */
export type DrawnMap = {
  map: AtlasMap; alpha: number; screen: Box; clip: Box; upscale: number; blur: number; dim?: number;
  /** A neighbour of the map in view: a wider soft edge. */ side?: boolean;
  /** How far out of focus the map under it is drawn. */ under?: number;
};
export type FrameInfo = {
  camera: Camera;
  width: number;
  height: number;
  focus: AtlasMap;
  drawn: DrawnMap[];
  moving: boolean;
  time: number;
};
export type EngineEvents = {
  frame(info: FrameInfo): void;
  focus(chain: AtlasMap[]): void;
  hover(map: AtlasMap | null): void;
  /** The view settled (after a move): good moment to save it in the URL. */
  settle(info: FrameInfo): void;
  background(): void;
  /** The maps shown changed (an era's picture is in). */
  set?(set: MapSet): void;
};
export type EngineOptions = { alive: boolean; reducedMotion: boolean; insets: Insets };

type Flight = { path: ReturnType<typeof flightPath>; start: number; duration: number; after?: () => void };
type Pointer = { id: number; x: number; y: number };
type TerrainDraw = { map: AtlasMap; alpha: number; clip: Box };
type ArtStyle = { corner?: number; holes?: Array<[number, number, number, number]>; alpha: number; light: number; cloud: number; water: number; desat: number; levelScale: number; edge?: number; exists?: (z: number, x: number, y: number) => boolean; maskStrength?: number };

/** Floors and caves under a place (micro maps, orphan levels like Cleft of Shadow): never opened by zooming over its surface. */
const UNDER: ReadonlySet<string> = new Set(["micro", "orphan"]);
/** A map blended into the one under it by its own-area mask (zones and cities; a top map has nothing under it). */
// Worlds and continents keep their own painted sea (soft edge): their land masks open the sea to the world
// picture under it, whose painted names of those very continents then show twice.
const usesMask = (map: AtlasMap) => Boolean(map.mask) && map.depth > 0 && map.type !== "world" && map.type !== "cosmic" && map.type !== "continent";
const FADE_TILE = 150;
const FADE_ERA = 650;
/** Longest wait for an era's picture to load before it fades in anyway. */
const ERA_WAIT = 900;

export class WorldMapEngine {
  private set: MapSet;
  private fromSet: MapSet | null = null;
  private pending: { set: MapSet; anchor: number | null; since: number } | null = null;
  get maps() { return this.set.maps; }
  private get shown() { return this.set.shown; }
  private renderer: MapRenderer;
  private tiles: TileStore;
  private camera: Camera = { x: 0.5, y: 0.33, scale: 1000 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private quality = 1;
  private frameTimes: number[] = [];
  private intervals: number[] = [];
  private raf = 0;
  private dirty = true;
  private lastFrame = 0;
  private visible = true;
  private lost = false;
  private flight: Flight | null = null;
  private velocity: { x: number; y: number } | null = null;
  private wheel: { x: number; y: number; log: number } | null = null;
  private pointers = new Map<number, Pointer>();
  private gesture: { distance: number; mid: [number, number]; moved: number; start: [number, number]; startTime: number; samples: Array<{ t: number; x: number; y: number }> } | null = null;
  private lastTap: { t: number; x: number; y: number } | null = null;
  private focusId = -1;
  private hoverId: number | null = null;
  private clickTimer = 0;
  private settleTimer = 0;
  private eraStart = 0;
  private compare: { left: MapSet; at: number } | null = null;
  private start = performance.now();
  private pausedTime = 0;
  private lastInfo: FrameInfo | null = null;
  private terrain: TerrainDraw[] = [];
  private disposed = false;
  private cleanup: Array<() => void> = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private surface: HTMLElement,
    base: MapSet,
    private events: EngineEvents,
    private options: EngineOptions,
  ) {
    this.set = base;
    this.renderer = new MapRenderer(canvas);
    const coarse = matchMedia("(pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency || 4;
    this.quality = coarse && cores <= 4 ? 0.75 : 1;
    // GPU memory for tiles: ~240 tiles of 256² on desktop, ~110 on phones.
    this.tiles = new TileStore(this.renderer.gl, (coarse ? 56 : 128) * 1048576, 6);
    this.tiles.onReady = () => this.invalidate();
    this.bindInput();
    this.resize();
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(surface);
    const intersection = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; if (this.visible) this.invalidate(); });
    intersection.observe(surface);
    const onVisibility = () => { if (!document.hidden) this.invalidate(); };
    document.addEventListener("visibilitychange", onVisibility);
    // A lost GL context (driver reset, too many tabs): stop drawing, then rebuild everything when it comes back.
    const onLost = (event: Event) => {
      event.preventDefault();
      this.lost = true;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    };
    const onRestored = () => {
      this.lost = false;
      this.renderer.init();
      this.tiles.reset();
      this.applyDpr();
      this.invalidate();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    this.watchDpr();
    this.cleanup.push(
      () => observer.disconnect(), () => intersection.disconnect(), () => document.removeEventListener("visibilitychange", onVisibility),
      () => canvas.removeEventListener("webglcontextlost", onLost), () => canvas.removeEventListener("webglcontextrestored", onRestored),
    );
  }

  /** The window moved to a screen of another pixel density: redraw at the new one. */
  private watchDpr() {
    const media = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const change = () => { media.removeEventListener("change", change); if (this.disposed) return; this.applyDpr(); this.invalidate(); this.watchDpr(); };
    media.addEventListener("change", change);
    this.cleanup.push(() => media.removeEventListener("change", change));
  }

  // ---------------------------------------------------------------- public

  get view() { return this.camera; }
  get size() { return { width: this.width, height: this.height }; }
  get focus() { return this.maps.get(this.focusId) ?? null; }

  setOptions(next: Partial<EngineOptions>) {
    const home = this.stillHome();
    this.options = { ...this.options, ...next };
    if (home !== null && next.insets) this.refitHome(home);
    this.invalidate();
  }

  /** The map shown whole if the camera has not moved since (else null). */
  private stillHome() {
    return this.home && !this.moving && this.atHome(this.home.id) ? this.home.id : null;
  }

  /** The panels or the window changed size while a map was shown whole: show it whole again. */
  private refitHome(id: number) {
    const camera = this.fitMap(id);
    if (!camera) return;
    this.camera = this.limit(camera);
    this.home = { id, camera: this.camera };
    this.scheduleSettle();
  }

  get setKey() { return this.set.key; }

  /**
   * Show another moment of the timeline. The camera keeps the place it looks at
   * (anchored on the deepest map of the focus chain that exists then, else on
   * `anchor`'s chain); with `animate` the new picture is loaded first, then
   * cross-fades in.
   */
  setMapSet(next: MapSet, animate: boolean | { animate?: boolean; anchor?: number | null } = true) {
    const opts = typeof animate === "boolean" ? { animate } : animate;
    if (next === this.set || next.key === this.set.key) { this.pending = null; return; }
    const anchor = opts.anchor ?? null;
    // Without animation (a link opening in its era) the page's map is the anchor: the link's view is relative to it.
    if (opts.animate === false || this.options.reducedMotion) { this.pending = null; this.switchSet(next, anchor, false, opts.animate === false); return; }
    this.pending = { set: next, anchor, since: performance.now() };
    this.invalidate();
  }

  private switchSet(next: MapSet, anchor: number | null, fade: boolean, anchorFirst = false) {
    const from = this.set;
    // A map shown whole stays shown whole in the other era (its place and size there may differ).
    const home = this.stillHome();
    const focus = chainUp(from, this.focusId), anchored = anchor !== null ? chainUp(next, anchor) : [];
    const chain = anchorFirst ? [...anchored, ...focus] : [...focus, ...anchored];
    const moved = transferCamera(this.camera, from, next, chain);
    // A flight under way goes on to the same place in the new maps.
    const flight = this.flight;
    const flightTarget = flight ? transferCamera(flight.path.at(1), from, next, chain) : null;
    this.flight = null;
    this.set = next;
    if (moved) this.camera = this.limit(moved);
    else {
      // Nothing in view existed then (the Cosmic map before Outland): show that era's top map whole.
      let top: AtlasMap | undefined;
      let best = Infinity;
      for (const map of next.maps.values()) {
        if (map.depth !== 0 || !map.art) continue;
        const d = Math.hypot((map.frame[0] + map.frame[2]) / 2 - this.camera.x, (map.frame[1] + map.frame[3]) / 2 - this.camera.y);
        if (d < best) { best = d; top = map; }
      }
      if (top) this.camera = this.limit(this.fit(next.shown.get(top.id) ?? top.frame));
    }
    if (flight && flightTarget) {
      const left = Math.max(200, flight.duration - (performance.now() - flight.start));
      this.flight = { path: flightPath(this.camera, this.limit(flightTarget), this.width, this.height), start: performance.now(), duration: left, after: flight.after };
    }
    if (home !== null && next.maps.has(home)) this.refitHome(home);
    // The anchor is the focus until the next frame finds it again.
    if (!next.maps.has(this.focusId)) this.focusId = chain.find((id) => next.maps.has(id)) ?? -1;
    this.fromSet = fade ? from : null;
    this.eraStart = performance.now();
    this.events.set?.(next);
    this.invalidate();
    this.scheduleSettle();
  }

  /** Split view: `left` on the left of the divider, the current maps on the right. */
  setCompare(compare: { left: MapSet; at: number } | null) {
    this.compare = compare;
    this.invalidate();
  }

  private focusChain(set: MapSet) {
    return chainUp(set, this.focusId);
  }

  private withCamera<T>(camera: Camera, run: () => T): T {
    const saved = this.camera;
    this.camera = camera;
    try { return run(); } finally { this.camera = saved; }
  }

  /** Camera that shows a box inside the free part of the viewport (UI panels excluded). */
  fit(box: Box, margin = 0.05, closer = 1.9): Camera {
    const { top, right, bottom, left } = this.options.insets;
    const freeW = Math.max(80, this.width - left - right), freeH = Math.max(80, this.height - top - bottom);
    let camera = fitBox(box, freeW, freeH, margin);
    // A wide map on a tall phone screen: come closer than "whole" so it fills more of the screen (pan sideways).
    const boxAspect = (box[2] - box[0]) / (box[3] - box[1]);
    if (freeW / freeH < 1.05 && boxAspect > 1.1) camera = { ...camera, scale: Math.min(camera.scale * closer, (freeH * (1 - margin * 2)) / (box[3] - box[1])) };
    return { scale: camera.scale, x: camera.x - (left - right) / 2 / camera.scale, y: camera.y - (top - bottom) / 2 / camera.scale };
  }

  fitMap(id: number) {
    const map = this.maps.get(id);
    return map ? this.fit(this.shown.get(id) ?? map.frame, 0.05, this.closerOf(map)) : null;
  }

  /**
   * How much closer than "whole" a wide map comes on a tall phone screen: a continent fills the height
   * (pan sideways), a world a little; a city is shown whole — its quarters are what the reader came for.
   */
  private closerOf(map: AtlasMap) {
    if (map.type === "world" || map.type === "cosmic") return 1.35;
    if (map.type === "continent") return 1.9;
    const parent = map.parent === null ? undefined : this.maps.get(map.parent);
    const share = parent ? (map.frame[2] - map.frame[0]) / Math.max(1e-9, parent.frame[2] - parent.frame[0]) : 1;
    return parent?.type === "zone" || share < 0.08 ? 1 : 1.5;
  }

  /** "Show the map whole": the map in view fitted entirely, on any screen. */
  showWhole() {
    const map = this.focus;
    if (!map) return;
    const camera = this.fit(this.shown.get(map.id) ?? map.frame, 0.05, 1);
    this.flyTo(camera, () => { this.home = { id: map.id, camera: this.camera }; });
  }

  /** The last move was a flight to a place (search, a click on a map), not a drag or wheel: true until read. */
  private flown = false;
  takeFlown() { const value = this.flown; this.flown = false; return value; }

  jumpTo(camera: Camera) {
    this.flight = null;
    this.velocity = null;
    this.wheel = null;
    this.camera = this.limit(camera);
    this.invalidate();
    this.scheduleSettle();
  }

  flyTo(target: Camera, after?: () => void) {
    this.velocity = null;
    this.wheel = null;
    const to = this.limit(target);
    this.flown = true;
    if (this.options.reducedMotion) { this.jumpTo(to); after?.(); return; }
    const sameRoot = this.rootAt(this.camera.x, this.camera.y) === this.rootAt(to.x, to.y);
    if (!sameRoot) {
      // Another hierarchy far away: a quick fade instead of flying through the void.
      this.canvas.style.transition = "opacity 180ms ease";
      this.canvas.style.opacity = "0";
      window.setTimeout(() => {
        if (this.disposed) return;
        this.jumpTo(to);
        this.canvas.style.opacity = "1";
        after?.();
      }, 190);
      return;
    }
    const path = flightPath(this.camera, to, this.width, this.height);
    const duration = clamp(Math.abs(path.S) * 520, 450, 2400);
    this.flight = { path, start: performance.now(), duration, after };
    this.invalidate();
  }

  flyToMap(id: number, after?: () => void) {
    const camera = this.fitMap(id);
    if (!camera) return;
    this.flyTo(camera, after);
    this.home = { id, camera: this.limit(camera) };
  }

  /** Show a map whole at once (a page opening). */
  jumpToMap(id: number) {
    const camera = this.fitMap(id);
    if (!camera) return;
    this.jumpTo(camera);
    this.home = { id, camera: this.camera };
  }

  /**
   * The last "show this map whole" view: the camera is still there (the reader
   * did not move since), even if the panels around changed size afterwards.
   */
  private home: { id: number; camera: Camera } | null = null;
  atHome(id: number) {
    const h = this.home;
    if (!h || h.id !== id) return false;
    const c = this.camera;
    return Math.abs(c.scale / h.camera.scale - 1) < 0.01 && Math.abs(c.x - h.camera.x) * c.scale < 2 && Math.abs(c.y - h.camera.y) * c.scale < 2;
  }

  /** Centre a point of a map with the map shown at least whole. */
  flyToPoint(mapId: number, x: number, y: number, zoom = 1.6, after?: () => void) {
    const map = this.maps.get(mapId);
    if (!map) return;
    const fit = this.fit(this.shown.get(map.id) ?? map.frame);
    const [ax, ay] = this.mapPoint(map, x, y);
    const { top, right, bottom, left } = this.options.insets;
    const scale = fit.scale * zoom;
    this.flyTo({ scale, x: ax - (left - right) / 2 / scale, y: ay - (top - bottom) / 2 / scale }, after);
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2) {
    const target = this.limit(zoomAt(this.camera, this.width, this.height, sx, sy, factor), { x: sx, y: sy });
    if (this.options.reducedMotion) this.jumpTo(target);
    else {
      this.velocity = null;
      this.wheel = null;
      this.flight = { path: flightPath(this.camera, target, this.width, this.height, 0.0001), start: performance.now(), duration: 320 };
      this.invalidate();
    }
  }

  panBy(dx: number, dy: number) {
    this.flyTo({ ...this.camera, x: this.camera.x + dx / this.camera.scale, y: this.camera.y + dy / this.camera.scale });
    this.flown = false;
  }

  /** One level up, like the zoom-out button of the game's map. */
  up() {
    const focus = this.focus;
    if (!focus) return;
    const fitFocus = this.fit(this.shown.get(focus.id) ?? focus.frame);
    // Zoomed into the focus map: first show it whole; already whole: go to its parent.
    if (this.camera.scale > fitFocus.scale * 1.15 || focus.parent === null) this.flyTo(fitFocus);
    else this.flyToMap(focus.parent);
  }

  mapPoint(map: AtlasMap, x: number, y: number): [number, number] {
    return [map.frame[0] + x * (map.frame[2] - map.frame[0]), map.frame[1] + y * (map.frame[3] - map.frame[1])];
  }

  project(x: number, y: number) { return toScreen(this.camera, this.width, this.height, x, y); }
  unproject(sx: number, sy: number) { return toAtlas(this.camera, this.width, this.height, sx, sy); }

  /** The chain from the top map down to a map. */
  chain(id: number) {
    const out: AtlasMap[] = [];
    for (let map = this.maps.get(id); map && out.length < 32; map = map.parent === null ? undefined : this.maps.get(map.parent)) out.unshift(map);
    return out;
  }

  /** The child map the reader would open by clicking at a screen point. */
  drillTarget(sx: number, sy: number): AtlasMap | null {
    const info = this.lastInfo;
    if (!info) return null;
    const [ax, ay] = this.unproject(sx, sy);
    // The deepest settled map under the point is the base; its children are the targets.
    let base: AtlasMap | null = null;
    for (const entry of info.drawn) {
      if (entry.alpha > 0.55 && entry.map.depth >= (base?.depth ?? -1) && contains(this.shown.get(entry.map.id) ?? entry.map.frame, ax, ay)) base = entry.map;
    }
    if (!base) return null;
    let best: AtlasMap | null = null;
    let bestArea = Infinity;
    for (const id of base.children) {
      const child = this.maps.get(id);
      if (!child || !contains(child.box, ax, ay) || !child.art || UNDER.has(child.type)) continue;
      const area = (child.box[2] - child.box[0]) * (child.box[3] - child.box[1]);
      if (area < bestArea) { best = child; bestArea = area; }
    }
    return best;
  }

  invalidate() {
    this.dirty = true;
    if (!this.raf && !this.disposed && !this.lost) this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  resize() {
    const rect = this.surface.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const home = this.width > 1 ? this.stillHome() : null;
    if (this.width > 1 && (width !== this.width || height !== this.height)) {
      // Keep the same span of the atlas visible across a resize.
      this.camera = { ...this.camera, scale: this.camera.scale * Math.min(width / this.width, height / this.height) ** 0.5 * Math.max(width / this.width, height / this.height) ** 0.5 };
    }
    this.width = width;
    this.height = height;
    if (home !== null) this.refitHome(home);
    this.applyDpr();
    this.invalidate();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.clickTimer);
    window.clearTimeout(this.settleTimer);
    for (const fn of this.cleanup) fn();
    this.tiles.dispose();
    this.renderer.dispose();
    this.renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /** Probe for checks: GPU memory, tiles, frame timings (CPU per frame and intervals while moving). */
  stats() {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
    return {
      tiles: this.tiles.loadedCount, entries: this.tiles.count, gpuMB: Math.round((this.tiles.bytes + this.renderer.layerBytes) / 1048576), dpr: this.dpr, quality: this.quality,
      frameMs: this.frameTimes.length ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0,
      intervalP50: pct(0.5), intervalP95: pct(0.95), samples: sorted.length,
      drawn: this.lastInfo?.drawn.length ?? 0, set: this.set.key, pending: Boolean(this.pending),
    };
  }

  resetStats() { this.intervals = []; }

  // ---------------------------------------------------------------- loop

  private applyDpr() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  private get alive() { return this.options.alive && !this.options.reducedMotion; }

  private get moving() { return Boolean(this.flight || this.velocity || this.wheel || this.pointers.size); }

  private tick(now: number) {
    this.raf = 0;
    if (this.disposed || this.lost) return;
    const dt = Math.min(64, now - (this.lastFrame || now));
    const animating = Boolean(this.moving || this.pending || (this.fromSet && now - this.eraStart < FADE_ERA));
    if (!this.visible || document.hidden) { this.lastFrame = now; return; }
    // The living layers alone run at ~30 fps; interaction at full rate.
    if (!animating && !this.dirty && this.alive && now - this.lastFrame < 31) { this.raf = requestAnimationFrame((t) => this.tick(t)); return; }
    if (this.moving && this.lastFrame && now - this.lastFrame < 200) {
      this.intervals.push(now - this.lastFrame);
      if (this.intervals.length > 600) this.intervals.splice(0, this.intervals.length - 600);
    }
    this.lastFrame = now;
    this.step(now, dt);
    const t0 = performance.now();
    this.render(now);
    this.measure(performance.now() - t0);
    this.dirty = false;
    const keep = this.moving || this.alive || this.pending || this.tiles.pending > 0 || this.fading(now) || (this.fromSet && now - this.eraStart < FADE_ERA);
    if (keep) this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private measure(ms: number) {
    this.frameTimes.push(ms);
    if (this.frameTimes.length < 40) return;
    const average = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    // Slow device: draw fewer pixels rather than drop frames.
    if (average > 14 && this.quality > 0.5) { this.quality = Math.max(0.5, this.quality - 0.15); this.applyDpr(); }
  }

  private fadingUntil = 0;
  private fading(now: number) { return now < this.fadingUntil; }

  private step(now: number, dt: number) {
    if (this.flight) {
      const t = clamp((now - this.flight.start) / this.flight.duration, 0, 1);
      this.camera = this.flight.path.at(easeInOut(t));
      if (t >= 1) {
        const after = this.flight.after;
        this.flight = null;
        this.camera = this.limit(this.camera);
        after?.();
        this.scheduleSettle();
      }
    }
    if (this.wheel) {
      // Eased wheel zoom: each notch is spent over ~100 ms, the point under the cursor stays put.
      const portion = 1 - Math.exp(-dt / 70);
      const log = this.wheel.log * portion;
      this.wheel.log -= log;
      this.camera = this.limit(zoomAt(this.camera, this.width, this.height, this.wheel.x, this.wheel.y, Math.exp(log)), this.wheel);
      if (Math.abs(this.wheel.log) < 0.002) { this.wheel = null; this.scheduleSettle(); }
    }
    if (this.velocity) {
      this.camera = this.limit({ ...this.camera, x: this.camera.x - (this.velocity.x * dt) / this.camera.scale, y: this.camera.y - (this.velocity.y * dt) / this.camera.scale });
      const decay = Math.exp(-dt / 325);
      this.velocity = { x: this.velocity.x * decay, y: this.velocity.y * decay };
      if (Math.hypot(this.velocity.x, this.velocity.y) < 0.02) { this.velocity = null; this.scheduleSettle(); }
    }
  }

  private scheduleSettle() {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => { if (this.lastInfo && !this.disposed) this.events.settle(this.lastInfo); }, 260);
  }

  private rootAt(x: number, y: number) {
    for (const map of this.maps.values()) if (map.depth === 0 && contains([map.box[0] - 1, map.box[1] - 1, map.box[2] + 1, map.box[3] + 1], x, y)) return map.id;
    return -1;
  }

  /**
   * Zoom limits: from a whole top map down to twice the native size of the
   * deepest map at the centre (twice the terrain's, over a continent that has one).
   */
  private limit(camera: Camera, anchor?: { x: number; y: number }): Camera {
    const root = this.maps.get(this.rootAt(camera.x, camera.y)) ?? this.maps.values().next().value;
    if (!root) return camera;
    const min = this.fit(root.frame, 0.02).scale * 0.6;
    // The most detailed picture under the centre sets the limit (a small coarse sub-zone overlapping a city must not).
    let max = 0;
    let terrain: AtlasMap["terrain"] | undefined;
    for (const map of this.maps.values()) {
      if (!map.art || UNDER.has(map.type) || !contains(map.frame, camera.x, camera.y)) continue;
      max = Math.max(max, maxScaleOf(map.art, map.frame[2] - map.frame[0]));
      if (map.terrain && contains(map.terrain.frame, camera.x, camera.y)) terrain = map.terrain;
    }
    if (terrain) max = Math.max(max, maxScaleOf({ width: 0 }, 1, terrain));
    if (!max) max = min * 100;
    const scale = clamp(camera.scale, min, Math.max(min, max));
    let next = { ...camera, scale };
    if (anchor && scale !== camera.scale) {
      // Clamped zoom: keep the point under the cursor in place.
      const [ax, ay] = toAtlas(camera, this.width, this.height, anchor.x, anchor.y);
      next = { scale, x: ax - (anchor.x - this.width / 2) / scale, y: ay - (anchor.y - this.height / 2) / scale };
    }
    // Keep some of the top map on screen.
    const pad = Math.min(this.width, this.height) * 0.35 / scale;
    next.x = clamp(next.x, root.frame[0] - pad, root.frame[2] + pad);
    next.y = clamp(next.y, root.frame[1] - pad, root.frame[3] + pad);
    return next;
  }

  // ---------------------------------------------------------------- render

  /**
   * The maps to draw this frame, bottom first: each top map, then the children
   * it opens (bigger first, the smaller and more detailed ones over them), and
   * theirs. Neighbours stay: around a city you see its zone and the zones next
   * to it, out of focus as far as they are magnified.
   */
  private collect(set: MapSet): DrawnMap[] & { all?: DrawnMap[] } {
    const out: DrawnMap[] & { all?: DrawnMap[] } = [];
    const view: Box = [0, 0, this.width, this.height];
    const minDim = Math.min(this.width, this.height);
    const { top, right, bottom, left } = this.options.insets;
    const freeW = Math.max(80, this.width - left - right), freeH = Math.max(80, this.height - top - bottom);
    const homeLock = this.home && set === this.set && this.atHome(this.home.id) ? this.home.id : null;
    const visit = (map: AtlasMap, alpha: number, parentClip: Box | null, side = false, under = 0) => {
      const art = map.art;
      if (!art) return;
      const [x0, y0] = this.project(map.frame[0], map.frame[1]);
      const [x1, y1] = this.project(map.frame[2], map.frame[3]);
      const screen: Box = [x0, y0, x1, y1];
      const clip: Box = parentClip && !map.portal
        ? [Math.max(x0, parentClip[0]), Math.max(y0, parentClip[1]), Math.min(x1, parentClip[2]), Math.min(y1, parentClip[3])]
        : screen;
      if (clip[2] <= clip[0] || clip[3] <= clip[1] || !intersects(clip, view)) return;
      const upscale = upscaleOf(x1 - x0, art);
      const entry: DrawnMap = { map, alpha, screen, clip, upscale, blur: blurOf(upscale), ...(side ? { side } : {}), ...(under ? { under } : {}) };
      out.push(entry);
      const density = ((x1 - x0) * this.dpr) / art.width;
      // Most of this map in view: the reader looks at it, not into one of its children
      // (Classic's continents fill most of its world map, yet the world map is what shows).
      const iw = Math.max(0, Math.min(clip[2], this.width) - Math.max(clip[0], 0)), ih = Math.max(0, Math.min(clip[3], this.height) - Math.max(clip[1], 0));
      const shownFrac = (iw * ih) / Math.max(1, (clip[2] - clip[0]) * (clip[3] - clip[1]));
      const lookingAtParent = smoothstep(0.65, 0.85, shownFrac);
      let portalOpen = 0;
      const mx = this.width / 2, my = this.height / 2;
      const opened: Array<{ child: AtlasMap; a: number; area: number; fill: number; centre: boolean; box: Box }> = [];
      for (const id of map.children) {
        const child = set.maps.get(id);
        // Floors and caves under a place (Cleft of Shadow under Orgrimmar) are not part of its surface.
        if (!child?.art || UNDER.has(child.type)) continue;
        const [cx0, cy0] = this.project(child.frame[0], child.frame[1]);
        const [cx1, cy1] = this.project(child.frame[2], child.frame[3]);
        if (child.portal) {
          let a = smoothstep(0.34, 0.8, Math.min(cx1 - cx0, cy1 - cy0) / minDim);
          // Only the world the camera heads for opens; its neighbours on the Cosmic map stay planets.
          const gap = Math.hypot(Math.max(cx0 - mx, 0, mx - cx1), Math.max(cy0 - my, 0, my - cy1));
          a *= 1 - smoothstep(0.05, 0.3, gap / Math.max(1, Math.min(cx1 - cx0, cy1 - cy0)));
          portalOpen = Math.max(portalOpen, a);
          if (a > 0.003) opened.push({ child, a, area: Infinity, fill: 0, centre: false, box: [cx0, cy0, cx1, cy1] });
          continue;
        }
        // A child opens when the parent's picture runs out of detail, or when the
        // child fills most of the view (a continent framed on the world map).
        const vx0 = Math.max(cx0, clip[0]), vy0 = Math.max(cy0, clip[1]), vx1 = Math.min(cx1, clip[2]), vy1 = Math.min(cy1, clip[3]);
        const vw = vx1 - vx0, vh = vy1 - vy0;
        if (vw <= 0 || vh <= 0 || !intersects([vx0, vy0, vx1, vy1], view)) continue;
        // How much of the free part of the view (panels excluded) the child takes.
        const fill = Math.max(vw / freeW, vh / freeH);
        // Detail alone does not open a small child (a city on a continent): it must also take a fair part of the view.
        // A map shown whole on purpose keeps its children closed until its own detail runs out.
        // The map shown whole on purpose is open itself, whatever its parent's picture (Classic's Kalimdor on Azeroth).
        const a = homeLock === child.id ? 1 : homeLock === map.id
          ? smoothstep(0.95 / this.quality, 1.3 / this.quality, density) * smoothstep(0.22, 0.45, fill)
          : Math.max(Math.min(smoothstep(0.6 / this.quality, 1.05 / this.quality, density), smoothstep(0.22, 0.45, fill)), smoothstep(0.5, 0.85, fill)) * (1 - lookingAtParent);
        if (a <= 0.003) continue;
        opened.push({ child, a, area: (cx1 - cx0) * (cy1 - cy0), fill, centre: vx0 <= mx && mx <= vx1 && vy0 <= my && my <= vy1, box: [cx0, cy0, cx1, cy1] });
      }
      // The child the reader looks into (at the centre, filling most of the view) lies over its
      // neighbours, whose rectangles would otherwise cover its edges; places inside it (a city in
      // its zone) lie over it. Otherwise bigger pictures first, the smaller ones over them.
      // The one framed by the view: its centre nearest the centre of the free area (a zone shown whole
      // is framed; its bigger neighbour also covers the centre but sits off it).
      const fx = left + freeW / 2, fy = top + freeH / 2;
      const off = (entry: (typeof opened)[number]) => Math.hypot((entry.box[0] + entry.box[2]) / 2 - fx, (entry.box[1] + entry.box[3]) / 2 - fy) / Math.max(1, entry.box[2] - entry.box[0], entry.box[3] - entry.box[1]);
      let best: (typeof opened)[number] | null = null;
      for (const entry of opened) if (entry.centre && entry.fill >= 0.45 && (!best || off(entry) < off(best))) best = entry;
      const inside = (entry: (typeof opened)[number]) => {
        if (!best || entry === best || entry.area >= best.area) return false;
        // Mostly over the framed map (a city on the edge of its zone counts).
        const b = best.box, e = entry.box;
        const ow = Math.min(b[2], e[2]) - Math.max(b[0], e[0]), oh = Math.min(b[3], e[3]) - Math.max(b[1], e[1]);
        return ow > 0 && oh > 0 && (ow * oh) / Math.max(1, entry.area) >= 0.3;
      };
      const rank = (entry: (typeof opened)[number]) => (entry === best ? 1 : inside(entry) ? 2 : 0);
      opened.sort((p, q) => rank(p) - rank(q) || q.area - p.area);
      for (const opening of opened) visit(opening.child, alpha * opening.a, clip, Boolean(best) && rank(opening) === 0, entry.blur);
      // A world opened from the Cosmic map: the starry parchment around it falls back.
      if (portalOpen > 0) entry.alpha = alpha * (1 - 0.8 * portalOpen);
    };
    for (const map of set.maps.values()) if (map.depth === 0) visit(map, 1, null);
    // A settled map whose solid part covers the whole view hides everything drawn before it.
    for (let i = out.length - 1; i > 0; i--) {
      const entry = out[i];
      if (entry.alpha < 0.995 || entry.map.portal || usesMask(entry.map)) continue;
      const devW = (entry.screen[2] - entry.screen[0]) * this.dpr, devH = (entry.screen[3] - entry.screen[1]) * this.dpr;
      const f = entry.map.depth === 0 ? 0 : featherOf(devW, devH, this.dpr) / this.dpr;
      if (entry.clip[0] + f <= 0 && entry.clip[1] + f <= 0 && entry.clip[2] - f >= this.width && entry.clip[3] - f >= this.height) {
        const shown: DrawnMap[] & { all?: DrawnMap[] } = out.slice(i);
        // The hidden ones still carry the continent's terrain over everything.
        shown.all = out;
        return shown;
      }
    }
    return out;
  }

  /** Terrain over its continent once the finest painted map at the centre runs out of detail. */
  private collectTerrain(shown: DrawnMap[] & { all?: DrawnMap[] }): TerrainDraw[] {
    const out: TerrainDraw[] = [];
    const list = shown.all ?? shown;
    const cx = this.width / 2, cy = this.height / 2;
    for (const entry of list) {
      const terrain = entry.map.terrain;
      if (!terrain) continue;
      let finest = entry.upscale;
      for (const other of list) {
        if (other.alpha < 0.5 || !contains(other.clip, cx, cy)) continue;
        let m: AtlasMap | undefined = other.map;
        while (m && m.id !== entry.map.id) m = m.parent === null ? undefined : this.set.maps.get(m.parent) ?? this.compare?.left.maps.get(m.parent);
        if (m) finest = Math.min(finest, other.upscale);
      }
      const [x0, y0] = this.project(terrain.frame[0], terrain.frame[1]);
      const [x1, y1] = this.project(terrain.frame[2], terrain.frame[3]);
      // Only where the ground has more detail than the painted map it would cover.
      const ground = upscaleOf(x1 - x0, terrain.art);
      const alpha = terrainAlphaOf(finest) * smoothstep(1.05, 1.5, finest / Math.max(1e-6, ground)) * entry.alpha;
      if (alpha <= 0.003) continue;
      const clip: Box = [Math.max(x0, entry.clip[0]), Math.max(y0, entry.clip[1]), Math.min(x1, entry.clip[2]), Math.min(y1, entry.clip[3])];
      if (clip[2] > clip[0] && clip[3] > clip[1]) out.push({ map: entry.map, alpha, clip });
    }
    return out;
  }

  private render(now: number) {
    const W = this.canvas.width, H = this.canvas.height;
    const time = this.alive ? (now - this.start) / 1000 : this.pausedTime;
    if (this.alive) this.pausedTime = time;
    // Clouds: about eight cells across a world, fading out once a zone fills the screen.
    const cloudCell = 0.09;
    const cloudK = 1 / (cloudCell * this.camera.scale * this.dpr);
    const ox = (this.camera.x - this.width / 2 / this.camera.scale) / cloudCell;
    const oy = (this.camera.y - this.height / 2 / this.camera.scale) / cloudCell;
    const cloudMap: [number, number, number] = [cloudK, ox, oy];
    const waterCell = 22 * this.dpr;
    const wx = ((this.camera.x * this.camera.scale - this.width / 2) * this.dpr / waterCell) % 4096;
    const wy = ((this.camera.y * this.camera.scale - this.height / 2) * this.dpr / waterCell) % 4096;
    const waterMap: [number, number, number] = [1 / waterCell, wx, wy];
    this.renderer.begin(W, H, time, cloudMap, waterMap);

    const cloudScreen = cloudCell * this.camera.scale;
    const cloud = this.alive ? 1 - smoothstep(600, 2600, cloudScreen) : 0;
    const water = this.alive ? 1 : 0;

    // An era on its way: its tiles load while the current picture stays; then it cross-fades in.
    if (this.pending) {
      const pending = this.pending;
      const camera = transferCamera(this.camera, this.set, pending.set, [...this.focusChain(this.set), ...(pending.anchor !== null ? chainUp(pending.set, pending.anchor) : [])]) ?? this.camera;
      const ready = this.withCamera(camera, () => this.prefetch(pending.set, now));
      if (ready >= 0.9 || now - pending.since > ERA_WAIT) {
        this.pending = null;
        this.switchSet(pending.set, pending.anchor, true);
      }
    }

    let drawn: DrawnMap[];
    if (this.compare) {
      // The other era on the left of the divider, with the camera on the same place in its maps.
      const split = this.compare.at * W;
      const left = this.compare.left;
      this.renderer.clip([0, 0, split, H], H);
      const camera = transferCamera(this.camera, this.set, left, this.focusChain(this.set)) ?? this.camera;
      this.withCamera(camera, () => { const list = this.collect(left); this.drawList(list, left, 1, cloud, water, now); });
      this.renderer.clip([split, 0, W, H], H);
      drawn = this.collect(this.set);
      this.drawList(drawn, this.set, 1, cloud, water, now);
      this.renderer.clip(null, H);
    } else {
      const fade = this.fromSet ? clamp((now - this.eraStart) / FADE_ERA, 0, 1) : 1;
      const from = this.fromSet;
      if (from && fade < 1) {
        // The old picture stays under the new one until the new one is nearly opaque (no dip to the background).
        const camera = transferCamera(this.camera, this.set, from, this.focusChain(this.set)) ?? this.camera;
        this.withCamera(camera, () => this.drawList(this.collect(from), from, 1 - smoothstep(0.6, 1, fade), cloud, water, now));
        drawn = this.collect(this.set);
        this.drawList(drawn, this.set, easeInOut(fade), cloud, water, now);
      } else {
        this.fromSet = null;
        drawn = this.collect(this.set);
        this.drawList(drawn, this.set, 1, cloud, water, now);
      }
    }
    this.tiles.endFrame();

    // Focus: the deepest well-shown map under the centre of the free area.
    const { top, right, bottom, left } = this.options.insets;
    const [cx, cy] = this.unproject(left + (this.width - left - right) / 2, top + (this.height - top - bottom) / 2);
    let focus = drawn[0]?.map ?? this.maps.get(this.focusId) ?? this.maps.values().next().value as AtlasMap;
    for (const entry of drawn) if (entry.alpha > 0.5 && contains(entry.map.frame, cx, cy) && entry.map.depth >= (focus?.depth ?? 0)) focus = entry.map;
    // Still on "show this map whole" (a page, a click): that map is the one in view, even where a child fills the phone screen.
    const home = this.home && this.atHome(this.home.id) ? this.maps.get(this.home.id) : undefined;
    if (home) focus = home;
    if (focus && focus.id !== this.focusId) {
      this.focusId = focus.id;
      this.events.focus(this.chain(focus.id));
      // The URL follows the map in view even when nothing moved (an era's picture came in).
      this.scheduleSettle();
    }
    this.lastInfo = { camera: this.camera, width: this.width, height: this.height, focus, drawn, moving: this.moving, time };
    this.events.frame(this.lastInfo);
  }

  /** The map in view and everything inside it (its own words and decor stay). */
  private focusSubtree(set: MapSet) {
    const out = new Set<number>();
    const walk = (id: number) => {
      if (out.has(id)) return;
      out.add(id);
      for (const child of set.maps.get(id)?.children ?? []) walk(child);
    };
    if (set.maps.has(this.focusId)) walk(this.focusId);
    return out;
  }

  /**
   * Where a map around the one in view gives way (device px): its painted names of that place
   * (labelFor, else words over the place's frame) and its decor near it.
   */
  private holesOf(entry: DrawnMap, focus: AtlasMap): Array<[number, number, number, number]> {
    const art = entry.map.art;
    if (!art) return [];
    const f = focus.frame, fw = f[2] - f[0], fh = f[3] - f[1];
    const near: Box = [f[0] - fw * 0.15, f[1] - fh * 0.15, f[2] + fw * 0.15, f[3] + fh * 0.15];
    const m = entry.map.frame, mw = m[2] - m[0], mh = m[3] - m[1];
    const toAtlas = (b: ArtBox["box"]): Box => [m[0] + b[0] * mw, m[1] + b[1] * mh, m[0] + b[2] * mw, m[1] + b[3] * mh];
    const out: Array<[number, number, number, number]> = [];
    const add = (b: Box) => {
      const [x0, y0] = this.project(b[0], b[1]), [x1, y1] = this.project(b[2], b[3]);
      if (x1 < 0 || y1 < 0 || x0 > this.width || y0 > this.height) return;
      out.push([x0 * this.dpr, y0 * this.dpr, x1 * this.dpr, y1 * this.dpr]);
    };
    // Without labelFor: only a big name over the place itself (the neighbour's "STORMWIND" banner over the
    // city) — a word that merely touches the place's edge stays: a hole there would show the map below.
    const core: Box = [f[0] + fw * 0.12, f[1] + fh * 0.12, f[2] - fw * 0.12, f[3] - fh * 0.12];
    for (const label of labelBoxes(art)) {
      if (label.for !== undefined) { if (label.for === focus.id) add(toAtlas(label.box)); continue; }
      const b = toAtlas(label.box);
      if (contains(core, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2) && b[2] - b[0] >= fw * 0.18) add(b);
    }
    for (const decor of decorBoxes(art)) {
      if (decor.for !== undefined && decor.for !== focus.id) continue;
      const b = toAtlas(decor.box);
      if (intersects(b, near)) add(b);
    }
    // The biggest first: when there are more than the shader takes, the small ones go.
    return out.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1])).slice(0, 8);
  }

  /** Asks for the tiles a set needs in this view; returns the share already loaded. */
  private prefetch(set: MapSet, now: number) {
    let ready = 0, total = 0;
    const list = this.collect(set);
    for (const entry of list) {
      if (entry.alpha < 0.3 || !entry.map.art) continue;
      const scale = entry.blur > 0.06 ? layerScale(blurRadiusPx(entry.blur, this.dpr, entry.upscale)) : 1;
      const [r, t] = this.drawArt(entry.map, entry.map.art, entry.screen, entry.clip, { alpha: 0, light: 0, cloud: 0, water: 0, desat: 0, levelScale: scale }, now, true, true);
      ready += r;
      total += t;
    }
    return total ? ready / total : 1;
  }

  /**
   * Draws the maps of one set at an opacity (the incoming era fades in over the
   * outgoing one). Runs of out-of-focus maps go through one blurred offscreen
   * layer each; the terrain and a hovered child come last.
   */
  private drawList(list: DrawnMap[], set: MapSet, eraAlpha: number, cloud: number, water: number, now: number) {
    const moving = this.moving;
    // Out-of-focus draws grouped by their blur radius (it grows with the magnification).
    const keys = list.map((entry) => blurKey(blurRadiusCss(entry.blur, entry.upscale)));
    const focus = set.maps.get(this.focusId);
    const inFocus = this.focusSubtree(set);
    for (const group of blurGroups(keys)) {
      const radius = radiusOfKey(group.blur) * this.dpr;
      const scale = group.blur > 0 ? layerScale(radius) : 1;
      let upscale = 0;
      if (group.blur > 0) this.renderer.beginLayer(scale);
      for (let i = group.from; i <= group.to; i++) {
        const entry = list[i];
        const art = entry.map.art;
        if (!art) continue;
        upscale += entry.upscale;
        const hovered = this.hoverId === entry.map.id && entry.alpha < 0.98;
        const alpha = (hovered ? Math.max(entry.alpha, 0.3) : entry.alpha) * eraAlpha;
        if (alpha < 0.003) continue;
        const terrain = entry.map.type !== "cosmic";
        const style: ArtStyle = {
          alpha, light: hovered ? 0.55 : -(entry.dim ?? 0), edge: entry.side ? 1.6 : 1,
          maskStrength: 1,
          cloud: terrain ? cloud * (entry.map.depth <= 2 || entry.map.type === "continent" ? 1 : 0.6) : 0, water: terrain ? water : 0,
          desat: 0, levelScale: scale,
          // Maps around the one in view: their corner ornaments go, and their painted words and decor
          // where the place in view lies give way (no second "STORMWIND" over the city).
          ...(focus && !inFocus.has(entry.map.id) ? { corner: entry.map.depth > 0 ? 0.16 : 0, holes: this.holesOf(entry, focus) } : {}),
        };
        this.drawArt(entry.map, art, entry.screen, entry.clip, style, now, moving);
      }
      if (group.blur > 0) {
        const u = upscale / (group.to - group.from + 1);
        this.renderer.endLayer(radius / scale, dimOf(u), desatOf(u), vignetteOf(u));
      }
    }
    // The ground of a continent over its painted maps, deep in.
    const terrain = set === this.set ? (this.terrain = this.collectTerrain(list)) : this.collectTerrain(list);
    for (const t of terrain) {
      const tr = t.map.terrain;
      if (!tr) continue;
      const exists = this.terrainTiles(tr.index);
      if (exists === null) continue;
      const [x0, y0] = this.project(tr.frame[0], tr.frame[1]);
      const [x1, y1] = this.project(tr.frame[2], tr.frame[3]);
      this.drawArt(t.map, tr.art, [x0, y0, x1, y1], t.clip, { alpha: t.alpha * eraAlpha, light: 0, cloud: 0, water: water * 0.5, desat: 0, levelScale: 1, exists }, now, moving, false, "t");
    }
    // A hovered child that is not drawn yet peeks through its parent.
    if (set === this.set && this.hoverId !== null && !list.some((entry) => entry.map.id === this.hoverId)) {
      const map = set.maps.get(this.hoverId);
      const art = map?.art;
      const parent = map && list.find((entry) => entry.map.id === map.parent);
      if (map && art && parent) {
        const [x0, y0] = this.project(map.frame[0], map.frame[1]);
        const [x1, y1] = this.project(map.frame[2], map.frame[3]);
        const clip: Box = [Math.max(x0, parent.clip[0]), Math.max(y0, parent.clip[1]), Math.min(x1, parent.clip[2]), Math.min(y1, parent.clip[3])];
        if (clip[2] > clip[0] && clip[3] > clip[1]) this.drawArt(map, art, [x0, y0, x1, y1], clip, { alpha: 0.3 * eraAlpha, light: 0.55, cloud: 0, water: 0, desat: 0, levelScale: 1 }, now, moving);
      }
    }
  }

  /**
   * Draws one picture (a map's art or a terrain): the tiles of the level its
   * size on screen needs (a coarser one inside a blurred layer), each over the
   * best coarser tile already loaded until it fades in. `dry`: only ask for the
   * tiles; returns [loaded, needed].
   */
  private drawArt(map: AtlasMap, art: MapArt, screen: Box, clipBox: Box, style: ArtStyle, now: number, moving: boolean, dry = false, kind = "a"): [number, number] {
    const d = this.dpr;
    const sx0 = screen[0] * d, sy0 = screen[1] * d, sx1 = screen[2] * d, sy1 = screen[3] * d;
    const devW = sx1 - sx0, devH = sy1 - sy0;
    const W = this.canvas.width, H = this.canvas.height;
    const cx0 = Math.max(0, clipBox[0] * d), cy0 = Math.max(0, clipBox[1] * d), cx1 = Math.min(W, clipBox[2] * d), cy1 = Math.min(H, clipBox[3] * d);
    if (cx1 <= cx0 || cy1 <= cy0) return [0, 0];
    const z = levelFor(art, devW / style.levelScale);
    const [cols, rows] = levelTiles(art, z);
    const [lw, lh] = levelSize(art, z);
    const ts = art.tileSize;
    const pxW = devW / lw, pxH = devH / lh;
    const tx0 = clamp(Math.floor((cx0 - sx0) / pxW / ts), 0, cols - 1), tx1 = clamp(Math.floor((cx1 - sx0) / pxW / ts), 0, cols - 1);
    const ty0 = clamp(Math.floor((cy0 - sy0) / pxH / ts), 0, rows - 1), ty1 = clamp(Math.floor((cy1 - sy0) / pxH / ts), 0, rows - 1);
    const isTerrain = kind === "t";
    // A mask blends a map into the one under it; a top map (Draenor standing alone) has nothing under it.
    const mask = !isTerrain && map.mask && usesMask(map) ? this.tiles.get(map.mask, map.depth * 0.5) : null;
    const maskStrength = style.maskStrength ?? 1;
    const maskReady = mask && mask.state === "ready" && mask.texture && maskStrength > 0.02 ? mask : null;
    // Top maps have no edge to blend; a world opened from the Cosmic map softens its edge once open.
    const feather: number | [number, number] = isTerrain ? featherOf(cx1 - cx0, cy1 - cy0, d) * 0.6
      : map.depth === 0 ? 0
      : map.portal ? (style.alpha > 0.98 ? featherOf(devW, devH, d) * 0.6 : 0)
      : maskReady && maskStrength > 0.98 ? maskFeatherOf(devW, devH, d)
      : [featherInsetOf(devW, devH), featherOf(devW, devH, d) * (style.edge ?? 1)];
    let portal: [number, number, number] = [0, 0, 0];
    if (!isTerrain && map.portal && style.alpha < 0.999) {
      // The world opens from the planet outwards: a circle that grows to cover the art.
      const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2;
      const inner = Math.min(devW, devH) / 2, outer = Math.hypot(devW, devH) / 2 * 1.2;
      portal = [cx, cy, inner + (outer - inner) * smoothstep(0.35, 1, style.alpha)];
    }
    // The terrain fades at the edge of the part shown (the continent's picture), a map at its own art border.
    const frame: Box = isTerrain ? [cx0, cy0, cx1, cy1] : [clipBox[0] * d, clipBox[1] * d, clipBox[2] * d, clipBox[3] * d];
    const paper = maskReady && !isTerrain && map.depth > 0 ? this.paperOf(map, art) : null;
    const base: Omit<DrawParams, "rect" | "uv"> = {
      alpha: style.alpha, frame, feather, portal, light: style.light, cloud: style.cloud, water: style.water, desat: style.desat,
      mask: maskReady && maskReady.texture ? { texture: maskReady.texture, rect: [sx0, sy0, sx1, sy1], strength: maskStrength } : null,
      paper: paper ? [paper[0], paper[1], paper[2], 0.9] : null,
      art: [sx0, sy0, sx1, sy1], corner: isTerrain ? 0 : style.corner ?? 0, holes: isTerrain ? [] : style.holes ?? [],
    };
    const centerX = W / 2, centerY = H / 2;
    const id = map.id;
    const exists = style.exists;
    // The whole picture at level 0 first: something to show while the details load.
    let ready = 0, total = 0;
    if (!exists || exists(0, 0, 0)) {
      const root = this.tiles.get(tileUrl(art, id, 0, 0, 0), map.depth);
      ready = root.state === "ready" ? 1 : 0;
      total = 1;
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        // Neighbouring tiles share the very same edge coordinates: the rasteriser then leaves neither a gap
        // nor a doubly blended line between them (an overlap would show where the map is see-through: masks, edges).
        const edgeX = (i: number) => (i * ts >= lw ? sx1 : sx0 + i * ts * pxW), edgeY = (i: number) => (i * ts >= lh ? sy1 : sy0 + i * ts * pxH);
        const rx0 = edgeX(tx), ry0 = edgeY(ty);
        // Edge tiles cover fewer texels than a full tile; their files may be full-size with empty padding.
        const tw = Math.min(ts, lw - tx * ts), th = Math.min(ts, lh - ty * ts);
        const rect: Box = [rx0, ry0, edgeX(tx + 1), edgeY(ty + 1)];
        const rw = rect[2] - rx0, rh = rect[3] - ry0;
        // Ground with no tile there (open sea): nothing to ask for.
        if (exists && !exists(z, tx, ty)) continue;
        const dist = Math.hypot(rx0 + rw / 2 - centerX, ry0 + rh / 2 - centerY) / Math.max(W, H);
        const tile = this.tiles.get(tileUrl(art, id, z, tx, ty), 2 + map.depth * 0.5 + dist * 4 + (isTerrain ? -0.5 : 0));
        total += 1;
        if (tile.state === "ready" || tile.state === "failed") ready += 1;
        if (dry) continue;
        const fade = tile.state === "ready" ? (this.options.reducedMotion ? 1 : clamp((now - tile.readyAt) / FADE_TILE, 0, 1)) : 0;
        if (fade < 1) {
          this.drawFallback(art, id, z, tx, ty, rect, base);
          if (tile.state === "ready") this.fadingUntil = Math.max(this.fadingUntil, tile.readyAt + FADE_TILE);
        }
        if (tile.state === "ready" && tile.texture) {
          this.renderer.draw(tile.texture, { ...base, rect, uv: [0, 0, Math.min(1, tw / tile.width), Math.min(1, th / tile.height)], alpha: style.alpha * fade });
        }
      }
    }
    // Next level for the middle of the view, while nothing moves.
    if (!dry && !moving && z < art.maxZoom && style.levelScale === 1) {
      const [ncols, nrows] = levelTiles(art, z + 1);
      const nx0 = clamp(tx0 * 2, 0, ncols - 1), nx1 = clamp(tx1 * 2 + 1, 0, ncols - 1);
      const ny0 = clamp(ty0 * 2, 0, nrows - 1), ny1 = clamp(ty1 * 2 + 1, 0, nrows - 1);
      const midX = (nx0 + nx1) / 2, midY = (ny0 + ny1) / 2;
      for (let ty = ny0; ty <= ny1; ty++) {
        for (let tx = nx0; tx <= nx1; tx++) {
          if (Math.abs(tx - midX) > (nx1 - nx0) / 3 + 1 || Math.abs(ty - midY) > (ny1 - ny0) / 3 + 1) continue;
          if (exists && !exists(z + 1, tx, ty)) continue;
          this.tiles.get(tileUrl(art, id, z + 1, tx, ty), 40 + map.depth);
        }
      }
    }
    return [ready, total];
  }

  /** The bare sheet's colour of a picture whose mask is only a soft rectangle (looked at once per picture). */
  private papers = new Map<string, [number, number, number] | null | "loading">();
  private paperOf(map: AtlasMap, art: MapArt): [number, number, number] | null {
    if (!map.mask) return null;
    const key = `${map.mask}|${art.url}`;
    const known = this.papers.get(key);
    if (known === "loading") return null;
    if (known !== undefined) return known;
    this.papers.set(key, "loading");
    const [w0, h0] = levelSize(art, 0);
    analysePaper(map.mask, tileUrl(art, map.id, 0, 0, 0), [w0, h0])
      .then((paper) => { this.papers.set(key, paper); if (paper) this.invalidate(); })
      .catch(() => this.papers.set(key, null));
    return null;
  }

  /** Which terrain tiles exist (its index file, fetched once); null while it loads, a pass-all without an index. */
  private terrainIndex = new Map<string, Map<number, Set<string>> | "loading" | "failed">();
  private terrainTiles(index: string | undefined): ((z: number, x: number, y: number) => boolean) | null {
    if (!index) return () => true;
    const known = this.terrainIndex.get(index);
    if (known === "failed") return () => false;
    if (known && known !== "loading") return (z, x, y) => known.get(z)?.has(`${x}_${y}`) ?? false;
    if (!known) {
      this.terrainIndex.set(index, "loading");
      fetch(index, { cache: "force-cache" })
        .then((r) => (r.ok ? r.json() as Promise<Record<string, string[]>> : Promise.reject(new Error(String(r.status)))))
        .then((data) => {
          const levels = new Map<number, Set<string>>();
          for (const [z, list] of Object.entries(data)) if (Array.isArray(list)) levels.set(Number(z), new Set(list));
          this.terrainIndex.set(index, levels);
          this.invalidate();
        })
        .catch(() => this.terrainIndex.set(index, "failed"));
    }
    return null;
  }

  private drawFallback(art: MapArt, id: number, z: number, tx: number, ty: number, rect: Box, base: Omit<DrawParams, "rect" | "uv">) {
    const ts = art.tileSize;
    for (let k = 1; k <= z; k++) {
      const pz = z - k;
      const parent = this.tiles.peek(tileUrl(art, id, pz, tx >> k, ty >> k));
      if (!parent || !parent.texture) continue;
      const f = 2 ** k;
      const [lw, lh] = levelSize(art, z);
      // This tile's span inside the coarser tile, in that tile's pixels.
      const px0 = (tx * ts) / f - (tx >> k) * ts, py0 = (ty * ts) / f - (ty >> k) * ts;
      const pw = Math.min(ts, lw - tx * ts) / f, ph = Math.min(ts, lh - ty * ts) / f;
      this.renderer.draw(parent.texture, { ...base, rect, uv: [px0 / parent.width, py0 / parent.height, (px0 + pw) / parent.width, (py0 + ph) / parent.height] });
      return;
    }
  }

  // ---------------------------------------------------------------- input

  private bindInput() {
    const el = this.surface;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (event: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    const local = (event: { clientX: number; clientY: number }): [number, number] => {
      const rect = el.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };

    on("pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      // A press on a marker may still become a drag; the pointer is captured only once it moves,
      // so a plain tap stays a click on the marker.
      const [x, y] = local(event);
      this.pointers.set(event.pointerId, { id: event.pointerId, x, y });
      this.flight = null;
      this.flown = false;
      this.velocity = null;
      this.wheel = null;
      this.startGesture();
      this.invalidate();
    });
    on("pointermove", (event) => {
      const [x, y] = local(event);
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) {
        if (event.pointerType === "mouse") this.updateHover(x, y, event.target as HTMLElement);
        return;
      }
      const before = this.centroid();
      const beforeDistance = this.spread();
      pointer.x = x;
      pointer.y = y;
      const after = this.centroid();
      const g = this.gesture;
      if (!g) return;
      let camera = { ...this.camera, x: this.camera.x - (after[0] - before[0]) / this.camera.scale, y: this.camera.y - (after[1] - before[1]) / this.camera.scale };
      // Pinch: zoom around the fingers' midpoint by the change of their spread (no rotation).
      if (this.pointers.size >= 2 && beforeDistance > 0) {
        camera = zoomAt(camera, this.width, this.height, after[0], after[1], this.spread() / beforeDistance);
      }
      this.camera = this.limit(camera, this.pointers.size >= 2 ? { x: after[0], y: after[1] } : undefined);
      g.moved = Math.max(g.moved, Math.hypot(after[0] - g.start[0], after[1] - g.start[1]));
      if (g.moved > 4 && !el.hasPointerCapture(event.pointerId)) { try { el.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ } }
      g.samples.push({ t: performance.now(), x: after[0], y: after[1] });
      if (g.samples.length > 8) g.samples.shift();
      if (g.moved > 4) this.setHover(null);
      this.invalidate();
    });
    const release = (event: PointerEvent) => {
      if (!this.pointers.has(event.pointerId)) return;
      const g = this.gesture;
      const wasPinch = this.pointers.size > 1;
      this.pointers.delete(event.pointerId);
      if (this.pointers.size > 0) { this.startGesture(); return; }
      this.gesture = null;
      if (!g) return;
      if (g.moved <= 5 && !wasPinch && event.type === "pointerup") {
        const [x, y] = local(event);
        if (!(event.target as HTMLElement).closest("[data-map-ui]")) this.handleTap(x, y, event.pointerType);
      } else if (!this.options.reducedMotion && !wasPinch) {
        // Inertia: the map keeps gliding at the speed of the last ~90 ms of the drag.
        const recent = g.samples.filter((s) => performance.now() - s.t < 90);
        if (recent.length >= 2) {
          const a = recent[0], b = recent[recent.length - 1];
          const dt = Math.max(8, b.t - a.t);
          const v = { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
          if (Math.hypot(v.x, v.y) > 0.15) { this.velocity = { x: clamp(v.x, -4, 4), y: clamp(v.y, -4, 4) }; }
        }
      }
      this.scheduleSettle();
      this.invalidate();
    };
    on("pointerup", release);
    on("pointercancel", release);
    on("pointerleave", (event) => { if (event.pointerType === "mouse" && !this.pointers.size) this.setHover(null); });
    on("wheel", (event) => {
      if ((event.target as HTMLElement).closest("[data-map-ui-scroll]")) return;
      event.preventDefault();
      const [x, y] = local(event);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
      const dy = event.deltaY * unit;
      this.flight = null;
      this.velocity = null;
      const kind = wheelKind(event.deltaMode, event.deltaX, event.deltaY, event.ctrlKey);
      if (kind === "notch" && !this.options.reducedMotion) {
        // A mouse wheel: ~1.32× per notch, eased over the next frames.
        this.wheel = { x, y, log: clamp((this.wheel?.log ?? 0) - clamp(dy, -300, 300) * 0.0028, -2.5, 2.5) };
      } else {
        // Trackpad scroll or pinch: it is already smooth, follow it frame by frame.
        const log = kind === "pinch" ? -clamp(dy, -60, 60) * 0.011 : -clamp(dy, -120, 120) * (kind === "notch" ? 0.0028 : 0.0042);
        this.wheel = null;
        this.camera = this.limit(zoomAt(this.camera, this.width, this.height, x, y, Math.exp(log)), { x, y });
        this.scheduleSettle();
      }
      this.invalidate();
    }, { passive: false });
    on("dblclick", (event) => {
      if ((event.target as HTMLElement).closest("[data-map-ui]")) return;
      event.preventDefault();
      window.clearTimeout(this.clickTimer);
      const [x, y] = local(event);
      this.zoomBy(event.shiftKey ? 0.5 : 2, x, y);
    });
    on("contextmenu", (event) => {
      if ((event.target as HTMLElement).closest("[data-map-ui]")) return;
      event.preventDefault();
      this.up();
    });
    on("keydown", (event) => {
      if ((event.target as HTMLElement) !== el || event.metaKey || event.ctrlKey || event.altKey) return;
      const step = 140;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => this.panBy(-step, 0), ArrowRight: () => this.panBy(step, 0),
        ArrowUp: () => this.panBy(0, -step), ArrowDown: () => this.panBy(0, step),
        "+": () => this.zoomBy(1.6), "=": () => this.zoomBy(1.6), "-": () => this.zoomBy(1 / 1.6), _: () => this.zoomBy(1 / 1.6),
        PageUp: () => this.zoomBy(1.6), PageDown: () => this.zoomBy(1 / 1.6),
        Backspace: () => this.up(),
        Home: () => { const root = [...this.maps.values()].find((m) => m.depth === 0); if (root) this.flyToMap(root.id); },
      };
      const action = keys[event.key];
      if (action) { event.preventDefault(); action(); }
    });
  }

  private startGesture() {
    const mid = this.centroid();
    this.gesture = { distance: this.spread(), mid, moved: this.gesture?.moved ?? 0, start: this.gesture?.start ?? mid, startTime: performance.now(), samples: [{ t: performance.now(), x: mid[0], y: mid[1] }] };
    if (this.pointers.size > 1) this.gesture.moved = 99;
  }

  private centroid(): [number, number] {
    let x = 0, y = 0;
    for (const p of this.pointers.values()) { x += p.x; y += p.y; }
    const n = Math.max(1, this.pointers.size);
    return [x / n, y / n];
  }

  private spread() {
    const list = [...this.pointers.values()];
    return list.length < 2 ? 0 : Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  }

  private handleTap(x: number, y: number, pointerType: string) {
    const now = performance.now();
    // A second tap close by: zoom in there (a touch screen has no double click).
    if (pointerType !== "mouse" && this.lastTap && now - this.lastTap.t < 320 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 36) {
      window.clearTimeout(this.clickTimer);
      this.lastTap = null;
      this.zoomBy(2, x, y);
      return;
    }
    this.lastTap = { t: now, x, y };
    const target = this.drillTarget(x, y);
    window.clearTimeout(this.clickTimer);
    if (!target) { this.events.background(); return; }
    // Wait for a possible double click or tap before flying in.
    this.clickTimer = window.setTimeout(() => this.flyToMap(target.id), pointerType === "mouse" ? 230 : 280);
  }

  private updateHover(x: number, y: number, target: HTMLElement) {
    if (target.closest("[data-map-ui]")) { this.setHover(null); return; }
    this.setHover(this.drillTarget(x, y));
  }

  /** Highlight a child map from outside (its label is hovered). */
  highlight(id: number | null) {
    this.setHover(id === null ? null : this.maps.get(id) ?? null, false);
  }

  private setHover(map: AtlasMap | null, notify = true) {
    const id = map?.id ?? null;
    if (id === this.hoverId) return;
    this.hoverId = id;
    if (notify) {
      this.surface.style.cursor = map ? "pointer" : "";
      this.events.hover(map);
    }
    this.invalidate();
  }
}
