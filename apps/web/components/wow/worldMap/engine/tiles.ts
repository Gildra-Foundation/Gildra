import type { MapArt } from "@/lib/wow/worldMap/types";

/**
 * Tile cache of the world map: fetches WebP tiles by priority (a few at a
 * time, decoded off the main thread with createImageBitmap), keeps them as
 * GPU textures and forgets the least recently drawn ones past a budget.
 */
export type Tile = {
  key: string;
  state: "queued" | "loading" | "ready" | "failed";
  texture: WebGLTexture | null;
  width: number;
  height: number;
  readyAt: number;
  usedAt: number;
  priority: number;
  abort?: AbortController;
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

export class TileStore {
  private tiles = new Map<string, Tile>();
  private wanted: Tile[] = [];
  private active = 0;
  private frame = 0;
  bytes = 0;
  loadedCount = 0;
  onReady: () => void = () => {};

  constructor(private gl: WebGLRenderingContext, private budget: number, private concurrency: number) {}

  /** A tile for this frame; asks for it with a priority (lower loads first). */
  get(key: string, priority: number): Tile {
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = { key, state: "queued", texture: null, width: 0, height: 0, readyAt: 0, usedAt: this.frame, priority };
      this.tiles.set(key, tile);
    }
    tile.usedAt = this.frame;
    if (tile.state === "queued") {
      tile.priority = Math.min(tile.priority, priority);
      this.wanted.push(tile);
    }
    return tile;
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
    if (this.tiles.size > this.budget) this.evict();
  }

  get pending() { return this.active; }

  private load(tile: Tile) {
    tile.state = "loading";
    this.active += 1;
    const abort = new AbortController();
    tile.abort = abort;
    const done = () => { this.active -= 1; tile.abort = undefined; };
    fetch(tile.key, { signal: abort.signal, cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        done();
        if (!this.tiles.has(tile.key)) { bitmap.close?.(); return; }
        this.upload(tile, bitmap);
        bitmap.close?.();
        this.onReady();
      })
      .catch(() => {
        done();
        tile.state = "failed";
        this.onReady();
      });
  }

  private upload(tile: Tile, source: ImageBitmap) {
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
      .filter((tile) => tile.usedAt < this.frame - 2 && tile.state !== "loading")
      .sort((a, b) => a.usedAt - b.usedAt);
    for (const tile of old) {
      if (this.tiles.size <= this.budget * 0.85) break;
      this.drop(tile);
    }
  }

  private drop(tile: Tile) {
    if (tile.texture) {
      this.gl.deleteTexture(tile.texture);
      this.bytes -= tile.width * tile.height * 4;
    }
    tile.abort?.abort();
    this.tiles.delete(tile.key);
  }

  dispose() {
    for (const tile of [...this.tiles.values()]) this.drop(tile);
  }
}
