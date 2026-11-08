import type { MapArt } from "@/lib/wow/worldMap/types";

/**
 * Tile cache of the world map: fetches WebP tiles by priority (a few at a
 * time, the middle of the screen first, decoded off the main thread with
 * createImageBitmap), keeps them as GPU textures and forgets the least
 * recently drawn ones past a memory budget. Loads nobody asked for during the
 * last half second (the view moved on) are cancelled.
 */
export type Tile = {
  key: string;
  state: "queued" | "loading" | "decoded" | "ready" | "failed";
  /** Decoded off the main thread, waiting for its turn to go to the GPU. */
  bitmap?: ImageBitmap;
  texture: WebGLTexture | null;
  width: number;
  height: number;
  readyAt: number;
  usedAt: number;
  priority: number;
  abort?: AbortController;
  /** Made here instead of fetched (a backdrop worked out of a tile). */
  source?: () => Promise<TexImageSource & { width: number; height: number }>;
};

export const tileUrl = (art: MapArt, id: number, z: number, x: number, y: number) =>
  art.url.replace("{id}", String(id)).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

export const levelSize = (art: MapArt, z: number) => {
  const div = 2 ** (art.maxZoom - z);
  return [Math.ceil(art.width / div), Math.ceil(art.height / div)] as const;
};
export const levelTiles = (art: MapArt, z: number) => {
  const [w, h] = levelSize(art, z);
  return [Math.ceil(w / art.tileSize), Math.ceil(h / art.tileSize)] as const;
};

/** Frames without a request after which a running load is cancelled (~0.5 s at 60 fps; ~0.15 s while the view moves fast). */
const STALE_FRAMES = 30;
const STALE_FRAMES_MOVING = 10;

export class TileStore {
  private tiles = new Map<string, Tile>();
  private wanted: Tile[] = [];
  private uploads: Tile[] = [];
  private active = 0;
  private frame = 0;
  bytes = 0;
  loadedCount = 0;
  /** The view moves (pan, zoom, flight): loads the view has left are cancelled sooner. */
  moving = false;
  /** Upload timings (ms per frame that uploaded anything), for the probe. */
  uploadTimes: number[] = [];
  onReady: () => void = () => {};

  /** `budget`: GPU bytes kept; `concurrency`: loads at a time. */
  constructor(private gl: WebGLRenderingContext, private budget: number, private concurrency: number, private maxEntries = 900) {}

  /** A tile for this frame; asks for it with a priority (lower loads first). */
  get(key: string, priority: number, source?: Tile["source"]): Tile {
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = { key, state: "queued", texture: null, width: 0, height: 0, readyAt: 0, usedAt: this.frame, priority, ...(source ? { source } : {}) };
      this.tiles.set(key, tile);
    }
    tile.usedAt = this.frame;
    if (tile.state === "queued") {
      tile.priority = Math.min(tile.priority, priority);
      this.wanted.push(tile);
    }
    return tile;
  }

  /** Loaded or given up on (nothing more to wait for), without asking. */
  settled(key: string) {
    const state = this.tiles.get(key)?.state;
    return state === "ready" || state === "failed";
  }

  /** Peek without asking. */
  peek(key: string) {
    const tile = this.tiles.get(key);
    if (tile) tile.usedAt = this.frame;
    return tile && tile.state === "ready" ? tile : null;
  }

  /** End of a frame: start the most wanted loads, forget old textures. */
  endFrame() {
    this.frame += 1;
    const queue = [...new Set(this.wanted)].sort((a, b) => a.priority - b.priority);
    this.wanted = [];
    for (const tile of queue) {
      if (this.active >= this.concurrency) break;
      if (tile.state === "queued") this.load(tile);
    }
    // Reset priorities so stale wishes do not keep their place.
    for (const tile of queue) if (tile.state === "queued") tile.priority = Number.POSITIVE_INFINITY;
    // Loads for places the view has left: cancel them (they would only push wanted tiles back).
    const stale = this.moving ? STALE_FRAMES_MOVING : STALE_FRAMES;
    if (this.frame % (this.moving ? 4 : 8) === 0) {
      for (const tile of this.tiles.values()) if (tile.state === "loading" && tile.usedAt < this.frame - stale) this.drop(tile);
    }
    if (this.bytes > this.budget || this.tiles.size > this.maxEntries) this.evict();
  }

  get pending() { return this.active + this.uploads.length; }

  /**
   * Upload decoded tiles to the GPU, the most wanted first, within a time budget per frame
   * (a burst of tiles never stalls one frame); the rest wait for the next frames.
   */
  flushUploads(budgetMs: number) {
    if (!this.uploads.length) return 0;
    const t0 = performance.now();
    this.uploads.sort((a, b) => a.priority - b.priority);
    let done = 0;
    while (this.uploads.length) {
      const tile = this.uploads.shift() as Tile;
      const bitmap = tile.bitmap;
      tile.bitmap = undefined;
      if (!bitmap || this.tiles.get(tile.key) !== tile) { bitmap?.close?.(); continue; }
      this.upload(tile, bitmap);
      bitmap.close?.();
      done += 1;
      if (performance.now() - t0 >= budgetMs) break;
    }
    const ms = performance.now() - t0;
    this.uploadTimes.push(ms);
    if (this.uploadTimes.length > 600) this.uploadTimes.splice(0, this.uploadTimes.length - 600);
    return done;
  }

  private load(tile: Tile) {
    tile.state = "loading";
    this.active += 1;
    const abort = new AbortController();
    tile.abort = abort;
    const done = () => { if (tile.abort === abort) { this.active -= 1; tile.abort = undefined; } };
    if (tile.source) {
      tile.source()
        .then((image) => {
          done();
          if (this.tiles.get(tile.key) !== tile || abort.signal.aborted) return;
          this.upload(tile, image);
          this.onReady();
        })
        .catch(() => {
          const cancelled = abort.signal.aborted;
          done();
          if (cancelled) return;
          tile.state = "failed";
          this.onReady();
        });
      return;
    }
    fetch(tile.key, { signal: abort.signal, cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      // Decoded off the main thread (options here can send the browser down a slower decode path).
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        done();
        if (this.tiles.get(tile.key) !== tile) { bitmap.close?.(); return; }
        // At rest (loading a view) a decoded tile goes to the GPU at once; only while the view moves do uploads
        // wait in a queue drained within a per-frame budget (a burst must not stall a moving frame).
        if (!this.moving) {
          this.upload(tile, bitmap);
          bitmap.close?.();
        } else {
          tile.state = "decoded";
          tile.bitmap = bitmap;
          this.uploads.push(tile);
        }
        this.onReady();
      })
      .catch(() => {
        const cancelled = abort.signal.aborted;
        done();
        if (cancelled) return;
        tile.state = "failed";
        this.onReady();
      });
  }

  private upload(tile: Tile, source: TexImageSource & { width: number; height: number }) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    tile.texture = texture;
    tile.width = source.width;
    tile.height = source.height;
    tile.state = "ready";
    tile.readyAt = performance.now();
    this.bytes += source.width * source.height * 4;
    this.loadedCount += 1;
  }

  private evict() {
    const old = [...this.tiles.values()]
      .filter((tile) => tile.usedAt < this.frame - 2 && tile.state !== "loading" && tile.state !== "decoded")
      .sort((a, b) => a.usedAt - b.usedAt);
    for (const tile of old) {
      if (this.bytes <= this.budget * 0.85 && this.tiles.size <= this.maxEntries * 0.85) break;
      this.drop(tile);
    }
  }

  private drop(tile: Tile, lost = false) {
    if (tile.texture) {
      if (!lost) this.gl.deleteTexture(tile.texture);
      this.bytes -= tile.width * tile.height * 4;
      this.loadedCount -= 1;
    }
    if (tile.abort) { const abort = tile.abort; tile.abort = undefined; this.active -= 1; abort.abort(); }
    if (tile.bitmap) { tile.bitmap.close?.(); tile.bitmap = undefined; this.uploads = this.uploads.filter((t) => t !== tile); }
    this.tiles.delete(tile.key);
  }

  /** The GL context was lost: every texture is gone; start again (the browser cache keeps the files). */
  reset() {
    for (const tile of [...this.tiles.values()]) this.drop(tile, true);
    this.wanted = [];
  }

  get count() { return this.tiles.size; }

  dispose() {
    for (const tile of [...this.tiles.values()]) this.drop(tile);
  }
}
