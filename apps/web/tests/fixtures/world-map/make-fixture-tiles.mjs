#!/usr/bin/env node
// Development-only stand-in art for the world map viewer: procedural terrain
// tiles for the maps of tests/fixtures/world-map/maps.json (and the era
// overrides of eras.json), their masks and the deep-zoom terrain, written to
// apps/web/public/maps/fixture-tiles/.
// Never committed: the real game art comes from the map data pipeline.
// Run from the repo root: node apps/web/tests/fixtures/world-map/make-fixture-tiles.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.resolve(here, "../../..");
const require = createRequire(path.join(web, "package.json"));
const sharp = require("sharp");
const maps = JSON.parse(fs.readFileSync(path.join(here, "maps.json"), "utf8"));
const eras = JSON.parse(fs.readFileSync(path.join(here, "eras.json"), "utf8"));
const out = path.join(web, "public");

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, octaves = 5) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { sum += amp * noise(x * f, y * f, seed + i * 17); amp *= 0.5; f *= 2.03; }
  return sum;
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function terrain(map, variant) {
  const { width: W, height: H } = map.art;
  const px = Buffer.alloc(W * H * 3);
  const seed = map.id * 7 + (variant === "classic" ? 3 : variant === "cata" ? 5 : 0);
  const city = map.type === "zone" && map.children.length === 0 && [85, 88, 89, 84, 87, 90].includes(map.id);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / W, ny = y / H;
      let rgb;
      if (map.type === "cosmic") {
        const n = fbm(nx * 3, ny * 2, seed, 4);
        rgb = mix([6, 8, 18], [40, 26, 70], Math.max(0, n - 0.45) * 2.2);
        if (hash(x, y, 9) > 0.9993) rgb = [230, 230, 255];
        for (const id of map.children) {
          const r = maps.find((m) => m.id === id)?.rectInParent;
          if (!r) continue;
          const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, rad = ((r[2] - r[0]) * W) / 2.4;
          const d = Math.hypot(x - cx * W, y - cy * H) / rad;
          if (d < 1) rgb = mix([40, 90, 140], [12, 20, 40], d * d);
          else if (d < 1.15) rgb = mix(rgb, [120, 160, 230], (1.15 - d) * 3);
        }
      } else if (city) {
        const ground = fbm(nx * 6, ny * 4, seed, 3);
        rgb = variant === "cata" ? [120, 70, 50] : [150, 120, 80];
        rgb = mix(rgb, [90, 70, 50], ground * 0.6);
        const gx = Math.floor(nx * 22), gy = Math.floor(ny * 15);
        if (hash(gx, gy, seed) > 0.45 && (x % Math.floor(W / 22)) > 6 && (y % Math.floor(H / 15)) > 6) rgb = mix(rgb, [70, 50, 40], 0.7);
        const d = Math.hypot(nx - 0.5, ny - 0.5);
        if (d > 0.48) rgb = mix(rgb, [30, 26, 22], Math.min(1, (d - 0.48) * 6));
      } else {
        const falloff = 1 - Math.min(1, Math.hypot((nx - 0.5) * 1.6, (ny - 0.5) * 1.7));
        const h = fbm(nx * 5, ny * 4, seed) * 0.8 + falloff * 0.55 - 0.35;
        const water = map.type === "world" ? 0.2 : 0.14;
        if (h < water) rgb = mix([18, 44, 66], [46, 92, 118], Math.max(0, h / water));
        else if (h < water + 0.02) rgb = [186, 168, 120];
        else if (h < 0.42) rgb = variant === "classic" ? mix([70, 120, 50], [50, 96, 40], (h - water) * 3) : variant === "cata" ? mix([140, 90, 60], [110, 70, 50], (h - water) * 3) : mix([104, 124, 64], [70, 100, 52], (h - water) * 3);
        else if (h < 0.6) rgb = mix([120, 108, 84], [150, 140, 120], (h - 0.42) * 5);
        else rgb = [226, 230, 236];
        rgb = mix(rgb, [20, 16, 12], Math.max(0, Math.hypot(nx - 0.5, ny - 0.5) - 0.42) * 1.4);
      }
      const o = (y * W + x) * 3;
      px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2];
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } });
}

async function pyramid(map, art, variant) {
  const base = await terrain({ ...map, art }, variant).png().toBuffer();
  for (let z = 0; z <= art.maxZoom; z++) {
    const scale = 2 ** (art.maxZoom - z);
    const w = Math.ceil(art.width / scale), h = Math.ceil(art.height / scale);
    const level = await sharp(base).resize(w, h).png().toBuffer();
    for (let ty = 0; ty * art.tileSize < h; ty++) {
      for (let tx = 0; tx * art.tileSize < w; tx++) {
        const file = path.join(out, art.url.replace("{id}", map.id).replace("{z}", z).replace("{x}", tx).replace("{y}", ty));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tw = Math.min(art.tileSize, w - tx * art.tileSize), th = Math.min(art.tileSize, h - ty * art.tileSize);
        await sharp(level).extract({ left: tx * art.tileSize, top: ty * art.tileSize, width: tw, height: th }).webp({ quality: 78 }).toFile(file);
      }
    }
  }
}

// soft elliptical mask of a map's own area (single channel, white = the map)
async function mask(url, art) {
  if (!url) return;
  const w = Math.min(512, art.width), h = Math.round((w * art.height) / art.width);
  const px = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x / w - 0.5) / 0.42, (y / h - 0.5) / 0.4) + (fbm(x / 40, y / 40, 9) - 0.5) * 0.3;
    px[y * w + x] = Math.round(255 * Math.max(0, Math.min(1, (1 - d) / 0.12)));
  }
  const file = path.join(out, url.replace(/^\//, ""));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(px, { raw: { width: w, height: h, channels: 1 } }).webp({ quality: 70 }).toFile(file);
}

// deep-zoom terrain: one 256 px tile per block, open sea (no tile) at the edges
async function terrainPyramid(map) {
  const t = map.terrain;
  if (!t) return;
  const index = {};
  for (let z = 0; z <= t.maxZoom; z++) {
    const scale = 2 ** (t.maxZoom - z);
    const cols = Math.ceil(t.width / scale / t.tileSize), rows = Math.ceil(t.height / scale / t.tileSize);
    index[z] = [];
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
      if (z === t.maxZoom && Math.hypot((tx + 0.5) / cols - 0.5, (ty + 0.5) / rows - 0.5) > 0.5) continue;
      const px = Buffer.alloc(t.tileSize * t.tileSize * 3);
      for (let y = 0; y < t.tileSize; y++) for (let x = 0; x < t.tileSize; x++) {
        const h = fbm((tx * t.tileSize + x) * scale / 300, (ty * t.tileSize + y) * scale / 300, map.id);
        px.set(mix([60, 90, 50], [150, 140, 100], h).map(Math.round), (y * t.tileSize + x) * 3);
      }
      const file = path.join(out, t.url.replace(/^\//, "").replace("{z}", z).replace("{x}", tx).replace("{y}", ty));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await sharp(px, { raw: { width: t.tileSize, height: t.tileSize, channels: 3 } }).webp({ quality: 70 }).toFile(file);
      index[z].push(`${tx}_${ty}`);
    }
  }
  if (t.index) fs.writeFileSync(path.join(out, t.index.replace(/^\//, "")), JSON.stringify(index));
}

for (const map of maps) {
  await pyramid(map, map.art, "retail");
  await mask(map.mask, map.art);
  await terrainPyramid(map);
}
for (const era of eras) {
  for (const [id, value] of Object.entries(era.maps)) {
    if (!value || typeof value !== "object" || value.absent) continue;
    const art = "url" in value ? value : value.art;
    if (!art) continue;
    const map = maps.find((m) => m.id === Number(id));
    await pyramid(map, art, era.id === "classic" ? "classic" : "cata");
    if (value.mask) await mask(value.mask, art);
  }
}
console.log("fixture tiles written under", path.join(out, "maps/fixture-tiles"));
