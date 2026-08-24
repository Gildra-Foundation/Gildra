/**
 * Deterministic design screenshot matrix for Gildra.
 *
 * Usage:
 *   DESIGN_BASE_URL=http://127.0.0.1:3000 npm run design:capture
 *   npm run design:capture -- --out .artifacts/design/my-run
 *
 * Captures the primary landing, tier-list and database routes at
 * 1440×1000, 1280×900, 768×1024 and 390×844
 * (viewport + full-page). Does not start or stop any server. Exits non-zero
 * when a page is unreachable or the browser errors.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.DESIGN_BASE_URL || "http://127.0.0.1:3000";
const outFlag = process.argv.indexOf("--out");
const OUT =
  outFlag !== -1 && process.argv[outFlag + 1]
    ? process.argv[outFlag + 1]
    : ".artifacts/design";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/tier-lists", name: "tier-lists" },
  { path: "/ru/database?type=spell&category=classes%2Fmonk%2Fbrewmaster", name: "database" },
];

const VIEWPORTS = [
  { width: 1440, height: 1000, name: "desktop-1440" },
  { width: 1280, height: 900, name: "laptop-1280" },
  { width: 768, height: 1024, name: "tablet-768" },
  { width: 390, height: 844, name: "mobile-390" },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;

  try {
    for (const route of ROUTES) {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({
          viewport: { width: vp.width, height: vp.height },
        });
        const url = `${BASE}${route.path}`;
        try {
          const res = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });
          if (!res || !res.ok()) {
            throw new Error(`HTTP ${res ? res.status() : "no response"}`);
          }
          // fonts + image decode + short layout settle (reveal failsafe is 2.2s)
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(2500);

          const base = `${OUT}/${route.name}--${vp.name}`;
          await page.screenshot({ path: `${base}.png` });
          await page.screenshot({ path: `${base}--full.png`, fullPage: true });
          console.log(`ok  ${route.path} @ ${vp.width}x${vp.height}`);
        } catch (err) {
          failures++;
          console.error(
            `FAIL ${url} @ ${vp.width}x${vp.height}: ${err.message}`,
          );
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    console.error(`${failures} capture(s) failed`);
    process.exit(1);
  }
  console.log(`done → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
