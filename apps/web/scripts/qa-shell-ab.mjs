#!/usr/bin/env node
/**
 * A/B of the shell against another build, interleaved run by run so both see
 * the same machine load:
 * - search: CPU ×4, time from Ctrl+K to the first frame with the dialog's
 *   field, the longest task of the opening (1.2 s) and of typing a word;
 * - locale: EN → RU from the middle of a page (no throttling), layout shift of
 *   the arriving document over 5 s and whether the reading position held.
 *
 *   node apps/web/scripts/qa-shell-ab.mjs --a http://172.18.0.4:3000 --b http://127.0.0.1:3136 [--runs 5] [--only search,locale] [--out /tmp/shell2/ab.json]
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const bases = { a: arg("a", "http://172.18.0.4:3000"), b: arg("b", "http://127.0.0.1:3136") };
const runs = Number(arg("runs", "5"));
const only = arg("only", "search,locale").split(",");
const out = arg("out", "/tmp/shell2/ab.json");
const browser = await chromium.launch({ args: ["--disable-gpu"] });
const median = (list) => { const sorted = [...list].sort((x, y) => x - y); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };
const results = { search: [], locale: [] };

async function context(width) {
  const mobile = width < 800;
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, locale: "en-GB" });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("gildra-consent", "essential"); } catch {}
    window.__lt = [];
    window.__shift = 0;
    try {
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__lt.push([entry.startTime, entry.duration]); }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value; }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  return ctx;
}

async function search(name, base) {
  const ctx = await context(1440);
  const page = await ctx.newPage();
  await page.goto(base + "/wow/raids", { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(5000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const t0 = await page.evaluate(() => {
    window.__open = new Promise((resolve) => {
      const start = performance.now();
      (function poll() {
        if (document.querySelector("[role=dialog] input") || performance.now() - start > 8000) requestAnimationFrame(() => resolve(Math.round(performance.now() - start)));
        else requestAnimationFrame(poll);
      })();
    });
    return performance.now();
  });
  await page.keyboard.press("Control+k");
  const open = await page.evaluate(() => window.__open);
  await page.waitForTimeout(1200);
  const t1 = await page.evaluate(() => performance.now());
  await page.keyboard.type("voidspire", { delay: 150 });
  await page.waitForTimeout(1000);
  const tasks = await page.evaluate(() => window.__lt);
  const longest = (from, to = Infinity) => Math.round(Math.max(0, ...tasks.filter(([at]) => at >= from && at < to).map(([, duration]) => duration)));
  const row = { name, openMs: open, openLongest: longest(t0, t1), typingLongest: longest(t1) };
  await ctx.close();
  return row;
}

const pages = [["/wow/raids", 900], ["/wow/map", 0], ["/library", 700], ["/wow/mythic-plus", 1200]];
async function locale(name, base, path, scroll, width) {
  const ctx = await context(width);
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(3000);
  const y = Math.round(scroll * (width < 800 ? 1.4 : 1));
  if (y) { await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y); await page.waitForTimeout(700); }
  const before = await page.evaluate(() => {
    const line = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const probe = document.elementFromPoint(innerWidth / 2, line + 40);
    const heading = probe?.closest("section, article, li, [id]")?.querySelector("h1, h2, h3");
    return { y: Math.round(scrollY), heading: heading?.textContent?.trim().slice(0, 40) ?? null };
  });
  const switched = await page.evaluate(() => { const link = document.querySelector("[data-locale-switch-root] a[hreflang=ru]"); link?.click(); return !!link; });
  await page.waitForURL(/\/ru(\/|$)/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const after = await page.evaluate(() => ({ y: Math.round(scrollY), shift: Number((window.__shift ?? 0).toFixed(4)), url: location.pathname }));
  await ctx.close();
  return { name, path, width, switched, yBefore: before.y, yAfter: after.y, cls: after.shift, url: after.url };
}

for (let run = 1; run <= runs; run += 1) {
  for (const [name, base] of Object.entries(bases)) {
    if (only.includes("search")) {
      const row = await search(name, base).catch((error) => ({ name, error: String(error).slice(0, 120) }));
      results.search.push({ run, ...row });
      console.log("search", JSON.stringify({ run, ...row }));
    }
  }
}
if (only.includes("locale")) {
  for (const [path, scroll] of pages) for (const width of [1440, 390]) for (const [name, base] of Object.entries(bases)) {
    const row = await locale(name, base, path, scroll, width).catch((error) => ({ name, path, width, error: String(error).slice(0, 120) }));
    results.locale.push(row);
    console.log("locale", JSON.stringify(row));
  }
}

const summary = {};
for (const name of Object.keys(bases)) {
  const rows = results.search.filter((row) => row.name === name && !row.error);
  summary[name] = { base: bases[name], openMs: median(rows.map((row) => row.openMs)), openLongest: median(rows.map((row) => row.openLongest)), typingLongest: median(rows.map((row) => row.typingLongest)), runs: rows.length };
}
console.log("summary", JSON.stringify(summary));
writeFileSync(out, JSON.stringify({ summary, ...results }, null, 2));
await browser.close();
