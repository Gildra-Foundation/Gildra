#!/usr/bin/env node
// World map overlap check: opens every zone/city/continent page of the map (RU) and the main views
// of a few eras, waits for the picture, and asks the engine how the frame is put together.
//   (a) over the map in view only that map and the places inside it show (no neighbour, no ancestor
//       through it);
//   (b) the masked areas (where a map shows at more than half, through its own mask, under the maps drawn
//       before it in its layer) of the maps beside each other — neighbours and the map in view — overlap by
//       at most 2% of what they cover;
//   (c) no painted word of an ancestor shows (an ancestor is only its washed-out backdrop).
//   npm run qa:map-overlap                              local :3100, all pages
//   npm run qa:map-overlap -- --base http://127.0.0.1:3482 --only 47-duskwood,80-moonglade --out /tmp/x.json
// Engines without composition() (older builds) are read from their last frame with the old rules, so the
// same script gives the "before" numbers. Exits 1 when a page fails.
import fs from "node:fs";
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1]]);
  return pairs;
}, []));
const base = args.base ?? "http://127.0.0.1:3100";
const maxOverlap = Number(args["max-overlap"] ?? 0.02);
const parallel = Number(args.parallel ?? 3);
const data = JSON.parse(fs.readFileSync(new URL("../data/wow/map/maps.json", import.meta.url), "utf8"));
const maps = Array.isArray(data) ? data : data.maps;
const byId = new Map(maps.map((map) => [map.id, map]));
const top = (map) => { let m = map; for (let i = 0; i < 32 && m.parentId !== null && byId.has(m.parentId); i++) m = byId.get(m.parentId); return m; };
const pages = maps
  .filter((map) => map.art && ["continent", "zone"].includes(map.type) && ["cosmic", "world"].includes(top(map).type))
  .map((map) => `/ru/wow/map/${map.id}-${map.slug}`);
const eras = ["vanilla", "cataclysm", "legion"].map((era) => `/ru/wow/map?era=${era}`);
let routes = [...pages, ...eras];
if (args.urls) {
  // An external job list (one URL or path per line, or a JSON array of {url}): the audit's pages.
  const text = fs.readFileSync(args.urls, "utf8");
  const list = text.trim().startsWith("[") ? JSON.parse(text).map((job) => job.url ?? job) : text.split("\n").filter(Boolean);
  routes = [...new Set(list.map((line) => {
    const url = new URL(line.trim(), "http://x");
    url.searchParams.delete("debug");
    return url.pathname + url.search;
  }))];
}
if (args.only) {
  const only = args.only.split(",");
  routes = routes.filter((route) => only.some((key) => route.endsWith(`/${key}`) || route.includes(`/${key}-`) || route.endsWith(`era=${key}`)));
}

/** Runs in the page: the frame's draws (from composition(), or rebuilt from the last frame) and the three measures. */
async function measure() {
  const e = window.__worldMap;
  const info = e.lastInfo;
  const set = e.set;
  const W = e.width, H = e.height;
  const usesMaskOld = (m) => Boolean(m.mask) && m.depth > 0 && !["world", "cosmic", "continent"].includes(m.type);
  let comp = typeof e.composition === "function" ? e.composition() : null;
  if (!comp) {
    // An older engine: roles from the focus chain, its masks as it used them, nothing gives way.
    const focus = info.focus;
    const chain = new Set(); for (let m = focus; m; m = m.parent === null ? null : set.maps.get(m.parent)) chain.add(m.id);
    const inside = new Set(); const walk = (id) => { if (inside.has(id)) return; inside.add(id); for (const c of set.maps.get(id)?.children ?? []) walk(c); }; walk(focus.id);
    comp = {
      focus: focus.id, exclude: null,
      draws: info.drawn.map((d) => {
        const role = d.map.id === focus.id ? "focus" : inside.has(d.map.id) ? "inside" : chain.has(d.map.id) ? "ancestor" : "neighbour";
        return { id: d.map.id, name: d.map.name, type: d.map.type, depth: d.map.depth, role, alpha: d.alpha, tone: 0, blur: d.blur, screen: d.screen, clip: d.clip, mask: d.map.mask ?? null, masked: usesMaskOld(d.map) ? 1 : 0, excluded: 0, detail: 1 };
      }),
    };
  }
  const draws = comp.draws.filter((d) => d.alpha > 0.05);
  const held = draws.find((d) => d.role === "focus");
  if (!held) return { focus: comp.focus, foreign: [], overlap: 0, letters: [], note: "no focus drawn" };
  const sw = held.screen[2] - held.screen[0], sh = held.screen[3] - held.screen[1];
  const ramp = Math.max(Math.min(sw, sh) * 0.11, 8);
  const core = [held.clip[0] + ramp, held.clip[1] + ramp, held.clip[2] - ramp, held.clip[3] - ramp];
  const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const opaque = held.alpha >= 0.99 && held.masked <= 0.02;
  // (a) Foreign draws seen over the map in view.
  const foreign = [];
  for (const d of draws) {
    if (d.role === "focus" || d.role === "child" || d.role === "inside" || !hits(d.clip, core)) continue;
    if (d.role === "neighbour" && d.excluded >= 0.99) continue;
    if (d.role === "ancestor" && opaque) continue;
    if (draws.indexOf(d) > draws.indexOf(held) && d.role !== "neighbour") { foreign.push(`${d.id} ${d.name} (${d.role}, over)`); continue; }
    foreign.push(`${d.id} ${d.name} (${d.role})`);
  }
  // (b) Coverage of the maps beside each other, each through its own mask, at a quarter of the view.
  const q = 4, gw = Math.ceil(W / q), gh = Math.ceil(H / q);
  const sum = new Float32Array(gw * gh), max = new Float32Array(gw * gh);
  const fields = [];
  const masks = new Map();
  const maskOf = async (url) => {
    if (!masks.has(url)) masks.set(url, fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null));
    return masks.get(url);
  };
  const canvas = new OffscreenCanvas(gw, gh);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const smooth = (t) => t * t * (3 - 2 * t);
  // Neighbours drawn under each other in one layer fill only what the ones before them left empty.
  const layers = new Map();
  const ordered = [...draws].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const d of ordered) {
    if (d.role !== "neighbour" && d.role !== "focus" && d.role !== "child") continue;
    let px = null;
    if (d.masked > 0.02 && d.mask) {
      const bitmap = await maskOf(d.mask);
      if (bitmap) {
        ctx.clearRect(0, 0, gw, gh);
        ctx.drawImage(bitmap, d.screen[0] / q, d.screen[1] / q, (d.screen[2] - d.screen[0]) / q, (d.screen[3] - d.screen[1]) / q);
        px = ctx.getImageData(0, 0, gw, gh).data;
      }
    }
    const field = new Float32Array(gw * gh);
    const fw = d.screen[2] - d.screen[0], fh = d.screen[3] - d.screen[1];
    const inset = Math.min(fw, fh) * 0.025, end = Math.max(Math.min(fw, fh) * 0.11, 8);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const X = (x + 0.5) * q, Y = (y + 0.5) * q;
      if (X < d.clip[0] || X > d.clip[2] || Y < d.clip[1] || Y > d.clip[3]) continue;
      let a = d.alpha;
      const i = y * gw + x;
      if (px) a *= 1 - d.masked + d.masked * (px[i * 4 + 3] < 250 ? px[i * 4 + 3] / 255 : px[i * 4] / 255);
      else if (d.role === "focus" || d.masked <= 0.02) {
        const dist = Math.min(X - d.clip[0], d.clip[2] - X, Y - d.clip[1], d.clip[3] - Y);
        if (d.depth > 0) a *= smooth(Math.min(1, Math.max(0, (dist - inset) / Math.max(1, end - inset))));
      }
      if (d.role === "neighbour" && d.excluded > 0 && comp.exclude) {
        const r = comp.exclude.rect.map((v) => v / (comp.dpr ?? 1));
        const [e0, e1] = comp.exclude.edge.map((v) => v / (comp.dpr ?? 1));
        const dist = Math.min(X - r[0], r[2] - X, Y - r[1], r[3] - Y);
        a *= 1 - d.excluded * smooth(Math.min(1, Math.max(0, (dist - e0) / Math.max(1, e1 - e0))));
      }
      if (d.under) {
        if (!layers.has(d.layer)) layers.set(d.layer, new Float32Array(gw * gh));
        const acc = layers.get(d.layer);
        a *= 1 - acc[i];
        acc[i] += a;
      }
      if (a <= 0.02) continue;
      sum[i] += a;
      if (a > max[i]) max[i] = a;
      field[i] = a;
    }
    fields.push({ id: d.id, field, set: d.role === "child" ? 1 : 0 });
  }
  // The pairs that overlap most (sum of the smaller share per pixel), for the data side.
  const pairs = [];
  for (let x = 0; x < fields.length; x++) for (let y = x + 1; y < fields.length; y++) {
    if (fields[x].set !== fields[y].set) continue;
    let both = 0;
    const p = fields[x].field, r = fields[y].field;
    for (let i = 0; i < p.length; i++) if (p[i] > 0.5 && r[i] > 0.5) both += 1;
    if (both > 0) pairs.push([`${fields[x].id}+${fields[y].id}`, both]);
  }
  // A map's masked area: where it shows at more than half. Overlap = pixels in two such areas at once
  // (a soft seam where one fades out as the other fades in is not one); the soft mix is kept for reference.
  // Two sets: the map in view with its neighbours, and the places one level inside it (they lie over it by design).
  const count = [new Uint8Array(gw * gh), new Uint8Array(gw * gh)];
  for (const { field, set: k } of fields) for (let i = 0; i < field.length; i++) if (field[i] > 0.5) count[k][i] += 1;
  let over = 0, covered = 0, mix = 0, mixBase = 0;
  for (let i = 0; i < sum.length; i++) {
    if (count[0][i] >= 1) covered += 1;
    if (count[0][i] >= 2) over += 1;
    if (count[1][i] >= 2) over += 1;
    mix += sum[i] - max[i]; mixBase += max[i];
  }
  // (c) Painted words of ancestors still drawn (not only their wash), in view and not under the map in view.
  const letters = [];
  for (const d of draws) {
    if (d.role !== "ancestor" || d.alpha * d.detail < 0.05) continue;
    const art = set.maps.get(d.id)?.art;
    for (const label of art?.paintedLabels ?? []) {
      const box = Array.isArray(label) ? label : label.plaque ?? label.box ?? label.rect;
      const target = Array.isArray(label) ? null : label.labelFor;
      if (!box || target === held.id) continue;
      const w = d.screen[2] - d.screen[0], h = d.screen[3] - d.screen[1];
      const s = [d.screen[0] + box[0] * w, d.screen[1] + box[1] * h, d.screen[0] + box[2] * w, d.screen[1] + box[3] * h];
      if (!hits(s, [0, 0, W, H]) || !hits(s, d.clip)) continue;
      if (opaque && s[0] >= core[0] && s[1] >= core[1] && s[2] <= core[2] && s[3] <= core[3]) continue;
      letters.push(`${d.id}:${box.map((v) => v.toFixed(2)).join(",")}`);
    }
  }
  pairs.sort((a, b) => b[1] - a[1]);
  // Two pictures of one place in the frame (same name), and a focus that reads blurred: drawn out of focus,
  // or see-through (its mask) over a blurred ancestor.
  const names = new Map();
  // An ancestor of the same name (the Maelstrom zone in the Maelstrom) is the backdrop, not a second picture.
  for (const d of draws) if (d.role !== "ancestor") names.set(d.name, [...(names.get(d.name) ?? []), d.id]);
  const duplicates = [...names.values()].filter((ids) => new Set(ids).size > 1).map((ids) => ids.join("/"));
  const blurry = held.blur >= 0.06 || (held.masked > 0.02 && draws.some((d) => d.role === "ancestor" && d.blur >= 0.06 && d.detail > 0.05 && hits(d.clip, core)));
  // Dark patches over the map in view: near-black share of its core, read back from a frame drawn just now
  // (what the canvas shows: transparent counts as dark, the page behind it is).
  let dark = 0;
  {
    e.dirty = true;
    e.render(performance.now());
    const gl = e.renderer.gl, k = e.dpr;
    const x0 = Math.max(0, Math.round(core[0] * k)), y0 = Math.max(0, Math.round(core[1] * k));
    const x1 = Math.min(gl.drawingBufferWidth, Math.round(core[2] * k)), y1 = Math.min(gl.drawingBufferHeight, Math.round(core[3] * k));
    if (x1 - x0 > 20 && y1 - y0 > 20) {
      const px = new Uint8Array((x1 - x0) * (y1 - y0) * 4);
      gl.readPixels(x0, gl.drawingBufferHeight - y1, x1 - x0, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 14) n += 1;
      dark = n / (px.length / 4);
    }
  }
  return { focus: comp.focus, core, dark, duplicates, blurry, foreign, overlap: covered ? over / covered : 0, mix: mixBase ? mix / mixBase : 0, letters, pairs: pairs.slice(0, 6).map(([k, v]) => `${k} ${(100 * v / Math.max(1, covered)).toFixed(1)}%`) };
}

/** The audit's classes (MAPQ4): a page can have several; OK only without any. */
function classify(r) {
  if (r.missing) return ["NOT-A-PAGE"];
  if (r.error || r.note) return ["OTHER"];
  const out = [];
  if (r.foreign.length || r.overlap > maxOverlap) out.push("OVERLAP-NEIGHBOUR");
  if (r.duplicates.length) out.push("DUPLICATE-PLACE");
  if (r.letters.length) out.push("PARENT-TEXT");
  if (r.blurry) out.push("BLURRY-FOCUS");
  if ((r.dark ?? 0) > 0.03) out.push("DARK-RECT");
  return out.length ? out : ["OK"];
}

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => { try { localStorage.setItem("gildra-consent", "denied"); } catch {} });
const results = [];
const queue = [...routes];
const work = async () => {
  for (let route = queue.shift(); route; route = queue.shift()) {
    const page = await context.newPage();
    const url = `${base}${route}${route.includes("?") ? "&" : "?"}debug`;
    let result;
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (response?.status() === 404) { result = { route, missing: true, ok: true, classes: ["NOT-A-PAGE"] }; results.push(result); console.log(`404  ${route}`); await page.close(); continue; }
      if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status()}`);
      await page.waitForFunction(() => { const e = window.__worldMap; return e && e.lastInfo && e.tiles.loadedCount > 4 && e.tiles.pending === 0 && !e.pending && !e.fromSet; }, null, { timeout: Number(args.wait ?? 120000), polling: 300 });
      await page.waitForTimeout(400);
      result = { route, ...(await page.evaluate(measure)) };
    } catch (error) {
      result = { route, error: String(error.message ?? error).split("\n")[0] };
    }
    result.classes = classify(result);
    result.ok = result.classes.length === 1 && result.classes[0] === "OK";
    results.push(result);
    console.log(`${result.ok ? "ok  " : "FAIL"} ${route} ${result.classes.join(",")}${result.error ? ` ${result.error}` : ` foreign ${result.foreign.length} overlap ${(result.overlap * 100).toFixed(1)}% letters ${result.letters.length} dark ${((result.dark ?? 0) * 100).toFixed(1)}%`}`);
    await page.close();
  }
};
await Promise.all(Array.from({ length: parallel }, work));
await browser.close();
const failed = results.filter((r) => !r.ok);
const classes = {};
for (const r of results) for (const c of r.classes) classes[c] = (classes[c] ?? 0) + 1;
const summary = {
  classes,
  pages: results.length, failed: failed.length,
  foreign: results.filter((r) => r.foreign?.length).length,
  overlap: results.filter((r) => r.overlap > maxOverlap).length,
  letters: results.filter((r) => r.letters?.length).length,
  errors: results.filter((r) => r.error).length,
  notPages: results.filter((r) => r.missing).length,
};
console.log(JSON.stringify(summary));
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ base, summary, results: results.sort((a, b) => a.route.localeCompare(b.route)) }, null, 1));
process.exit(failed.length ? 1 : 0);
