import type { AtlasMap } from "@/lib/wow/worldMap/bundle";
import type { MapArt } from "@/lib/wow/worldMap/types";
import { clamp, contains, easeInOut, fitBox, flightPath, intersects, smoothstep, toAtlas, toScreen, zoomAt, type Box, type Camera } from "./camera";
import { MapRenderer, type DrawParams } from "./gl";
import { blurGroups, blurKey, blurOf, blurRadiusCss, blurRadiusPx, desatOf, dimOf, radiusOfKey, vignetteOf, featherInsetOf, featherOf, layerScale, levelFor, maskFeatherOf, maxScaleOf, rubber, sharpenOf, smoothOf, terrainAlphaOf, upscaleOf } from "./lod";
import { areaAt, areaCentre, loadArea, type Area } from "./area";
import { loadGrade, type Grade } from "./grade";
import { wheelKind } from "./input";
import { FOCUS_FADE, MAX_AHEAD, SLOW_FRAME, TAU_NOTCH, TAU_SMOOTH, ZOOM_DONE, fadeOut, gather, holdFocus, spend, wheelLog } from "./motion";
import { analysePaper } from "./paper";
import { loadTone } from "./tone";
import { decorBoxes, labelBoxes, type ArtBox } from "@/lib/wow/worldMap/painted";
import { chainUp, transferCamera, type MapSet } from "./sets";
import { layerGroups, placeKeys } from "./compose";
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
/** Panels around the map (CSS px); `corner`: a box in the lower right (the overview inset) the fitted map keeps clear of. */
export type Insets = { top: number; right: number; bottom: number; left: number; corner?: { width: number; height: number } };
/**
 * A map in this frame: its art rect on screen and the part of it inside its
 * parents (children may overhang); `upscale` CSS px per art texel; `blur`
 * 0 (in focus) … 1 (a soft backdrop).
 */
export type DrawnMap = {
  map: AtlasMap; alpha: number; screen: Box; clip: Box; upscale: number; blur: number; dim?: number;
  /** How far the zoom has opened it (0..1), whatever it is drawn at: the map in view is drawn whole, yet it hands over by this. */ open?: number;
  /** A neighbour of the map in view: a wider soft edge. */ side?: boolean;
  /** How far out of focus the map under it is drawn. */ under?: number;
  /**
   * Its part in the picture of the map in view: that map itself (whole, crisp, over its own rectangle), a place
   * in it (`child`: one level down, its own land only, never over another child; `inside`: deeper), an ancestor (a calm backdrop without its words) or a neighbour (only its own land, outside the map in view).
   */
  role?: DrawRole;
  /** The map in view magnified past its own detail (0..1): its words give way, it goes out of focus. */
  past?: number;
  /** Ancestor: how far it is a backdrop (0 = its picture, 1 = only the wash); focus: how far it shows whole (its mask off). */
  tone?: number;
};
export type DrawRole = "focus" | "child" | "inside" | "ancestor" | "neighbour";
export type FrameInfo = {
  camera: Camera;
  width: number;
  height: number;
  focus: AtlasMap;
  drawn: DrawnMap[];
  moving: boolean;
  time: number;
  /** How far a continent's terrain covers the middle of the view (0..1): past ~0.6 the painted names are gone under it. */
  ground?: number;
  /** Zoom left (log units) in and out from here: the buttons' state. */
  room?: { in: number; out: number };
};
export type EngineEvents = {
  frame(info: FrameInfo): void;
  focus(chain: AtlasMap[]): void;
  hover(map: AtlasMap | null): void;
  /** The view settled (after a move): good moment to save it in the URL. */
  settle(info: FrameInfo): void;
  background(): void;
  /** The first view is all on screen (every tile it needs is loaded): extras may start now. */
  resident?(): void;
  /** The maps shown changed (an era's picture is in). */
  set?(set: MapSet): void;
};
export type EngineOptions = { alive: boolean; reducedMotion: boolean; insets: Insets };

type Flight = { path: ReturnType<typeof flightPath>; start: number; duration: number; after?: () => void };
type Pointer = { id: number; x: number; y: number };
type TerrainDraw = { map: AtlasMap; alpha: number; clip: Box };
type Patch = { url: string; box: Box };
type ArtStyle = { corner?: number; holes?: Array<[number, number, number, number]>; patches?: Patch[]; alpha: number; light: number; cloud: number; water: number; desat: number; levelScale: number; edge?: number; exists?: (z: number, x: number, y: number) => boolean; maskStrength?: number;
  /** Only its own land: drawn through its mask or not at all (not before the mask is in). */ ownLand?: boolean;
  /** Device-px box under the solid part of the map in view: tiles wholly inside it are neither drawn nor asked for. */ hidden?: Box;
  exclude?: DrawParams["exclude"];
  /** Unsharp at its finest level once magnified past it (the map in view, the terrain). */
  sharp?: boolean;
  grade?: Grade | null;
  /** The holes are where this picture comes in first (the terrain over the painted words it replaces), at this opacity. */
  holeFill?: number;
  /** A flat colour under the picture inside its rect (a terrain's sea). */
  ocean?: string;
  /** A rectangle the terrain gives way over (a map whose era knows no ground there). */
  cut?: DrawParams["exclude"];
};

/** Floors and caves under a place (micro maps, orphan levels like Cleft of Shadow): never opened by zooming over its surface. */
const UNDER: ReadonlySet<string> = new Set(["micro", "orphan"]);
/** A map blended into the one under it by its own-area mask (zones and cities; a top map has nothing under it). */
// Worlds and continents keep their own painted sea (soft edge): their land masks open the sea to the world
// picture under it, whose painted names of those very continents then show twice.
const usesMask = (map: AtlasMap) => Boolean(map.mask) && map.depth > 0 && map.type !== "world" && map.type !== "cosmic" && map.type !== "continent";
const NONE: ReadonlySet<number> = new Set();
/** Where the map in view is solid (device px): its rectangle inside its soft edge. */
const coreOf = (exclude: NonNullable<DrawParams["exclude"]>): Box => {
  const [x0, y0, x1, y1] = exclude.rect, e = exclude.edge[1];
  return [x0 + e, y0 + e, x1 - e, y1 - e];
};
/** The bounding box of `box` without `hole` (null when the hole covers it). */
function outsideOf(box: Box, hole: Box): Box | null {
  const parts: Box[] = [
    [box[0], box[1], Math.min(box[2], hole[0]), box[3]], [Math.max(box[0], hole[2]), box[1], box[2], box[3]],
    [box[0], box[1], box[2], Math.min(box[3], hole[1])], [box[0], Math.max(box[1], hole[3]), box[2], box[3]],
  ].filter((b): b is Box => b[2] > b[0] && b[3] > b[1]);
  if (!parts.length) return null;
  return [Math.min(...parts.map((b) => b[0])), Math.min(...parts.map((b) => b[1])), Math.max(...parts.map((b) => b[2])), Math.max(...parts.map((b) => b[3]))];
}
const FADE_TILE = 150;
type PinMode = "centre" | "contain";
/** How far past its edge a dragged map follows the pointer at most (CSS px, the rubber band's reach). */
const PAN_RUBBER = 64;
/** Least share of the free view a place must fill to become the map in view. */
const MIN_SHARE = 0.2;
const MIN_SHARE_BESIDE = 0.45;
/** The map in view, unchanged this long during a move, is told to the page (ms). */
const FOCUS_TELL = 450;
const FADE_ERA = 900;
/** Longest wait for an era's picture to load before it fades in anyway. */
const ERA_WAIT = 2500;

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
  /** Zoom still to come, eased in frame by frame around a screen point (wheel, buttons, keys, double click). */
  private wheel: { x: number; y: number; log: number; tau: number } | null = null;
  /** The frame before the map in view changed, fading out over the new one. */
  private crossfade: { camera: Camera; start: number; width: number; height: number } | null = null;
  /** The map in view changed while the camera moved: told to the page once it rests (or has stayed a moment). */
  private focusUntold = false;
  private focusSince = 0;
  /**
   * The atlas point the reader zoomed at (under the cursor; the middle for the buttons and keys): the map in view is
   * the one there, also once the zoom rests — until the view is dragged or flown elsewhere.
   */
  private lookAt: [number, number] | null = null;
  /** The way the reader last zoomed (1 in, −1 out; 0 after a drag or a flight): at rest it still counts. */
  private zoomIntent = 0;
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
    // GPU memory for tiles: ~500 tiles of 256² on desktop, ~220 on phones, ~150 on dense (DPR ≥ 2) phones.
    const dense = coarse && (window.devicePixelRatio || 1) >= 2;
    this.tiles = new TileStore(this.renderer.gl, (dense ? 40 : coarse ? 56 : 128) * 1048576, coarse ? 4 : 6);
    this.tiles.onReady = () => this.invalidate();
    this.tiles.mipmap = (key) => key.includes("/maps/terrain/");
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
    const was = this.options.insets;
    this.options = { ...this.options, ...next };
    // Panels that changed size refit a map shown whole; the overview's corner only shapes the next fits
    // (no jump of the view, no second set of tiles right after it loaded).
    const sides = next.insets && (next.insets.top !== was.top || next.insets.right !== was.right || next.insets.bottom !== was.bottom || next.insets.left !== was.left);
    if (home !== null && sides) this.refitHome(home);
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
    this.camera = this.limit(camera, undefined, null);
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
    else {
      // The page's map did not exist then (Boralus before Kul Tiras): its nearest ancestor that did, shown whole —
      // not the empty spot where it would be, nor a neighbour that happens to lie there.
      const missing = home ?? (anchor !== null && !next.maps.has(anchor) ? anchor : null);
      const kept = missing !== null ? chainUp(from, missing).find((id) => next.maps.has(id) && next.maps.get(id)?.art) : undefined;
      if (kept !== undefined) { this.refitHome(kept); this.focusId = kept; }
    }
    // The anchor is the focus until the next frame finds it again.
    if (!next.maps.has(this.focusId)) this.focusId = chain.find((id) => next.maps.has(id)) ?? -1;
    this.fromSet = fade ? from : null;
    this.eraStart = performance.now();
    this.events.set?.(next);
    this.invalidate();
    this.scheduleSettle();
  }

  /**
   * Places that glow on the living map: capitals pulse slowly, portals swirl. Points in their
   * map's 0..1 space; drawn only over a map shown in focus (not out of focus, not while reduced motion).
   */
  setEffects(list: Array<{ map: number; x: number; y: number; kind: "capital" | "portal" }>) {
    this.effects = list.map((e, i) => ({ ...e, phase: ((i * 0.618) % 1) }));
    this.invalidate();
  }
  private effects: Array<{ map: number; x: number; y: number; kind: "capital" | "portal"; phase: number }> = [];

  private drawEffects(drawn: DrawnMap[]) {
    if (!this.alive || !this.effects.length) return;
    const d = this.dpr;
    const shown = new Map<number, DrawnMap>();
    for (const entry of drawn) if (entry.alpha > 0.6 && entry.blur < 0.3) shown.set(entry.map.id, entry);
    for (const fx of this.effects) {
      const entry = shown.get(fx.map);
      if (!entry) continue;
      const [ax, ay] = this.mapPoint(entry.map, fx.x, fx.y);
      const [sx, sy] = this.project(ax, ay);
      if (sx < -60 || sy < -60 || sx > this.width + 60 || sy > this.height + 60) continue;
      const r = (fx.kind === "capital" ? 34 : 15) * d;
      const color: [number, number, number, number] = fx.kind === "capital" ? [1, 0.76, 0.42, fx.phase] : [0.58, 0.62, 1, fx.phase];
      this.renderer.draw(this.renderer.blank, {
        rect: [sx * d - r, sy * d - r, sx * d + r, sy * d + r], uv: [0, 0, 1, 1], alpha: entry.alpha, frame: [0, 0, this.canvas.width, this.canvas.height],
        feather: 0, portal: [0, 0, 0], light: 0, cloud: 0, water: 0, fx: { kind: fx.kind === "capital" ? 1 : 2, color },
      });
    }
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
    // The overview inset in the lower right: shrink the fitted map just enough to clear it on one side.
    const corner = this.options.insets.corner;
    if (corner && corner.width > 0 && corner.height > 0) {
      const w = (box[2] - box[0]) * camera.scale, h = (box[3] - box[1]) * camera.scale;
      const overW = (left + (freeW - w) / 2 + w) - (this.width - right - corner.width);
      const overH = (top + (freeH - h) / 2 + h) - (this.height - bottom - corner.height);
      if (overW > 0 && overH > 0) {
        // Clearing sideways or upwards, whichever costs less of the map's size (never below 85%).
        const k = Math.max(0.85, Math.max((w - 2 * overW) / w, (h - 2 * overH) / h));
        camera = { ...camera, scale: camera.scale * Math.min(1, k) };
      }
    }
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

  /** CSS px per texel of a map's art when it is shown whole (cached per size of the view). */
  private wholeUpscale(set: MapSet, map: AtlasMap) {
    if (!map.art) return 1;
    const key = `${set.key}|${map.id}|${this.width}x${this.height}|${this.options.insets.left},${this.options.insets.right},${this.options.insets.top},${this.options.insets.bottom}`;
    const known = this.wholeCache.get(key);
    if (known !== undefined) return known;
    const box = set.shown.get(map.id) ?? map.frame;
    const fit = this.fit(box, 0.05, this.closerOf(map));
    const value = ((map.frame[2] - map.frame[0]) * fit.scale) / map.art.width;
    if (this.wholeCache.size > 400) this.wholeCache.clear();
    this.wholeCache.set(key, value);
    return value;
  }
  private wholeCache = new Map<string, number>();

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
    this.stretch = null;
    this.recentre = true;
    this.lookAt = null;
    this.zoomIntent = 0;
    this.flight = null;
    this.velocity = null;
    this.wheel = null;
    this.camera = this.limit(camera, undefined, null);
    this.invalidate();
    this.scheduleSettle();
  }

  flyTo(target: Camera, after?: () => void) {
    this.stretch = null;
    this.recentre = true;
    this.lookAt = null;
    this.zoomIntent = 0;
    this.velocity = null;
    this.wheel = null;
    const to = this.limit(target, undefined, null);
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
    this.boundsId = id;
    this.flyTo(camera, after);
    this.home = { id, camera: this.limit(camera, undefined, null) };
  }

  /** Show a map whole at once (a page opening). */
  jumpToMap(id: number) {
    const camera = this.fitMap(id);
    if (!camera) return;
    this.boundsId = id;
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

  /** Zoom by a factor around a screen point (buttons, keys, double click): eased like the wheel, the point held in place. */
  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2) {
    if (this.options.reducedMotion) { this.jumpTo(this.limit(zoomAt(this.camera, this.width, this.height, sx, sy, factor), { x: sx, y: sy })); return; }
    this.flight = null;
    this.velocity = null;
    this.addZoom(Math.log(factor), sx, sy, TAU_NOTCH * 1.15);
  }

  /**
   * Adds zoom to what is still to come around a screen point. The total never runs past the zoom limits
   * (nothing left to spend against a wall) nor more than MAX_AHEAD ahead of the camera.
   */
  private addZoom(log: number, x: number, y: number, tau: number) {
    // Back out of an overshoot first (a wheel turned back at the limit).
    log = this.unwind(log);
    this.boundsId = null;
    this.recentre = false;
    if (!log) { this.markMoving(); this.invalidate(); return; }
    if (log > 0) this.detent = null;
    let wanted = gather(this.wheel?.log ?? 0, log);
    // A mouse wheel zooming out stops once at each level shown whole on the way (the parent of the map in view, then
    // its parent…): a big notch never skips the continent between a zone and the world.
    if (wanted < 0 && tau >= TAU_NOTCH) wanted = Math.max(wanted, this.detentOut(wanted));
    let left = wanted;
    // What the limits allow from here, around this point.
    const far = this.limit(zoomAt(this.camera, this.width, this.height, x, y, Math.exp(left > 0 ? MAX_AHEAD : -MAX_AHEAD)), { x, y });
    const room = Math.log(far.scale / this.camera.scale);
    left = left > 0 ? Math.min(left, Math.max(0, room)) : Math.max(left, Math.min(0, room));
    // Past the limit: the rest is a rubber band (never a hard stop).
    if (Math.abs(wanted) > Math.abs(left) + 1e-4 && Math.abs(room) < MAX_AHEAD - 1e-3) this.pushStretch(Math.min(Math.abs(log), Math.abs(wanted) - Math.abs(left)) * Math.sign(wanted), x, y);
    this.setHover(null);
    this.markMoving();
    if (Math.abs(left) < ZOOM_DONE) { this.wheel = null; return; }
    this.wheel = { x, y, log: left, tau };
    this.lookAt = this.unproject(x, y);
    this.zoomIntent = Math.sign(left);
    this.invalidate();
  }

  /** The map a zoom out stops at, shown whole (see detentOut): it becomes the map shown whole once the zoom rests. */
  private detent: number | null = null;
  /** The log zoom to the next level shown whole on the way out (≤ 0), or −∞ if `log` crosses none. */
  private detentOut(log: number) {
    const s = this.camera.scale, target = s * Math.exp(log);
    for (const id of chainUp(this.set, this.focusId).slice(1)) {
      const map = this.maps.get(id);
      if (!map) continue;
      const fit = this.fit(this.shown.get(id) ?? map.frame, 0.05, this.closerOf(map)).scale;
      // (Already at or past that size: look further up.)
      if (fit >= s * 0.97) continue;
      if (fit <= target * 1.03) return -Infinity;
      // Landing there, that map is the one shown whole — as if flown to (Classic's Kalimdor fills most of its world,
      // yet stopping at its whole size names Kalimdor, not the world).
      this.detent = id;
      return Math.log(fit / s);
    }
    return -Infinity;
  }

  /**
   * The page hides what follows the pointer (the hover name) while the view moves: told at once, in the input
   * event itself, not only on the next frame (no frame shows the name over a view that already moves).
   */
  private markMoving() {
    if (!this.surface.hasAttribute("data-moving")) this.surface.toggleAttribute("data-moving", true);
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
      if (!child || !contains(child.box, ax, ay) || !child.art || UNDER.has(child.type) || this.hiddenIn(this.set).has(id) || !this.inArea(child, ax, ay)) continue;
      const area = (child.box[2] - child.box[0]) * (child.box[3] - child.box[1]);
      if (area < bestArea) { best = child; bestArea = area; }
    }
    return best;
  }

  /** Maps of a set not shown at the moment (another picture of their place stands for them). */
  setHidden(key: string, ids: ReadonlySet<number>) {
    const known = this.hidden.get(key);
    if (known && known.size === ids.size && [...ids].every((id) => known.has(id))) return;
    this.hidden.set(key, ids);
    this.invalidate();
  }
  private hidden = new Map<string, ReadonlySet<number>>();
  private hiddenIn(set: MapSet): ReadonlySet<number> { return this.hidden.get(set.key) ?? NONE; }

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
      uploadMsMax: Math.max(0, ...this.tiles.uploadTimes), uploadMsP95: [...this.tiles.uploadTimes].sort((a, b) => a - b)[Math.floor(this.tiles.uploadTimes.length * 0.95)] ?? 0,
      frames: this.frameCount, idleFrames: this.idleFrames,
      drawn: this.lastInfo?.drawn.length ?? 0, set: this.set.key, pending: Boolean(this.pending),
    };
  }

  /**
   * Probe for checks: the share of the tiles the last frame drew that were loaded (painted maps and terrain), and
   * the finest picture at the middle of the view with its magnification (CSS px per texel).
   */
  coverage() {
    const focus = this.focus;
    const ground = this.lastInfo?.ground ?? 0;
    const t = this.terrain.find((entry) => entry.alpha >= 0.9)?.map.terrain;
    const detail = ground >= 0.9 && t
      ? { source: "terrain", upscale: ((t.frame[2] - t.frame[0]) * this.camera.scale) / t.art.width }
      : focus?.art ? { source: "art", upscale: ((focus.frame[2] - focus.frame[0]) * this.camera.scale) / focus.art.width } : null;
    return { tiles: this.drawnTiles[1] ? this.drawnTiles[0] / this.drawnTiles[1] : 1, drawn: this.drawnTiles[1], detail };
  }
  /** Tiles the last frame drew: [loaded, needed] (a tile still loading is drawn from a coarser one meanwhile). */
  private drawnTiles: [number, number] = [0, 0];
  private countTiles: [number, number] = [0, 0];

  resetStats() { this.intervals = []; this.tiles.uploadTimes = []; this.frameCount = 0; this.idleFrames = 0; }
  /** Frames drawn, and rAF callbacks that drew nothing (the living layers' 30 fps gate). */
  private frameCount = 0;
  private idleFrames = 0;

  // ---------------------------------------------------------------- loop

  private applyDpr() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  private get alive() { return this.options.alive && !this.options.reducedMotion; }

  private get moving() { return Boolean(this.flight || this.velocity || this.wheel || this.pointers.size || this.stretch || this.springing); }
  /** The view springs back inside its pin this frame. */
  private springing = false;

  private tick(now: number) {
    this.raf = 0;
    if (this.disposed || this.lost) return;
    // (Up to a quarter second: on a slow device the eased zoom still takes its own time, not many times longer.)
    const dt = Math.min(250, now - (this.lastFrame || now));
    this.frameDt = dt;
    const animating = Boolean(this.moving || this.pending || this.crossfade || (this.fromSet && now - this.eraStart < FADE_ERA));
    if (!this.visible || document.hidden) { this.lastFrame = now; return; }
    // The living layers alone run at ~30 fps; interaction at full rate.
    if (!animating && !this.dirty && this.alive && now - this.lastFrame < 31) { this.idleFrames += 1; this.raf = requestAnimationFrame((t) => this.tick(t)); return; }
    // Still camera, tiles arriving: draw at ~15 fps, not on every tile — each frame would take the main thread
    // from the loads themselves (slow devices load the first view faster this way).
    if (!animating && this.tiles.pending > 0 && now - this.lastFrame < 66) { this.idleFrames += 1; this.raf = requestAnimationFrame((t) => this.tick(t)); return; }
    this.frameCount += 1;
    if (this.moving && this.lastFrame && now - this.lastFrame < 200) {
      this.intervals.push(now - this.lastFrame);
      if (this.intervals.length > 600) this.intervals.splice(0, this.intervals.length - 600);
    }
    this.lastFrame = now;
    const before = this.camera;
    this.step(now, dt);
    // The page hides what follows the pointer (the hover name) while the view moves, on this very frame — also on
    // the frame where a move ends (the camera still changed in it).
    const moving = this.moving || this.camera.scale !== before.scale || this.camera.x !== before.x || this.camera.y !== before.y;
    if (moving !== this.surface.hasAttribute("data-moving")) this.surface.toggleAttribute("data-moving", moving);
    const t0 = performance.now();
    // Decoded tiles go to the GPU within a budget per frame: a burst never stalls one frame.
    this.tiles.moving = this.moving;
    this.tiles.flushUploads(this.moving ? 3 : Infinity);
    const z0 = this.lastScale;
    this.zoomDir = z0 <= 0 ? 0 : this.camera.scale > z0 * 1.002 ? 1 : this.camera.scale < z0 * 0.998 ? -1 : 0;
    this.lastScale = this.camera.scale;
    // (The rubber band's overshoot is only drawn: the camera itself stays at the limit. Not while an era waits:
    // its switch moves the camera itself.)
    if (this.stretch && !this.pending) this.withCamera(this.drawnCamera(), () => this.render(now));
    else this.render(now);
    this.measure(performance.now() - t0);
    this.dirty = false;
    if (!this.residentOnce && this.tiles.loadedCount > 0 && this.tiles.pending === 0 && !this.pending) { this.residentOnce = true; this.events.resident?.(); }
    // (A few frames more after a move: the map in view is settled by the rules of a resting view, at once.)
    if (this.moving) this.movedAt = now;
    const keep = this.moving || this.recompose || now - this.movedAt < 400 || this.alive || this.pending || this.tiles.pending > 0 || this.fading(now) || this.crossfade || this.focusUntold || (this.fromSet && now - this.eraStart < FADE_ERA);
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

  /** Why the map in view is what it is (for checks, `?debug`). */
  private focusWhy: Record<string, unknown> = {};
  private fadingUntil = 0;
  private movedAt = 0;
  private frameDt = 16;
  private recompose = false;
  private residentOnce = false;
  /** The camera's zoom direction this frame (1 in, -1 out, 0 still): the next level is asked for ahead of it. */
  private zoomDir = 0;
  private lastScale = 0;

  private fading(now: number) { return now < this.fadingUntil; }

  private step(now: number, dt: number) {
    if (this.flight) {
      const t = clamp((now - this.flight.start) / this.flight.duration, 0, 1);
      this.camera = this.flight.path.at(easeInOut(t));
      if (t >= 1) {
        const after = this.flight.after;
        this.flight = null;
        this.camera = this.limit(this.camera, undefined, null);
        after?.();
        this.scheduleSettle();
      }
    }
    if (this.wheel) {
      // Eased zoom: what is left is spent exponentially (the same at any frame rate), the point under the cursor stays put.
      const [log, left] = spend(this.wheel.log, dt, this.wheel.tau);
      this.camera = this.limit(zoomAt(this.camera, this.width, this.height, this.wheel.x, this.wheel.y, Math.exp(log)), this.wheel);
      this.wheel.log = left;
      if (Math.abs(left) < ZOOM_DONE) {
        this.wheel = null;
        const id = this.detent;
        this.detent = null;
        if (id !== null) {
          const map = this.maps.get(id);
          const fit = map ? this.fit(this.shown.get(id) ?? map.frame, 0.05, this.closerOf(map)).scale : 0;
          if (fit && Math.abs(this.camera.scale / fit - 1) < 0.02) this.home = { id, camera: { ...this.camera } };
        }
        this.scheduleSettle();
      }
    }
    if (this.stretch && !this.pointers.size && (!this.wheel || Math.sign(this.wheel.log) !== Math.sign(this.stretch.log)) && now - this.stretch.at > 90) {
      // The rubber band springs back once the input stops (~0.12 s time constant).
      this.stretch.log *= Math.exp(-dt / 120);
      if (Math.abs(this.stretch.log) < 0.003) { this.stretch = null; this.scheduleSettle(); }
    }
    this.springing = this.springBack(dt, now);
    if (this.velocity) {
      const free = { ...this.camera, x: this.camera.x - (this.velocity.x * dt) / this.camera.scale, y: this.camera.y - (this.velocity.y * dt) / this.camera.scale };
      this.camera = this.limit(free, undefined, this.camera, "centre");
      // The glide stops at the edge of the map (no sliding along a wall into the void).
      if (Math.abs(this.camera.x - free.x) * this.camera.scale > 0.01) this.velocity = { ...this.velocity, x: 0 };
      if (Math.abs(this.camera.y - free.y) * this.camera.scale > 0.01) this.velocity = { ...this.velocity, y: 0 };
      // Glide like a native map: a long, soft stop (~0.4 s time constant).
      const decay = Math.exp(-dt / 400);
      this.velocity = { x: this.velocity.x * decay, y: this.velocity.y * decay };
      if (Math.hypot(this.velocity.x, this.velocity.y) < 0.02) { this.velocity = null; this.scheduleSettle(); }
    }
  }

  /** At rest off its pin (a drag past the edge, a place newly in view): the view springs inside (~0.07 s time constant). Returns whether it moved. */
  private springBack(dt: number, now: number) {
    if (!this.pointers.size && !this.velocity) this.pinFrozen = null;
    // (Not on the frame the map in view has just changed: only once it has stayed a moment — never a pull towards a
    // map that was in view for a frame.)
    if (this.flight || this.wheel || this.pointers.size || this.pending || now - this.focusSince < 100) return false;
    const off = this.pinOff(this.camera);
    if (!off || (!off.x && !off.y)) return false;
    const k = this.options.reducedMotion ? 1 : 1 - Math.exp(-dt / 55);
    const px = Math.hypot(off.x, off.y) * this.camera.scale;
    this.camera = px < 1 ? { ...this.camera, x: this.camera.x - off.x, y: this.camera.y - off.y } : { ...this.camera, x: this.camera.x - off.x * k, y: this.camera.y - off.y * k };
    if (px < 1) this.scheduleSettle();
    return true;
  }

  private scheduleSettle() {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      if (!this.lastInfo || this.disposed) return;
      if (this.moving) { this.scheduleSettle(); return; }
      this.events.settle(this.lastInfo);
      // (The name under the pointer comes back when the pointer moves, not by itself under a resting one: after a
      // wheel zoom a zone's name would otherwise pop up over the map the reader just zoomed to.)
    }, 260);
  }

  private rootAt(x: number, y: number) {
    for (const map of this.maps.values()) if (map.depth === 0 && contains([map.box[0] - 1, map.box[1] - 1, map.box[2] + 1, map.box[3] + 1], x, y)) return map.id;
    return -1;
  }

  /**
   * Zoom limits at a camera: from a whole top map (out) down to 1.6× the native size of the most detailed painted
   * map under the point (in) — or twice the native texel density of a continent's terrain there.
   */
  private bounds(camera: Camera, anchor?: { x: number; y: number }) {
    const root = this.maps.get(this.rootAt(camera.x, camera.y)) ?? this.maps.values().next().value;
    if (!root) return null;
    // Out to the top map shown whole on the stage (contained, panels left free) — never smaller, in a void.
    const min = this.fit(root.frame, 0.02, 1).scale;
    // The most detailed picture under the centre sets the limit (a small coarse sub-zone overlapping a city must not).
    let max = 0;
    let terrain: AtlasMap["terrain"] | undefined;
    // Zooming at a point (the cursor), the place under it sets the limit (not the view's middle: over the sea beside
    // an island the world map would otherwise be blown up past its detail on the way).
    const at = anchor ? toAtlas(camera, this.width, this.height, anchor.x, anchor.y) : null;
    const under = (box: Box) => (at !== null ? contains(box, at[0], at[1]) : contains(box, camera.x, camera.y));
    // The pictures that may set it: the map in view and the places inside it — not its ancestors, shown only as a
    // backdrop (Outland's own picture is finer than Nagrand's: it must not let Nagrand be blown up past its detail).
    const focus = this.maps.get(this.focusId);
    const above = focus ? new Set(chainUp(this.set, focus.id).filter((id) => id !== focus.id)) : null;
    let blocked = false;
    for (const map of this.maps.values()) {
      if (map.noTerrain && under(map.frame)) blocked = true;
      // (The map in view counts wherever the middle is: it may be zoomed to its own limit.)
      if (!map.art || UNDER.has(map.type) || (!under(map.frame) && map.id !== this.focusId)) continue;
      if (map.terrain && under(map.terrain.frame) && (!terrain || map.terrain.art.width / (map.terrain.frame[2] - map.terrain.frame[0]) > terrain.art.width / (terrain.frame[2] - terrain.frame[0]))) terrain = map.terrain;
      if (above?.has(map.id)) continue;
      max = Math.max(max, maxScaleOf(map.art, map.frame[2] - map.frame[0]));
    }
    // (Only where the ground has a tile: over its open sea the painted map's own limit holds; nor over a map whose
    // era knows no ground there — a phase.)
    if (terrain && !blocked && this.groundAt(terrain, at ?? [camera.x, camera.y])) max = Math.max(max, maxScaleOf({ width: 0 }, 1, terrain));
    if (!max) max = min * 100;
    return { root, min, max: Math.max(min, max) };
  }

  /** Whether a terrain has a tile (of its finest level) at an atlas point; true while its index loads. */
  private groundAt(terrain: NonNullable<AtlasMap["terrain"]>, [x, y]: [number, number] | number[]) {
    const exists = this.terrainTiles(terrain);
    if (!exists) return true;
    const f = terrain.frame, art = terrain.art;
    const tx = Math.floor(((x - f[0]) / (f[2] - f[0])) * art.width / art.tileSize), ty = Math.floor(((y - f[1]) / (f[3] - f[1])) * art.height / art.tileSize);
    return exists(art.maxZoom, tx, ty);
  }

  /**
   * Zoom limits, then the pin: the map in view never drifts off the stage. `against`: the camera before this step —
   * a move may not leave the map further off its bounds than it already was (null: put it inside at once, for flights
   * and jumps). Once the input stops, the view springs back inside (step()).
   */
  private limit(camera: Camera, anchor?: { x: number; y: number }, against: Camera | null = this.camera, mode: PinMode = against ? "contain" : "centre"): Camera {
    const b = this.bounds(camera, anchor);
    if (!b) return camera;
    const { min, max } = b;
    // A move that does not zoom never changes the zoom either (panning at the deepest zoom off the ground's tiles onto
    // open sea, or onto a map that allows less): the next zoom in simply has no room there.
    const panOnly = against !== null && Math.abs(camera.scale / against.scale - 1) < 1e-9;
    const scale = panOnly ? Math.max(min, camera.scale) : clamp(camera.scale, min, max);
    let next = { ...camera, scale };
    if (anchor && scale !== camera.scale) {
      // Clamped zoom: keep the point under the cursor in place.
      const [ax, ay] = toAtlas(camera, this.width, this.height, anchor.x, anchor.y);
      next = { scale, x: ax - (anchor.x - this.width / 2) / scale, y: ay - (anchor.y - this.height / 2) / scale };
    }
    return this.pin(next, against, mode);
  }

  /**
   * Where the camera's centre may be (per axis, atlas units), like the game's own map: on each axis, the deepest map on
   * the way to the one in view that is shown at least ~85% of its whole size (or fills 85% of the free stage there)
   * must keep covering the stage — or, if it is smaller, stay centred on it; with none, the top map stays centred.
   * (A place only just opening inside the map in view does not yet pin the view: no jump towards it.)
   */
  private pinRange(camera: Camera, mode: PinMode): { x: [number, number]; y: [number, number] } | null {
    let ids = this.pinFrozen ?? chainUp(this.set, this.boundsId !== null && this.maps.has(this.boundsId) ? this.boundsId : this.focusId);
    // Deep in, over a continent's terrain, the world is one: the view pans freely across the continent's ground (the
    // map in view follows by the usual rules, the zoom stays); the continent's own bounds pin it.
    if ((this.lastInfo?.ground ?? 0) >= 0.6) {
      const at = ids.findIndex((id) => this.maps.get(id)?.terrain);
      if (at > 0) ids = ids.slice(at);
    }
    if (!ids.length) return null;
    const { top, right, bottom, left } = this.options.insets;
    const s = camera.scale;
    const axis = (lo0: 0 | 1, near: number, far: number, size: number): [number, number] => {
      const free = Math.max(1, size - near - far);
      let box: Box | null = null;
      for (const id of ids) {
        const map = this.maps.get(id);
        if (!map) continue;
        const f = this.shown.get(id) ?? map.frame;
        box = f;
        const extent = f[lo0 + 2] - f[lo0];
        if (extent * s >= free * 0.85 || s >= this.fit(f, 0.05, this.closerOf(map)).scale * 0.85) break;
      }
      const f = box as Box;
      const lo = f[lo0] + (size / 2 - near) / s, hi = f[lo0 + 2] - (size / 2 - far) / s;
      if (lo <= hi) return [lo, hi];
      // Smaller than the stage there: wholly inside it while zooming (the cursor's point holds until the map meets
      // the stage's edge); centred after a drag and for a flight's landing.
      if (mode === "contain") return [hi, lo];
      const c = (f[lo0] + f[lo0 + 2]) / 2 - (near - far) / 2 / s;
      return [c, c];
    };
    return { x: axis(0, left, right, this.width), y: axis(1, top, bottom, this.height) };
  }

  /** How far (atlas units, signed) a camera is off its pin on each axis. */
  private pinOff(camera: Camera, mode: PinMode = this.recentre ? "centre" : "contain") {
    const r = this.pinRange(camera, mode);
    if (!r) return null;
    const off = (v: number, [lo, hi]: [number, number]) => (v < lo ? v - lo : v > hi ? v - hi : 0);
    return { x: off(camera.x, r.x), y: off(camera.y, r.y), r };
  }

  private pin(camera: Camera, against: Camera | null, mode: PinMode): Camera {
    const now = this.pinOff(camera, mode);
    if (!now) return camera;
    const was = against ? this.pinOff(against, mode) : null;
    const next = { ...camera };
    for (const k of ["x", "y"] as const) {
      const v = now[k];
      if (!v) continue;
      // The view may stay as far off as it already was (in screen px), never further.
      const allowed = was ? Math.abs(was[k]) * (against as Camera).scale : 0;
      if (Math.abs(v) * camera.scale <= allowed + 0.5) continue;
      next[k] = (v > 0 ? now.r[k][1] : now.r[k][0]) + Math.sign(v) * allowed / camera.scale;
    }
    return next;
  }

  /** The last move was a drag or a flight (the map smaller than the stage centres again), not a zoom (it stays where the zoom left it, inside the stage). */
  private recentre = true;
  /** The map whose place a flight or a jump heads for: it pins the view until the reader moves on (else the map in view). */
  private boundsId: number | null = null;
  /** The maps that pin the view while a gesture and its glide last (the map in view may change under them meanwhile). */
  private pinFrozen: number[] | null = null;
  /** A drag: where the pointer would have taken the camera, and the camera when it started. */
  private dragRaw: Camera | null = null;
  private dragBase: Camera | null = null;

  /** How much more the view can zoom in and out from here (log units, at the middle of the view): for the buttons. */
  zoomRoom(at?: { x: number; y: number }) {
    const b = this.bounds(this.camera, at);
    if (!b) return { in: 0, out: 0 };
    return { in: Math.max(0, Math.log(b.max / this.camera.scale)), out: Math.max(0, Math.log(this.camera.scale / b.min)) };
  }

  /**
   * Zoom asked for past a limit: a rubber band. `log` (raw, signed) gathers here and shows as a small, ever harder
   * overshoot around the point zoomed at; it springs back once the input stops. Zoom the other way first unwinds it.
   */
  private stretch: { log: number; x: number; y: number; at: number } | null = null;
  /** Spends zoom the other way on an overshoot first; returns what is left for the camera. */
  private unwind(log: number) {
    const st = this.stretch;
    if (!st || !log || Math.sign(log) === Math.sign(st.log)) return log;
    const use = Math.sign(log) * Math.min(Math.abs(log), Math.abs(st.log));
    st.log += use;
    st.at = performance.now();
    if (Math.abs(st.log) < 1e-4) this.stretch = null;
    return log - use;
  }
  private pushStretch(excess: number, x: number, y: number) {
    if (this.options.reducedMotion || Math.abs(excess) < 1e-4) return;
    const log = clamp((this.stretch?.log ?? 0) + excess, -0.6, 0.6);
    this.stretch = { log, x, y, at: performance.now() };
    this.invalidate();
  }
  /** The camera as drawn: the real one, zoomed by the rubber band's overshoot around its point. */
  private drawnCamera(): Camera {
    const st = this.stretch;
    return st ? zoomAt(this.camera, this.width, this.height, st.x, st.y, Math.exp(rubber(st.log))) : this.camera;
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
    // The map in view (the page's map, or the last frame's focus): it alone shows over its rectangle.
    const fid = homeLock !== null && set.maps.has(homeLock) ? homeLock : set.maps.has(this.focusId) ? this.focusId : null;
    const chainIds = fid !== null ? chainUp(set, fid) : [];
    const onChain = new Set(chainIds);
    const within = fid !== null ? this.subtreeOf(set, fid) : new Set<number>();
    const roleOf = (id: number): DrawRole | undefined => (fid === null ? undefined : id === fid ? "focus"
      : within.has(id) ? (set.maps.get(id)?.parent === fid ? "child" : "inside") : onChain.has(id) ? "ancestor" : "neighbour");
    const hidden = this.hiddenIn(set);
    /** `natural`: how far the zoom has opened it, whatever it is drawn at (a neighbour shows whole around the map in view, yet is not "open"). */
    const visit = (map: AtlasMap, alpha: number, parentClip: Box | null, side = false, under = 0, natural = alpha) => {
      const art = map.art;
      if (!art) return;
      // Another picture of its place stands for it now (unless the reader is on its way to it).
      if (hidden.has(map.id) && !onChain.has(map.id)) return;
      const role = roleOf(map.id);
      const [x0, y0] = this.project(map.frame[0], map.frame[1]);
      const [x1, y1] = this.project(map.frame[2], map.frame[3]);
      const screen: Box = [x0, y0, x1, y1];
      const clip: Box = parentClip && !map.portal
        ? [Math.max(x0, parentClip[0]), Math.max(y0, parentClip[1]), Math.min(x1, parentClip[2]), Math.min(y1, parentClip[3])]
        : screen;
      if (clip[2] <= clip[0] || clip[3] <= clip[1] || !intersects(clip, view)) return;
      const upscale = upscaleOf(x1 - x0, art);
      // The map in view is always crisp, and whole: never half see-through over the backdrop while the zoom hands
      // over to another level (the change of the map in view cross-fades the whole picture instead).
      const open = natural;
      if (role === "focus" && !map.portal) alpha = 1;
      const entry: DrawnMap = { map, alpha, open, screen, clip, upscale, blur: role === "focus" ? 0 : blurOf(upscale), ...(side ? { side } : {}), ...(under ? { under } : {}), ...(role ? { role } : {}) };
      if (role === "focus") {
        entry.tone = smoothstep(0.5, 0.9, alpha);
        // The map in view magnified past its own detail on the way into one of its places (a fast zoom, before the
        // hand-over): its painted words give way and it goes softly out of focus — never shown blown up and sharp.
        const whole = this.wholeUpscale(set, map);
        const past = smoothstep(Math.max(1.7, whole * 1.3), Math.max(2.3, whole * 1.75), upscale);
        if (past > 0) { entry.past = past; entry.blur = blurOf(upscale) * past; }
      }
      out.push(entry);
      // A neighbour shows its own land only: the places inside it are not opened (no picture over another).
      if (role === "neighbour") return;
      const density = ((x1 - x0) * this.dpr) / art.width;
      // Most of this map in view: the reader looks at it, not into one of its children
      // (Classic's continents fill most of its world map, yet the world map is what shows).
      const iw = Math.max(0, Math.min(clip[2], this.width) - Math.max(clip[0], 0)), ih = Math.max(0, Math.min(clip[3], this.height) - Math.max(clip[1], 0));
      const shownFrac = (iw * ih) / Math.max(1, (clip[2] - clip[0]) * (clip[3] - clip[1]));
      const lookingAtParent = smoothstep(0.65, 0.85, shownFrac);
      // Magnified past its own detail, a map hands over to the places in it, whatever their size in the view:
      // never a map shown blown up with its painted words while its children wait (relative to its size shown
      // whole: on a wide screen a whole map may already be a little magnified).
      const wholeUp = this.wholeUpscale(set, map);
      const overDetail = smoothstep(Math.max(1.3, wholeUp * 1.15), Math.max(1.75, wholeUp * 1.55), upscale);
      let portalOpen = 0;
      const mx = this.width / 2, my = this.height / 2;
      const opened: Array<{ child: AtlasMap; a: number; n?: number; area: number; fill: number; centre: boolean; box: Box }> = [];
      for (const id of map.children) {
        const child = set.maps.get(id);
        // Floors and caves under a place (Cleft of Shadow under Orgrimmar) are not part of its surface.
        if (!child?.art || UNDER.has(child.type) || (hidden.has(id) && !onChain.has(id))) continue;
        const [cx0, cy0] = this.project(child.frame[0], child.frame[1]);
        const [cx1, cy1] = this.project(child.frame[2], child.frame[3]);
        if (child.portal) {
          let a = smoothstep(0.34, 0.8, Math.min(cx1 - cx0, cy1 - cy0) / minDim);
          // Only the world the camera heads for opens; its neighbours on the Cosmic map stay planets.
          const gap = Math.hypot(Math.max(cx0 - mx, 0, mx - cx1), Math.max(cy0 - my, 0, my - cy1));
          a *= 1 - smoothstep(0.05, 0.3, gap / Math.max(1, Math.min(cx1 - cx0, cy1 - cy0)));
          // The world shown whole on purpose (its page) is open, whatever its size in the view.
          if (homeLock === child.id) a = 1;
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
          : Math.max(Math.min(smoothstep(0.6 / this.quality, 1.05 / this.quality, density), smoothstep(0.22, 0.45, fill)), smoothstep(0.5, 0.85, fill), overDetail) * (1 - lookingAtParent * (1 - overDetail));
        opened.push({ child, a, area: (cx1 - cx0) * (cy1 - cy0), fill, centre: vx0 <= mx && mx <= vx1 && vy0 <= my && my <= vy1, box: [cx0, cy0, cx1, cy1] });
      }
      if (role === "ancestor") {
        // An ancestor of the map in view turns into a backdrop as the way down to it opens; then the land around
        // comes from its other children (the neighbours), each its own land, instead of its own picture.
        const next = opened.find((entry) => onChain.has(entry.child.id));
        // A world opening from the Cosmic map: the starry sheet is a backdrop as soon as the portal is half open.
        // Any other ancestor is only its calm wash: never its picture blown up with its painted words.
        const tone = !next ? 1 : next.child.portal ? smoothstep(0.1, 0.5, alpha * next.a) : 1;
        entry.tone = tone;
        for (const entry of opened) {
          if (entry.child.portal || onChain.has(entry.child.id)) continue;
          // Strictly its own land: a neighbour without a mask is left out (the backdrop shows there).
          if (!entry.child.mask) { entry.a = 0; entry.n = 0; continue; }
          // Other continents and worlds stay in the backdrop (the world's calm wash) until the view all but frames
          // them: no half-seen continent with its big painted title cut by the view's edge.
          if (entry.child.type === "continent" || entry.child.type === "world") { entry.n = entry.a; if (entry.a < 0.6) entry.a = 0; continue; }
          entry.n = entry.a;
          entry.a = Math.max(entry.a, tone);
        }
      }
      // The way down to the map in view always stays (barely open, it still leads to the map drawn whole).
      for (let i = opened.length - 1; i >= 0; i--) {
        if (opened[i].a > 0.003) continue;
        if (onChain.has(opened[i].child.id) && !opened[i].child.portal) { opened[i].n = opened[i].n ?? opened[i].a; opened[i].a = 0.004; } else opened.splice(i, 1);
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
        // A place inside the framed map is much smaller than it (a city in its zone); an overlapping
        // neighbour of about its size (Pandaria by Khaz Algar) is not.
        if (!best || entry === best || entry.area >= best.area * 0.25) return false;
        // Mostly over the framed map (a city on the edge of its zone counts).
        const b = best.box, e = entry.box;
        const ow = Math.min(b[2], e[2]) - Math.max(b[0], e[0]), oh = Math.min(b[3], e[3]) - Math.max(b[1], e[1]);
        return ow > 0 && oh > 0 && (ow * oh) / Math.max(1, entry.area) >= 0.3;
      };
      const rank = (entry: (typeof opened)[number]) => (entry === best ? 1 : inside(entry) ? 2 : 0);
      opened.sort((p, q) => rank(p) - rank(q) || q.area - p.area);
      for (const opening of opened) visit(opening.child, alpha * opening.a, clip, Boolean(best) && rank(opening) === 0, entry.blur, open * (opening.n ?? opening.a));
      // A world opened from the Cosmic map: the starry parchment around it falls back.
      if (portalOpen > 0) entry.alpha = alpha * (1 - 0.8 * portalOpen);
    };
    for (const map of set.maps.values()) if (map.depth === 0) visit(map, 1, null);
    // Two pictures of one place (phases, variants): only the one on the way to the map in view, or the first.
    if (fid !== null) {
      const seen = new Map<string, number>();
      for (const id of chainIds) for (const key of placeKeys(set.maps.get(id))) seen.set(key, id);
      for (let i = 0; i < out.length; i++) {
        const entry = out[i];
        if (onChain.has(entry.map.id) || within.has(entry.map.id) || entry.map.depth === 0) continue;
        const keys = placeKeys(entry.map);
        if (keys.some((key) => seen.has(key) && seen.get(key) !== entry.map.id)) { out.splice(i, 1); i -= 1; continue; }
        for (const key of keys) seen.set(key, entry.map.id);
      }
    }
    // Under the solid part of the map in view nothing else shows: a neighbour is cut to what lies outside it
    // (no tiles asked for under it), and one wholly under it is not drawn at all.
    const held = out.find((entry) => entry.role === "focus");
    if (held && held.alpha >= 0.999 && (held.tone ?? 0) >= 0.999 && held.map.depth > 0) {
      const w = held.screen[2] - held.screen[0], h = held.screen[3] - held.screen[1];
      const ramp = featherOf(w * this.dpr, h * this.dpr, this.dpr) / this.dpr;
      const core: Box = [held.clip[0] + ramp, held.clip[1] + ramp, held.clip[2] - ramp, held.clip[3] - ramp];
      for (let i = out.length - 1; i >= 0; i--) {
        const entry = out[i];
        if (entry.role !== "neighbour" || core[2] <= core[0] || core[3] <= core[1]) continue;
        const outside = outsideOf(entry.clip, core);
        // A sliver beside it is left to the backdrop (not worth its mask and tiles).
        const seen = outside ? Math.max(0, Math.min(outside[2], this.width) - Math.max(outside[0], 0)) * Math.max(0, Math.min(outside[3], this.height) - Math.max(outside[1], 0)) : 0;
        if (!outside || seen < this.width * this.height * 0.03) out.splice(i, 1);
        else entry.clip = outside;
      }
    }
    // A settled map whose solid part covers the whole view hides everything drawn before it.
    for (let i = out.length - 1; i > 0; i--) {
      const entry = out[i];
      const masked = entry.role === "focus" ? (entry.tone ?? 0) < 0.995 && usesMask(entry.map) : usesMask(entry.map);
      // (Only once it has something to show: a map whose smallest level is not in yet hides nothing.)
      // (Nor a map in view whose painted words give way, magnified past its detail: the backdrop shows through there.)
      if (entry.alpha < 0.995 || entry.map.portal || masked || entry.role === "neighbour" || (entry.past ?? 0) > 0.2 || !this.artReady(entry.map)) continue;
      const devW = (entry.screen[2] - entry.screen[0]) * this.dpr, devH = (entry.screen[3] - entry.screen[1]) * this.dpr;
      const f = entry.map.depth === 0 ? 0 : featherOf(devW, devH, this.dpr) / this.dpr;
      // (The map in view's corner pieces fade out — corner 0.2 of its smaller side, up to 1.25× that from the corner:
      // a view that takes in one of its corners is not covered there.)
      const r = entry.role === "focus" && entry.map.depth > 0 ? 0.25 * Math.min(entry.screen[2] - entry.screen[0], entry.screen[3] - entry.screen[1]) : 0;
      const cornerSeen = r > 0 && [[entry.screen[0], entry.screen[1]], [entry.screen[2], entry.screen[1]], [entry.screen[0], entry.screen[3]], [entry.screen[2], entry.screen[3]]]
        .some(([x, y]) => intersects([Math.min(x, x + (x === entry.screen[0] ? r : -r)), Math.min(y, y + (y === entry.screen[1] ? r : -r)), Math.max(x, x + (x === entry.screen[0] ? r : -r)), Math.max(y, y + (y === entry.screen[1] ? r : -r))], [0, 0, this.width, this.height]));
      if (!cornerSeen && entry.clip[0] + f <= 0 && entry.clip[1] + f <= 0 && entry.clip[2] - f >= this.width && entry.clip[3] - f >= this.height) {
        const shown: DrawnMap[] & { all?: DrawnMap[] } = out.slice(i);
        // The hidden ones still carry the continent's terrain over everything.
        shown.all = out;
        return shown;
      }
    }
    return out;
  }

  /** Terrain over its continent once the finest painted map at the centre runs out of detail. */
  private collectTerrain(list: DrawnMap[], set: MapSet, now: number): TerrainDraw[] {
    const out: TerrainDraw[] = [];
    const seen = new Set<string>();
    const cx = this.width / 2, cy = this.height / 2;
    for (const entry of list) {
      const terrain = entry.map.terrain;
      // Only the ground under the way to the map in view: a neighbour's would lie over that map.
      if (!terrain || entry.role === "neighbour" || this.gradePending(entry.map)) continue;
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
      const more = smoothstep(1.05, 1.5, finest / Math.max(1e-6, ground)) * entry.alpha;
      // A map of the set whose era knows no ground there (a phase) under the middle of the view: no terrain at all.
      const target = this.groundless(set, cx, cy) ? 0 : terrainAlphaOf(finest) * more;
      const clip: Box = [Math.max(x0, entry.clip[0]), Math.max(y0, entry.clip[1]), Math.min(x1, entry.clip[2]), Math.min(y1, entry.clip[3])];
      const key = `${set.key}:${entry.map.id}`;
      seen.add(key);
      const shown = this.groundShown.get(key) ?? 0;
      // Its tiles are asked for a little before the hand-over begins (so it rarely waits), at the level it will need.
      const soon = terrainAlphaOf(finest * 1.3) * more;
      let ready = 0;
      if ((soon > 0.003 || target > 0.003) && clip[2] > clip[0] && clip[3] > clip[1]) {
        const exists = this.terrainTiles(terrain);
        if (exists) {
          // (A tile still loading counts once a coarser level of it is in: it is drawn from that meanwhile, never a hole.)
          const [, t, c] = this.drawArt(entry.map, terrain.art, [x0, y0, x1, y1], clip, { alpha: 0, light: 0, cloud: 0, water: 0, desat: 0, levelScale: 1, exists }, now, this.moving, true, "t");
          ready = t ? c / t : 1;
        }
      }
      // It comes in only over tiles that are there or drawn from a coarser level (never squares of empty ground), and at most over
      // ~0.16 s (a jump straight in fades rather than flashes); going out it follows the zoom at once.
      const alpha = target <= shown ? target : ready >= 0.9 || this.options.reducedMotion ? Math.min(target, this.options.reducedMotion ? 1 : shown + this.frameDt / 160) : shown;
      this.groundShown.set(key, alpha);
      if (alpha > shown + 1e-4 && alpha < target) this.fadingUntil = Math.max(this.fadingUntil, now + 32);
      if (alpha <= 0.003) continue;
      if (clip[2] > clip[0] && clip[3] > clip[1]) out.push({ map: entry.map, alpha, clip });
    }
    for (const key of this.groundShown.keys()) if (key.startsWith(`${set.key}:`) && !seen.has(key)) this.groundShown.delete(key);
    return out;
  }
  /** Whether a screen point lies over a map whose era clears its ground (`noTerrain`). */
  private groundless(set: MapSet, sx: number, sy: number) {
    const [ax, ay] = this.unproject(sx, sy);
    for (const map of set.maps.values()) if (map.noTerrain && contains(map.frame, ax, ay)) return true;
    return false;
  }
  /** The rectangle (device px) of a map in view whose era clears its ground: the terrain gives way there. */
  private groundCut(set: MapSet): DrawParams["exclude"] {
    for (const map of set.maps.values()) {
      if (!map.noTerrain) continue;
      const [x0, y0] = this.project(map.frame[0], map.frame[1]), [x1, y1] = this.project(map.frame[2], map.frame[3]);
      if (x1 < 0 || y1 < 0 || x0 > this.width || y0 > this.height) continue;
      const d = this.dpr, w = (x1 - x0) * d, h = (y1 - y0) * d;
      return { rect: [x0 * d, y0 * d, x1 * d, y1 * d], edge: [featherInsetOf(w, h), featherOf(w, h, d)], strength: 1 };
    }
    return null;
  }
  /** The terrain's opacity as last drawn, per set and map: it rises only over tiles that are loaded. */
  private groundShown = new Map<string, number>();

  private render(now: number) {
    this.recompose = false;
    this.countTiles = [0, 0];
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
      this.drawEffects(drawn);
      this.renderer.clip(null, H);
    } else {
      const fade = this.fromSet ? clamp((now - this.eraStart) / FADE_ERA, 0, 1) : 1;
      const from = this.fromSet;
      if (from && fade < 1) {
        // The old picture stays whole underneath; the new one spreads over it like ink from the middle of the view.
        const camera = transferCamera(this.camera, this.set, from, this.focusChain(this.set)) ?? this.camera;
        this.withCamera(camera, () => this.drawList(this.collect(from), from, 1, cloud, water, now));
        drawn = this.collect(this.set);
        this.renderer.setInk(easeInOut(fade));
        this.drawList(drawn, this.set, 1, cloud, water, now);
        this.drawEffects(drawn);
        this.renderer.setInk(0);
      } else {
        this.fromSet = null;
        drawn = this.collect(this.set);
        this.drawList(drawn, this.set, 1, cloud, water, now);
        this.drawEffects(drawn);
      }
    }
    // The frame before the map in view changed fades out over the new one, laid where its view lies now.
    const fade = this.crossfade;
    if (fade && !this.compare) {
      // A fast zoom leaves the old frame behind sooner: never a blown-up picture of it (its words 2× magnified).
      const k = this.camera.scale / fade.camera.scale;
      const alpha = fadeOut(now - fade.start, FOCUS_FADE) * (1 - smoothstep(1.2, 1.7, Math.max(k, 1 / k)));
      if (alpha <= 0.003 || fade.width !== this.width || fade.height !== this.height) this.crossfade = null;
      else {
        const [ax0, ay0] = toAtlas(fade.camera, fade.width, fade.height, 0, 0), [ax1, ay1] = toAtlas(fade.camera, fade.width, fade.height, fade.width, fade.height);
        const [x0, y0] = this.project(ax0, ay0), [x1, y1] = this.project(ax1, ay1);
        const d = this.dpr;
        // Its own edges are soft where it no longer covers the screen (zooming out).
        this.renderer.drawSnapshot([x0 * d, y0 * d, x1 * d, y1 * d], alpha, x0 > 0.5 || y0 > 0.5 ? 28 * d : 0);
      }
    }
    this.tiles.endFrame();
    this.drawnTiles = this.countTiles;

    // Focus: the deepest well-shown map under the centre of the free area.
    const { top, right, bottom, left } = this.options.insets;
    // The point the reader looks at: where the wheel zoomed (the view's middle only gets there as it zooms), else
    // the middle of the free area.
    const [cx, cy] = this.lookAt ?? this.unproject(left + (this.width - left - right) / 2, top + (this.height - top - bottom) / 2);
    const freeArea = Math.max(1, (this.width - left - right) * (this.height - top - bottom));
    /** The share of the free part of the view a drawn map covers. */
    // (A neighbour is drawn cut to what lies outside the map in view: as a place to go to it counts whole.)
    const share = (entry: DrawnMap) => {
      const b = entry.role === "neighbour" ? entry.screen : entry.clip;
      const w = Math.min(b[2], this.width - right) - Math.max(b[0], left), h = Math.min(b[3], this.height - bottom) - Math.max(b[1], top);
      return w > 0 && h > 0 ? (w * h) / freeArea : 0;
    };
    // How far the centre is from a map's own middle (0 there, 1 at its edge): of two overlapping zones, the one
    // the reader looks at is the one the view is centred on.
    const off = (map: AtlasMap) => {
      const f = map.frame;
      return Math.max(Math.abs(cx - (f[0] + f[2]) / 2) / Math.max(1e-12, (f[2] - f[0]) / 2), Math.abs(cy - (f[1] + f[3]) / 2) / Math.max(1e-12, (f[3] - f[1]) / 2));
    };
    // The map in view must also be what the view mostly shows: a place under the point that fills only a sliver
    // of it (a city 7% of the view inside its zone) is not yet the map in view.
    const liesIn = (inner: AtlasMap, outer: AtlasMap) => {
      const a = inner.frame, b = outer.frame;
      const ow = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oh = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      const area = (a[2] - a[0]) * (a[3] - a[1]);
      return ow > 0 && oh > 0 && (ow * oh) / area >= 0.7 && area < 0.5 * (b[2] - b[0]) * (b[3] - b[1]);
    };
    let candidate: DrawnMap | undefined;
    for (const entry of drawn) {
      if ((entry.open ?? entry.alpha) <= 0.5 || !this.inArea(entry.map, cx, cy)) continue;
      // A map beside the one in view whose own land is not read yet is no candidate (its rectangle may cover the view
      // where its land does not: Ashenvale's over Orgrimmar).
      if (entry.role === "neighbour" && usesMask(entry.map) && !this.areaOf(entry.map)) continue;
      // (A true child of the map in view may take over at a fifth of the view; anything else — a neighbour, a city
      // the data puts beside its zone — only once it fills nearly half of it.)
      const own = this.maps.get(entry.map.id)?.parent === this.focusId;
      if (entry.map.depth > 0 && entry.role !== "ancestor" && entry.map.id !== this.focusId && share(entry) < (own ? MIN_SHARE : MIN_SHARE_BESIDE)) continue;
      // The map in view itself, shrunk to a small part of the view (zooming out, or at rest after it), no longer
      // stands as its own candidate: the map around it takes over.
      const way = this.zoomDir || this.zoomIntent;
      if (entry.map.id === this.focusId && entry.map.depth > 0 && this.zoomDir <= 0 && share(entry) < (way < 0 ? 0.18 : 0.12)) continue;
      const depth = candidate?.map.depth ?? -1;
      // Of two at one level, a place lying inside the other (a city in its zone) is the deeper one; else the one
      // the point is nearest the middle of.
      const inner = candidate && entry.map.depth === depth && liesIn(entry.map, candidate.map);
      const outer = candidate && entry.map.depth === depth && liesIn(candidate.map, entry.map);
      if (entry.map.depth > depth || inner || (entry.map.depth === depth && candidate && !outer && off(entry.map) < off(candidate.map))) candidate = entry;
    }
    // The map in view against a map of its level under the point that clearly shows more of the view (a city the
    // data puts beside its zone, the zone all around it): that one is the candidate.
    // (Only on the way out: entering a city, its zone around it is still bigger for a while.)
    let beside = false;
    if (candidate && candidate.map.id === this.focusId && (this.zoomDir || this.zoomIntent) < 0) {
      const own = share(candidate);
      for (const entry of drawn) {
        // (By its rectangle: a zone's mask leaves out the city that lies in it — Durotar's, Orgrimmar.)
        if (entry === candidate || entry.map.depth !== candidate.map.depth || entry.role === "ancestor" || (entry.open ?? entry.alpha) <= 0.5 || !contains(entry.map.frame, cx, cy)) continue;
        if (share(entry) > own + 0.15 && (!candidate || share(entry) > share(candidate))) { candidate = entry; beside = true; }
      }
    }
    let focus = candidate?.map ?? drawn[0]?.map ?? this.maps.get(this.focusId) ?? this.maps.values().next().value as AtlasMap;
    // With hysteresis: down into a child once it is clearly open, up once the map in view has clearly faded.
    const held = this.maps.get(this.focusId);
    if (candidate && held && held.id !== candidate.map.id) {
      const shown = drawn.find((entry) => entry.map.id === held.id);
      const chain = chainUp(this.set, candidate.map.id);
      // A place lying inside the map in view (a city whose data puts it beside its zone, Orgrimmar by Durotar) is
      // a way down too: it is entered like a child, not swapped for like a neighbour.
      const relation = chain.includes(held.id) || liesIn(candidate.map, held) ? "deeper" : chainUp(this.set, held.id).includes(candidate.map.id) || liesIn(held, candidate.map) ? "above" : "other";
      // "Under" the point: inside its rectangle — or still filling a good part of the view. Beside the candidate
      // (zone rectangles overlap, a city may sit beside its zone in the data): inside it and not clearly further
      // off its middle than the candidate is from its own.
      // Not up while the point is already over a place of its level that is opening (Classic's Orgrimmar lies
      // beside Durotar in the data): the reader is on the way in, not out.
      const heading = relation === "above" && this.zoomDir >= 0 && drawn.some((entry) => entry !== shown && entry.map.depth >= held.depth && (entry.open ?? entry.alpha) > 0.2 && contains(entry.map.frame, cx, cy));
      // Beside it: the one that shows more of the view wins, with a margin (no flip-flop between two halves).
      const heldShare = shown ? share(shown) : 0;
      const under = Boolean(shown) && (heading || (relation === "other"
        ? this.inArea(held, cx, cy) && heldShare + 0.15 >= share(candidate) && off(held) <= off(candidate.map) + 0.1
        // Up a level: while zooming in only once it has all but left the view; at rest once it is a small part of it.
        : (contains(held.frame, cx, cy) || heldShare >= (relation !== "above" || this.zoomDir < 0 ? 0.3 : this.zoomDir > 0 ? 0.04 : 0.12))
          // …and never kept once it has shrunk to a small part of the view (zooming out, or at rest after it).
          && (this.zoomDir > 0 || heldShare >= ((this.zoomDir || this.zoomIntent) < 0 ? 0.18 : 0.12))));
      // (A map of its level that clearly shows more of the view on the way out — Durotar around Orgrimmar — takes over
      // at once: that margin is the hysteresis; the city's own openness would hold the title on it for another notch.)
      const keep = beside ? candidate.map.id : holdFocus({ id: held.id, alpha: shown?.open ?? shown?.alpha ?? 0, under }, { id: candidate.map.id, alpha: candidate.open ?? candidate.alpha }, relation, this.zoomDir || this.zoomIntent);
      // Down only once there is something to show: the child's whole picture (its smallest level) and the wash
      // the map in view turns into — never a child floating in an empty backdrop.
      // (Not for ever: past ~2× the map in view hands over anyway, rather than be shown blown up.)
      const heldUp = shown?.upscale ?? 0;
      const ready = relation !== "deeper" || heldUp > 2.1 || (this.artSettled(candidate.map) && this.washSettled(held));
      if (keep === held.id || !ready) focus = held;
      this.focusWhy = { held: held.id, candidate: candidate.map.id, relation, under, open: shown?.open ?? -1, zoom: this.zoomDir, keep, ready };
    } else this.focusWhy = { held: held?.id ?? -1, candidate: candidate?.map.id ?? -1 };
    // Still on "show this map whole" (a page, a click): that map is the one in view, even where a child fills the phone screen.
    const home = this.home && this.atHome(this.home.id) ? this.maps.get(this.home.id) : undefined;
    if (home) focus = home;
    if (focus && focus.id !== this.focusId) {
      // The new composition comes in under this very frame, which then fades out.
      // (Not on a device drawing a frame every 180+ ms: a fade over one or two frames only smears both pictures.)
      if (this.focusId >= 0 && !this.options.reducedMotion && !this.compare && !this.fromSet && this.lastInfo && this.frameDt < SLOW_FRAME) {
        this.renderer.snapshot();
        this.crossfade = { camera: { ...this.camera }, start: now, width: this.width, height: this.height };
      }
      this.focusId = focus.id;
      this.focusUntold = true;
      this.focusSince = now;
      // This frame was put together around the old one: the next is drawn around the new one, whatever else moves.
      this.recompose = true;
    }
    // The page hears of the map in view once the camera rests — or once it has stayed the same for a moment while
    // a slow glide ends (no title or panel jumping through every level on the way, never a stale one at rest).
    if (this.focusUntold && focus && (!this.moving || now - this.focusSince > FOCUS_TELL)) {
      this.focusUntold = false;
      this.events.focus(this.chain(focus.id));
      // The URL follows the map in view even when nothing moved (an era's picture came in).
      this.scheduleSettle();
    }
    const mid = [left + (this.width - left - right) / 2, top + (this.height - top - bottom) / 2];
    let ground = 0;
    for (const t of this.terrain) if (contains(t.clip, mid[0], mid[1])) ground = Math.max(ground, t.alpha);
    this.lastInfo = { camera: this.camera, width: this.width, height: this.height, focus, drawn, moving: this.moving, time, ground, room: this.zoomRoom() };
    this.events.frame(this.lastInfo);
  }

  /**
   * Whether an atlas point lies on a map's own land: inside its rectangle and — for a zone or city with a mask —
   * on the white of its mask (zone rectangles overlap; their land does not). Until the mask is read: the rectangle.
   */
  inArea(map: AtlasMap, x: number, y: number) {
    const f = map.frame;
    if (!contains(f, x, y)) return false;
    const area = this.areaOf(map);
    if (!area || areaAt(area, (x - f[0]) / (f[2] - f[0]), (y - f[1]) / (f[3] - f[1])) >= 0.5) return true;
    // Its own places count as its land (a zone's mask may leave out its city: Classic's Durotar, Orgrimmar).
    return map.children.some((id) => { const child = this.maps.get(id); return Boolean(child?.art) && !UNDER.has(child?.type ?? "zone") && contains((child as AtlasMap).frame, x, y); });
  }

  /** A point well inside a map's own land (atlas space): its mask's deepest point, else its rectangle's middle. */
  areaPoint(id: number): [number, number] | null {
    const map = this.maps.get(id);
    if (!map) return null;
    const f = map.frame;
    const area = this.areaOf(map);
    const at = area ? areaCentre(area) : null;
    return at ? [f[0] + at[0] * (f[2] - f[0]), f[1] + at[1] * (f[3] - f[1])] : [(f[0] + f[2]) / 2, (f[1] + f[3]) / 2];
  }

  /** The own-area grid of a zone or city (read from its mask once); null for other maps or while it loads. */
  private areas = new Map<string, Area | "loading" | "failed">();
  private areaOf(map: AtlasMap): Area | null {
    if (!map.mask || !usesMask(map) || !map.art) return null;
    const known = this.areas.get(map.mask);
    if (known && known !== "loading" && known !== "failed") return known;
    if (!known) {
      this.areas.set(map.mask, "loading");
      loadArea(map.mask, (map.art as MapArt).width / (map.art as MapArt).height)
        .then((area) => { this.areas.set(map.mask as string, area); this.invalidate(); })
        .catch(() => this.areas.set(map.mask as string, "failed"));
    }
    return null;
  }

  /**
   * A map and everything inside it — including the places its data puts beside it that lie within it (Classic's
   * Stormwind under the Eastern Kingdoms, inside Elwynn; Orgrimmar by Durotar): they are its places, drawn over it.
   */
  private subtreeOf(set: MapSet, id: number) {
    const out = new Set<number>();
    const walk = (at: number) => {
      if (out.has(at)) return;
      out.add(at);
      for (const child of set.maps.get(at)?.children ?? []) walk(child);
    };
    walk(id);
    const map = set.maps.get(id);
    const parent = map && map.parent !== null ? set.maps.get(map.parent) : undefined;
    if (map && parent && map.depth > 0) {
      const f = map.frame, area = (f[2] - f[0]) * (f[3] - f[1]);
      for (const sid of parent.children) {
        const sib = set.maps.get(sid);
        if (!sib || sid === id || !sib.art || sib.portal || UNDER.has(sib.type)) continue;
        const b = sib.frame, sa = (b[2] - b[0]) * (b[3] - b[1]);
        const ow = Math.min(b[2], f[2]) - Math.max(b[0], f[0]), oh = Math.min(b[3], f[3]) - Math.max(b[1], f[1]);
        if (ow > 0 && oh > 0 && sa < 0.5 * area && (ow * oh) / sa >= 0.7) walk(sid);
      }
    }
    return out;
  }

  /** The map in view and everything inside it (its own words and decor stay). */
  private focusSubtree(set: MapSet) {
    return set.maps.has(this.focusId) ? this.subtreeOf(set, this.focusId) : new Set<number>();
  }

  /**
   * Where a map around the one in view gives way: its painted names of that place go (the word with
   * its banner; the ground drawn over it where the data has a patch of it), its decor near the place
   * goes, and — for words not tied to a place — a big word over the place's centre goes.
   * Holes in device px; patches as boxes in atlas space.
   */
  private givesWay(entry: DrawnMap, focus: AtlasMap, set: MapSet, allWords = false): { holes: Array<[number, number, number, number]>; patches: Patch[] } {
    const art = entry.map.art;
    if (!art) return { holes: [], patches: [] };
    const f = focus.frame, fw = f[2] - f[0], fh = f[3] - f[1];
    const near: Box = [f[0] - fw * 0.15, f[1] - fh * 0.15, f[2] + fw * 0.15, f[3] + fh * 0.15];
    const m = entry.map.frame, mw = m[2] - m[0], mh = m[3] - m[1];
    const toAtlas = (b: ArtBox["box"]): Box => [m[0] + b[0] * mw, m[1] + b[1] * mh, m[0] + b[2] * mw, m[1] + b[3] * mh];
    const holes: Array<[number, number, number, number]> = [];
    const patches: Patch[] = [];
    const add = (b: Box) => {
      const [x0, y0] = this.project(b[0], b[1]), [x1, y1] = this.project(b[2], b[3]);
      if (x1 < 0 || y1 < 0 || x0 > this.width || y0 > this.height) return;
      holes.push([x0 * this.dpr, y0 * this.dpr, x1 * this.dpr, y1 * this.dpr]);
    };
    // Without labelFor: only a big name over the place itself (an HD "VALDRAKKEN" on its zone) — a word that
    // merely touches the place's edge stays: a hole there would show the map below.
    const core: Box = [f[0] + fw * 0.12, f[1] + fh * 0.12, f[2] - fw * 0.12, f[3] - fh * 0.12];
    for (const label of labelBoxes(art)) {
      const plaque = toAtlas(label.plaque ?? label.box);
      // Every word goes: an ancestor's (while it is still seen as a picture, on the way to its backdrop) and a
      // blurred neighbour's — the ground drawn over it where the data has a patch, else the backdrop shows there.
      if (allWords) { if (label.patch) patches.push({ url: label.patch, box: plaque }); else add(plaque); continue; }
      if (label.for !== undefined) {
        // The place in view, or an older map of the same place (Silvermoon before Midnight on the old Eversong).
        const target = label.for === focus.id ? focus : set.maps.get(label.for);
        if (!target || (target.id !== focus.id && target.name !== focus.name)) continue;
        if (label.patch) patches.push({ url: label.patch, box: plaque });
        else add(plaque);
        continue;
      }
      const b = toAtlas(label.box);
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      if ((contains(core, cx, cy) && b[2] - b[0] >= fw * 0.18) || (contains(f, cx, cy) && b[2] - b[0] >= fw * 0.3)) add(plaque);
    }
    for (const decor of decorBoxes(art)) {
      if (decor.for !== undefined && decor.for !== focus.id) continue;
      const b = toAtlas(decor.box);
      if (intersects(b, near)) add(b);
    }
    // The biggest first: when there are more than the shader takes, the small ones go.
    holes.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
    return { holes: holes.slice(0, this.renderer.holes), patches };
  }

  /** Every painted word of a drawn map with its banner (device px), the biggest first, as many as a draw takes. */
  private wordsOf(entry: DrawnMap): Array<[number, number, number, number]> {
    const art = entry.map.art;
    if (!art) return [];
    const m = entry.map.frame, mw = m[2] - m[0], mh = m[3] - m[1], d = this.dpr;
    const out: Array<[number, number, number, number]> = [];
    for (const label of labelBoxes(art)) {
      const b = label.plaque ?? label.box;
      const [x0, y0] = this.project(m[0] + b[0] * mw, m[1] + b[1] * mh), [x1, y1] = this.project(m[0] + b[2] * mw, m[1] + b[3] * mh);
      if (x1 < 0 || y1 < 0 || x0 > this.width || y0 > this.height) continue;
      out.push([x0 * d, y0 * d, x1 * d, y1 * d]);
    }
    out.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
    return out.slice(0, this.renderer.holes);
  }

  /** The rectangle of the map in view and its soft edge (as drawArt gives it), for the maps around to give way there. */
  private excludeOf(held: DrawnMap): NonNullable<DrawParams["exclude"]> {
    const d = this.dpr;
    const devW = (held.screen[2] - held.screen[0]) * d, devH = (held.screen[3] - held.screen[1]) * d;
    const edge: [number, number] = held.map.depth === 0 ? [0, 1] : [featherInsetOf(devW, devH), featherOf(devW, devH, d)];
    return { rect: [held.clip[0] * d, held.clip[1] * d, held.clip[2] * d, held.clip[3] * d], edge, strength: held.tone ?? 0 };
  }

  /**
   * The order of the draws: the backdrops (ancestors, the outer first), then the neighbours, then the map in
   * view and what lies in it — nothing around it is drawn over it.
   */
  private drawOrder(list: DrawnMap[], inFocus: Set<number>) {
    if (!inFocus.size) return list;
    const rest = list.filter((entry) => !inFocus.has(entry.map.id));
    const back = rest.filter((entry) => entry.role === "ancestor").sort((a, b) => a.map.depth - b.map.depth);
    const own = list.filter((entry) => inFocus.has(entry.map.id));
    return [
      ...back, ...rest.filter((entry) => entry.role !== "ancestor"),
      ...own.filter((entry) => entry.role === "focus" || !entry.role), ...own.filter((entry) => entry.role === "child"), ...own.filter((entry) => entry.role === "inside"),
    ];
  }

  /**
   * Blur keys of the draws. A backdrop is a wash already (no pass). The neighbours share one pass (one layer,
   * each under the ones before it: never one over another), at their middle blur.
   */
  private blurKeys(list: DrawnMap[]) {
    const keys = list.map((entry) => (entry.role === "ancestor" && (entry.tone ?? 0) >= 0.999 ? 0 : blurKey(blurRadiusCss(entry.blur, entry.upscale))));
    for (const role of ["neighbour", "child"] as const) {
      const near = keys.filter((_, i) => list[i].role === role).sort((a, b) => a - b);
      if (near.length < 2) continue;
      const middle = near[Math.floor(near.length / 2)];
      list.forEach((entry, i) => { if (entry.role === role) keys[i] = middle; });
    }
    return keys;
  }

  /**
   * How this frame is put together (for the overlap check, `?debug`): every map drawn with its part, its
   * share of its own mask, whether it gives way over the map in view, and whether an ancestor shows only its wash.
   */
  composition() {
    const info = this.lastInfo;
    if (!info) return null;
    const held = info.drawn.find((entry) => entry.role === "focus");
    const exclude = held && (held.tone ?? 0) > 0.003 ? this.excludeOf(held) : null;
    // The passes as drawList makes them (the map in view and what is in it last).
    const ordered = this.drawOrder(info.drawn, this.focusSubtree(this.set));
    const pass = new Map<DrawnMap, { layer: number; shared: boolean }>();
    layerGroups(blurGroups(this.blurKeys(ordered)), ordered).forEach((group, layer) => {
      for (let i = group.from; i <= group.to; i++) pass.set(ordered[i], { layer, shared: group.blur > 0 || Boolean(group.flat) });
    });
    return {
      dpr: this.dpr, width: this.width, height: this.height, focus: held?.map.id ?? info.focus.id, exclude,
      // The continents' ground drawn over the painted maps (deep in), with the part of the map it belongs to.
      ground: this.terrain.map((t) => ({ id: t.map.id, alpha: t.alpha, clip: t.clip, role: info.drawn.find((entry) => entry.map === t.map)?.role ?? null })),
      draws: info.drawn.map((entry) => {
        const tone = entry.tone ?? 0;
        const masked = entry.role === "neighbour" || (entry.role === "child" && entry.map.mask) ? 1 : entry.role === "focus" ? (usesMask(entry.map) ? 1 - tone : 0) : entry.role === "ancestor" ? 0 : usesMask(entry.map) ? 1 : 0;
        return {
          id: entry.map.id, name: entry.map.name, type: entry.map.type, depth: entry.map.depth, role: entry.role ?? null,
          alpha: entry.alpha, tone, blur: entry.blur, screen: entry.screen, clip: entry.clip, mask: entry.map.mask ?? null, masked,
          excluded: entry.role === "neighbour" ? exclude?.strength ?? 0 : 0,
          layer: pass.get(entry)?.layer ?? -1, under: (entry.role === "neighbour" || entry.role === "child") && Boolean(pass.get(entry)?.shared),
          order: ordered.indexOf(entry),
          // An ancestor's own picture shows only on the way to its wash (a world opening from the Cosmic map); at a
          // full wash its picture is never drawn (its parchment stands in while the wash is made).
          detail: entry.role === "ancestor" ? (tone >= 0.999 ? 0 : 1 - (this.toneReady(entry) ? tone : 0)) : 1,
          // Painted words of a map other than the one in view still on screen (not covered by their patch, nor
          // among the holes the shader takes): must be 0.
          letters: this.lettersLeft(entry, held?.map ?? null),
        };
      }),
    };
  }

  /** Painted words of a drawn map (not the one in view) left on screen: see composition(). */
  private lettersLeft(entry: DrawnMap, focus: AtlasMap | null) {
    const art = entry.map.art;
    if (!art || !focus || entry.role === "focus" || entry.alpha < 0.05) return 0;
    if (entry.role === "ancestor" && (entry.tone ?? 0) >= 0.999) return 0;
    const m = entry.map.frame, mw = m[2] - m[0], mh = m[3] - m[1];
    let bare = 0;
    for (const label of labelBoxes(art)) {
      const b = label.plaque ?? label.box;
      const [x0, y0] = this.project(m[0] + b[0] * mw, m[1] + b[1] * mh), [x1, y1] = this.project(m[0] + b[2] * mw, m[1] + b[3] * mh);
      const seen: Box = [Math.max(x0, entry.clip[0]), Math.max(y0, entry.clip[1]), Math.min(x1, entry.clip[2]), Math.min(y1, entry.clip[3])];
      if (seen[2] <= seen[0] || seen[3] <= seen[1] || !intersects(seen, [0, 0, this.width, this.height])) continue;
      if (label.patch && this.tiles.peek(label.patch)) continue;
      bare += 1;
    }
    // The shader takes a limited number of holes (the biggest words first).
    return Math.max(0, bare - this.renderer.holes);
  }

  /** The backdrop of an ancestor: its smallest level with the painted words filled in, washed out (one texture). */
  private toneTile(map: AtlasMap) {
    const art = map.art as MapArt;
    const url = tileUrl(art, map.id, 0, 0, 0);
    const boxes = [...labelBoxes(art).map((label) => label.plaque ?? label.box), ...decorBoxes(art).map((decor) => decor.box)];
    const known = labelBoxes(art).length > 0;
    return this.tiles.get(`tone:${url}`, map.depth * 0.5 - 1, () => loadTone(url, known ? boxes : null, levelSize(art, 0)));
  }

  private artReady(map: AtlasMap) {
    return Boolean(map.art && this.tiles.peek(tileUrl(map.art, map.id, 0, 0, 0)));
  }

  private artSettled(map: AtlasMap) {
    return !map.art || this.tiles.settled(tileUrl(map.art, map.id, 0, 0, 0));
  }

  private washSettled(map: AtlasMap) {
    if (!map.art) return true;
    const key = `tone:${tileUrl(map.art, map.id, 0, 0, 0)}`;
    if (this.tiles.settled(key)) return true;
    this.toneTile(map);
    return false;
  }

  private toneReady(entry: DrawnMap) {
    return Boolean(entry.map.art && this.tiles.peek(`tone:${tileUrl(entry.map.art, entry.map.id, 0, 0, 0)}`));
  }

  /** Draws an ancestor as the calm wash behind the map in view; false while its backdrop is still being made. */
  private drawTone(entry: DrawnMap, alpha: number, cloud: number) {
    const map = entry.map, art = map.art;
    if (!art) return false;
    const tile = this.toneTile(map);
    if (tile.state !== "ready" || !tile.texture) return false;
    // A wash just made comes in softly over the parchment that stood in for it.
    const now = performance.now();
    const fade = this.options.reducedMotion ? 1 : clamp((now - tile.readyAt) / FADE_TILE, 0, 1);
    if (fade < 1) { this.drawPaper(entry, alpha); this.fadingUntil = Math.max(this.fadingUntil, tile.readyAt + FADE_TILE); }
    alpha *= fade;
    const d = this.dpr;
    const rect: Box = [entry.screen[0] * d, entry.screen[1] * d, entry.screen[2] * d, entry.screen[3] * d];
    const devW = rect[2] - rect[0], devH = rect[3] - rect[1];
    this.renderer.draw(tile.texture, {
      rect, uv: [0, 0, 1, 1], alpha,
      frame: [entry.clip[0] * d, entry.clip[1] * d, entry.clip[2] * d, entry.clip[3] * d],
      feather: map.depth === 0 ? 0 : [featherInsetOf(devW, devH), featherOf(devW, devH, d)], portal: [0, 0, 0],
      light: -(0.12 + dimOf(entry.upscale) * 0.6), cloud: map.type === "cosmic" ? 0 : cloud, water: 0, desat: 0.18 + desatOf(entry.upscale) * 0.5, art: rect,
    });
    return true;
  }

  /** The calm parchment over an ancestor's place (with its soft edge) while its wash is not ready. */
  private drawPaper(entry: DrawnMap, alpha: number) {
    const d = this.dpr;
    const rect: Box = [entry.screen[0] * d, entry.screen[1] * d, entry.screen[2] * d, entry.screen[3] * d];
    const devW = rect[2] - rect[0], devH = rect[3] - rect[1];
    this.renderer.draw(this.renderer.paper, {
      rect, uv: [0, 0, 1, 1], alpha: alpha * 0.92, frame: [entry.clip[0] * d, entry.clip[1] * d, entry.clip[2] * d, entry.clip[3] * d],
      feather: entry.map.depth === 0 ? 0 : [featherInsetOf(devW, devH), featherOf(devW, devH, d)], portal: [0, 0, 0], light: 0, cloud: 0, water: 0,
    });
  }

  /** Asks for the tiles a set needs in this view; returns the share already loaded. */
  private prefetch(set: MapSet, now: number) {
    let ready = 0, total = 0;
    const list = this.collect(set);
    for (const entry of list) {
      // An ancestor shows only its wash: that is what has to be ready (made from its smallest level).
      if (entry.role === "ancestor" && entry.map.art && !entry.map.portal) {
        total += 1;
        if (this.washSettled(entry.map)) ready += 1;
        continue;
      }
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
  private drawList(list: DrawnMap[] & { all?: DrawnMap[] }, set: MapSet, eraAlpha: number, cloud: number, water: number, now: number) {
    const moving = this.moving;
    // (The maps hidden under one that covers the view still carry their continent's terrain: kept before the reorder.)
    const all = list.all ?? list;
    // The map in view and what lies in it come last: nothing around it is drawn over it.
    const inFocus = this.focusSubtree(set);
    list = this.drawOrder(list, inFocus);
    // Out-of-focus draws grouped by their blur radius (it grows with the magnification); a backdrop is a wash already.
    const keys = this.blurKeys(list);
    const focus = set.maps.get(this.focusId);
    // The maps around give way over the rectangle of the map in view, along its own soft edge, as it shows whole.
    const held = list.find((entry) => entry.role === "focus");
    const exclude: DrawParams["exclude"] = held && (held.tone ?? 0) > 0.003 ? this.excludeOf(held) : null;
    for (const group of layerGroups(blurGroups(keys), list)) {
      const radius = radiusOfKey(group.blur) * this.dpr;
      const scale = group.blur > 0 ? layerScale(radius) : 1;
      let upscale = 0;
      if (group.blur > 0) this.renderer.beginLayer(scale);
      else if (group.flat) this.renderer.beginLayer(1);
      for (let i = group.from; i <= group.to; i++) {
        const entry = list[i];
        const art = entry.map.art;
        if (!art) continue;
        upscale += entry.upscale;
        const hovered = this.hoverId === entry.map.id && entry.alpha < 0.98;
        const alpha = (hovered ? Math.max(entry.alpha, 0.3) : entry.alpha) * eraAlpha;
        if (alpha < 0.003) continue;
        const terrain = entry.map.type !== "cosmic";
        const role = entry.role;
        const tone = role === "ancestor" ? entry.tone ?? 0 : 0;
        const washed = tone > 0.003 && this.drawTone(entry, alpha, cloud);
        // Only the wash: its own picture (and its words) is gone. While the wash is being made (a jump far away, an
        // era just switched) calm parchment stands in — never an empty void, never its picture blown up.
        if (tone >= 0.999) {
          if (!washed) this.drawPaper(entry, alpha);
          // Zooming out, the parent of the map in view is the next to show whole: its picture is asked for ahead
          // (only asked for, not drawn), so it comes in sharp rather than from its coarsest level.
          if ((this.zoomDir || this.zoomIntent) < 0 && focus && entry.map.id === focus.parent && entry.map.art) {
            this.drawArt(entry.map, entry.map.art, entry.screen, entry.clip, { alpha: 0, light: 0, cloud: 0, water: 0, desat: 0, levelScale: 1 }, now, moving, true);
          }
          continue;
        }
        // The map in view becomes the backdrop as soon as the zoom goes into one of its places: its wash is made ahead.
        // Not in yet itself (a jump far away): parchment under it, never an empty frame.
        if (role === "focus") { this.toneTile(entry.map); if (!this.artReady(entry.map)) this.drawPaper(entry, alpha); }
        const style: ArtStyle = {
          alpha: alpha * (1 - (tone > 0.003 && washed ? tone : 0)), light: hovered ? 0.55 : -(entry.dim ?? 0), edge: entry.side ? 1.6 : 1,
          // The map in view shows whole (its painted surroundings too) once open; a neighbour only its own land.
          maskStrength: role === "focus" ? 1 - (entry.tone ?? 0) : 1,
          ...(role === "neighbour" ? { ownLand: true, exclude, ...(exclude && exclude.strength >= 0.999 ? { hidden: coreOf(exclude) } : {}) } : role === "child" ? { ownLand: true } : {}),
          cloud: terrain ? cloud * (entry.map.depth <= 2 || entry.map.type === "continent" ? 1 : 0.6) : 0,
          // No shimmer on a backdrop out of focus (nor its land mask to load): it would not show.
          water: terrain && entry.blur < 0.3 ? water : 0,
          desat: 0, levelScale: scale,
          // Maps around the one in view: their corner ornaments go, and their painted words and decor
          // where the place in view lies give way (no second "STORMWIND" over the city).
          // (A neighbour keeps none of its words either: only the place in view is named; sharp or blurred, its
          // painted names would read as stray lettering around it.)
          ...(focus && !inFocus.has(entry.map.id) ? { corner: entry.map.depth > 0 ? 0.16 : 0, ...this.givesWay(entry, focus, set, role === "ancestor" || role === "neighbour") } : {}),
          // The map in view: its frame's corner pieces go too (its painted border is under its soft edge already).
          ...(role === "focus" && entry.map.depth > 0 ? { corner: 0.2 } : {}),
          ...(role === "focus" ? { sharp: true } : {}),
          // …and, magnified past its detail, its painted words.
          ...(role === "focus" && focus && (entry.past ?? 0) > 0.2 ? this.givesWay(entry, focus, set, true) : {}),
          // The places opened inside it show their land, not their painted names: only the map in view is named.
          ...((role === "child" || role === "inside") && focus ? this.givesWay(entry, focus, set, true) : {}),
        };
        // Neighbours in one layer: each only where the ones before it left the layer empty.
        this.renderer.setUnder((role === "neighbour" || role === "child") && this.renderer.inLayer);
        this.drawArt(entry.map, art, entry.screen, entry.clip, style, now, moving);
      }
      if (group.blur > 0) {
        const u = upscale / (group.to - group.from + 1);
        this.renderer.endLayer(radius / scale, dimOf(u), desatOf(u), vignetteOf(u));
      } else if (group.flat) this.renderer.endLayer(0, 0, 0, 0);
      this.renderer.setUnder(false);
    }
    // The ground of a continent over its painted maps, deep in.
    const terrain = set === this.set ? (this.terrain = this.collectTerrain(all, set, now)) : this.collectTerrain(all, set, now);
    // The painted words of the map in view: the ground comes in there first, so they fade out under it before they
    // are ever shown magnified.
    const words = held && terrain.length ? this.wordsOf(held) : [];
    const cut = terrain.length ? this.groundCut(set) : null;
    for (const t of terrain) {
      const tr = t.map.terrain;
      if (!tr) continue;
      const exists = this.terrainTiles(tr);
      if (exists === null) continue;
      const [x0, y0] = this.project(tr.frame[0], tr.frame[1]);
      const [x1, y1] = this.project(tr.frame[2], tr.frame[3]);
      this.drawArt(t.map, tr.art, [x0, y0, x1, y1], t.clip, {
        alpha: t.alpha * eraAlpha, light: 0, cloud: 0, water: water * 0.5, desat: 0, levelScale: 1, exists, sharp: true, grade: this.gradeOf(t.map),
        ...(words.length && t.alpha < 0.999 ? { holes: words, holeFill: Math.min(1, t.alpha * 3) * eraAlpha } : {}),
        ...(tr.ocean ? { ocean: tr.ocean } : {}),
        ...(cut ? { cut } : {}),
      }, now, moving, false, "t");
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
        // Only its own land, lit, without its painted words (its name is the hover plaque's).
        const peek: DrawnMap = { map, alpha: 0.3, screen: [x0, y0, x1, y1], clip, upscale: upscaleOf(x1 - x0, art), blur: 0 };
        const words = this.givesWay(peek, map, set, true);
        if (clip[2] > clip[0] && clip[3] > clip[1]) this.drawArt(map, art, [x0, y0, x1, y1], clip, { alpha: 0.3 * eraAlpha, light: 0.55, cloud: 0, water: 0, desat: 0, levelScale: 1, ownLand: true, ...words }, now, moving);
      }
    }
  }

  /**
   * Draws one picture (a map's art or a terrain): the tiles of the level its
   * size on screen needs (a coarser one inside a blurred layer), each over the
   * best coarser tile already loaded until it fades in. `dry`: only ask for the
   * tiles; returns [loaded, needed].
   */
  private drawArt(map: AtlasMap, art: MapArt, screen: Box, clipBox: Box, style: ArtStyle, now: number, moving: boolean, dry = false, kind = "a"): [number, number, number] {
    const d = this.dpr;
    const sx0 = screen[0] * d, sy0 = screen[1] * d, sx1 = screen[2] * d, sy1 = screen[3] * d;
    const devW = sx1 - sx0, devH = sy1 - sy0;
    const W = this.canvas.width, H = this.canvas.height;
    const cx0 = Math.max(0, clipBox[0] * d), cy0 = Math.max(0, clipBox[1] * d), cx1 = Math.min(W, clipBox[2] * d), cy1 = Math.min(H, clipBox[3] * d);
    if (cx1 <= cx0 || cy1 <= cy0) return [0, 0, 0];
    const z = levelFor(art, devW / style.levelScale);
    const [cols, rows] = levelTiles(art, z);
    const [lw, lh] = levelSize(art, z);
    const ts = art.tileSize;
    const pxW = devW / lw, pxH = devH / lh;
    const tx0 = clamp(Math.floor((cx0 - sx0) / pxW / ts), 0, cols - 1), tx1 = clamp(Math.floor((cx1 - sx0) / pxW / ts), 0, cols - 1);
    const ty0 = clamp(Math.floor((cy0 - sy0) / pxH / ts), 0, rows - 1), ty1 = clamp(Math.floor((cy1 - sy0) / pxH / ts), 0, rows - 1);
    const isTerrain = kind === "t";
    // A mask blends a map into the one under it; a top map (Draenor standing alone) has nothing under it.
    // A world's or continent's land mask does not cut it out (its own sea blends by the soft edge): it keeps the water shimmer off land.
    const ownLand = !isTerrain && Boolean(style.ownLand && map.mask);
    const landOnly = !isTerrain && !ownLand && !usesMask(map) && style.water > 0 && (map.type === "continent" || map.type === "world" || map.type === "cosmic");
    const mask = !isTerrain && map.mask && (ownLand || usesMask(map) || landOnly) ? this.tiles.get(map.mask, map.depth * 0.5 + (landOnly ? 4 : -0.5) + (style.exclude ? 6 : 0)) : null;
    const maskStrength = style.maskStrength ?? 1;
    const maskReady = mask && mask.state === "ready" && mask.texture && maskStrength > 0.02 ? mask : null;
    // Its own land or nothing: until the mask is in, its tiles are only asked for.
    if (ownLand && !maskReady) dry = true;
    // Top maps have no edge to blend; a world opened from the Cosmic map softens its edge once open.
    // (The terrain's soft edge is the edge of the part of it shown, off screen where that part runs past the view: never
    // a fade along the screen's own edges.)
    const feather: number | [number, number] = isTerrain ? featherOf((clipBox[2] - clipBox[0]) * d, (clipBox[3] - clipBox[1]) * d, d) * 0.6
      : map.depth === 0 ? 0
      : map.portal ? (style.alpha > 0.98 ? featherOf(devW, devH, d) * 0.6 : 0)
      : maskReady && !landOnly && maskStrength > 0.98 ? maskFeatherOf(devW, devH, d)
      : [featherInsetOf(devW, devH), featherOf(devW, devH, d) * (style.edge ?? 1)];
    let portal: [number, number, number] = [0, 0, 0];
    if (!isTerrain && map.portal && style.alpha < 0.999) {
      // The world opens from the planet outwards: a circle that grows to cover the art.
      const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2;
      const inner = Math.min(devW, devH) / 2, outer = Math.hypot(devW, devH) / 2 * 1.2;
      portal = [cx, cy, inner + (outer - inner) * smoothstep(0.35, 1, style.alpha)];
    }
    // The terrain fades at the edge of the part shown (the continent's picture), a map at its own art border.
    const frame: Box = [clipBox[0] * d, clipBox[1] * d, clipBox[2] * d, clipBox[3] * d];
    // The bare sheet is a city picture's (never a continent's or world's, nor needed for a neighbour's own land).
    const paper = maskReady && !landOnly && !isTerrain && map.depth > 0 && !style.exclude && (map.type === "zone" || map.type === "micro") ? this.paperOf(map, art) : null;
    const base: Omit<DrawParams, "rect" | "uv"> = {
      alpha: style.alpha, frame, feather, portal, light: style.light, cloud: style.cloud, water: style.water, desat: style.desat,
      mask: maskReady && maskReady.texture ? { texture: maskReady.texture, rect: [sx0, sy0, sx1, sy1], strength: maskStrength, land: landOnly } : null,
      paper: paper ? [paper[0], paper[1], paper[2], 0.9] : null,
      art: [sx0, sy0, sx1, sy1], corner: isTerrain ? 0 : style.corner ?? 0, holes: style.holes ?? [],
      exclude: isTerrain ? style.cut ?? null : style.exclude ?? null,
      grade: style.grade ?? null, holeFill: style.holeFill ?? 0,
    };
    // Its finest level magnified past its own size: sharpened (bilinear softness taken back), never drawn coarser.
    // (The terrain is softened there instead: see smoothOf.)
    const sharp = style.sharp && z === art.maxZoom ? (isTerrain ? -smoothOf(pxW) : sharpenOf(pxW)) : 0;
    if (!dry && style.ocean) {
      const sea = this.renderer.solid(style.ocean);
      if (sea) this.renderer.draw(sea, { ...base, rect: [sx0, sy0, sx1, sy1], uv: [0, 0, 1, 1] });
    }
    const centerX = W / 2, centerY = H / 2;
    const id = map.id;
    const exists = style.exists;
    // The whole picture at level 0 first: something to show while the details load.
    let ready = 0, total = 0, covered = 0;
    if (!exists || exists(0, 0, 0)) {
      const root = this.tiles.get(tileUrl(art, id, 0, 0, 0), map.depth + (style.exclude ? 6 : 0));
      ready = root.state === "ready" ? 1 : 0;
      covered = ready;
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
        const under = style.hidden;
        if (under && rect[0] >= under[0] && rect[1] >= under[1] && rect[2] <= under[2] && rect[3] <= under[3]) continue;
        const dist = Math.hypot(rx0 + rw / 2 - centerX, ry0 + rh / 2 - centerY) / Math.max(W, H);
        // A neighbour's tiles come after the map in view's own.
        const tile = this.tiles.get(tileUrl(art, id, z, tx, ty), 2 + map.depth * 0.5 + dist * 4 + (isTerrain ? -0.5 : 0) + (style.exclude ? 6 : 0));
        total += 1;
        if (tile.state === "ready" || tile.state === "failed") { ready += 1; covered += 1; }
        // (Not in yet, but drawn from a coarser level meanwhile: it shows, softer.)
        else if (dry && this.coarserOf(art, id, z, tx, ty)) covered += 1;
        if (dry) continue;
        this.countTiles[1] += 1;
        if (tile.state === "ready" || tile.state === "failed") this.countTiles[0] += 1;
        const fade = tile.state === "ready" ? (this.options.reducedMotion ? 1 : clamp((now - tile.readyAt) / FADE_TILE, 0, 1)) : 0;
        if (fade < 1) {
          this.drawFallback(art, id, z, tx, ty, rect, base);
          if (tile.state === "ready") this.fadingUntil = Math.max(this.fadingUntil, tile.readyAt + FADE_TILE);
        }
        if (tile.state === "ready" && tile.texture) {
          this.renderer.draw(tile.texture, { ...base, rect, uv: [0, 0, Math.min(1, tw / tile.width), Math.min(1, th / tile.height)], alpha: style.alpha * fade, ...(sharp ? { sharp, texel: [1 / tile.width, 1 / tile.height] as [number, number] } : {}) });
        }
      }
    }
    // The ground over a neighbour's name of the place in view (drawn as the picture itself is: same mask, edges, light).
    if (!dry && !isTerrain && style.patches?.length && ready > 0) {
      // Over the picture itself, even where it went under the maps before it.
      const under = this.renderer.under;
      this.renderer.setUnder(false);
      for (const patch of style.patches) {
        const tile = this.tiles.get(patch.url, 1 + map.depth * 0.5);
        if (tile.state !== "ready" || !tile.texture) continue;
        const [px0, py0] = this.project(patch.box[0], patch.box[1]), [px1, py1] = this.project(patch.box[2], patch.box[3]);
        const fade = this.options.reducedMotion ? 1 : clamp((now - tile.readyAt) / FADE_TILE, 0, 1);
        this.renderer.draw(tile.texture, { ...base, rect: [px0 * d, py0 * d, px1 * d, py1 * d], uv: [0, 0, 1, 1], alpha: style.alpha * fade });
      }
      this.renderer.setUnder(under);
    }
    // Next level for the middle of the view while nothing moves — and ahead of a zoom in.
    // (Not for a neighbour: the reader looks at the map in view.)
    if (!dry && !style.exclude && (!moving || this.zoomDir > 0) && z < art.maxZoom && style.levelScale === 1) {
      const [ncols, nrows] = levelTiles(art, z + 1);
      const nx0 = clamp(tx0 * 2, 0, ncols - 1), nx1 = clamp(tx1 * 2 + 1, 0, ncols - 1);
      const ny0 = clamp(ty0 * 2, 0, nrows - 1), ny1 = clamp(ty1 * 2 + 1, 0, nrows - 1);
      const midX = (nx0 + nx1) / 2, midY = (ny0 + ny1) / 2;
      for (let ty = ny0; ty <= ny1; ty++) {
        for (let tx = nx0; tx <= nx1; tx++) {
          if (Math.abs(tx - midX) > (nx1 - nx0) / 3 + 1 || Math.abs(ty - midY) > (ny1 - ny0) / 3 + 1) continue;
          if (exists && !exists(z + 1, tx, ty)) continue;
          this.tiles.get(tileUrl(art, id, z + 1, tx, ty), (this.zoomDir > 0 ? 12 : 40) + map.depth);
        }
      }
    }
    return [ready, total, covered];
  }

  /** Whether a coarser level of a tile is loaded (what drawFallback would draw meanwhile). */
  private coarserOf(art: MapArt, id: number, z: number, tx: number, ty: number) {
    for (let k = 1; k <= z; k++) if (this.tiles.peek(tileUrl(art, id, z - k, tx >> k, ty >> k))) return true;
    return false;
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

  /**
   * The colour grade of a map's terrain toward its painted picture (worked out once from both smallest levels);
   * null (no grade) while it is worked out or when it cannot be.
   */
  private grades = new Map<string, Grade | "loading" | "failed">();
  /** Still working the grade out (the terrain waits for it: no change of its colours once shown). */
  private gradePending(map: AtlasMap) {
    return this.gradeOf(map) === null && this.grades.get(`${map.terrain?.art.url}|${map.art?.url}`) === "loading";
  }
  private gradeOf(map: AtlasMap): Grade | null {
    const tr = map.terrain, art = map.art;
    if (!tr || !art) return null;
    const key = `${tr.art.url}|${art.url}`;
    const known = this.grades.get(key);
    if (known && known !== "loading" && known !== "failed") return known;
    if (!known) {
      this.grades.set(key, "loading");
      const f = map.frame, w = f[2] - f[0], h = f[3] - f[1];
      const rect: [number, number, number, number] = [(tr.frame[0] - f[0]) / w, (tr.frame[1] - f[1]) / h, (tr.frame[2] - f[0]) / w, (tr.frame[3] - f[1]) / h];
      loadGrade(tileUrl(art, map.id, 0, 0, 0), levelSize(art, 0), rect, tileUrl(tr.art, map.id, 0, 0, 0), levelSize(tr.art, 0))
        .then((grade) => { this.grades.set(key, grade); this.invalidate(); })
        .catch(() => this.grades.set(key, "failed"));
    }
    return null;
  }

  /**
   * Which terrain tiles exist: its index (the tiles there are) or its list of empty ones (the tiles there are not),
   * fetched once; null while it loads, a pass-all with neither.
   */
  private terrainIndex = new Map<string, Map<number, Set<string>> | "loading" | "failed">();
  private terrainTiles(tr: NonNullable<AtlasMap["terrain"]>): ((z: number, x: number, y: number) => boolean) | null {
    const url = tr.index ?? tr.empty;
    if (!url) return () => true;
    const listed = Boolean(tr.index);
    const known = this.terrainIndex.get(url);
    if (known === "failed") return () => !listed;
    if (known && known !== "loading") return (z, x, y) => (known.get(z)?.has(`${x}_${y}`) ?? false) === listed;
    if (!known) {
      this.terrainIndex.set(url, "loading");
      fetch(url, { cache: "force-cache" })
        .then((r) => (r.ok ? r.json() as Promise<Record<string, string[]>> : Promise.reject(new Error(String(r.status)))))
        .then((data) => {
          const levels = new Map<number, Set<string>>();
          for (const [z, list] of Object.entries(data)) if (Array.isArray(list)) levels.set(Number(z), new Set(list));
          this.terrainIndex.set(url, levels);
          this.invalidate();
        })
        .catch(() => this.terrainIndex.set(url, "failed"));
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
      const pinch = this.pointers.size >= 2 && beforeDistance > 0;
      if (!pinch) {
        // A drag: the map follows the pointer up to its edge, then only a little further, ever harder (a rubber band
        // it springs back from) — never dragged off the stage.
        const s = this.camera.scale;
        const raw = this.dragRaw ?? { ...this.camera };
        raw.x -= (after[0] - before[0]) / s;
        raw.y -= (after[1] - before[1]) / s;
        this.dragRaw = raw;
        const hard = this.limit(raw, undefined, this.dragBase ?? this.camera, "centre");
        this.recentre = true;
        const band = (px: number) => Math.sign(px) * PAN_RUBBER * (1 - Math.exp(-Math.abs(px) / PAN_RUBBER));
        const next = { ...hard, x: hard.x + band((raw.x - hard.x) * s) / s, y: hard.y + band((raw.y - hard.y) * s) / s };
        // Never past the band's reach from where the drag started, whatever the pin's own sums say.
        const off = this.pinOff(next, "centre"), from = this.pinOff(this.dragBase ?? this.camera, "centre");
        if (off && from) {
          for (const k of ["x", "y"] as const) {
            const most = (Math.abs(from[k]) * s + PAN_RUBBER) / s;
            if (Math.abs(off[k]) > most) next[k] -= off[k] - Math.sign(off[k]) * most;
          }
        }
        this.camera = next;
      } else {
        this.recentre = false;
        let camera = { ...this.camera, x: this.camera.x - (after[0] - before[0]) / this.camera.scale, y: this.camera.y - (after[1] - before[1]) / this.camera.scale };
        // Pinch: zoom around the fingers' midpoint by the change of their spread (no rotation).
        // (Pinching back out of an overshoot first unwinds it.)
        const log = this.unwind(Math.log(this.spread() / beforeDistance));
        camera = zoomAt(camera, this.width, this.height, after[0], after[1], Math.exp(log));
        const limited = this.limit(camera, { x: after[0], y: after[1] });
        // Fingers pinching past a limit: a rubber band, as on a native map.
        this.pushStretch(Math.log(camera.scale / limited.scale), after[0], after[1]);
        this.camera = limited;
      }
      this.markMoving();
      g.moved = Math.max(g.moved, Math.hypot(after[0] - g.start[0], after[1] - g.start[1]));
      if (g.moved > 4) { this.lookAt = null; this.zoomIntent = 0; }
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
        const recent = g.samples.filter((s) => performance.now() - s.t < 100);
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
      const log = wheelLog(kind, dy);
      if (this.options.reducedMotion) {
        this.wheel = null;
        this.camera = this.limit(zoomAt(this.camera, this.width, this.height, x, y, Math.exp(log)), { x, y });
        this.scheduleSettle();
        this.invalidate();
        return;
      }
      // A mouse wheel glides (~1.3× a notch); a trackpad or pinch, smooth by itself, is followed closely.
      this.addZoom(log, x, y, kind === "notch" ? TAU_NOTCH : TAU_SMOOTH);
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
    // (A drag measures its overshoot from where it starts, against the pin it starts with.)
    this.dragRaw = null;
    this.dragBase = { ...this.camera };
    this.boundsId = null;
    const ids = chainUp(this.set, this.focusId);
    this.pinFrozen = ids.length ? ids : null;
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
    // No names while the view moves under a resting pointer: they come back once it settles.
    if (this.moving) { this.setHover(null); return; }
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
