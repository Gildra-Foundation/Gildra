// Regression check for scripts/patch-next.mjs: abort the first (cold) /_next/image
// request early, then ask again; a stuck key answers nothing within 15 s.
//   node apps/web/scripts/image-abort-check.mjs http://127.0.0.1:3000   (clear .next/cache/images first)
import http from "node:http";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const images = ["/assets/wow/lairs/maps/luashal.jpg", "/assets/wow/loading/city.webp", "/assets/wow/mythic/backgrounds/nalorakk.webp", "/bg.jpg"];
const widths = [640, 750, 828, 1080, 1200, 1920, 2048];
const get = (path, abortAfter) => new Promise((resolve) => {
  const req = http.get(base + path, { headers: { Accept: "image/avif,image/webp,*/*" } }, (res) => {
    res.resume(); res.on("end", () => resolve(`${res.statusCode}`));
  });
  req.on("error", () => resolve("aborted"));
  if (abortAfter != null) setTimeout(() => { req.destroy(); resolve("aborted"); }, abortAfter);
  else req.setTimeout(15000, () => { req.destroy(); resolve("HANG"); });
});
let hangs = 0, n = 0;
for (const img of images) for (const w of widths) for (const q of [75]) {
  const path = `/_next/image?url=${encodeURIComponent(img)}&w=${w}&q=${q}`;
  const delay = 2 + Math.floor(Math.random() * 40);
  await get(path, delay);
  await new Promise((r) => setTimeout(r, 300));
  const t = Date.now(); const r = await get(path); n++;
  if (r === "HANG") hangs++;
  console.log(`${r.padEnd(6)} abort@${String(delay).padStart(2)}ms ${img} w=${w} ${Date.now() - t}ms`);
}
console.log(`hangs ${hangs}/${n}`);
if (hangs) process.exit(1);
