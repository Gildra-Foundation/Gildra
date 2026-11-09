#!/usr/bin/env node
// World map zoom check: wheels a mouse in and out along chains of maps (world → continent → zone → city) the
// way a reader does — notches of 100 px every ~110 ms, the cursor on the next place of the chain — and checks
// every frame drawn on the way:
//   - no ancestor of the map in view shows its picture (with its painted words): only its calm wash;
//   - no empty void around the map in view (the canvas is see-through over the free part of the view);
//   - no hover name while the view moves;
//   - the map in view the page tells (title, crumbs) only changes once the camera rests, only along the chain,
//     never back and forth;
//   - frame intervals while moving (p95, max) and long tasks.
//   npm run qa:map-zoom                                  local :3100, current era + vanilla
//   npm run qa:map-zoom -- --base http://127.0.0.1:3131 --only kalimdor --cpu 4 --shots /tmp/mapz/zoom
//   … --only interactions: keys, double click, buttons, era switch mid-zoom, Back mid-flight, resize, phone pinch
//   … --notches 100,300: one wheel event at a time, the view left to rest, the settled state checked (title = map in
//     view and dominant, no painted words or markers of other maps), both ways on every chain
//   … --pin: the map stays pinned like the game's own map: drags of 2000 px each way and a fling leave the map in view
//     covering what it covered (≥ 90%), inside its bounds within 400 ms of the release, never more than the rubber
//     band's reach past its edge while dragged; a spam of zoom-out notches never goes below the whole top map
//   … --deep: down each chain and on to the deepest zoom (Orgrimmar, Stormwind, Azsuna over their continents' terrain;
//     Nagrand of Outland, which has none, to its cap): the deepest zoom reached, nothing magnified past twice the
//     terrain's own texel density (1.6× a painted map's), no tiles missing after it settles, names not overlapping,
//     the title = the map in view, the zoom-in button spent, one more notch only bounces (rubber band)
// Exits 1 when a chain fails.
import fs from "node:fs";
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : "1"]);
  return pairs;
}, []));
const base = args.base ?? "http://127.0.0.1:3100";
const cpu = Number(args.cpu ?? 1);
const maxVoid = Number(args["max-void"] ?? 0.04);
// Frame interval p95 while moving (ms). Headless SwiftShader on a loaded host is slow: the default only catches
// regressions there (live map6b/mapov7 measured 1270–1880 ms on the same host); on a real GPU pass --max-frame 34.
const maxFrame = Number(args["max-frame"] ?? 1000);
const shots = args.shots ?? null;
const data = JSON.parse(fs.readFileSync(new URL("../data/wow/map/maps.json", import.meta.url), "utf8"));
const maps = Array.isArray(data) ? data : data.maps;
const byId = new Map(maps.map((map) => [map.id, map]));
const page = (id) => `/ru/wow/map/${id}-${byId.get(id)?.slug ?? ""}`;

// Chains: the page to start on, then the places to wheel into, one after another.
const CHAINS = [
  { key: "broken-isles", era: null, chain: [947, 619, 630] },
  { key: "kalimdor", era: null, chain: [12, 1, 85] },
  { key: "eastern-kingdoms", era: null, chain: [13, 37, 84] },
  { key: "kalimdor-vanilla", era: "vanilla", chain: [12, 1, 85] },
  { key: "eastern-kingdoms-vanilla", era: "vanilla", chain: [13, 37, 84] },
];
let chains = CHAINS;
if (args.only) chains = chains.filter((c) => args.only.split(",").some((key) => c.key === key || c.key.startsWith(`${key}`)));
//   (--only interactions runs only the interactions; --only kalimdor only that chain.)

/** Runs in the page: a recorder of every frame (after the engine's own frame callback). */
function install() {
  const e = window.__worldMap;
  const rec = { frames: [], long: [], told: [], focusTold: [], voids: [], phase: "in", stop: false };
  window.__zoomRec = rec;
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) rec.long.push(entry.duration); }).observe({ type: "longtask", buffered: false });
  const title = () => document.querySelector("#world-map-title")?.textContent?.trim() ?? "";
  let lastTitle = title();
  const probe = document.createElement("canvas");
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  let last = performance.now();
  let prev = null;
  const frame = (t) => {
    if (rec.stop) return;
    try { record(t); } catch (error) { rec.errors = (rec.errors ?? 0) + 1; rec.lastError = String(error); }
    requestAnimationFrame(frame);
  };
  const record = (t) => {
    const comp = e.composition?.();
    // Moving: the camera changed since the last frame (or a move is under way).
    const v = e.view;
    const moving = Boolean(e.flight || e.velocity || e.wheel || e.pointers?.size) || (prev !== null && (v.scale !== prev.scale || v.x !== prev.x || v.y !== prev.y));
    prev = { ...v };
    // A name shown on screen (its own rule and the stage's, as computed).
    const pill = [...document.querySelectorAll("div[data-shown]")].some((el) => /hoverName/.test(el.className) && Number(getComputedStyle(el).opacity) > 0.05);
    const ancestors = comp ? comp.draws.filter((d) => d.role === "ancestor" && d.alpha > 0.05 && d.detail > 0.05).map((d) => `${d.id}:${d.detail.toFixed(2)}`) : [];
    const focus = comp?.focus ?? null;
    const held = comp?.draws.find((d) => d.role === "focus");
    const art = held ? e.maps.get(held.id)?.art : null;
    const upscale = held && art ? (held.screen[2] - held.screen[0]) / art.width : 0;
    const empty = sampled;
    sampled = 0;
    const now = title();
    if (now !== lastTitle) { rec.told.push({ t, title: now, moving, focus }); lastTitle = now; }
    const ground = comp?.ground?.some((g) => g.alpha > 0.9) ?? false;
    rec.frames.push({ t, phase: rec.phase, dt: t - last, moving, pill, ancestors, focus, empty, scale: Math.round(v.scale), cx: Number(v.x.toFixed(5)), cy: Number(v.y.toFixed(5)), wheel: e.wheel ? Number(e.wheel.log.toFixed(3)) : 0, why: e.focusWhy, upscale: ground ? 0 : Number(upscale.toFixed(2)), fade: Boolean(e.crossfade) });
    last = t;
  };
  // The canvas, read inside the engine's own frame right after it drew (the buffer is handed over after that).
  let sampled = 0;
  let calls = 0;
  const events = e.events;
  // The page hears of the map in view: was the camera at rest then?
  const tell = events.focus;
  // (Told during a slow glide is fine once the map in view has stayed the same a moment: a "flicker" is a tell
  // of a map that has only just come — through every level on the way.)
  events.focus = (chain) => { rec.focusTold.push({ id: chain.at(-1)?.id ?? null, moving: Boolean(e.moving) && performance.now() - (e.focusSince ?? 0) < 400 }); tell(chain); };
  const original = events.frame;
  events.frame = (info) => {
    original(info);
    calls += 1;
    if (calls % 2 || !ctx) return;
    const c = e.canvas;
    const w = 160, h = Math.max(1, Math.round((160 * c.height) / c.width));
    probe.width = w; probe.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(c, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const ins = e.options.insets, W = e.width, H = e.height;
    // Only inside the top map of the one in view (past the edge of the world the page shows through, as it should).
    // (A world opened from the Cosmic map lies in the dark of space on purpose: the top is the world.)
    let root = info.focus;
    while (root && root.parent !== null && e.maps.get(root.parent) && e.maps.get(root.parent).type !== "cosmic") root = e.maps.get(root.parent);
    const [rx0, ry0] = e.project(root.frame[0], root.frame[1]), [rx1, ry1] = e.project(root.frame[2], root.frame[3]);
    // Inside its own soft edge (a world under the Cosmic map fades out at its rim, as it should).
    const rim = root.depth > 0 ? Math.min(rx1 - rx0, ry1 - ry0) * 0.12 : 0;
    const x0 = Math.floor((Math.max(ins.left, rx0 + rim) / W) * w), x1 = Math.ceil((Math.min(W - ins.right, rx1 - rim) / W) * w);
    const y0 = Math.floor((Math.max(ins.top, ry0 + rim) / H) * h), y1 = Math.ceil((Math.min(H - ins.bottom, ry1 - rim) / H) * h);
    let total = 0, holes = 0;
    // (Its frame's corner pieces fade out on purpose: the corners are not counted.)
    const cr = Math.min(x1 - x0, y1 - y0) * 0.22;
    const corner = (x, y) => (x - x0 < cr || x1 - x < cr) && (y - y0 < cr || y1 - y < cr);
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) { if (root.depth > 0 && corner(x, y)) continue; total += 1; if (px[(y * w + x) * 4 + 3] < 96) holes += 1; }
    const value = total ? holes / total : 0;
    sampled = Math.max(sampled, value);
    // The first few empty frames as pictures, to look at.
    if (value > window.__zoomMaxVoid && rec.voids.length < 4) rec.voids.push({ value, focus: info.focus.id, url: probe.toDataURL("image/png") });
  };
  requestAnimationFrame(frame);
}

async function ready(pg) {
  await pg.waitForFunction(() => { const e = window.__worldMap; return e && e.lastInfo && e.tiles.loadedCount > 4 && e.tiles.pending === 0 && !e.pending && !e.fromSet; }, null, { timeout: 180000, polling: 300 });
  await pg.waitForTimeout(800);
}

/**
 * The place to zoom into off the free part of the view (its middle past an edge, as zooming at the cursor
 * pushes away what lies beyond the cursor): dragged into view first, as a reader would.
 */
async function bringIntoView(pg, id, surface) {
  const where = await pg.evaluate((id) => {
    const e = window.__worldMap; const map = e.maps.get(id); const s = e.options.insets;
    if (!map) return null;
    const [x, y] = e.project(...(e.areaPoint?.(id) ?? [(map.frame[0] + map.frame[2]) / 2, (map.frame[1] + map.frame[3]) / 2]));
    const fx = s.left + (e.width - s.left - s.right) / 2, fy = s.top + (e.height - s.top - s.bottom) / 2;
    const inside = x > s.left + 60 && x < e.width - s.right - 60 && y > s.top + 60 && y < e.height - s.bottom - 60;
    return inside ? null : { dx: fx - x, dy: fy - y, fx, fy };
  }, id);
  if (!where) return;
  const steps = Math.ceil(Math.hypot(where.dx, where.dy) / 300);
  for (let k = 0; k < steps; k++) {
    const sx = surface[0] + where.fx, sy = surface[1] + where.fy;
    await pg.mouse.move(sx, sy);
    await pg.mouse.down();
    await pg.mouse.move(sx + where.dx / steps, sy + where.dy / steps, { steps: 6 });
    await pg.mouse.up();
    await pg.waitForTimeout(250);
  }
  await pg.waitForFunction(() => { const e = window.__worldMap; return !e.velocity && !e.flight; }, null, { timeout: 8000, polling: 100 }).catch(() => {});
}

/**
 * Screen point on a map's own land (its mask's deepest point; its rectangle's middle on builds without areas):
 * where a reader puts the cursor to zoom into it — Azsuna's rectangle's middle lies in Suramar.
 */
const centreOf = async (pg, id) => {
  // (The first ask starts reading the mask: asked again a moment later.)
  await pg.evaluate((id) => window.__worldMap.areaPoint?.(id), id);
  await pg.waitForTimeout(150);
  return pointOf(pg, id);
};
const pointOf = (pg, id) => pg.evaluate((id) => {
  const e = window.__worldMap; const map = e.maps.get(id);
  if (!map) return null;
  const [x, y] = e.project(...(e.areaPoint?.(id) ?? [(map.frame[0] + map.frame[2]) / 2, (map.frame[1] + map.frame[3]) / 2]));
  // Inside the free part of the view (never over the panels: the wheel scrolls them there).
  const ins = e.options.insets;
  return [Math.round(Math.max(ins.left + 30, Math.min(e.width - ins.right - 30, x))), Math.round(Math.max(ins.top + 30, Math.min(e.height - ins.bottom - 30, y)))];
}, id);

async function runChain(browser, spec) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  if (cpu > 1) { const cdp = await ctx.newCDPSession(pg); await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu }); }
  const url = `${base}${page(spec.chain[0])}?${spec.era ? `era=${spec.era}&` : ""}debug`;
  await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await ready(pg);
  // The cookie notice is part of the page, not the map: accepted so it does not cover the dock.
  await pg.locator("button", { hasText: /Принять|Accept/ }).first().click({ timeout: 2000 }).catch(() => {});
  await pg.evaluate((max) => { window.__zoomMaxVoid = max; }, maxVoid);
  await pg.evaluate(install);
  const surface = await pg.evaluate(() => { const r = window.__worldMap.surface.getBoundingClientRect(); return [r.left, r.top]; });
  const told = [];
  const wheel = async (target, dir, max) => {
    for (let i = 0; i < max; i++) {
      // In: the cursor on the place to go into; out: at the middle of the view, as a reader backs out.
      if (dir < 0) await bringIntoView(pg, target, surface);
      const at = dir < 0 ? await centreOf(pg, target) : null;
      const [x, y] = at ?? [720, 450];
      await pg.mouse.move(surface[0] + x, surface[1] + y);
      await pg.mouse.wheel(0, dir * 100);
      await pg.waitForTimeout(110);
      if (shots) await pg.screenshot({ path: `${shots}/${spec.key}-${dir < 0 ? "in" : "out"}-${String(i).padStart(2, "0")}.png` });
      const focus = await pg.evaluate(() => window.__worldMap.focus?.id ?? null);
      if (args.debug) console.log("      notch", target, i, [x, y], JSON.stringify(await pg.evaluate(() => { const e = window.__worldMap; return { f: e.focusId, s: Math.round(e.view.scale), why: e.focusWhy }; })));
      if (focus === target) return true;
    }
    // The last notches still gliding.
    await pg.waitForTimeout(900);
    return (await pg.evaluate(() => window.__worldMap.focus?.id ?? null)) === target;
  };
  const reached = [];
  // In: the cursor on each next place until it is the map in view.
  for (const id of spec.chain.slice(1)) reached.push([id, await wheel(id, -1, 18)]);
  await pg.waitForTimeout(900);
  // Out: back to the first map of the chain.
  await pg.evaluate(() => { window.__zoomRec.phase = "out"; });
  reached.push([spec.chain[0], await wheel(spec.chain[0], 1, 16)]);
  await pg.waitForTimeout(900);
  const rec = await pg.evaluate(() => { const r = window.__zoomRec; r.stop = true; return r; });
  told.push(...rec.told);
  if (shots) rec.voids.forEach((v, i) => fs.writeFileSync(`${shots}/${spec.key}-void-${i}-${v.focus}-${v.value.toFixed(2)}.png`, Buffer.from(v.url.split(",")[1], "base64")));
  await ctx.close();
  const moving = rec.frames.filter((f) => f.moving);
  const intervals = moving.map((f) => f.dt).filter((dt) => dt < 2000).sort((a, b) => a - b);
  const pct = (p) => (intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))] : 0);
  // Focus sequence (the engine's own, per frame): no A → B → A flip-flops.
  // Each way on its own (in, then out by the same maps: A → B → A across the turn is the way back, not a flip).
  const seq = [];
  let flips = 0;
  for (const phase of ["in", "out"]) {
    const part = [];
    for (const f of rec.frames) if (f.phase === phase && f.focus !== null && part.at(-1) !== f.focus) part.push(f.focus);
    for (let i = 2; i < part.length; i++) if (part[i] === part[i - 2] && part[i - 1] !== part[i]) flips += 1;
    for (const id of part) if (seq.at(-1) !== id) seq.push(id);
  }
  if (args.debug) {
    const at = rec.frames.findIndex((f, i) => i > 1 && f.focus === rec.frames[i - 2]?.focus && rec.frames[i - 1].focus !== f.focus);
    if (at >= 0) for (const f of rec.frames.slice(Math.max(0, at - 6), at + 6)) console.log("     ", JSON.stringify({ focus: f.focus, scale: f.scale, cx: f.cx, cy: f.cy, wheel: f.wheel, moving: f.moving, phase: f.phase }));
    // Every change of the map in view, with the frames around it.
    rec.frames.forEach((f, i) => { if (i && f.focus !== rec.frames[i - 1].focus) console.log("      change", rec.frames[i - 1].focus, "→", f.focus, JSON.stringify({ scale: f.scale, wheel: f.wheel, phase: f.phase, why: f.why })); });
    const big = rec.frames.reduce((a, f) => (f.upscale > (a?.upscale ?? 0) ? f : a), null);
    if (big) console.log("      max upscale", JSON.stringify(big));
  }
  const allowed = new Set(spec.chain);
  const result = {
    key: spec.key, era: spec.era ?? "current", frames: rec.frames.length, movingFrames: moving.length,
    reached: Object.fromEntries(reached.map(([id, ok]) => [id, ok])),
    ancestorFrames: rec.frames.filter((f) => f.ancestors.length).length,
    ancestorSample: rec.frames.find((f) => f.ancestors.length)?.ancestors ?? null,
    voidFrames: rec.frames.filter((f) => f.empty > maxVoid).length, voidMax: Math.max(0, ...rec.frames.map((f) => f.empty)),
    pillWhileMoving: moving.filter((f) => f.pill).length,
    toldWhileMoving: rec.focusTold.filter((t) => t.moving).length, toldTitles: told.map((t) => t.title),
    focusSeq: seq, flips, offChain: seq.filter((id) => !allowed.has(id)).length,
    focusUpscaleMax: Math.max(0, ...rec.frames.map((f) => f.upscale)),
    intervalP50: Math.round(pct(0.5)), intervalP95: Math.round(pct(0.95)), intervalMax: Math.round(intervals.at(-1) ?? 0),
    longTasks: rec.long.length, longMax: Math.round(Math.max(0, ...rec.long)),
  };
  const problems = [];
  if (Object.values(result.reached).some((ok) => !ok)) problems.push("NOT-REACHED");
  if (result.ancestorFrames) problems.push("ANCESTOR-PICTURE");
  if (result.voidFrames) problems.push("VOID");
  if (result.pillWhileMoving) problems.push("HOVER-WHILE-MOVING");
  if (result.toldWhileMoving) problems.push("TITLE-WHILE-MOVING");
  if (result.flips) problems.push("FLIP-FLOP");
  if (result.intervalP95 > maxFrame) problems.push("SLOW-FRAMES");
  result.problems = problems;
  return result;
}

/**
 * The other ways to zoom and move, on one page each: keys + and −, double click, the zoom buttons, an era switch
 * in the middle of a zoom, Back during a flight, a resize mid-zoom; a phone (390, DPR 2) pinching with two
 * fingers. Every frame is checked as above; plus no page errors and a camera that stays a number.
 */
async function runInteractions(browser) {
  const out = [];
  const summarise = (key, rec, errors, extra = {}) => {
    const moving = rec.frames.filter((f) => f.moving);
    const r = {
      key, frames: rec.frames.length, errors: errors.slice(0, 3),
      ancestorFrames: rec.frames.filter((f) => f.ancestors.length).length, pillWhileMoving: moving.filter((f) => f.pill).length,
      toldWhileMoving: rec.focusTold.filter((t) => t.moving).length, nonFinite: rec.frames.filter((f) => !Number.isFinite(f.scale) || !Number.isFinite(f.cx)).length,
      voidFrames: rec.frames.filter((f) => f.empty > maxVoid).length, recorderErrors: rec.errors ?? 0, lastError: rec.lastError, ...extra,
    };
    if (shots) rec.voids.forEach((v, i) => fs.writeFileSync(`${shots}/${key}-void-${i}-${v.focus}-${v.value.toFixed(2)}.png`, Buffer.from(v.url.split(",")[1], "base64")));
    r.voidMax = Number(Math.max(0, ...rec.frames.map((f) => f.empty)).toFixed(3));
    r.voidAt = rec.frames.filter((f) => f.empty > maxVoid).map((f) => `${f.phase}:${f.focus}`);
    r.ancestorAt = rec.frames.filter((f) => f.ancestors.length).map((f) => `${f.phase}:${f.ancestors.join("/")}`);
    r.problems = [errors.length && "PAGE-ERROR", r.ancestorFrames && "ANCESTOR-PICTURE", r.pillWhileMoving && "HOVER-WHILE-MOVING", r.toldWhileMoving && "TITLE-WHILE-MOVING", r.nonFinite && "NAN-CAMERA", r.voidFrames && "VOID"].filter(Boolean);
    return r;
  };
  // Desktop: keys, double click, buttons, era switch mid-zoom, Back mid-flight, resize mid-zoom.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    if (args.debug) pg.on("framenavigated", (f) => { if (f === pg.mainFrame()) console.log("      navigated", f.url()); });
    await pg.goto(`${base}${page(12)}?debug`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await ready(pg);
    await pg.locator("button", { hasText: /Принять|Accept/ }).first().click({ timeout: 2000 }).catch(() => {});
    await pg.evaluate((max) => { window.__zoomMaxVoid = max; }, maxVoid);
    await pg.evaluate(install);
    const surface = await pg.evaluate(() => { const r = window.__worldMap.surface.getBoundingClientRect(); return [r.left, r.top]; });
    const step = (name) => pg.evaluate((n) => { if (window.__zoomRec) window.__zoomRec.phase = n; }, name);
    await step("keys");
    await pg.evaluate(() => window.__worldMap.surface.focus());
    for (const key of ["+", "+", "+", "-", "-"]) { await pg.keyboard.press(key); await pg.waitForTimeout(160); }
    await pg.waitForTimeout(900);
    if (args.debug) console.log("      keys done");
    const at = await centreOf(pg, 1);
    await step("dblclick");
    await pg.mouse.dblclick(surface[0] + at[0], surface[1] + at[1]);
    await pg.waitForTimeout(900);
    await step("buttons");
    for (const label of [/Приблизить|Zoom in/, /Приблизить|Zoom in/, /Отдалить|Zoom out/, /Отдалить|Zoom out/]) {
      await pg.getByRole("button", { name: label }).first().click({ timeout: 3000 }).catch(() => {});
      await pg.waitForTimeout(180);
    }
    await pg.waitForTimeout(900);
    // An era switch in the middle of a wheel zoom.
    await step("era");
    await pg.mouse.move(surface[0] + 900, surface[1] + 450);
    await pg.mouse.wheel(0, -100);
    await pg.waitForTimeout(60);
    await pg.getByText(/^Classic$/).first().click({ timeout: 3000 }).catch(() => {});
    await pg.mouse.wheel(0, -100);
    await pg.waitForTimeout(1600);
    if (args.debug) console.log("      era done");
    // Back while a flight is under way (a click on a zone flies there and adds a history step).
    // (The first flight settles and leaves a step to go back to; Back comes in the middle of the second.)
    await step("back");
    await pg.evaluate(() => window.__worldMap.showWhole());
    await pg.waitForTimeout(1800);
    const zone = await centreOf(pg, 1);
    await pg.mouse.click(surface[0] + zone[0], surface[1] + zone[1]);
    await pg.waitForTimeout(2200);
    const city = await centreOf(pg, 85);
    await pg.mouse.click(surface[0] + city[0], surface[1] + city[1]);
    await pg.waitForTimeout(400);
    await pg.evaluate(() => history.back());
    await pg.waitForTimeout(1800);
    if (args.debug) console.log("      back done");
    // A resize in the middle of a zoom.
    await step("resize");
    await pg.mouse.wheel(0, -100);
    await pg.setViewportSize({ width: 1100, height: 760 });
    await pg.waitForTimeout(1600);
    const rec = await pg.evaluate(() => { const r = window.__zoomRec; if (!r) return null; r.stop = true; return r; });
    if (!rec) { out.push({ key: "interactions-desktop", problems: ["LEFT-THE-PAGE"], url: pg.url() }); await ctx.close(); return out; }
    out.push(summarise("interactions-desktop", rec, errors, { url: pg.url().replace(base, "") }));
    await ctx.close();
  }
  // Phone: 390 × 844 at DPR 2, two fingers pinching out and in.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await pg.goto(`${base}${page(1)}?debug`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await ready(pg);
    await pg.locator("button", { hasText: /Принять|Accept/ }).first().click({ timeout: 2000 }).catch(() => {});
    await pg.evaluate((max) => { window.__zoomMaxVoid = max; }, maxVoid);
    await pg.evaluate(install);
    const cdp = await ctx.newCDPSession(pg);
    const box = await pg.evaluate(() => { const r = window.__worldMap.surface.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.4]; });
    const pinch = async (from, to) => {
      const pts = (d) => [{ x: box[0] - d, y: box[1], id: 1 }, { x: box[0] + d, y: box[1], id: 2 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(from) });
      for (let i = 1; i <= 12; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(from + ((to - from) * i) / 12) }); await pg.waitForTimeout(16); }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await pg.waitForTimeout(900);
    };
    const s0 = await pg.evaluate(() => window.__worldMap.view.scale);
    await pinch(30, 120);
    const s1 = await pg.evaluate(() => window.__worldMap.view.scale);
    await pinch(120, 30);
    const s2 = await pg.evaluate(() => window.__worldMap.view.scale);
    const rec = await pg.evaluate(() => { const r = window.__zoomRec; r.stop = true; return r; });
    const r = summarise("interactions-phone-390-dpr2", rec, errors, { pinchOut: Number((s1 / s0).toFixed(2)), pinchIn: Number((s2 / s1).toFixed(2)) });
    if (!(s1 > s0 * 1.5 && s2 < s1 / 1.5)) r.problems.push("PINCH");
    out.push(r);
    await ctx.close();
  }
  return out;
}

/**
 * One wheel event at a time (deltaY 100 = a notch, 300 = a fast wheel or a Windows 3-line notch), then the view
 * left to rest, both ways along a chain. After every rest the state must be consistent:
 *   (a) the title is the map in view, and that map is the one whose picture dominates the view;
 *   (b) no painted words of any other map are on screen (their label boxes, projected, not covered);
 *   (c) no markers (points, names) of any other map.
 */
async function settled(pg) {
  await pg.waitForFunction(() => { const e = window.__worldMap; return !e.wheel && !e.flight && !e.velocity && !e.crossfade && !e.focusUntold && !e.pending && e.tiles.pending === 0; }, null, { timeout: 15000, polling: 100 }).catch(() => {});
  // …the screen has been drawn around it (a frame after the change; on a slow device that is a while)…
  await pg.waitForFunction(() => { const e = window.__worldMap; return e.composition().focus === e.focusId; }, null, { timeout: 5000, polling: 100 }).catch(() => {});
  // …and the page has caught up with it (its title is the map in view).
  await pg.waitForFunction(() => { const e = window.__worldMap; const m = e.maps.get(e.focusId); const t = document.querySelector("#world-map-title")?.textContent?.trim(); return !m || m.type === "cosmic" || t === m.name; }, null, { timeout: 3000, polling: 100 }).catch(() => {});
  await pg.waitForTimeout(300);
}
const stateOf = (pg) => pg.evaluate(() => {
  const e = window.__worldMap;
  const comp = e.composition();
  const focus = e.maps.get(comp.focus);
  const title = document.querySelector("#world-map-title")?.textContent?.trim() ?? "";
  const ins = e.options.insets;
  const free = [ins.left, ins.top, e.width - ins.right, e.height - ins.bottom];
  const share = (d) => { const w = Math.min(d.clip[2], free[2]) - Math.max(d.clip[0], free[0]), h = Math.min(d.clip[3], free[3]) - Math.max(d.clip[1], free[1]); return w > 0 && h > 0 ? (w * h) / ((free[2] - free[0]) * (free[3] - free[1])) : 0; };
  // (A map that holds the one in view — its zone around a city the data puts beside it — is its backdrop, not a rival.)
  const ff = focus?.frame;
  const holds = (d) => { const m = e.maps.get(d.id)?.frame; if (!m || !ff || d.id === comp.focus) return false; const ow = Math.min(m[2], ff[2]) - Math.max(m[0], ff[0]), oh = Math.min(m[3], ff[3]) - Math.max(m[1], ff[1]); return ow > 0 && oh > 0 && (ow * oh) / ((ff[2] - ff[0]) * (ff[3] - ff[1])) >= 0.7 && (m[2] - m[0]) * (m[3] - m[1]) > 2 * (ff[2] - ff[0]) * (ff[3] - ff[1]); };
  // A map around it shows only outside the map in view: its part over that map's rectangle does not count.
  const fd = comp.draws.find((d) => d.id === comp.focus);
  const over = (d) => (fd && d.id !== comp.focus ? share({ clip: [Math.max(d.clip[0], fd.clip[0]), Math.max(d.clip[1], fd.clip[1]), Math.min(d.clip[2], fd.clip[2]), Math.min(d.clip[3], fd.clip[3])] }) : 0);
  const shown = comp.draws.filter((d) => d.role !== "ancestor" && d.alpha > 0.5 && !holds(d)).map((d) => ({ id: d.id, role: d.role, share: Math.max(0, share(d) - over(d)) }));
  const top = shown.reduce((a, d) => (d.share > (a?.share ?? -1) ? d : a), null);
  const own = shown.find((d) => d.id === comp.focus);
  // (An engine without letters in its composition — older builds — is read the hard way: every painted word of a
  // map other than the one in view, on screen, counts unless that map is a full wash.)
  const lettersOf = (d) => {
    if (d.letters !== undefined) return d.letters;
    const map = e.maps.get(d.id);
    const labels = map?.art?.paintedLabels ?? [];
    if (d.role === "focus" || d.alpha < 0.05 || (d.role === "ancestor" && d.detail === 0) || !Array.isArray(labels)) return 0;
    const f = map.frame, fw = f[2] - f[0], fh = f[3] - f[1];
    let n = 0;
    for (const l of labels) {
      const b = l.plaque ?? l.box ?? l;
      if (!Array.isArray(b)) continue;
      const [x0, y0] = e.project(f[0] + b[0] * fw, f[1] + b[1] * fh), [x1, y1] = e.project(f[0] + b[2] * fw, f[1] + b[3] * fh);
      if (Math.min(x1, d.clip[2], e.width) > Math.max(x0, d.clip[0], 0) && Math.min(y1, d.clip[3], e.height) > Math.max(y0, d.clip[1], 0)) n += 1;
    }
    return n;
  };
  const letters = comp.draws.map((d) => [d, lettersOf(d)]).filter(([, n]) => n > 0).map(([d, n]) => `${d.id}:${d.role}:${n}`);
  const markers = (window.__worldMapMarkers ?? []).filter((m) => m.owner !== undefined && m.owner !== comp.focus && m.sx > 0 && m.sy > 0 && m.sx < e.width && m.sy < e.height).map((m) => `${m.owner}:${m.label}`);
  return { focus: comp.focus, name: focus?.name, type: focus?.type, title, dominant: top?.id ?? null, focusShare: own?.share ?? 0, topShare: top?.share ?? 0, letters, markers, scale: Math.round(e.view.scale) };
});

async function runNotches(browser, spec, delta) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await pg.goto(`${base}${page(spec.chain[0])}?${spec.era ? `era=${spec.era}&` : ""}debug`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await ready(pg);
  await pg.locator("button", { hasText: /Принять|Accept/ }).first().click({ timeout: 2000 }).catch(() => {});
  await settled(pg);
  const surface = await pg.evaluate(() => { const r = window.__worldMap.surface.getBoundingClientRect(); return [r.left, r.top]; });
  const problems = [];
  const steps = [];
  let n = 0;
  const check = async (dir) => {
    const st = await stateOf(pg);
    const issues = [];
    if (st.type !== "cosmic" && st.title !== st.name) {
      issues.push(`TITLE(${st.title}≠${st.name})`);
      if (args.debug) console.log("      title-debug", JSON.stringify(await pg.evaluate(() => { const e = window.__worldMap; return { focusId: e.focusId, home: e.home?.id, atHome: e.home ? e.atHome(e.home.id) : null, untold: e.focusUntold, moving: e.moving, why: e.focusWhy, comp: e.composition().focus, info: e.lastInfo.focus.id }; })));
    }
    // The map in view dominates: nothing else drawn covers clearly more of the view.
    if (st.dominant !== st.focus && st.topShare > st.focusShare + 0.15) issues.push(`DOMINANT(${st.dominant} ${st.topShare.toFixed(2)} > ${st.focus} ${st.focusShare.toFixed(2)})`);
    if (st.letters.length) issues.push(`LETTERS(${st.letters.join(",")})`);
    if (st.markers.length) issues.push(`MARKERS(${st.markers.slice(0, 4).join(",")})`);
    steps.push(`${dir}${n}:${st.focus}`);
    if (args.debug) console.log("      step", dir, n, JSON.stringify(await pg.evaluate(() => { const e = window.__worldMap; const [cx, cy] = e.lookAt ?? [0, 0]; const [sx, sy] = e.project(cx, cy); return { f: e.focusId, s: Math.round(e.view.scale), look: [Math.round(sx), Math.round(sy)], why: e.focusWhy, draws: e.lastInfo.drawn.filter((d) => d.map.depth >= 3).map((d) => `${d.map.id}:${d.role}:o${(d.open ?? 0).toFixed(2)}`).slice(0, 8) }; })));
    if (issues.length) {
      problems.push(`${dir}${n} focus ${st.focus} ${issues.join(" ")}`);
      if (shots) await pg.screenshot({ path: `${shots}/notch-${spec.key}-${delta}-${dir}${n}.png`, timeout: 120000 }).catch(() => {});
    }
    return st;
  };
  // In: the cursor on each next place of the chain, one event at a time.
  const missed = [];
  for (const id of spec.chain.slice(1)) {
    let got = false;
    for (let i = 0; i < 12; i++, n++) {
      await bringIntoView(pg, id, surface);
      await settled(pg);
      const [x, y] = (await centreOf(pg, id)) ?? [720, 450];
      await pg.mouse.move(surface[0] + x, surface[1] + y);
      await pg.mouse.wheel(0, -delta);
      await settled(pg);
      const st = await check("in");
      if (st.focus === id) { got = true; break; }
    }
    if (!got) missed.push(id);
  }
  // Out: at the middle of the free area, back to the first map of the chain.
  let back = false;
  for (let i = 0; i < 14; i++, n++) {
    const ins = await pg.evaluate(() => { const e = window.__worldMap, s = e.options.insets; return [s.left + (e.width - s.left - s.right) / 2, s.top + (e.height - s.top - s.bottom) / 2]; });
    await pg.mouse.move(surface[0] + ins[0], surface[1] + ins[1]);
    await pg.mouse.wheel(0, delta);
    await settled(pg);
    const st = await check("out");
    if (st.focus === spec.chain[0]) { back = true; break; }
  }
  await ctx.close();
  if (!back) missed.push(spec.chain[0]);
  return { key: `notch-${spec.key}-${delta}`, steps, problems: [...(problems.length ? ["SETTLED-STATE"] : []), ...(missed.length ? [`NOT-REACHED(${missed.join(",")})`] : [])], detail: problems };
}

/** Labels on screen that overlap (their text boxes, more than 3 px each way). */
const overlaps = (pg) => pg.evaluate(() => {
  const boxes = [...document.querySelectorAll("[class*='labelText'], [data-labelled] [class*='markerName'], [class*='poiIcon']")]
    .filter((el) => { const st = getComputedStyle(el); return st.visibility !== "hidden" && Number(st.opacity) > 0.1 && el.closest("[data-quiet]") === null; })
    .map((el) => ({ text: el.textContent?.trim() || el.closest("[aria-label]")?.getAttribute("aria-label") || "?", r: el.getBoundingClientRect() }))
    .filter((b) => b.r.width > 0 && b.r.height > 0);
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r;
    // (A point's own icon and name touch by design.)
    if (boxes[i].text === boxes[j].text) continue;
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) out.push(`${boxes[i].text} × ${boxes[j].text}`);
  }
  return { count: boxes.length, overlaps: out };
});

const DEEP = [
  { key: "deep-kalimdor", chain: [12, 1, 85], terrain: true },
  { key: "deep-eastern-kingdoms", chain: [13, 37, 84], terrain: true },
  { key: "deep-broken-isles", chain: [619, 630], terrain: true },
  { key: "deep-outland", chain: [101, 107], terrain: true },
  // A phase whose era knows no ground under its zone (Theramore fallen): capped at the painted map, no modern ground.
  { key: "deep-theramore-fall", chain: [12, 70], terrain: false, query: "at=5.2.0" },
];

async function runDeep(browser, spec) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  if (cpu > 1) { const cdp = await ctx.newCDPSession(pg); await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu }); }
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await pg.goto(`${base}${page(spec.chain[0])}?${spec.query ? `${spec.query}&` : ""}debug`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await ready(pg);
  await pg.locator("button", { hasText: /Принять|Accept/ }).first().click({ timeout: 2000 }).catch(() => {});
  await pg.evaluate((max) => { window.__zoomMaxVoid = max; }, maxVoid);
  await pg.evaluate(install);
  const surface = await pg.evaluate(() => { const r = window.__worldMap.surface.getBoundingClientRect(); return [r.left, r.top]; });
  const problems = [];
  const missed = [];
  const notch = async (id) => {
    await bringIntoView(pg, id, surface);
    const [x, y] = (await centreOf(pg, id)) ?? [720, 450];
    await pg.mouse.move(surface[0] + x, surface[1] + y);
    await pg.mouse.wheel(0, -100);
    await pg.waitForTimeout(160);
  };
  for (const id of spec.chain.slice(1)) {
    let got = false;
    for (let i = 0; i < 18 && !got; i++) { await notch(id); got = (await pg.evaluate(() => window.__worldMap.focus?.id ?? null)) === id; }
    if (!got) { await pg.waitForTimeout(900); got = (await pg.evaluate(() => window.__worldMap.focus?.id ?? null)) === id; }
    if (!got) missed.push(id);
  }
  const last = spec.chain.at(-1);
  // On to the deepest zoom, the cursor on the place's own land.
  let notches = 0;
  for (; notches < 30; notches++) {
    const room = await pg.evaluate(() => window.__worldMap.zoomRoom().in);
    if (room < 0.005 && !(await pg.evaluate(() => Boolean(window.__worldMap.wheel)))) break;
    await notch(last);
  }
  await settled(pg);
  await pg.waitForFunction(() => window.__worldMap.tiles.pending === 0, null, { timeout: 60000, polling: 200 }).catch(() => {});
  await pg.waitForTimeout(1200);
  const st = await pg.evaluate(() => {
    const e = window.__worldMap;
    const cov = e.coverage();
    const zoomIn = document.querySelector("button[aria-label='Приблизить'], button[aria-label='Zoom in']");
    return { room: e.zoomRoom().in, focus: e.focus?.id, name: e.focus?.name, title: document.querySelector("#world-map-title")?.textContent?.trim() ?? "", cov, spent: zoomIn?.getAttribute("aria-disabled") === "true", scale: e.view.scale, ground: e.lastInfo?.ground ?? 0 };
  });
  const labels = await overlaps(pg);
  if (shots) await pg.screenshot({ path: `${shots}/${spec.key}-max.png`, timeout: 120000 }).catch(() => {});
  // One more notch: a bounce at the limit, then back to the same view.
  // (At the middle of the free view, where the limit was read: elsewhere another picture may set another limit.)
  const [bx, by] = await pg.evaluate(() => { const e = window.__worldMap, s = e.options.insets; return [s.left + (e.width - s.left - s.right) / 2, s.top + (e.height - s.top - s.bottom) / 2]; });
  await pg.mouse.move(surface[0] + bx, surface[1] + by);
  await pg.mouse.wheel(0, -100);
  await pg.waitForTimeout(40);
  const bounce = await pg.evaluate(() => window.__worldMap.stretch?.log ?? 0);
  await settled(pg);
  await pg.waitForTimeout(400);
  const after = await pg.evaluate(() => ({ scale: window.__worldMap.view.scale, stretch: window.__worldMap.stretch }));
  const rec = await pg.evaluate(() => { const r = window.__zoomRec; r.stop = true; return r; });
  await ctx.close();
  if (shots) rec.voids.forEach((v, i) => fs.writeFileSync(`${shots}/${spec.key}-void-${i}-${v.focus}-${v.value.toFixed(2)}.png`, Buffer.from(v.url.split(",")[1], "base64")));
  const voidAt = rec.frames.filter((f) => f.empty > maxVoid).map((f) => `${f.focus}:${f.scale}:${f.empty.toFixed(2)}`).slice(0, 6);
  const limit = st.cov.detail?.source === "terrain" ? 2 : 1.6;
  if (missed.length) problems.push(`NOT-REACHED(${missed.join(",")})`);
  if (st.room > 0.01) problems.push(`NOT-MAX(${st.room.toFixed(3)} left)`);
  if (!st.cov.detail || st.cov.detail.upscale > limit * 1.02) problems.push(`OVER-UPSCALE(${st.cov.detail?.source}:${st.cov.detail?.upscale?.toFixed(2)})`);
  if (spec.terrain && st.cov.detail?.source !== "terrain") problems.push("NO-TERRAIN");
  if (!spec.terrain && st.cov.detail && st.cov.detail.upscale < 1.5) problems.push(`CAP-SHALLOW(${st.cov.detail.upscale.toFixed(2)})`);
  if (st.cov.tiles < 0.99) problems.push(`BLANK-TILES(${st.cov.tiles.toFixed(3)} of ${st.cov.drawn})`);
  if (labels.overlaps.length) problems.push(`LABEL-OVERLAP(${labels.overlaps.slice(0, 3).join("; ")})`);
  if (st.title !== st.name || st.focus !== last) problems.push(`TITLE(${st.title}|${st.name}|${st.focus})`);
  if (!st.spent) problems.push("ZOOM-IN-NOT-SPENT");
  if (!(bounce > 0)) problems.push("NO-RUBBER");
  if (after.stretch || Math.abs(after.scale / st.scale - 1) > 0.01) problems.push("RUBBER-DRIFT");
  const voids = rec.frames.filter((f) => f.empty > maxVoid).length, pills = rec.frames.filter((f) => f.moving && f.pill).length;
  if (voids) problems.push(`VOID(${voids})`);
  if (pills) problems.push(`HOVER-WHILE-MOVING(${pills})`);
  if (errors.length) problems.push("PAGE-ERROR");
  return {
    key: spec.key, problems, errors: errors.slice(0, 2), voidAt, notches, room: Number(st.room.toFixed(4)), detail: st.cov.detail && { source: st.cov.detail.source, upscale: Number(st.cov.detail.upscale.toFixed(3)) },
    coverage: { tiles: Number(st.cov.tiles.toFixed(3)), drawn: st.cov.drawn }, drift: Number((after.scale / st.scale).toFixed(4)), ground: Number(st.ground.toFixed(2)), labels: labels.count, title: st.title, bounce: Number(bounce.toFixed(3)),
  };
}

const PIN = [
  { key: "pin-kalimdor", id: 12, w: 1440, h: 900 },
  { key: "pin-durotar", id: 1, w: 1440, h: 900 },
  { key: "pin-orgrimmar-deep", id: 85, w: 1440, h: 900, query: "x=0.45&y=0.55&z=3" },
  { key: "pin-durotar-390", id: 1, w: 390, h: 844 },
];

/** Runs in the page: how far the camera is off its pin (CSS px) and the share of the free stage the map in view covers. */
function pinState() {
  const e = window.__worldMap, s = e.options.insets, v = e.view;
  const off = e.pinOff(v);
  const map = e.focus;
  const f = map ? e.shown?.get?.(map.id) ?? map.frame : null;
  const L = s.left, R = e.width - s.right, T = s.top, B = e.height - s.bottom;
  let share = 0;
  if (f) {
    const [x0, y0] = e.project(f[0], f[1]), [x1, y1] = e.project(f[2], f[3]);
    const w = Math.min(x1, R) - Math.max(x0, L), h = Math.min(y1, B) - Math.max(y0, T);
    share = w > 0 && h > 0 ? (w * h) / ((R - L) * (B - T)) : 0;
  }
  const min = e.bounds(v)?.min ?? 0;
  // (Per axis: the rubber band reaches as far on each.)
  return { off: off ? Math.max(Math.abs(off.x), Math.abs(off.y)) * v.scale : 0, share, focus: map?.id ?? null, scale: v.scale, min };
}

async function runPin(browser, spec) {
  const ctx = await browser.newContext({ viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: spec.w < 500 ? 2 : 1 });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await pg.goto(`${base}${page(spec.id)}?${spec.query ? `${spec.query}&` : ""}debug`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await ready(pg);
  await pg.locator("button", { hasText: /Принять|Accept/ }).first().click({ timeout: 2000 }).catch(() => {});
  await settled(pg);
  const box = await pg.evaluate(() => { const e = window.__worldMap, s = e.options.insets, r = e.surface.getBoundingClientRect(); return { x: r.left + s.left + (e.width - s.left - s.right) / 2, y: r.top + s.top + (e.height - s.top - s.bottom) / 2, w: e.width - s.left - s.right, h: e.height - s.top - s.bottom }; });
  const problems = [];
  const log = [];
  await pg.evaluate(`window.__pinState = ${pinState.toString()}`);
  const before = await pg.evaluate(pinState);
  const pageY0 = await pg.evaluate(() => window.scrollY);
  // While dragging: the farthest past the edge.
  await pg.evaluate(() => { window.__pinMax = 0; const tick = () => { if (window.__pinStop) return; const st = window.__pinState(); if (st.off - (window.__pinBase ?? 0) > window.__pinMax) { window.__pinMax = st.off - (window.__pinBase ?? 0); window.__pinAt = `${window.__pinPhase}:${st.focus}`; } requestAnimationFrame(tick); }; window.__pinStop = false; requestAnimationFrame(tick); });
  const slow = [];
  const check = async (label) => {
    await pg.evaluate((l) => { window.__pinPhase = `after-${l}`; }, label);
    // Back inside its bounds: how long after the release (wall clock), and in how many drawn frames. Headless
    // SwiftShader on a loaded host may stall frames for a second: a late return over a frame or two is the host's.
    const back = await pg.evaluate(() => new Promise((done) => {
      const e = window.__worldMap, t0 = performance.now(), f0 = e.frameCount;
      const poll = () => { const st = window.__pinState(); const t = performance.now() - t0; if (st.off <= 2 || t > 3000) done({ t, frames: e.frameCount - f0, off: st.off }); else setTimeout(poll, 20); };
      poll();
    }));
    // Late with plenty of frames drawn is the engine's fault; late over a few stalled frames (> 100 ms each) the host's.
    if (back.t > 400) {
      slow.push(`${label}:${Math.round(back.t)}ms/${back.frames}f`);
      if (back.off > 2 && back.frames >= 12) problems.push(`${label} LATE(${Math.round(back.t)}ms over ${back.frames} frames)`);
      if (back.frames > 0 && back.t / back.frames < 100 && back.t > 400) problems.push(`${label} LATE(${Math.round(back.t)}ms)`);
    }
    await pg.waitForTimeout(Math.max(0, 400 - back.t));
    const st = await pg.evaluate(pinState);
    const need = before.share >= 0.99 ? 0.9 : before.share * 0.9;
    const bad = [];
    if (st.off > 2 && back.frames >= 12) bad.push(`OFF(${st.off.toFixed(1)}px)`);
    if (st.share < need) bad.push(`SHARE(${st.share.toFixed(2)}<${need.toFixed(2)})`);
    log.push(`${label}:${st.share.toFixed(2)}/${st.off.toFixed(1)}`);
    if (bad.length) problems.push(`${label} ${bad.join(" ")}`);
  };
  // 2000 px each way, in strokes across the free part of the stage (a pointer stays on the page, as a hand's does).
  for (const [name, ux, uy] of [["right", 1, 0], ["left", -1, 0], ["down", 0, 1], ["up", 0, -1]]) {
    const stroke = Math.floor((ux ? box.w : box.h) * 0.8);
    for (let done = 0; done < 2000; done += stroke) {
      const len = Math.min(stroke, 2000 - done);
      const x0 = box.x - (ux * len) / 2, y0 = box.y - (uy * len) / 2;
      await pg.mouse.move(x0, y0);
      // (The reach is measured from where the stroke starts: a host that stalled frames may leave the last one unsettled.)
      await pg.evaluate(() => { window.__pinBase = window.__pinState().off; });
      await pg.mouse.down();
      for (let i = 1; i <= 20; i++) { await pg.mouse.move(x0 + (ux * len * i) / 20, y0 + (uy * len * i) / 20); await pg.waitForTimeout(8); }
      // (Held still a moment: a drag, not a throw.)
      await pg.waitForTimeout(120);
      await pg.mouse.up();
    }
    await check(`drag-${name}`);
    await settled(pg);
  }
  // A fling: a fast short throw, released while moving.
  for (const [name, fx, fy] of [["fling-left", -0.6, 0], ["fling-up", 0, -0.6], ["fling-diag", 0.5, 0.5]]) {
    const dx = fx * box.w, dy = fy * box.h;
    await pg.mouse.move(box.x - dx / 2, box.y - dy / 2);
    await pg.evaluate(() => { window.__pinBase = window.__pinState().off; });
    await pg.mouse.down();
    for (let i = 1; i <= 4; i++) { await pg.mouse.move(box.x - dx / 2 + (dx * i) / 4, box.y - dy / 2 + (dy * i) / 4); await pg.waitForTimeout(12); }
    await pg.mouse.up();
    await check(name);
    await settled(pg);
  }
  const rubber = await pg.evaluate(() => { window.__pinStop = true; return window.__pinMax; });
  const rubberAt = await pg.evaluate(() => window.__pinAt);
  if (rubber > 70) problems.push(`RUBBER-REACH(${rubber.toFixed(0)}px at ${rubberAt})`);
  // Zoom-out spam: never smaller than the whole top map.
  await pg.evaluate(() => { window.__pinLow = Infinity; window.__pinStop = false; const tick = () => { if (window.__pinStop) return; const st = window.__pinState(); window.__pinLow = Math.min(window.__pinLow, st.scale / st.min); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  for (let i = 0; i < 40; i++) {
    await pg.mouse.move(box.x + (((i * 137) % 100) / 100 - 0.5) * box.w * 0.8, box.y + (((i * 71) % 100) / 100 - 0.5) * box.h * 0.8);
    await pg.mouse.wheel(0, 300);
    await pg.waitForTimeout(40);
  }
  await settled(pg);
  const low = await pg.evaluate(() => { window.__pinStop = true; return window.__pinLow; });
  if (low < 0.995) problems.push(`BELOW-FIT(${low.toFixed(3)})`);
  const end = await pg.evaluate(pinState);
  if (end.off > 2) problems.push(`OFF-AFTER-ZOOM(${end.off.toFixed(1)}px)`);
  const pageY1 = await pg.evaluate(() => window.scrollY);
  if (pageY1 !== pageY0) problems.push(`PAGE-SCROLLED(${pageY0}→${pageY1})`);
  if (errors.length) problems.push("PAGE-ERROR");
  if (shots) await pg.screenshot({ path: `${shots}/${spec.key}-end.png`, timeout: 120000 }).catch(() => {});
  await ctx.close();
  return { key: spec.key, problems, log, slow, before: { share: Number(before.share.toFixed(2)) }, rubber: Number(rubber.toFixed(1)), lowest: Number(low.toFixed(3)), errors: errors.slice(0, 2) };
}

if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const results = [];
if (args.pin) {
  for (const spec of PIN.filter((d) => !args.only || args.only.split(",").some((key) => d.key.includes(key)))) {
    let r;
    try { r = await runPin(browser, spec); } catch (error) { r = { key: spec.key, problems: ["ERROR"], error: String(error).slice(0, 300) }; }
    results.push(r);
    console.log(`${r.problems.length ? "FAIL" : "OK  "} ${r.key.padEnd(26)} ${r.problems.join(",")}`);
    console.log(`     ${JSON.stringify({ ...r, problems: undefined, key: undefined })}`);
  }
}
if (args.deep) {
  for (const spec of DEEP.filter((d) => !args.only || args.only.split(",").some((key) => d.key.includes(key)))) {
    let r;
    try { r = await runDeep(browser, spec); } catch (error) { r = { key: spec.key, problems: ["ERROR"], error: String(error).slice(0, 300) }; }
    results.push(r);
    console.log(`${r.problems.length ? "FAIL" : "OK  "} ${r.key.padEnd(26)} ${r.problems.join(",")}`);
    console.log(`     ${JSON.stringify({ ...r, problems: undefined, key: undefined })}`);
  }
}
if (args.notches) {
  // --notches [100,300]: only the one-event-at-a-time runs.
  for (const delta of String(args.notches === "1" ? "100,300" : args.notches).split(",").map(Number)) {
    for (const spec of chains) {
      let r;
      try { r = await runNotches(browser, spec, delta); } catch (error) { r = { key: `notch-${spec.key}-${delta}`, problems: ["ERROR"], detail: [String(error).slice(0, 200)] }; }
      results.push(r);
      console.log(`${r.problems.length ? "FAIL" : "OK  "} ${r.key.padEnd(34)} ${(r.steps ?? []).join(" ")}`);
      for (const line of r.detail.slice(0, 8)) console.log(`     ${line}`);
    }
  }
}
for (const spec of args.notches || args.deep || args.pin ? [] : chains) {
  try { results.push(await runChain(browser, spec)); } catch (error) { results.push({ key: spec.key, problems: ["ERROR"], error: String(error).slice(0, 300) }); }
  const r = results.at(-1);
  const missed = Object.entries(r.reached ?? {}).filter(([, ok]) => !ok).map(([id]) => id);
  console.log(`${r.problems.length ? "FAIL" : "OK  "} ${r.key.padEnd(26)} ${r.problems.join(",") || ""}${missed.length ? ` (not reached ${missed.join(",")})` : ""}`);
  console.log(`     focus ${(r.focusSeq ?? []).join("→")} | titles ${(r.toldTitles ?? []).join(" → ")} | void ${r.voidFrames ?? "-"} (max ${(r.voidMax ?? 0).toFixed(3)}) | ancestor ${r.ancestorFrames ?? "-"} ${r.ancestorSample ? JSON.stringify(r.ancestorSample) : ""} | pill ${r.pillWhileMoving ?? "-"} | frames p50 ${r.intervalP50} p95 ${r.intervalP95} max ${r.intervalMax} ms, long tasks ${r.longTasks} (max ${r.longMax}) | focus upscale max ${r.focusUpscaleMax}${r.error ? ` | ${r.error}` : ""}`);
}
if (!args.notches && !args.deep && !args.pin && (!args.only || args.only.includes("interactions"))) {
  for (const r of await runInteractions(browser).catch((error) => [{ key: "interactions", problems: ["ERROR"], error: String(error).slice(0, 300) }])) {
    results.push(r);
    console.log(`${r.problems.length ? "FAIL" : "OK  "} ${r.key.padEnd(26)} ${r.problems.join(",")}`);
    console.log(`     ${JSON.stringify({ ...r, problems: undefined, key: undefined })}`);
  }
}
await browser.close();
if (args.out) fs.writeFileSync(args.out, JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.problems.length) ? 1 : 0);
