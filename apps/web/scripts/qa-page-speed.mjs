// Page-speed breakdown: per route, desktop (host network) and phone (Slow 4G, 4x CPU),
// cold (fresh context) and warm (same context, second visit) loads, plus client-side
// transitions. Usage: BASE_URL=https://gildra.net PERF_LABEL=before node scripts/qa-page-speed.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "https://gildra.net";
const label = process.env.PERF_LABEL || "baseline";
const runs = Number(process.env.PERF_RUNS || 2);
const only = process.env.PERF_ONLY ? new Set(process.env.PERF_ONLY.split(",")) : null;
const directory = path.resolve(import.meta.dirname, "../.artifacts/page-speed", label);
fs.mkdirSync(directory, { recursive: true });

const routes = [
  "/", "/ru", "/wow", "/ru/wow", "/wow/mythic-plus", "/wow/mythic-plus/midnight-season-2/murder-row",
  "/wow/raids", "/wow/raids/march-on-queldanas", "/tier-lists", "/ru/tier-lists", "/wow/characters",
  "/database", "/wow/articles",
].filter((route) => !only || only.has(route));
const transitions = [
  { from: "/wow", link: 'a[href="/wow/raids"]', to: "/wow/raids" },
  { from: "/wow", link: 'a[href="/wow/mythic-plus"]', to: "/wow/mythic-plus" },
  { from: "/wow/raids", link: 'a[href="/wow"]', to: "/wow" },
  { from: "/wow", link: 'a[href="/ru/wow"]', to: "/ru/wow" },
  { from: "/", link: 'a[href="/tier-lists"]', to: "/tier-lists" },
];
const profiles = [
  { id: "desktop", viewport: { width: 1440, height: 900 }, cpu: 1, network: null },
  // Chrome DevTools "Slow 4G" preset.
  { id: "phone", viewport: { width: 390, height: 844 }, cpu: 4, network: { latency: 150, down: 1.6e6 / 8, up: 750e3 / 8 }, mobile: true },
];

const probe = () => {
  if (window !== window.top) return;
  window.__perf = { long: [], lcp: 0, lcpEl: "", cls: 0 };
  for (const type of ["longtask", "largest-contentful-paint", "layout-shift"]) {
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (type === "longtask") window.__perf.long.push({ start: e.startTime, duration: e.duration });
          if (type === "largest-contentful-paint") {
            window.__perf.lcp = e.startTime;
            const el = e.element;
            window.__perf.lcpEl = el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}${e.url ? " " + e.url.split("/").pop().slice(0, 40) : ""}` : "";
          }
          if (type === "layout-shift" && !e.hadRecentInput) window.__perf.cls += e.value;
        }
      }).observe({ type, buffered: true });
    } catch {}
  }
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });

async function session(profile) {
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: !!profile.mobile, hasTouch: !!profile.mobile, reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    if (window !== window.top) return;
    try {
      localStorage.setItem("gildra-consent", "declined");
      localStorage.setItem("gildra-home-music", JSON.stringify({ confirmed: true, enabled: false, volume: 0 }));
    } catch {}
  });
  await context.addInitScript(probe);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  if (profile.network) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: profile.network.latency, downloadThroughput: profile.network.down, uploadThroughput: profile.network.up });
  }
  return { context, page };
}

const collect = (page) => page.evaluate(() => {
  const p = window.__perf, nav = performance.getEntriesByType("navigation")[0], paint = performance.getEntriesByType("paint");
  const bytes = { js: 0, css: 0, img: 0, font: 0, fetch: 0, total: 0 }, counts = { js: 0, css: 0, img: 0, font: 0, fetch: 0 };
  const after = [];
  for (const e of performance.getEntriesByType("resource")) {
    const size = e.transferSize || 0;
    bytes.total += size;
    const kind = /\.js(?:\?|$)/.test(e.name) ? "js" : /\.css(?:\?|$)/.test(e.name) ? "css" : /\.woff2?(?:\?|$)/.test(e.name) ? "font"
      : /\.(?:avif|webp|png|jpe?g|svg|gif)(?:\?|$)|\/_next\/image/.test(e.name) ? "img" : (e.initiatorType === "fetch" || e.initiatorType === "xmlhttprequest") ? "fetch" : null;
    if (kind) { bytes[kind] += size; counts[kind]++; }
    if (kind === "fetch") after.push({ url: e.name.replace(location.origin, "").slice(0, 90), start: Math.round(e.startTime), ms: Math.round(e.duration) });
  }
  const fcp = paint.find((e) => e.name === "first-contentful-paint")?.startTime || 0;
  const tbt = p.long.filter((t) => t.start >= fcp).reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
  return {
    dnsTls: Math.round(nav.connectEnd - nav.domainLookupStart), ttfb: Math.round(nav.responseStart), html: Math.round(nav.responseEnd),
    htmlBytes: nav.transferSize, fcp: Math.round(fcp), lcp: Math.round(p.lcp), lcpEl: p.lcpEl, dcl: Math.round(nav.domContentLoadedEventEnd),
    load: Math.round(nav.loadEventEnd), tbt: Math.round(tbt), longTasks: p.long.length, cls: +p.cls.toFixed(3),
    kb: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), counts, fetches: after.slice(0, 8),
  };
});

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const results = { base, label, at: new Date().toISOString(), loads: [], transitions: [] };

for (const profile of profiles) {
  for (const route of routes) {
    const cold = [], warm = [];
    for (let run = 0; run < runs; run++) {
      const { context, page } = await session(profile);
      try {
        await page.goto(base + route, { waitUntil: "load", timeout: 120000 });
        await page.waitForTimeout(2500);
        cold.push(await collect(page));
        await page.goto("about:blank");
        await page.goto(base + route, { waitUntil: "load", timeout: 120000 });
        await page.waitForTimeout(2000);
        warm.push(await collect(page));
      } catch (error) { console.error(profile.id, route, error.message); }
      await context.close();
    }
    for (const [mode, rows] of [["cold", cold], ["warm", warm]]) {
      if (!rows.length) continue;
      const pick = (key) => median(rows.map((row) => row[key]));
      const row = { profile: profile.id, route, mode, ttfb: pick("ttfb"), fcp: pick("fcp"), lcp: pick("lcp"), dcl: pick("dcl"), load: pick("load"), tbt: pick("tbt"), cls: pick("cls"), lcpEl: rows[0].lcpEl, kb: rows[0].kb, counts: rows[0].counts, htmlBytes: rows[0].htmlBytes, fetches: rows[0].fetches, dnsTls: pick("dnsTls") };
      results.loads.push(row);
      console.log(`${profile.id.padEnd(7)} ${mode} ${route.padEnd(48)} ttfb=${row.ttfb} fcp=${row.fcp} lcp=${row.lcp} load=${row.load} tbt=${row.tbt} cls=${row.cls} js=${row.kb.js}KB/${row.counts.js} css=${row.kb.css}KB/${row.counts.css} img=${row.kb.img}KB font=${row.kb.font}KB fetch=${row.counts.fetch} lcpEl=${row.lcpEl}`);
    }
  }
  if (process.env.PERF_TRANSITIONS === "off") continue;
  for (const transition of transitions) {
    const times = [];
    for (let run = 0; run < runs; run++) {
      const { context, page } = await session(profile);
      try {
        await page.goto(base + transition.from, { waitUntil: "load", timeout: 120000 });
        await page.waitForTimeout(3000);
        const link = page.locator(transition.link).first();
        await link.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        const before = await page.evaluate(() => document.querySelector("h1")?.textContent || "");
        const started = Date.now();
        await link.click({ noWaitAfter: true });
        await page.waitForFunction(({ to, before }) => location.pathname === to && (document.querySelector("h1")?.textContent || "") !== before && !!document.querySelector("h1"), { to: transition.to, before }, { timeout: 30000, polling: 16 });
        times.push(Date.now() - started);
      } catch (error) { console.error(profile.id, transition.from, "->", transition.to, error.message.split("\n")[0]); }
      await context.close();
    }
    if (!times.length) continue;
    const row = { profile: profile.id, from: transition.from, to: transition.to, ms: median(times), runs: times };
    results.transitions.push(row);
    console.log(`${profile.id.padEnd(7)} transition ${transition.from} -> ${transition.to}: ${row.ms} ms [${times.join(", ")}]`);
  }
}
await browser.close();
fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(results, null, 2));
console.log("written", path.join(directory, "results.json"));
