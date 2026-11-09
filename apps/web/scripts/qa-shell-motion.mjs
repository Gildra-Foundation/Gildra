#!/usr/bin/env node
/**
 * Frame sheets of the shell's motion: quick search, the EN → RU switch and a
 * switch between game versions. Real-time screenshots of a loaded machine
 * miss most frames, so each phase of a motion is stepped instead: as soon as
 * the phase starts, every animation of the document (CSS, WAAPI and the View
 * Transition's pseudo-elements) is paused and moved to 0, 60, 120 … ms, one
 * screenshot per step; then they are let go. A language switch has two
 * phases in two documents: the old page's dissolve (the next document is
 * held back meanwhile) and the new page's arrival.
 *
 *   node apps/web/scripts/qa-shell-motion.mjs --base http://127.0.0.1:3136 --out /tmp/shell2/after [--only search,search-390,locale-raids,locale-map,game] [--gpu] [--cpu 4]
 *
 * Also measures in real time, without stepping (CPU ×4 by default): time to
 * open the search, long tasks (> 50 ms) from the action on, layout shift and
 * console errors.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = arg("base", "http://127.0.0.1:3136").replace(/\/$/, "");
const out = arg("out", "/tmp/shell2/run");
const only = arg("only", "search,search-390,locale-raids,locale-map,game").split(",");
const cpu = Number(arg("cpu", "4"));
const step = Number(arg("step", "60"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: args.includes("--gpu") ? ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] : ["--disable-gpu"] });
const report = {};

async function newPage({ width, height, mobile }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: "en-GB" });
  await context.addInitScript(() => {
    try { localStorage.setItem("gildra-consent", "essential"); } catch {}
    // Headless Chrome composites in software, which the site treats as a weak device (no page
    // cross-fades, no blurred veil). The sheets show what a GPU device gets.
    try { sessionStorage.setItem("gildra-render-tier", "gpu"); } catch {}
    window.__longTasks = [];
    window.__shift = 0;
    try {
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) }); }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value; }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 240)); });
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 240)));
  return { context, page, errors };
}

async function open(page, path) {
  await page.goto(base + path, { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector("[data-route-ready]", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

/** Pauses the document's animations once `ready` holds, then screenshots them at each step. */
async function stepPhase(page, name, { ready, duration, width, height }) {
  // A navigation in between destroys the context the wait runs in: wait again in the new one.
  for (const until = Date.now() + 15000; Date.now() < until;) {
    try { await page.waitForFunction(ready, null, { timeout: Math.max(1, until - Date.now()), polling: 4 }); break; } catch (error) { if (page.isClosed()) throw error; console.error(name, "wait:", String(error).split("\n")[0].slice(0, 160)); await new Promise((resolve) => setTimeout(resolve, 20)); }
  }
  const count = await page.evaluate(() => {
    window.__phase = document.getAnimations();
    for (const animation of window.__phase) animation.pause();
    return window.__phase.length;
  }).catch(() => 0);
  const frames = [];
  for (let at = 0; at <= duration; at += step) {
    await page.evaluate((time) => {
      for (const animation of window.__phase ?? []) { try { animation.currentTime = time; } catch {} }
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, at).catch(() => {});
    const data = await page.screenshot({ type: "jpeg", quality: 70, clip: { x: 0, y: 0, width, height } }).catch(() => null);
    if (data) frames.push({ label: duration ? `${name} ${at} ms` : name, data });
  }
  await page.evaluate(() => { for (const animation of window.__phase ?? []) { try { animation.play(); } catch {} } }).catch(() => {});
  return { frames, animations: count };
}

async function sheet(file, frames, width, height) {
  if (!frames.length) return null;
  const columns = width > 800 ? 4 : 6;
  const tileWidth = width > 800 ? 480 : 260;
  const tileHeight = Math.round(tileWidth * height / width);
  const label = 22;
  const rows = Math.ceil(frames.length / columns);
  const tiles = await Promise.all(frames.map(async ({ label: text, data }, index) => {
    const image = await sharp(data).resize(tileWidth, tileHeight).toBuffer();
    const caption = Buffer.from(`<svg width="${tileWidth}" height="${label}"><rect width="100%" height="100%" fill="#111"/><text x="6" y="16" font-family="monospace" font-size="13" fill="#eee">${text}</text></svg>`);
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + label);
    return [{ input: caption, left, top }, { input: image, left, top: top + label }];
  }));
  await sharp({ create: { width: columns * tileWidth, height: rows * (tileHeight + label), channels: 3, background: "#000" } })
    .composite(tiles.flat()).jpeg({ quality: 80 }).toFile(file);
  return file;
}

/** Real-time run of the same action (CPU ×cpu): long tasks after it, layout shift, errors. */
async function measure(viewport, path, act, settle = 1500) {
  const { context, page, errors } = await newPage(viewport);
  await open(page, path);
  const session = await context.newCDPSession(page);
  if (cpu > 1) await session.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const startPath = await page.evaluate(() => location.pathname);
  const since = await page.evaluate(() => performance.now());
  const marks = (await act(page)) ?? {};
  await new Promise((resolve) => setTimeout(resolve, settle));
  const stats = await page.evaluate(({ from, path }) => ({
    // In a new document every long task counts (its whole life is after the action).
    longTasks: (window.__longTasks ?? []).filter((task) => location.pathname !== path || task.start >= from).map((task) => task.duration),
    shift: Number((window.__shift ?? 0).toFixed(4)),
    url: location.pathname,
    scrollY: Math.round(scrollY),
  }), { from: since, path: startPath }).catch(() => ({}));
  await context.close();
  return { ...marks, ...stats, errors };
}

async function scenario(name, { width = 1440, height = 900, mobile = false, start, act, phases, measureAct }) {
  const viewport = { width, height, mobile };
  const { context, page, errors } = await newPage(viewport);
  await open(page, start);
  const shots = [];
  const counts = [];
  const pending = act(page).catch((error) => console.error(name, "act:", String(error).slice(0, 200)));
  page.on("close", () => console.error(name, "page closed"));
  page.on("crash", () => console.error(name, "page crashed"));
  for (const phase of phases) {
    if (phase.before) await phase.before(page);
    const { frames, animations } = await stepPhase(page, phase.name, { ...phase, width, height });
    shots.push(...frames);
    counts.push(animations);
    if (phase.after) await phase.after(page);
  }
  await pending;
  await page.waitForTimeout(800);
  shots.push({ label: "at rest", data: await page.screenshot({ type: "jpeg", quality: 70 }) });
  const file = await sheet(join(out, `${name}.jpg`), shots, width, height);
  await context.close();
  const real = await measure(viewport, start, measureAct ?? act);
  report[name] = { sheet: file, frames: shots.length, animations: counts, real, steppedErrors: errors };
  console.log(name, JSON.stringify(report[name]));
}

const typed = (text, select = false) => async (page) => {
  if (select) await page.keyboard.press("Control+a");
  await page.keyboard.type(text, { delay: 30 });
  await page.waitForTimeout(500);
};

if (only.includes("search")) await scenario("search-1440-en", {
  start: "/wow/raids",
  act: async (page) => { await page.keyboard.press("Control+k"); },
  phases: [
    { name: "open", ready: () => !!document.querySelector("[role=dialog] input"), duration: 360 },
    { name: "typed «void»", before: typed("void"), ready: () => true, duration: 0 },
    { name: "typed «orgrimar» (typo)", before: typed("orgrimar", true), ready: () => true, duration: 0 },
    { name: "typed «lhe» (RU layout)", before: typed("lhe", true), ready: () => true, duration: 0 },
  ],
  measureAct: async (page) => {
    const started = Date.now();
    await page.keyboard.press("Control+k");
    await page.waitForSelector("[role=dialog] input", { timeout: 5000 });
    const openMs = Date.now() - started;
    await page.keyboard.type("voidspire", { delay: 120 });
    return { openMs };
  },
});

if (only.includes("search-390")) await scenario("search-390-ru", {
  width: 390, height: 844, mobile: true,
  start: "/ru/wow/raids",
  act: async (page) => { await page.click("header button[aria-haspopup=dialog]"); },
  phases: [
    { name: "open", ready: () => !!document.querySelector("[role=dialog] input"), duration: 360 },
    { name: "«друид»", before: typed("друид"), ready: () => true, duration: 0 },
    { name: "«оргр»", before: typed("оргр", true), ready: () => true, duration: 0 },
  ],
  measureAct: async (page) => {
    const started = Date.now();
    await page.click("header button[aria-haspopup=dialog]");
    await page.waitForSelector("[role=dialog] input", { timeout: 5000 });
    const openMs = Date.now() - started;
    await page.keyboard.type("друид", { delay: 120 });
    return { openMs };
  },
});

/**
 * EN → RU. Holding the next document back stalls the automation, so the old
 * page's dissolve is stepped under the same mark the switch sets on the click
 * (data-locale-leaving, checked for real in the measured run), then the switch
 * is pressed for real and the new document's arrival is stepped.
 */
const localeScenario = (name, path, scroll) => scenario(name, {
  start: path,
  act: async (page) => {
    if (scroll) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scroll); await page.waitForTimeout(600); }
  },
  phases: [
    { name: "leave", before: async (page) => { await page.waitForTimeout(scroll ? 900 : 0); await page.evaluate(() => { document.documentElement.dataset.localeLeaving = "ru"; }); }, ready: () => true, duration: 240,
      after: async (page) => {
        await page.evaluate(() => { delete document.documentElement.dataset.localeLeaving; });
        // A script click: no hover, so the speculative prefetch of the other language never starts.
        await page.evaluate(() => document.querySelector("[data-locale-switch-root] a[hreflang=ru]")?.click());
      } },
    { name: "arrive", ready: () => document.documentElement.hasAttribute("data-locale-arrival") && document.readyState !== "loading", duration: 600 },
  ],
  measureAct: async (page) => {
    if (scroll) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scroll); await page.waitForTimeout(600); }
    const before = await page.evaluate(() => scrollY);
    const started = Date.now();
    const leaving = await page.evaluate(() => {
      document.querySelector("[data-locale-switch-root] a[hreflang=ru]")?.click();
      return document.documentElement.dataset.localeLeaving ?? null;
    });
    await page.waitForURL(/\/ru(\/|$)/, { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelector("h1"), null, { timeout: 20000 }).catch(() => {});
    return { scrollBefore: Math.round(before), leavingMark: leaving, arrivedMs: Date.now() - started };
  },
});
if (only.includes("locale-raids")) await localeScenario("locale-raids-en-ru", "/wow/raids", 900);
if (only.includes("locale-map")) await localeScenario("locale-map-en-ru", "/wow/map", 0);

const strip = (version) => `nav[aria-label="World of Warcraft versions"] a[data-version=${version}]`;
if (only.includes("game")) await scenario("game-midnight-mists", {
  start: "/wow/classes",
  act: async (page) => { await page.click(strip("mists")); },
  phases: [
    { name: "turn", ready: () => document.getAnimations().some((animation) => animation.effect?.pseudoElement?.startsWith("::view-transition")), duration: 480 },
  ],
  measureAct: async (page) => { await page.click(strip("mists")); },
});

writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
