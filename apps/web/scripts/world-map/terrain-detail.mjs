#!/usr/bin/env node
// Terrain detail index: which deepest-level terrain tiles carry less real detail than their texels (a minimap block
// of 256 or 128 px stretched by nearest sampling onto the 512 px grid, see docs/world-map/TERRAIN.md). Writes
// <pyramid>/detail.json = { "<z>": { "x_y": factor } } (factor 2 or 4; tiles at full detail are left out) next to every
// index.json under public/maps/terrain. The viewer reads it to cap the zoom there at twice the SOURCE detail and to
// smooth those tiles instead of sharpening them (no blocks, no checker of the old minimaps' dithering).
//   node scripts/world-map/terrain-detail.mjs [public/maps/terrain]
// Detection per tile (luma): differences between neighbouring pixels inside a would-be 2-px block against those
// across block edges; a stretched picture has (nearly) none inside. The same with 4-px blocks for ×4.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(process.argv[2] ?? new URL("../../public/maps/terrain", import.meta.url).pathname);
const indexes = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === "index.json") indexes.push(p); } };
walk(root);

/** Mean |difference| of horizontally and vertically neighbouring pixels at offsets `o` modulo `k` (pairs (i, i+1) with i % k === o). */
function energy(px, w, h, k, o) {
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = o; x + 1 < w; x += k) { sum += Math.abs(px[y * w + x] - px[y * w + x + 1]); n += 1; }
  for (let y = o; y + 1 < h; y += k) for (let x = 0; x < w; x++) { sum += Math.abs(px[y * w + x] - px[(y + 1) * w + x]); n += 1; }
  return n ? sum / n : 0;
}

export function factorOf(px, w, h) {
  const across2 = energy(px, w, h, 2, 1), inside2 = energy(px, w, h, 2, 0);
  // Flat ground (sea, snow): nothing to tell; full detail costs nothing there.
  if (across2 < 1.2) return 1;
  if (inside2 / across2 > 0.45) return 1;
  const across4 = energy(px, w, h, 4, 3), inside4 = energy(px, w, h, 4, 1);
  return across4 > 1.2 && inside4 / across4 < 0.45 ? 4 : 2;
}

let files = 0, coarse = 0;
for (const index of indexes) {
  const dir = path.dirname(index);
  const levels = JSON.parse(fs.readFileSync(index, "utf8"));
  const z = Math.max(...Object.keys(levels).map(Number));
  const out = {};
  for (const key of levels[String(z)] ?? []) {
    const file = path.join(dir, String(z), `${key}.webp`);
    if (!fs.existsSync(file)) continue;
    const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
    files += 1;
    const f = factorOf(data, info.width, info.height);
    if (f > 1) { out[key] = f; coarse += 1; }
  }
  const target = path.join(dir, "detail.json");
  if (Object.keys(out).length) fs.writeFileSync(target, JSON.stringify({ [z]: out }) + "\n");
  else if (fs.existsSync(target)) fs.rmSync(target);
  console.log(`${path.relative(root, dir).padEnd(18)} z${z} ${String(Object.keys(out).length).padStart(5)} coarse of ${(levels[String(z)] ?? []).length}`);
}
console.log(`${files} tiles, ${coarse} coarse`);
