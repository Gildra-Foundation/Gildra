/**
 * Генерирует статичную OG-карточку 1200×630 → app/opengraph-image.png.
 * Рендерит HTML в headless chromium (Playwright), шрифты — Google Fonts.
 * Запуск: node scripts/generate-og.mjs (нужен npx playwright install chromium).
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const helmet =
  "data:image/png;base64," +
  readFileSync(path.join(root, "public/brand/helmet.png")).toString("base64");
const out = path.join(root, "app/opengraph-image.png");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;position:relative;
    background:#0b0d13;font-family:Inter,sans-serif;color:#e9ecf3}
  body::before{content:"";position:absolute;inset:0;
    background:
      radial-gradient(760px 520px at 26% 42%,rgba(201,162,79,.10),transparent 68%),
      radial-gradient(900px 600px at 78% 20%,#131722,transparent 70%)}
  .edge{position:absolute;left:0;right:0;height:1px;
    background:linear-gradient(90deg,transparent,rgba(201,162,79,.55),transparent)}
  .edge.top{top:34px}.edge.bot{bottom:34px}
  .helm{position:absolute;left:96px;top:50%;transform:translateY(-50%);
    width:400px;height:auto;filter:drop-shadow(0 26px 60px rgba(0,0,0,.6))}
  .tx{position:absolute;left:560px;top:50%;transform:translateY(-50%);width:560px}
  .brand{font-family:"Chakra Petch";font-weight:700;font-size:84px;
    letter-spacing:.16em;color:#eef0f8;line-height:1}
  .rule{display:flex;align-items:center;gap:14px;margin:30px 0}
  .rule i{flex:1;height:1px;background:linear-gradient(90deg,#8a733c,transparent)}
  .rule s{width:9px;height:9px;background:#c9a24f;transform:rotate(45deg)}
  .tag{font-size:27px;font-weight:500;color:#98a2b6;line-height:1.5}
  .season{margin-top:34px;font-family:"Chakra Petch";font-weight:600;
    font-size:21px;letter-spacing:.24em;color:#e6c77a}
</style></head><body>
  <div class="edge top"></div><div class="edge bot"></div>
  <img class="helm" src="${helmet}">
  <div class="tx">
    <div class="brand">GILDRA</div>
    <div class="rule"><s></s><i></i></div>
    <div class="tag">Tier lists, Mythic+ meta, builds and guides for World of Warcraft</div>
    <div class="season">MIDNIGHT &middot; SEASON 1</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log("og image →", out);
