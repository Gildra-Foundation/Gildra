import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const engine = process.env.ATLAS_BROWSER || "brave";
const baseURL = process.env.ATLAS_URL || "http://127.0.0.1:3118";
const output = path.resolve(process.env.ATLAS_OUTPUT_DIR || "work/atlas-qa");
const widths = (process.env.ATLAS_WIDTHS || "320,768,1440").split(",").map(Number);
const routes = (process.env.ATLAS_ROUTES || "/ru/wow/characters,/wow/characters,/ru/login,/login,/ru/wow,/wow,/ru/tier-lists,/tier-lists,/ru/database,/database,/ru/search,/ru/analytics,/ru/privacy,/ru/wow/delves,/ru/wow/classes,/ru/wow/gear,/ru/wow/midnight/season-2,/ru/wow/mythic-plus,/ru/wow/raids,/ru/wow/lairs,/ru/talents/fury-warrior,/ru/wow/rotation/fury-warrior").split(",");
fs.mkdirSync(output, { recursive: true });
const browser = engine === "webkit"
  ? await webkit.launch({ headless: true })
  : await chromium.launch({ headless: true, executablePath: process.env.BRAVE_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const report = { browser: engine, version: browser.version(), platform: process.platform, baseURL, checks: [], failures: [] };

async function navigate(page, route) {
  try { return await page.goto(`${baseURL}${route}`, { waitUntil: "load", timeout: 120000 }); }
  catch (error) {
    if (!String(error).includes("ERR_ABORTED")) throw error;
    return await page.goto(`${baseURL}${route}`, { waitUntil: "load", timeout: 120000 });
  }
}

async function checkPage(page, route, width) {
  const errors = [];
  const collect = (error) => errors.push(error.message);
  page.on("pageerror", collect);
  try {
    const response = await navigate(page, route);
    assert.equal(response.status(), 200, `${route}: HTTP status`);
    await page.locator("h1").first().waitFor({ state: "attached", timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every((image) => !image.complete || image.naturalWidth > 0 || image.offsetWidth === 0), undefined, { timeout: 15000 });
    const state = await page.evaluate(() => ({
      theme: document.querySelector(".workspace-content")?.getAttribute("data-atlas-theme"),
      background: getComputedStyle(document.querySelector(".workspace-content")).backgroundColor,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.querySelector("h1")?.textContent,
      h1Count: document.querySelectorAll("h1").length,
      physicalFrames: document.querySelectorAll("[data-character-book], [data-gildra-grimoire], [data-physical-book]").length,
    }));
    assert.equal(state.theme, "dark", `${route}: atlas scope`);
    assert.equal(state.background, "rgb(5, 6, 7)", `${route}: shared background`);
    assert(state.scrollWidth <= state.width + 1, `${route}: horizontal overflow ${state.scrollWidth}/${state.width}`);
    assert.equal(state.h1Count, 1, `${route}: one page title`);
    assert.equal(state.physicalFrames, 0, `${route}: atlas replaces internal book surfaces`);
    assert.deepEqual(errors, [], `${route}: JavaScript errors`);
    if (["/ru/wow/characters", "/ru/tier-lists", "/ru/wow", "/ru/database"].includes(route)) {
      await page.screenshot({ path: path.join(output, `${route.replaceAll("/", "_")}-${width}.png`), caret: "initial" });
    }
    report.checks.push({ route, width, ...state });
  } catch (error) {
    report.failures.push({ route, width, error: String(error), errors });
    await page.screenshot({ path: path.join(output, `failure-${route.replaceAll("/", "_")}-${width}.png`), caret: "initial" }).catch(() => {});
  } finally { page.off("pageerror", collect); }
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("gildra-consent", "declined"));
    if (engine === "brave") {
      const page = await context.newPage();
      await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 120000 });
      assert(await page.evaluate(() => navigator.brave?.isBrave()), "QA must use the actual Brave browser");
      await page.close();
    }
    for (const route of routes) {
      const page = await context.newPage();
      await checkPage(page, route, width);
      await page.close();
    }
    await context.close();
    console.log(JSON.stringify({ browser: engine, width, passed: report.checks.length, failed: report.failures.length }));
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}
if (report.failures.length) { console.error(JSON.stringify(report.failures)); process.exitCode = 1; }
