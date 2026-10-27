import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

const base = process.env.BASE_URL || "http://127.0.0.1:5187";
const fixture = process.env.FIXTURE === "1";
const verifyShards = process.env.VERIFY_PAGE_SHARDS === "1";
const output = path.resolve(import.meta.dirname, "../.artifacts/frost-characters");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
const results = [];

async function localRoster(context) {
  // Exercise the real Auth.js/roster route without real account credentials,
  // Blizzard requests, data writes, or a production authentication bypass.
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base), "fixture sessions are local-only");
  assert.ok(process.env.FROST_QA_SECRET, "FROST_QA_SECRET is required for the isolated fixture");
  const value = await encode({ token: { name: "QA ONLY roster", battleNetAccessToken: "fixture-only", battleNetExpiresAt: Math.floor(Date.now() / 1000) + 3600 }, secret: process.env.FROST_QA_SECRET, salt: "authjs.session-token" });
  await context.addCookies([{ name: "authjs.session-token", value, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const characters = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, accountId: 123, region: "eu", name: "QA ONLY " + String(i).padStart(3, "0"), level: 90, realm: { id: 1, name: "QA realm", slug: "qa" }, playableClass: { id: 1, name: "Warrior" }, playableRace: { id: 1, name: "Human" }, faction: { type: "ALLIANCE", name: "Alliance" }, armoryUrl: "https://example.invalid/qa" }));
  await context.route("**/api/wow/characters/roster?**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ regions: [{ region: "eu", status: 200, characters }] }) }));
}

try {
  for (const locale of ["ru", "en"]) for (const width of [1440, 390]) for (const scroll of [0, 3000]) {
    const home = locale === "ru" ? "/ru" : "/", prefix = locale === "ru" ? "/ru" : "";
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "no-preference" });
    if (fixture) await localRoster(context);
    await context.addInitScript(() => {
    if (window !== window.top) return;
      localStorage.setItem("gildra-consent", "declined");
      localStorage.setItem("gildra-home-music", JSON.stringify({ confirmed: true, enabled: false, volume: 0 }));
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + prefix + "/wow/characters", { waitUntil: "load" });
    await page.locator("[data-book-route-frame][data-route-ready]").waitFor();
    if (fixture) await page.locator("[data-roster-view=roster] li").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (verifyShards) await page.evaluate(() => {
      const send = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message, ...rest) {
        if (message?.type === "play") message = { ...message, phases: message.phases.map(phase => phase.phase === "shattering" ? { ...phase, duration: 5000 } : phase) };
        if (message?.type === "frame" && message.phase === "shattering") message = { ...message, progress: Math.min(.35, message.progress) };
        return send.call(this, message, ...rest);
      };
    });
    await page.waitForTimeout(700);
    await page.evaluate(y => window.scrollTo(0, y), scroll);
    const label = `${locale}-${width}-${scroll}`;
    await page.screenshot({ path: path.join(output, `${label}-before.png`) });
    // Keep the inert DOM around after the real route commits, including on a
    // slow machine. Only the QA cleanup timeout changes; rendering runs normally.
    await page.evaluate(() => {
      const schedule = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => schedule(callback, delay === 920 ? 8000 : delay, ...args);
    });
    const initial = await page.evaluate(home => {
      const elements = [...document.querySelector("[data-book-route-frame]").querySelectorAll("h1,h2,h3,p,a,button,input,select,img,section,li")].filter(el => {
        const r = el.getBoundingClientRect(); return r.width && r.height && r.bottom > 0 && r.top < innerHeight;
      });
      const before = elements.map((el, i) => {
        el.dataset.qaGeometry = String(i);
        const r = el.getBoundingClientRect();
        return { i, tag: el.tagName, x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const anchor = document.querySelector(`header a[href="${home}"]`);
      if (!anchor) throw Error("Missing Gildra home choice");
      const start = performance.now(); anchor.click();
      return { before, clickMs: performance.now() - start, nodes: document.querySelector("[data-transition-snapshot]")?.querySelectorAll("*").length };
    }, home);
    assert.equal(await page.locator("[data-transition-snapshot]").count(), 1);
    assert.equal(await page.locator("[data-ice-surface]").count(), 1);
    assert.ok(initial.nodes < 700, "outgoing roster must keep a bounded viewport copy");
    await page.waitForURL(base + home);
    await page.waitForTimeout(350);
    const comparison = await page.evaluate(before => {
      const snapshot = document.querySelector("[data-transition-snapshot]");
      return before.map(b => {
        const el = snapshot?.querySelector(`[data-qa-geometry="${b.i}"]`);
        if (!el) return { i: b.i, missing: true };
        const r = el.getBoundingClientRect();
        return { i: b.i, delta: Math.max(Math.abs(r.x - b.x), Math.abs(r.y - b.y), Math.abs(r.width - b.w), Math.abs(r.height - b.h)) };
      });
    }, initial.before);
    await page.screenshot({ path: path.join(output, `${label}-frozen.png`) });
    const failures = comparison.filter(v => v.missing || v.delta > 3);
    const row = { locale, width, scroll, fixture, clickMs: initial.clickMs, nodes: initial.nodes, maxDelta: Math.max(0, ...comparison.map(v => v.delta || 0)), failures, errors };
    if (verifyShards) {
      await page.waitForFunction(() => document.querySelector('[data-ice-surface][data-page-content="ready"][data-render-phase="shattering"]'), null, { timeout: 10000 });
      row.raster = await page.locator('[data-transition-snapshot]').evaluate(el => ({ ...el.dataset, visibility: getComputedStyle(el).visibility }));
      assert.equal(row.raster.visibility, "hidden", "the worker bitmap must carry content after the DOM is hidden");
      assert.equal(row.raster.pageRaster, "ready");
      await page.screenshot({ path: path.join(output, `${label}-content-shards.png`) });
    }
    results.push(row);
    console.log(JSON.stringify(row));
    await context.close();
  }
  assert.ok(results.every(row => !row.failures.length && !row.errors.length), "outgoing character-list snapshot must preserve visible geometry after home mounts");
} finally {
  fs.writeFileSync(path.join(output, fixture ? "character-home-fixture.json" : "character-home-entry.json"), JSON.stringify({ base, fixture, results, passed: results.length === 8 && results.every(row => !row.failures.length && !row.errors.length) }, null, 2));
  await browser.close();
}
