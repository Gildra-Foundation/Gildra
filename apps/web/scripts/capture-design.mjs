/**
 * Deterministic design screenshot matrix for Gildra.
 *
 * Usage:
 *   DESIGN_BASE_URL=http://127.0.0.1:3000 npm run design:capture
 *   npm run design:capture -- --out .artifacts/design/my-run
 *   npm run design:capture -- --deterministic        # reduced motion, stable pixels
 *   npm run design:capture -- --only home,home-ru    # subset of routes by name
 *   npm run design:capture -- --blocks               # every block from /dev/blocks
 *
 * Captures the primary landing (EN + RU), tier-list and database routes at
 * 1440×1000, 1280×900, 768×1024 and 390×844
 * (viewport + full-page). Next to every PNG pair a `<name>.json` records the
 * horizontal overflow (`scrollWidth - innerWidth`, must be 0 per design.md §I).
 * Does not start or stop any server. Exits non-zero when a page is unreachable
 * or the browser errors.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.DESIGN_BASE_URL || "http://127.0.0.1:3000";
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : undefined;
};

const OUT = value("--out") ?? ".artifacts/design";
const DETERMINISTIC = flag("--deterministic");
const ONLY = value("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const BLOCKS = flag("--blocks");

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/ru", name: "home-ru" },
  { path: "/tier-lists", name: "tier-lists" },
  { path: "/specs/frost-death-knight", name: "spec" },
  { path: "/ru/specs/frost-death-knight", name: "spec-ru" },
  { path: "/privacy", name: "privacy" },
  { path: "/ru/privacy", name: "privacy-ru" },
  { path: "/league-of-legends", name: "lol" },
  { path: "/ru/league-of-legends", name: "lol-ru" },
  { path: "/league-of-legends/content/items", name: "lol-items" },
  { path: "/ru/database?type=spell&category=classes%2Fmonk%2Fbrewmaster", name: "database" },
];

const VIEWPORTS = [
  { width: 1440, height: 1000, name: "desktop-1440" },
  { width: 1280, height: 900, name: "laptop-1280" },
  { width: 768, height: 1024, name: "tablet-768" },
  { width: 390, height: 844, name: "mobile-390" },
];

/** Block gallery routes come from the dev manifest (guarded outside dev). */
async function blockRoutes() {
  const res = await fetch(`${BASE}/dev/blocks/manifest`);
  if (!res.ok) throw new Error(`block manifest unavailable (HTTP ${res.status})`);
  const { blocks } = await res.json();
  return blocks.flatMap((type) => [
    { path: `/dev/blocks/${type}?lang=en`, name: `block-${type}` },
    { path: `/dev/blocks/${type}?lang=ru`, name: `block-${type}-ru` },
  ]);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let routes = BLOCKS ? await blockRoutes() : ROUTES;
  if (ONLY) routes = routes.filter((r) => ONLY.includes(r.name));
  if (routes.length === 0) throw new Error("no routes selected");

  const browser = await chromium.launch();
  let failures = 0;

  try {
    for (const route of routes) {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({
          viewport: { width: vp.width, height: vp.height },
          ...(DETERMINISTIC ? { reducedMotion: "reduce" } : {}),
        });
        const url = `${BASE}${route.path}`;
        try {
          if (DETERMINISTIC) {
            // The cookie notice slides in after mount; pre-consent keeps
            // the render identical between runs.
            await page.addInitScript(() => {
              try {
                localStorage.setItem("gildra-consent", "accepted");
              } catch {}
            });
          }
          const res = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });
          if (!res || !res.ok()) {
            throw new Error(`HTTP ${res ? res.status() : "no response"}`);
          }
          // fonts + image decode + short layout settle (reveal failsafe is 2.2s)
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(DETERMINISTIC ? 800 : 2500);

          const base = `${OUT}/${route.name}--${vp.name}`;
          await page.screenshot({ path: `${base}.png` });
          await page.screenshot({ path: `${base}--full.png`, fullPage: true });
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          await writeFile(
            `${base}.json`,
            JSON.stringify({ route: route.path, viewport: vp, overflow }, null, 2),
          );
          console.log(
            `ok  ${route.path} @ ${vp.width}x${vp.height}${overflow ? `  OVERFLOW ${overflow}px` : ""}`,
          );
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
