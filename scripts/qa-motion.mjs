#!/usr/bin/env node
// Motion budget and smoothness of the inner pages (roadmap items 45, 50).
// Budget, checked per page at 1440×900:
//   - at most 8 endless (ambient) animations running at once;
//   - every running animation moves only compositor properties (transform,
//     translate, scale, rotate, opacity, filter) — no layout or paint work;
//   - none at all under prefers-reduced-motion or the site's "less motion" switch.
// Smoothness: scroll each page top to bottom with the CPU slowed 4× and add up
// the main-thread long tasks (> 50 ms) — at most 300 ms blocked, none over 150 ms.
// (Frame pacing itself is not measurable in headless Chrome on a busy host.)
//   npm run qa:motion [-- --base https://gildra.net --routes /ru/wow,/wow/raids]
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1]]);
  return pairs;
}, []));
const base = args.base ?? "http://127.0.0.1:3100";
const routes = (args.routes ?? "/ru/wow,/wow/raids,/ru/wow/raids/the-voidspire,/ru/wow/lairs,/wow/classes,/ru/wow/mythic-plus,/ru/database,/tier-lists").split(",");
const COMPOSITOR = new Set(["transform", "translate", "scale", "rotate", "opacity", "filter", "offset", "computedOffset", "easing", "composite"]);
const MAX_AMBIENT = 8;
const MAX_BLOCKED = 300;
const MAX_TASK = 150;

const browser = await chromium.launch();
const failures = [];
const rows = [];

async function open(context, route) {
  const page = await context.newPage();
  await context.addInitScript(() => { try { localStorage.setItem("gildra-consent", "declined"); } catch {} });
  await page.goto(base + route, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(2500); // arrival settle and art drift begin
  return page;
}

const census = () => document.getAnimations().filter((a) => a.playState === "running").map((a) => {
  const effect = a.effect;
  const timing = effect?.getTiming?.() ?? {};
  const props = new Set();
  for (const frame of effect?.getKeyframes?.() ?? []) for (const key of Object.keys(frame)) props.add(key);
  return { name: a.animationName ?? a.constructor.name, endless: timing.iterations === Infinity, props: [...props], scroll: a.timeline && !(a.timeline instanceof DocumentTimeline) };
});

for (const route of routes) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await open(context, route);
  const running = await page.evaluate(census);
  const ambient = running.filter((a) => a.endless && !a.scroll);
  const heavy = running.filter((a) => a.props.some((prop) => !COMPOSITOR.has(prop))).map((a) => `${a.name}(${a.props.filter((p) => !COMPOSITOR.has(p)).join(",")})`);

  // Smoothness: slow CPU, scroll down in steps, collect frame intervals.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const tasks = await page.evaluate(async () => {
    const found = [];
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) found.push(entry.duration); });
    observer.observe({ type: "longtask" });
    const height = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y <= height; y += Math.max(120, height / 40)) { window.scrollTo(0, y); await new Promise((resolve) => setTimeout(resolve, 60)); }
    await new Promise((resolve) => setTimeout(resolve, 400));
    observer.disconnect();
    return found;
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const blocked = tasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0);
  const longest = Math.max(0, ...tasks);
  await context.close();

  // Stillness: system reduced motion, then the site's switch.
  const still = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const reduced = (await (await open(still, route)).evaluate(census)).filter((a) => !a.scroll);
  await still.close();
  const switched = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await switched.addInitScript(() => { try { localStorage.setItem("gildra-motion", "reduced"); } catch {} });
  const lessMotion = (await (await open(switched, route)).evaluate(census)).filter((a) => !a.scroll);
  await switched.close();

  rows.push(`${route.padEnd(36)} ambient ${String(ambient.length).padStart(2)}  heavy ${heavy.length}  blocked ${String(Math.round(blocked)).padStart(4)} ms (longest ${Math.round(longest)})  still ${reduced.length}/${lessMotion.length}`);
  if (ambient.length > MAX_AMBIENT) failures.push(`${route}: ${ambient.length} endless animations (budget ${MAX_AMBIENT})`);
  if (heavy.length) failures.push(`${route}: non-compositor animation ${heavy.slice(0, 4).join(" ")}`);
  if (blocked > MAX_BLOCKED || longest > MAX_TASK) failures.push(`${route}: ${Math.round(blocked)} ms blocked, longest task ${Math.round(longest)} ms while scrolling at 4× CPU`);
  if (reduced.length) failures.push(`${route}: ${reduced.length} animation(s) under prefers-reduced-motion: ${reduced.slice(0, 3).map((a) => a.name).join(", ")}`);
  if (lessMotion.length) failures.push(`${route}: ${lessMotion.length} animation(s) with "less motion" on: ${lessMotion.slice(0, 3).map((a) => a.name).join(", ")}`);
}
await browser.close();
console.log(rows.join("\n"));
console.log(failures.length ? `\n${failures.join("\n")}\n\nqa:motion — ${failures.length} problem(s)` : "\nqa:motion — within the motion budget, smooth at 4× CPU, still when asked");
process.exit(failures.length ? 1 : 0);
