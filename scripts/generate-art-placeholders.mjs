#!/usr/bin/env node
// Blurred placeholders for the atlas paintings (roadmap item 64): a 16 px wide
// WebP of every scene, raid, boss, lair and dungeon picture, as a data URL in
// lib/atlas/artPlaceholders.json. AtlasFrame, AtlasCard and AtlasPath show it
// while the real image loads. Run after adding art: npm run art:placeholders
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dirs = ["public/assets/wow/loading", "public/assets/wow/raids", "public/assets/wow/lairs", "public/assets/wow/mythic", "public/assets/characters"];
// Single paintings used as scenes outside those folders (lib/atlas/scenes.ts).
const files = ["public/assets/wow/character-book/intro/varok-home-background-v2.webp"];
const extensions = /\.(webp|jpe?g|png)$/i;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (extensions.test(entry.name)) yield full;
  }
}

const out = {};
const sources = [...dirs.flatMap((dir) => (fs.existsSync(path.join(root, dir)) ? [...walk(path.join(root, dir))] : [])), ...files.map((file) => path.join(root, file))];
{
  for (const file of sources) {
    const { width = 0 } = await sharp(file).metadata();
    if (width < 200) continue; // icons and thumbnails need no placeholder
    const buffer = await sharp(file).resize(16).webp({ quality: 40 }).toBuffer();
    out[`/${path.relative(path.join(root, "public"), file).split(path.sep).join("/")}`] = `data:image/webp;base64,${buffer.toString("base64")}`;
  }
}
const target = path.join(root, "lib/atlas/artPlaceholders.json");
fs.writeFileSync(target, `${JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 0)}\n`);
console.log(`art:placeholders — ${Object.keys(out).length} pictures, ${Math.round(fs.statSync(target).size / 1024)} KB`);
