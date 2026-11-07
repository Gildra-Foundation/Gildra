import type { AtlasBundle, AtlasEra, AtlasMap } from "@/lib/wow/worldMap/bundle";
import type { MapArt } from "@/lib/wow/worldMap/types";
import { clamp, contains, easeInOut, fitBox, flightPath, intersects, smoothstep, toAtlas, toScreen, zoomAt, type Box, type Camera } from "./camera";
import { MapRenderer } from "./gl";
import { levelSize, levelTiles, TileStore, tileUrl } from "./tiles";

/**
 * The world map viewer: camera, input (pointer, wheel, pinch, keyboard,
 * double click, inertia), level-of-detail tiles and the nested maps that fade
 * in at their places as you zoom — continent → zones → cities, Cosmic →
 * worlds through a round portal. Eras swap the art with a cross-fade; the
 * compare mode splits the view between two eras at a divider.
 */
export type Insets = { top: number; right: number; bottom: number; left: number };
/** A map in this frame: its art rect on screen and the part of it inside its parents (children may overhang). */
export type DrawnMap = { map: AtlasMap; alpha: number; screen: Box; clip: Box; dim?: number };
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
};
export type EngineOptions = { alive: boolean; reducedMotion: boolean; insets: Insets };

type Flight = { path: ReturnType<typeof flightPath>; start: number; duration: number; after?: () => void };
type Pointer = { id: number; x: number; y: number };

const FADE_TILE = 240;
const FADE_ERA = 700;

export class WorldMapEngine {
  readonly maps = new Map<number, AtlasMap>();
  private renderer: MapRenderer;
  private tiles: TileStore;
  private camera: Camera = { x: 0.5, y: 0.33, scale: 1000 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private quality = 1;
  private frameTimes: number[] = [];
  private raf = 0;
  private dirty = true;
  private lastFrame = 0;
  private visible = true;
  private flight: Flight | null = null;
  private velocity: { x: number; y: number } | null = null;
  private wheel: { x: number; y: number; log: number } | null = null;
  private pointers = new Map<number, Pointer>();
  private gesture: { distance: number; mid: [number, number]; moved: number; start: [number, number]; startTime: number; samples: Array<{ t: number; x: number; y: number }> } | null = null;
  private focusId = -1;
  private hoverId: number | null = null;
  private clickTimer = 0;
  private settleTimer = 0;
  private era: AtlasEra | null = null;
  private fromEra: AtlasEra | null = null;
  private eraStart = 0;
  private compare: { left: AtlasEra | null; right: AtlasEra | null; at: number } | null = null;
  private start = performance.now();
  private pausedTime = 0;
  private lastInfo: FrameInfo | null = null;
  private disposed = false;
  private cleanup: Array<() => void> = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private surface: HTMLElement,
    bundle: AtlasBundle,
    private events: EngineEvents,
    private options: EngineOptions,
  ) {
    for (const map of bundle.maps) this.maps.set(map.id, map);
    this.renderer = new MapRenderer(canvas);
    const coarse = matchMedia("(pointer: coarse)").matches;
    const cores = navigator.hardwareConcurrency || 4;
    this.quality = coarse && cores <= 4 ? 0.75 : 1;
    this.tiles = new TileStore(this.renderer.gl, coarse ? 220 : 480, 6);
    this.tiles.onReady = () => this.invalidate();
    this.bindInput();
    this.resize();
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(surface);
    const intersection = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; if (this.visible) this.invalidate(); });
    intersection.observe(surface);
    const onVisibility = () => { if (!document.hidden) this.invalidate(); };
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", (event) => event.preventDefault());
    this.cleanup.push(() => observer.disconnect(), () => intersection.disconnect(), () => document.removeEventListener("visibilitychange", onVisibility));
  }

  // ---------------------------------------------------------------- public

  get view() { return this.camera; }
  get size() { return { width: this.width, height: this.height }; }
  get focus() { return this.maps.get(this.focusId) ?? null; }

  setOptions(next: Partial<EngineOptions>) {
    this.options = { ...this.options, ...next };
    this.invalidate();
  }

  setEra(era: AtlasEra | null, animate = true) {
    if (era?.id === this.era?.id) return;
    this.fromEra = animate && !this.options.reducedMotion ? this.era : null;
    this.era = era;
    this.eraStart = performance.now();
    this.invalidate();
  }

  setCompare(compare: { left: AtlasEra | null; right: AtlasEra | null; at: number } | null) {
    this.compare = compare;
    this.invalidate();
  }

  /** The art a map shows in an era: `null` when it did not exist then. */
  artIn(map: AtlasMap, era: AtlasEra | null): MapArt | null {
    if (era && map.id in era.maps) return era.maps[map.id];
    return map.art;
  }

  /** Camera that shows a box inside the free part of the viewport (UI panels excluded). */
  fit(box: Box, margin = 0.05): Camera {
    const { top, right, bottom, left } = this.options.insets;
    const freeW = Math.max(80, this.width - left - right), freeH = Math.max(80, this.height - top - bottom);
    let camera = fitBox(box, freeW, freeH, margin);
    // A wide map on a tall phone screen: come closer than "whole" so it fills more of the screen (pan sideways).
    const boxAspect = (box[2] - box[0]) / (box[3] - box[1]);
    if (freeW / freeH < 0.85 && boxAspect > 1.1) camera = { ...camera, scale: Math.min(camera.scale * 1.55, (freeH * (1 - margin * 2)) / (box[3] - box[1])) };
    return { scale: camera.scale, x: camera.x - (left - right) / 2 / camera.scale, y: camera.y - (top - bottom) / 2 / camera.scale };
  }

  fitMap(id: number) {
    const map = this.maps.get(id);
    return map ? this.fit(map.frame) : null;
  }

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
    if (this.options.reducedMotion) { this.jumpTo(to); after?.(); return; }
    const sameRoot = this.rootAt(this.camera.x, this.camera.y) === this.rootAt(to.x, to.y);
    if (!sameRoot) {
      // Another hierarchy far away: a quick fade instead of flying through the void.
      this.canvas.style.transition = "opacity 180ms ease";
      this.canvas.style.opacity = "0";
      window.setTimeout(() => {
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
    if (camera) this.flyTo(camera, after);
  }

  /** Centre a point of a map with the map shown at least whole. */
  flyToPoint(mapId: number, x: number, y: number, zoom = 1.6, after?: () => void) {
    const map = this.maps.get(mapId);
    if (!map) return;
    const fit = this.fit(map.frame);
    const [ax, ay] = this.mapPoint(map, x, y);
    const { top, right, bottom, left } = this.options.insets;
    const scale = fit.scale * zoom;
    this.flyTo({ scale, x: ax - (left - right) / 2 / scale, y: ay - (top - bottom) / 2 / scale }, after);
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2) {
    const target = this.limit(zoomAt(this.camera, this.width, this.height, sx, sy, factor));
    if (this.options.reducedMotion) this.jumpTo(target);
    else {
      this.flight = { path: flightPath(this.camera, target, this.width, this.height, 0.0001), start: performance.now(), duration: 320 };
      this.invalidate();
    }
  }

  panBy(dx: number, dy: number) {
    this.flyTo({ ...this.camera, x: this.camera.x + dx / this.camera.scale, y: this.camera.y + dy / this.camera.scale });
  }

  /** One level up, like the zoom-out button of the game's map. */
  up() {
    const focus = this.focus;
    if (!focus) return;
    const fitFocus = this.fit(focus.frame);
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
    for (let map = this.maps.get(id); map; map = map.parent === null ? undefined : this.maps.get(map.parent)) out.unshift(map);
    return out;
  }

  /** The child map the reader would open by clicking at a screen point. */
  drillTarget(sx: number, sy: number): AtlasMap | null {
    const info = this.lastInfo;
    if (!info) return null;
    const [ax, ay] = this.unproject(sx, sy);
    // The deepest settled map under the point is the base; its children are the targets.
    let base: AtlasMap | null = null;
    for (const entry of info.drawn) if (entry.alpha > 0.85 && contains(entry.map.frame, ax, ay)) base = entry.map;
    if (!base) return null;
    let best: AtlasMap | null = null;
    let bestArea = Infinity;
    for (const id of base.children) {
      const child = this.maps.get(id);
      if (!child || !contains(child.box, ax, ay) || this.artIn(child, this.era) === null) continue;
      const area = (child.box[2] - child.box[0]) * (child.box[3] - child.box[1]);
      if (area < bestArea) { best = child; bestArea = area; }
    }
    return best;
  }

  invalidate() {
    this.dirty = true;
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  resize() {
    const rect = this.surface.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    if (this.width > 1 && (width !== this.width || height !== this.height)) {
      // Keep the same span of the atlas visible across a resize.
      this.camera = { ...this.camera, scale: this.camera.scale * Math.min(width / this.width, height / this.height) ** 0.5 * Math.max(width / this.width, height / this.height) ** 0.5 };
    }
    this.width = width;
    this.height = height;
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
    this.renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  stats() {
    return { tiles: this.tiles.loadedCount, gpuMB: Math.round(this.tiles.bytes / 1048576), dpr: this.dpr, frameMs: this.frameTimes.length ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length : 0 };
  }

  // ---------------------------------------------------------------- loop

  private applyDpr() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const w = Math.round(this.width * this.dpr), h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  private get alive() { return this.options.alive && !this.options.reducedMotion; }

  private tick(now: number) {
    this.raf = 0;
    if (this.disposed) return;
    const dt = Math.min(64, now - (this.lastFrame || now));
    const animating = Boolean(this.flight || this.velocity || this.wheel || this.pointers.size || (this.fromEra && now - this.eraStart < FADE_ERA));
    if (!this.visible || document.hidden) { this.lastFrame = now; return; }
    // The living layers alone run at ~30 fps; interaction at full rate.
    if (!animating && !this.dirty && this.alive && now - this.lastFrame < 31) { this.raf = requestAnimationFrame((t) => this.tick(t)); return; }
    this.lastFrame = now;
    this.step(now, dt);
    const t0 = performance.now();
    this.render(now);
    this.measure(performance.now() - t0 + (dt > 40 ? 8 : 0));
    this.dirty = false;
    const keep = this.flight || this.velocity || this.wheel || this.alive || this.tiles.pending > 0 || this.fading(now) || (this.fromEra && now - this.eraStart < FADE_ERA);
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
      const portion = 1 - Math.exp(-dt / 85);
      const log = this.wheel.log * portion;
      this.wheel.log -= log;
      this.camera = this.limit(zoomAt(this.camera, this.width, this.height, this.wheel.x, this.wheel.y, Math.exp(log)), this.wheel);
      if (Math.abs(this.wheel.log) < 0.002) { this.wheel = null; this.scheduleSettle(); }
    }
    if (this.velocity) {
      this.camera = this.limit({ ...this.camera, x: this.camera.x - (this.velocity.x * dt) / this.camera.scale, y: this.camera.y - (this.velocity.y * dt) / this.camera.scale });
      const decay = Math.exp(-dt / 300);
      this.velocity = { x: this.velocity.x * decay, y: this.velocity.y * decay };
      if (Math.hypot(this.velocity.x, this.velocity.y) < 0.02) { this.velocity = null; this.scheduleSettle(); }
    }
  }

  private scheduleSettle() {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => { if (this.lastInfo) this.events.settle(this.lastInfo); }, 260);
  }

  private rootAt(x: number, y: number) {
    for (const map of this.maps.values()) if (map.depth === 0 && contains([map.box[0] - 1, map.box[1] - 1, map.box[2] + 1, map.box[3] + 1], x, y)) return map.id;
    return -1;
  }

  /** Zoom limits: from a whole top map down to a few times the native size of the deepest map at the centre. */
  private limit(camera: Camera, anchor?: { x: number; y: number }): Camera {
    const root = this.maps.get(this.rootAt(camera.x, camera.y)) ?? [...this.maps.values()][0];
    if (!root) return camera;
    const min = this.fit(root.frame, 0.02).scale * 0.6;
    let deepest = root;
    for (const map of this.maps.values()) {
      if (map.depth > deepest.depth && contains(map.frame, camera.x, camera.y) && this.artIn(map, this.era)) deepest = map;
    }
    const art = this.artIn(deepest, this.era) ?? deepest.art;
    const max = art ? (art.width / (deepest.frame[2] - deepest.frame[0])) * 2.4 : min * 100;
    const scale = clamp(camera.scale, min, Math.max(min, max));
    let next = { ...camera, scale };
    if (anchor && scale !== camera.scale) {
      // Clamped wheel zoom: keep the point under the cursor in place.
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

  private collect(era: AtlasEra | null): DrawnMap[] {
    const out: DrawnMap[] = [];
    const view: Box = [0, 0, this.width, this.height];
    const minDim = Math.min(this.width, this.height);
    const visit = (map: AtlasMap, alpha: number, parentClip: Box | null) => {
      const art = this.artIn(map, era);
      if (!art) return;
      const [x0, y0] = this.project(map.frame[0], map.frame[1]);
      const [x1, y1] = this.project(map.frame[2], map.frame[3]);
      const screen: Box = [x0, y0, x1, y1];
      const clip: Box = parentClip && !map.portal
        ? [Math.max(x0, parentClip[0]), Math.max(y0, parentClip[1]), Math.min(x1, parentClip[2]), Math.min(y1, parentClip[3])]
        : screen;
      if (clip[2] <= clip[0] || clip[3] <= clip[1] || !intersects(clip, view)) return;
      const entry: DrawnMap = { map, alpha, screen, clip };
      out.push(entry);
      const density = ((x1 - x0) * this.dpr) / art.width;
      let portalOpen = 0;
      let dominant = 0;
      for (const id of map.children) {
        const child = this.maps.get(id);
        if (!child) continue;
        const [cx0, cy0] = this.project(child.frame[0], child.frame[1]);
        const [cx1, cy1] = this.project(child.frame[2], child.frame[3]);
        let a: number;
        if (child.portal) {
          a = smoothstep(0.34, 0.8, Math.min(cx1 - cx0, cy1 - cy0) / minDim);
          portalOpen = Math.max(portalOpen, a);
        } else {
          // A child opens when the parent's picture runs out of detail, or when the
          // child fills most of the view (a continent framed on the world map).
          const fill = Math.max((cx1 - cx0) / this.width, (cy1 - cy0) / this.height);
          // Detail alone does not open a small child (a city on a continent): it must also take a fair part of the view.
          a = Math.max(Math.min(smoothstep(0.6 / this.quality, 1.05 / this.quality, density), smoothstep(0.22, 0.45, fill)), smoothstep(0.5, 0.85, fill));
          // The map the reader came to see stands out: its parent darkens around it.
          dominant = Math.max(dominant, a * smoothstep(0.6, 0.95, fill));
        }
        if (a > 0.003) visit(child, alpha * a, clip);
      }
      // A world opened from the Cosmic map: the starry parchment around it falls back.
      if (portalOpen > 0) entry.alpha = alpha * (1 - 0.8 * portalOpen);
      if (dominant > 0) entry.dim = 0.62 * dominant;
    };
    for (const map of this.maps.values()) if (map.depth === 0) visit(map, 1, null);
    // A settled map that covers the whole view hides everything drawn before it.
    for (let i = out.length - 1; i > 0; i--) {
      const entry = out[i];
      if (entry.alpha > 0.995 && !entry.map.portal && entry.clip[0] <= 0 && entry.clip[1] <= 0 && entry.clip[2] >= this.width && entry.clip[3] >= this.height) {
        return out.slice(i);
      }
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

    let drawn: DrawnMap[];
    if (this.compare) {
      const split = this.compare.at * W;
      this.renderer.clip([0, 0, split, H], H);
      drawn = this.collect(this.compare.left);
      this.drawList(drawn, this.compare.left, 1, cloud, water, now);
      this.renderer.clip([split, 0, W, H], H);
      const right = this.collect(this.compare.right);
      this.drawList(right, this.compare.right, 1, cloud, water, now);
      this.renderer.clip(null, H);
      drawn = right.length >= drawn.length ? right : drawn;
    } else {
      const fade = this.fromEra ? clamp((now - this.eraStart) / FADE_ERA, 0, 1) : 1;
      if (this.fromEra && fade < 1) {
        const before = this.collect(this.fromEra);
        this.drawList(before, this.fromEra, 1, cloud, water, now);
        drawn = this.collect(this.era);
        this.drawList(drawn, this.era, easeInOut(fade), cloud, water, now, this.fromEra);
      } else {
        if (this.fromEra) this.fromEra = null;
        drawn = this.collect(this.era);
        this.drawList(drawn, this.era, 1, cloud, water, now);
      }
    }
    this.tiles.endFrame();

    // Focus: the deepest well-shown map under the centre of the free area.
    const { top, right, bottom, left } = this.options.insets;
    const [cx, cy] = this.unproject(left + (this.width - left - right) / 2, top + (this.height - top - bottom) / 2);
    let focus = drawn[0]?.map ?? this.maps.values().next().value as AtlasMap;
    for (const entry of drawn) if (entry.alpha > 0.5 && contains(entry.map.frame, cx, cy) && entry.map.depth >= (focus?.depth ?? 0)) focus = entry.map;
    if (focus && focus.id !== this.focusId) {
      this.focusId = focus.id;
      this.events.focus(this.chain(focus.id));
    }
    const moving = Boolean(this.flight || this.velocity || this.wheel || this.pointers.size);
    this.lastInfo = { camera: this.camera, width: this.width, height: this.height, focus, drawn, moving, time };
    this.events.frame(this.lastInfo);
  }

  /** Draws the maps of one era; `over` = the era fading out underneath (only changed art is drawn again). */
  private drawList(list: DrawnMap[], era: AtlasEra | null, eraAlpha: number, cloud: number, water: number, now: number, over?: AtlasEra) {
    const moving = Boolean(this.flight || this.velocity || this.wheel || this.pointers.size);
    for (const entry of list) {
      const art = this.artIn(entry.map, era);
      if (!art) continue;
      if (over && eraAlpha < 1 && this.artIn(entry.map, over) === art) continue;
      const hovered = this.hoverId === entry.map.id && entry.alpha < 0.98;
      const alpha = (hovered ? Math.max(entry.alpha, 0.3) : entry.alpha) * eraAlpha;
      if (alpha < 0.003) continue;
      const terrain = entry.map.type !== "cosmic";
      this.drawArt(entry.map, art, entry.screen, entry.clip, alpha, hovered ? 0.55 : -(entry.dim ?? 0), terrain ? cloud * (entry.map.depth <= 2 || entry.map.type === "continent" ? 1 : 0.6) : 0, terrain ? water : 0, now, moving);
    }
    // A hovered child that is not drawn yet peeks through its parent.
    if (this.hoverId !== null && !list.some((entry) => entry.map.id === this.hoverId)) {
      const map = this.maps.get(this.hoverId);
      const art = map && this.artIn(map, era);
      const parent = map && list.find((entry) => entry.map.id === map.parent);
      if (map && art && parent) {
        const [x0, y0] = this.project(map.frame[0], map.frame[1]);
        const [x1, y1] = this.project(map.frame[2], map.frame[3]);
        const clip: Box = [Math.max(x0, parent.clip[0]), Math.max(y0, parent.clip[1]), Math.min(x1, parent.clip[2]), Math.min(y1, parent.clip[3])];
        if (clip[2] > clip[0] && clip[3] > clip[1]) this.drawArt(map, art, [x0, y0, x1, y1], clip, 0.3 * eraAlpha, 0.55, 0, 0, now, moving);
      }
    }
  }

  private drawArt(map: AtlasMap, art: MapArt, screen: Box, clipBox: Box, alpha: number, light: number, cloud: number, water: number, now: number, moving: boolean) {
    const d = this.dpr;
    const sx0 = screen[0] * d, sy0 = screen[1] * d, sx1 = screen[2] * d, sy1 = screen[3] * d;
    const devW = sx1 - sx0, devH = sy1 - sy0;
    const W = this.canvas.width, H = this.canvas.height;
    const cx0 = Math.max(0, clipBox[0] * d), cy0 = Math.max(0, clipBox[1] * d), cx1 = Math.min(W, clipBox[2] * d), cy1 = Math.min(H, clipBox[3] * d);
    // Level: the smallest one that is not upscaled by more than ~10%.
    let z = 0;
    while (z < art.maxZoom && levelSize(art, z)[0] < devW * 0.9) z += 1;
    const [cols, rows] = levelTiles(art, z);
    const [lw, lh] = levelSize(art, z);
    const ts = art.tileSize;
    const pxW = devW / lw, pxH = devH / lh;
    const tx0 = clamp(Math.floor((cx0 - sx0) / pxW / ts), 0, cols - 1), tx1 = clamp(Math.floor((cx1 - sx0) / pxW / ts), 0, cols - 1);
    const ty0 = clamp(Math.floor((cy0 - sy0) / pxH / ts), 0, rows - 1), ty1 = clamp(Math.floor((cy1 - sy0) / pxH / ts), 0, rows - 1);
    const feather = map.depth === 0 || map.portal ? 0 : clamp(Math.min(devW, devH) * 0.08, 6 * d, 120 * d);
    let portal: [number, number, number] = [0, 0, 0];
    if (map.portal && alpha < 0.999) {
      // The world opens from the planet outwards: a circle that grows to cover the art.
      const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2;
      const inner = Math.min(devW, devH) / 2, outer = Math.hypot(devW, devH) / 2 * 1.2;
      portal = [cx, cy, inner + (outer - inner) * smoothstep(0.35, 1, alpha)];
    }
    const base = { alpha, frame: [clipBox[0] * d, clipBox[1] * d, clipBox[2] * d, clipBox[3] * d] as Box, feather, portal, light, cloud, water };
    const centerX = W / 2, centerY = H / 2;
    // The whole picture at level 0 first: something to show while the details load.
    this.tiles.get(tileUrl(art, map.id, 0, 0, 0), map.depth);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const rx0 = sx0 + tx * ts * pxW, ry0 = sy0 + ty * ts * pxH;
        const rw = Math.min(ts, lw - tx * ts) * pxW, rh = Math.min(ts, lh - ty * ts) * pxH;
        // Opaque tiles overlap by half a pixel against seams; see-through ones must not (the overlap would show as lines).
        const o = alpha > 0.999 ? 0.5 : 0;
        const rect: Box = [rx0 - o, ry0 - o, rx0 + rw + o, ry0 + rh + o];
        const dist = Math.hypot(rx0 + rw / 2 - centerX, ry0 + rh / 2 - centerY) / Math.max(W, H);
        const tile = this.tiles.get(tileUrl(art, map.id, z, tx, ty), 2 + map.depth * 0.5 + dist * 4 + (z - 0) * 0.01);
        const fade = tile.state === "ready" ? clamp((now - tile.readyAt) / FADE_TILE, 0, 1) : 0;
        if (fade < 1) {
          this.drawFallback(map, art, z, tx, ty, rect, base);
          if (tile.state === "ready") this.fadingUntil = Math.max(this.fadingUntil, tile.readyAt + FADE_TILE);
        }
        if (tile.state === "ready" && tile.texture) {
          this.renderer.draw(tile.texture, { ...base, rect, uv: [0, 0, 1, 1], alpha: alpha * (this.options.reducedMotion ? 1 : fade) });
        }
      }
    }
    // Next level for the middle of the view, while nothing moves.
    if (!moving && z < art.maxZoom) {
      const [ncols, nrows] = levelTiles(art, z + 1);
      const nx0 = clamp(tx0 * 2, 0, ncols - 1), nx1 = clamp(tx1 * 2 + 1, 0, ncols - 1);
      const ny0 = clamp(ty0 * 2, 0, nrows - 1), ny1 = clamp(ty1 * 2 + 1, 0, nrows - 1);
      const midX = (nx0 + nx1) / 2, midY = (ny0 + ny1) / 2;
      for (let ty = ny0; ty <= ny1; ty++) {
        for (let tx = nx0; tx <= nx1; tx++) {
          if (Math.abs(tx - midX) > (nx1 - nx0) / 3 + 1 || Math.abs(ty - midY) > (ny1 - ny0) / 3 + 1) continue;
          this.tiles.get(tileUrl(art, map.id, z + 1, tx, ty), 40 + map.depth);
        }
      }
    }
  }

  private drawFallback(map: AtlasMap, art: MapArt, z: number, tx: number, ty: number, rect: Box, base: Omit<Parameters<MapRenderer["draw"]>[1], "rect" | "uv">) {
    const ts = art.tileSize;
    for (let k = 1; k <= z; k++) {
      const pz = z - k;
      const parent = this.tiles.peek(tileUrl(art, map.id, pz, tx >> k, ty >> k));
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
      if ((event.target as HTMLElement).closest("[data-map-ui]")) return;
      el.setPointerCapture(event.pointerId);
      const [x, y] = local(event);
      this.pointers.set(event.pointerId, { id: event.pointerId, x, y });
      this.flight = null;
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
      if (this.pointers.size >= 2 && beforeDistance > 0) {
        camera = zoomAt(camera, this.width, this.height, after[0], after[1], this.spread() / beforeDistance);
      }
      this.camera = this.limit(camera);
      g.moved = Math.max(g.moved, Math.hypot(after[0] - g.start[0], after[1] - g.start[1]));
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
        this.handleTap(x, y, event.pointerType);
      } else if (!this.options.reducedMotion && !wasPinch) {
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
      const delta = clamp(event.deltaY * unit, -240, 240);
      const log = -delta * (event.ctrlKey ? 0.01 : 0.0024);
      this.flight = null;
      this.velocity = null;
      if (this.options.reducedMotion) { this.camera = this.limit(zoomAt(this.camera, this.width, this.height, x, y, Math.exp(log)), { x, y }); this.scheduleSettle(); }
      else this.wheel = { x, y, log: (this.wheel?.log ?? 0) + log };
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
      if ((event.target as HTMLElement) !== el) return;
      const step = 120;
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
    const target = this.drillTarget(x, y);
    if (!target) { this.events.background(); return; }
    // Wait for a possible double click before flying in (mouse only; a tap drills at once).
    window.clearTimeout(this.clickTimer);
    const go = () => this.flyToMap(target.id);
    if (pointerType === "mouse") this.clickTimer = window.setTimeout(go, 230);
    else go();
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
