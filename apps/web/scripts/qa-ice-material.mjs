import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:5187";
const output = path.resolve(import.meta.dirname, "../.artifacts/site-theme");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of [390, 1440, 2560]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "no-preference" });
    await context.addInitScript(() => {
      localStorage.setItem("gildra-home-music", JSON.stringify({ enabled:false, confirmed:true, volume:0 }));
      window.__iceUrls = new Set();
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); window.__iceUrls.add(url); return url; };
      URL.revokeObjectURL = url => { window.__iceUrls.delete(url); revoke(url); };
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install({ time:new Date("2026-10-17T10:00:00Z") });
    await page.goto(base + "/");
    await page.getByRole("button", { name:/Choose theme:|Выбрать тему:/ }).waitFor();
    await page.locator("[data-book-route-frame][data-view-transitions]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.clock.pauseAt(new Date("2026-10-17T12:00:00Z"));
    const navigate = () => page.evaluate(() => { const a = document.createElement("a"); a.href = "/privacy"; document.body.append(a); a.click(); });
    const material = () => page.evaluate(() => {
      const host = document.querySelector("[data-themed-transition]");
      const canvas = host.querySelector("canvas");
      if (!canvas) return { phase:host.dataset.phase };
      const ctx = canvas.getContext("2d"), data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let covered = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 25) covered++;
      const alpha = (x, y) => ctx.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1).data[3];
      return { phase:host.dataset.phase, covered:covered / (data.length / 4), edge:alpha(.02,.5), centre:alpha(.5,.5) };
    });
    await navigate();
    await page.clock.runFor(200);
    const early = await material();
    assert.equal(early.phase, "freezing");
    assert.ok(early.edge > early.centre);
    await page.screenshot({ path:path.join(output, `ice-${width}-early.png`) });
    await page.clock.runFor(400);
    const late = await material();
    assert.equal(late.phase, "freezing");
    assert.ok(late.covered > early.covered + .2, "the frost front must advance across the page");
    await page.screenshot({ path:path.join(output, `ice-${width}-late.png`) });
    await page.clock.runFor(260);
    assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), "cracking");
    const skin = await page.locator("[data-ice-shard]").first().evaluate(el => getComputedStyle(el, "::after").backgroundImage);
    assert.match(skin, /blob:/);
    // Decode the actual material, including on a wide screen where data URLs
    // previously exceeded the CSS variable limit and silently disappeared.
    await page.evaluate(async skin => { const img = new Image(); img.src = skin.slice(5, -2); await img.decode(); }, skin);
    await page.screenshot({ path:path.join(output, `ice-${width}-cracks.png`) });
    await page.clock.runFor(500);
    // RSC may still be completing beneath the frozen sheet; keep fake clocks
    // moving while its real network request finishes.
    for (let count = 0; count < 30 && await page.locator("[data-themed-transition]").getAttribute("data-phase") !== "shattering"; count++) await page.clock.runFor(50);
    assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), "shattering");
    await page.evaluate(() => document.querySelector("[data-themed-transition]").getAnimations({ subtree:true }).forEach(animation => { animation.pause(); animation.currentTime = 330; }));
    await page.screenshot({ path:path.join(output, `ice-${width}-shatter.png`) });
    await page.clock.runFor(1000);
    assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), null);
    assert.equal(await page.evaluate(() => window.__iceUrls.size), 0, "release must revoke every texture URL");
    // Cancellation during frost also stops its RAF and disposes the surface.
    await page.evaluate(() => { const a = document.createElement("a"); a.href = "/login"; document.body.append(a); a.click(); });
    await page.clock.runFor(200);
    await page.keyboard.press("Escape");
    await page.clock.runFor(1800);
    assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"), null);
    assert.equal(await page.evaluate(() => window.__iceUrls.size), 0);
    assert.deepEqual(errors, []);
    results.push({ width, early, late, errors });
    console.log(`Ice material passed: ${width}px, edge growth, advancing coverage, texture decode, release/cancel cleanup.`);
    await context.close();
  }
  fs.writeFileSync(path.join(output, "ice-material.json"), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
