#!/usr/bin/env node
// Portrait crops of the frame's scene paintings for phones (AtlasFrameShell art
// direction). The frame's atmosphere is a full-width box up to 880 px tall, so on
// a portrait screen `object-fit: cover` shows only a narrow vertical strip of the
// landscape painting — the phone downloaded the whole painting at a 100vw width
// and magnified it about 2x. The crop keeps the full height and the strip around
// the scene's focus, at the painting's own resolution (a crop, no resampling).
//
// Geometry: with the crop's left edge at fx·(W − cw), the same object-position
// shows exactly the same part of the painting as before in every box whose
// aspect ratio is at most cw/H (0.9) — the frame's box under PORTRAIT_MEDIA
// (packages/atlas-ui/src/artSources.ts). Run after adding a scene:
//   npm run art:portraits
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
/** Crop width / painting height; must match PORTRAIT_RATIO in packages/atlas-ui/src/artSources.ts. */
const RATIO = 0.9;

// Scenes of lib/atlas/scenes.ts (art + object-position), read from the source.
const scenesSource = fs.readFileSync(path.join(root, "lib/atlas/scenes.ts"), "utf8");
const L = "/assets/wow/loading";
const entries = [...scenesSource.matchAll(/art:\s*(`[^`]+`|"[^"]+")\s*,\s*position:\s*"([^"]+)"/g)]
  .map(([, art, position]) => [art.slice(1, -1).replace("${L}", L), position]);
// Paintings that pages hand to the frame directly (`art` + `artPosition`).
const direct = [
  ["/assets/wow/loading/season-2-quel-danas-20261106.webp", "70% 40%"], // SeasonTwoHub
  // RaidOverview of the remaining Season 1 raids (The Dreamrift and March on Quel'Danas have pages of their own).
  ["/assets/wow/raids/midnight/backgrounds/the-voidspire-scene.webp", "center 30%"],
  ["/assets/wow/raids/hub/stylized/scenes/kithix-loading-screen.webp", "center 18%"], // KithixPage (frame default)
];

const focusX = (position) => {
  const x = position.split(/\s+/)[0];
  return x === "center" ? 0.5 : x === "left" ? 0 : x === "right" ? 1 : parseFloat(x) / 100;
};

const out = {};
for (const [art, position] of [...entries, ...direct]) {
  const fx = focusX(position);
  if (out[art]) {
    if (out[art].x !== fx) throw new Error(`${art}: two focus points (${out[art].x}, ${fx}) need two crops`);
    continue;
  }
  const file = path.join(root, "public", art);
  const { width: W, height: H } = await sharp(file).metadata();
  const cw = Math.ceil(H * RATIO);
  if (cw >= W * 0.8) continue; // nearly as narrow as the box already: nothing to gain
  const left = Math.round(fx * (W - cw));
  const target = art.replace(/\.(webp|jpe?g|png)$/i, "-portrait.webp");
  // The painting's own pixels, encoded visually lossless (PSNR > 41 dB against the
  // source); the page serves it through the image optimizer like the painting.
  await sharp(file).extract({ left, top: 0, width: cw, height: H })
    .webp({ quality: 90, effort: 6, smartSubsample: true })
    .toFile(path.join(root, "public", target));
  out[art] = { src: target, x: fx, width: cw, height: H };
  console.log(`${target}  ${cw}x${H} from ${W}x${H} at x=${left}  ${Math.round(fs.statSync(path.join(root, "public", target)).size / 1024)} KB`);
}
const manifest = path.join(root, "lib/atlas/artPortraits.json");
fs.writeFileSync(manifest, `${JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 1)}\n`);
console.log(`art:portraits — ${Object.keys(out).length} crops`);
