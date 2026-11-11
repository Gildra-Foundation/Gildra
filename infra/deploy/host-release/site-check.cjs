// Whole-site check of wowarcana.com: discover one sample URL per route template, then screenshot
// EN/RU × 1440/390 (MATRIX=full|half|rest|one|other) and collect status, overflow, console errors,
// broken images, junk text. SHOTS=0 takes no pictures, SHOTS=problems only of pages with a problem
// (a third of the check's time is the pictures), anything else of every page.
//   OUT=<dir> node site-check.cjs discover   -> urls.json
//   OUT=<dir> node site-check.cjs capture    -> shots/*.jpg + report.json
//   OUT=<dir> node site-check.cjs summary    -> prints problems, exit 1 if any
// BASE=http://127.0.0.1:<port> checks a candidate container instead of production.
const fs = require("fs");
const path = require("path");
const { chromium } = require("/home/debian/Gildra-atlas/node_modules/playwright");
const OUT = process.env.OUT || process.cwd();
const BASE = process.env.BASE || "https://wowarcana.com";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 GildraAudit";

const templates = [
  ["home", /^\/$/], ["analytics", /^\/analytics$/], ["api-console", /^\/api-console$/],
  ["blueprints", /^\/blueprints$/], ["blueprint", /^\/blueprints\/.+/], ["compare", /^\/compare$/],
  ["database", /^\/database$/], ["database-record", /^\/database\/[^/]+\/[^/]+\/[^/]+$/],
  ["dev-atlas", /^\/dev\/atlas$/], ["dev-blocks", /^\/dev\/blocks$/], ["diablo", /^\/diablo$/],
  ["games", /^\/games\/[^/]+$/], ["genshin", /^\/genshin$/], ["genshin-artifact", /^\/genshin\/artifacts\/[^/]+$/],
  ["genshin-character", /^\/genshin\/characters\/[^/]+$/], ["genshin-weapon", /^\/genshin\/weapons\/[^/]+$/],
  ["lol", /^\/league-of-legends$/], ["lol-champion", /^\/league-of-legends\/champions\/[^/]+$/],
  ["lol-content", /^\/league-of-legends\/content\/[^/]+$/], ["library", /^\/library$/],
  ["library-dataset", /^\/library\/[^/]+$/], ["library-record", /^\/library\/[^/]+\/[^/]+(\/[^/]+){1,2}$/],
  ["login", /^\/login$/], ["patches", /^\/patches$/], ["privacy", /^\/privacy$/], ["profile", /^\/profile\/[^/]+$/],
  ["search", /^\/search$/], ["spec", /^\/specs\/[^/]+$/], ["talents", /^\/talents\/[^/]+$/], ["tier-lists", /^\/tier-lists$/],
  ["wow", /^\/wow$/], ["auction", /^\/wow\/auction$/], ["characters", /^\/wow\/characters$/],
  ["character", /^\/wow\/characters\/[^/]+$/], ["classes", /^\/wow\/classes$/], ["class", /^\/wow\/classes\/[^/]+$/],
  ["class-spec", /^\/wow\/classes\/[^/]+\/[^/]+$/], ["delves", /^\/wow\/delves$/], ["delve", /^\/wow\/delves\/[^/]+$/],
  ["dungeons", /^\/wow\/dungeons$/], ["dungeon", /^\/wow\/dungeons\/[^/]+$/], ["gear", /^\/wow\/gear$/],
  ["lairs", /^\/wow\/lairs$/], ["lair", /^\/wow\/lairs\/[^/]+$/], ["season-2", /^\/wow\/midnight\/season-2$/],
  ["mythic", /^\/wow\/mythic$/], ["mythic-dungeon-legacy", /^\/wow\/mythic\/[^/]+$/], ["mythic-plus", /^\/wow\/mythic-plus$/],
  ["mythic-meta", /^\/wow\/mythic-plus\/meta$/], ["mplus-comps", /^\/wow\/mythic-plus\/comps$/], ["mplus-stats", /^\/wow\/mythic-plus\/stats$/], ["mplus-routes", /^\/wow\/mythic-plus\/routes$/], ["mplus-leaderboard", /^\/wow\/mythic-plus\/leaderboard$/], ["mythic-season", /^\/wow\/mythic-plus\/seasons\/[^/]+$/],
  ["mythic-route", /^\/wow\/mythic-plus\/(?!seasons\/|meta$)[^/]+\/[^/]+$/], ["prey", /^\/wow\/prey$/],
  ["raids", /^\/wow\/raids$/], ["raid-composition", /^\/wow\/raids\/composition$/], ["raid", /^\/wow\/raids\/(?!composition$)[^/]+$/], ["raid-boss", /^\/wow\/raids\/[^/]+\/[^/]+$/],
  ["rotation", /^\/wow\/rotation\/[^/]+$/], ["shared", /^\/wow\/shared\/[^/]+$/], ["stories", /^\/wow\/stories$/],
  ["transmog", /^\/wow\/transmog$/], ["whats-new", /^\/wow\/whats-new$/],
  ["world-map", /^\/wow\/map$/], ["world-map-zone", /^\/wow\/map\/[^/]+$/], ["professions", /^\/wow\/professions$/], ["profession", /^\/wow\/professions\/[^/]+$/],
];
// Extra fixed samples so every template family has more than one example where it matters.
const extra = [
  "/wow/raids/the-voidspire", "/wow/raids/venomous-abyss", "/wow/raids/sporefall", "/wow/mythic-plus/midnight-season-2/ruby-life-pools",
  "/library/items", "/library/spells", "/wow/classes/warrior", "/wow/classes/warrior/fury", "/talents/fury-warrior", "/wow/rotation/fury-warrior",
  "/specs/fury-warrior", "/games/world-of-warcraft", "/wow/professions", "/wow/professions/alchemy", "/wow/raids/composition", "/wow/map", "/wow/map/12-kalimdor", "/wow/mythic-plus/comps", "/wow/mythic-plus/stats", "/wow/mythic-plus/routes", "/wow/mythic-plus/leaderboard",
];

function classify(p) { for (const [id, re] of templates) if (re.test(p)) return id; return null; }

async function discover() {
  const seeds = ["/", "/wow", "/wow/raids", "/wow/mythic-plus", "/wow/classes", "/wow/delves", "/wow/dungeons", "/wow/lairs",
    "/library", "/library/items", "/library/spells", "/database", "/genshin", "/league-of-legends", "/blueprints", "/wow/stories",
    "/tier-lists", "/wow/characters", "/diablo", "/wow/mythic", "/wow/mythic-plus/meta", "/wow/whats-new", "/patches", "/wow/classes/warrior",
    "/wow/raids/the-voidspire", "/wow/midnight/season-2", "/dev/atlas", "/wow/gear", "/wow/prey", "/compare", "/analytics", "/search"];
  const found = new Map();
  const seen = new Set();
  const queue = [...seeds, ...extra];
  for (const p of [...seeds, ...extra]) { const id = classify(p); if (id && !found.has(id)) found.set(id, p); }
  let n = 0;
  // Eight pages at a time; the links are read in queue order, so the samples do not depend on timing.
  while (queue.length && n < 80) {
    const round = [];
    while (queue.length && round.length < 8 && n < 80) { const p = queue.shift(); if (seen.has(p)) continue; seen.add(p); n++; round.push(p); }
    const pages = await Promise.all(round.map((p) => fetch(BASE + p, { headers: { "user-agent": UA }, redirect: "follow" })
      .then((r) => r.text()).catch((e) => { console.error("discover", p, e.message); return ""; })));
    for (const html of pages) {
      for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        let link = m[1].replace(/\/$/, "") || "/";
        if (link.startsWith("/ru/")) link = link.slice(3); else if (link === "/ru") link = "/";
        if (/^\/(_next|api|assets|images)/.test(link)) continue;
        const id = classify(link);
        if (id && !found.has(id)) { found.set(id, link); queue.push(link); }
      }
    }
  }
  const urls = [...found.entries()].map(([id, p]) => ({ id, path: p }));
  for (const p of extra) if (!urls.some((u) => u.path === p)) urls.push({ id: classify(p) + "+", path: p });
  const missing = templates.map(([id]) => id).filter((id) => !found.has(id));
  fs.writeFileSync(path.join(OUT, "urls.json"), JSON.stringify({ urls, missing }, null, 2));
  console.log(urls.length, "urls; missing:", missing.join(", "));
}

async function capture() {
  const { urls } = JSON.parse(fs.readFileSync(path.join(OUT, "urls.json"), "utf8"));
  fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
  // Rendering is CPU-bound on this 4-core host (measured 2026-11-11: 10 pages at once were only
  // 12 % faster than 4, 12 pages in 4 browsers overloaded it), so the pool stays small.
  const pool = Number(process.env.POOL) || 6;
  const browsers = await Promise.all(Array.from({ length: Math.min(pool, Number(process.env.BROWSERS) || 2) }, () => chromium.launch()));
  const jobs = [];
  // MATRIX: full — all four variants of every template; half — English at 1440 and Russian at 390;
  // rest — the other two (English at 390, Russian at 1440); one — every template once, English at
  // 1440 for every even template and Russian at 390 for every odd one; other — the reverse of one.
  // half + rest = full, one + other = half.
  const matrix = process.env.MATRIX || "full";
  const wanted = (lang, w, index) => {
    const main = (lang === "en") === (w === 1440);
    if (matrix === "full") return true;
    if (matrix === "half" || matrix === "rest") return main === (matrix === "half");
    return main && ((lang === "en") === (index % 2 === 0)) === (matrix === "one");
  };
  urls.forEach((u, index) => { for (const lang of ["en", "ru"]) for (const w of [1440, 390]) if (wanted(lang, w, index)) jobs.push({ ...u, lang, w }); });
  const results = [];
  async function run(job, browser) {
    // A route removed on purpose is judged by its status alone: no page to render.
    if (REMOVED.includes(job.path)) {
      const url = BASE + (job.lang === "ru" ? "/ru" + job.path : job.path);
      const rec = { id: job.id, path: job.path, lang: job.lang, w: job.w, url, errors: [], failed: [] };
      const started = Date.now();
      rec.status = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" }).then((r) => r.status, (e) => { rec.error = e.message.slice(0, 300); return 0; });
      rec.ms = Date.now() - started;
      results.push(rec);
      process.stdout.write(`${results.length}/${jobs.length} ${rec.status || "ERR"} ${url} ${job.w}\n`);
      return;
    }
    const ctx = await browser.newContext({ viewport: { width: job.w, height: job.w === 390 ? 844 : 900 }, userAgent: UA, deviceScaleFactor: 1, isMobile: job.w === 390, hasTouch: job.w === 390 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
    const failed = [];
    page.on("response", (r) => { if (r.status() >= 400) { const u = new URL(r.url()); failed.push(`${r.status()} ${u.pathname}${u.search}`.slice(0, 200)); } });
    const url = BASE + (job.lang === "ru" ? (job.path === "/" ? "/ru" : "/ru" + job.path) : job.path);
    const rec = { id: job.id, path: job.path, lang: job.lang, w: job.w, url };
    const started = Date.now();
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      rec.status = resp ? resp.status() : 0;
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(800);
      Object.assign(rec, await page.evaluate(() => {
        const main = document.querySelector("main") || document.body;
        const vis = (el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length; };
        const markers = [...new Set([...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => /^data-(atlas|mythic|raid|library|auction|transmog|hub|frost|voidspire)/.test(n)))];
        const classes = [...new Set([...document.querySelectorAll("[class]")].flatMap((el) => String(el.className.baseVal ?? el.className).split(/\s+/)).map((c) => c.replace(/__[A-Za-z0-9_-]+$/, "")).filter((c) => /^[A-Za-z]/.test(c)))].slice(0, 400);
        return {
          title: document.title,
          h1: [...document.querySelectorAll("h1")].map((h) => h.innerText.trim()).join(" | "),
          headings: [...main.querySelectorAll("h2,h3")].filter(vis).map((h) => h.tagName + ": " + h.innerText.trim()).slice(0, 60),
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          height: document.documentElement.scrollHeight,
          images: document.images.length,
          brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc).slice(0, 10),
          detailsCount: main.querySelectorAll("details").length,
          markers, cssModules: classes.filter((c) => /_/.test(c)).map((c) => c.split("_")[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 80),
          text: main.innerText.replace(/\n{2,}/g, "\n").slice(0, 12000),
        };
      }));
    } catch (e) { rec.error = e.message.slice(0, 300); }
    // The host's network interfaces change while other jobs create Docker networks: Chromium
    // then aborts requests with ERR_NETWORK_CHANGED. That is not the site; load the page again,
    // three times at most.
    const attempt = job.attempt || 1;
    if (attempt < 3 && [...errors, rec.error || ""].some((e) => /ERR_NETWORK_CHANGED/.test(e))) { await ctx.close(); return run({ ...job, attempt: attempt + 1 }, browser); }
    rec.errors = errors.slice(0, 12);
    rec.failed = failed.slice(0, 12);
    if (attempt > 1) rec.attempts = attempt;
    const shots = process.env.SHOTS || "1";
    if (rec.height && shots !== "0" && (shots !== "problems" || problemsOf(rec).length)) {
      const file = `${job.id.replace(/\+$/, "")}-${job.path.split("/").filter(Boolean).slice(-1)[0] || "root"}-${job.lang}-${job.w}.jpg`.replace(/[^a-z0-9.+-]/gi, "_");
      const h = Math.min(rec.height, job.w === 390 ? 7000 : 5000);
      await page.screenshot({ path: path.join(OUT, "shots", file), type: "jpeg", quality: 60, clip: { x: 0, y: 0, width: job.w, height: h }, fullPage: true })
        .then(() => { rec.shot = "shots/" + file; }, (e) => { rec.shotError = e.message.slice(0, 200); });
    }
    rec.ms = Date.now() - started;
    await ctx.close();
    results.push(rec);
    process.stdout.write(`${results.length}/${jobs.length} ${rec.status || "ERR"} ${url} ${job.w}\n`);
  }
  let i = 0;
  await Promise.all(Array.from({ length: pool }, async (_, worker) => { while (i < jobs.length) { const j = jobs[i++]; await run(j, browsers[worker % browsers.length]); } }));
  await Promise.all(browsers.map((browser) => browser.close()));
  results.sort((a, b) => a.path.localeCompare(b.path) || a.lang.localeCompare(b.lang) || a.w - b.w);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
}

// Routes removed on purpose (2026-10-27): a 404 there is expected, a 200 is a regression.
const REMOVED = ["/analytics", "/blueprints", "/compare", "/patches", "/dev/atlas", "/diablo", "/games/world-of-warcraft",
  "/genshin", "/league-of-legends", "/wow/classes/warrior/fury"];
// Junk text (skill gildra-clean-ui): exact service/provenance phrases fail the release gate.
const JUNK = /(under review|provenance|fixture|unsaved|only fields confirmed|not verified|не проводилась|refreshing(?:…|\.\.\.|\s+(?:data|prices|history|profile))|lorem ipsum|\bTODO\b|\bundefined\b|\bNaN\b|\[object Object\]|GAME ID|Record data|data checked on|talent data:|data updated|data may lag|last updated|how it works|coming soon|powered by|fallback icon|Node #\d|данные обновлены|данные проверены|данные могут отставать|как это работает|в разработке|Данные забегов|Данные [A-Za-zА-Яа-я+.]+:|Назад к атласу|Back to the [A-Za-z+ ]+atlas|Sources and notes|Источники:|Run data:)/i;
// A candidate runs without the real Battle.net keys, so the live auction market answers 503 there
// and only there. Production gets no such allowance.
const NO_KEYS = /^http:\/\/127\.0\.0\.1/.test(BASE) ? /^503 \/api\/wow\/auction\?/ : null;
function problemsOf(x) {
  const problems = [];
  const where = `${x.path} ${x.lang} ${x.w}`;
  if (REMOVED.includes(x.path)) return x.status !== 404 ? [`removed route answers ${x.status}: ${where}`] : [];
  if (!x.status || x.status >= 400) problems.push(`status ${x.status || "ERR"}: ${where}`);
  if ((x.overflowX || 0) > 1) problems.push(`horizontal overflow ${x.overflowX}px: ${where}`);
  if ((x.brokenImages || []).length) problems.push(`broken images ${x.brokenImages.length}: ${where}`);
  const noKeys = NO_KEYS && (x.failed || []).length > 0 && x.failed.every((f) => NO_KEYS.test(f));
  for (const e of x.errors || []) if (!(noKeys && /status of 503/.test(e))) problems.push(`${e.slice(0, 140)}: ${where}`);
  const m = (x.text || "").match(JUNK); if (m) problems.push(`junk text "${m[0]}": ${where}`);
  return problems;
}
function summary() {
  const r = JSON.parse(fs.readFileSync(path.join(OUT, "report.json"), "utf8"));
  const problems = r.flatMap(problemsOf);
  const ok = r.filter((x) => !REMOVED.includes(x.path)).length;
  console.log(`${r.length} pages, ${ok} live pages, ${problems.length} problems`);
  for (const p of [...new Set(problems)].slice(0, 80)) console.log("  " + p);
  process.exit(problems.length ? 1 : 0);
}

({ discover, capture, summary }[process.argv[2]] || (() => { console.error("usage: discover|capture|summary"); process.exit(2); }))().catch((e) => { console.error(e); process.exit(1); });
