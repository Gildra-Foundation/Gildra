#!/usr/bin/env node
/**
 * Collects where every Midnight recipe is learned into data/wow/professions/sources/recipe-sources.json and applies it
 * to the profession files (data/wow/professions/<slug>.json → recipe.learn).
 *
 *   node apps/web/scripts/build-wow-profession-sources.mjs                    apply the saved facts only (no network)
 *   node apps/web/scripts/build-wow-profession-sources.mjs --wowhead-dir D    collect from saved Wowhead pages in D:
 *       items-all.html  (https://www.wowhead.com/items/recipes?filter=166;12;0 — every Midnight recipe item),
 *       npc=<id>.html   (vendor pages: the "sells" tab with costs and renown conditions),
 *       item=<id>.html  (recipe item pages: the "sold-by" tab).
 *     Names in Russian, NPC coordinates, currency names come from Wowhead tooltips (public JSON, cached), recipe items
 *     from the game tables (wago.tools, cached). Facts only — no text is copied.
 */
import fs from "node:fs";
import path from "node:path";
import { applyRecipeSources, parseCost, parseDiscovery, parseListviewTab, parseListviewVar, parseRenown } from "./wow-profession-sources.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.resolve(here, "..");
const outDir = path.join(web, "data/wow/professions");
const factsFile = path.join(outDir, "sources/recipe-sources.json");
const cacheDir = path.resolve(web, "../../.artifacts/professions-cache");
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const log = (...parts) => console.log("[recipe-sources]", ...parts);
const slugs = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf8")).map((p) => p.slug);
const professionFile = (slug) => path.join(outDir, `${slug}.json`);

/** Discovery stations by the name their recipes show, checked on Wowhead NPC pages. */
const STATIONS = { "Camberon's Cauldron": 247420 };
/** Wowhead zone (area) → the world map TomTom's /way understands. */
const AREA_MAPS = { 15969: 2393, 15968: 2395, 15947: 2437, 15355: 2413, 15458: 2405, 16365: 2512 };

async function fetchText(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Gildra professions builder)" }, signal: AbortSignal.timeout(120_000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

async function csv(table, locale = "enUS") {
  const file = path.join(cacheDir, "db2", `${table}${locale === "enUS" ? "" : `.${locale}`}.csv`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    log("download", table, locale);
    fs.writeFileSync(file, await fetchText(`https://wago.tools/db2/${table}/csv${locale === "enUS" ? "" : `?locale=${locale}`}`));
  }
  // Quoted fields may hold commas and line breaks.
  const text = fs.readFileSync(file, "utf8"), rows = [];
  let fields = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { fields.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; fields.push(field); field = ""; if (fields.length > 1 || fields[0]) rows.push(fields); fields = []; }
    else field += ch;
  }
  if (field || fields.length) { fields.push(field); rows.push(fields); }
  const [header, ...body] = rows;
  return body.map((f) => Object.fromEntries(header.map((h, i) => [h, f[i] ?? ""])));
}

const tooltipQueue = [];
let tooltipActive = 0;
async function tooltip(kind, id, locale) {
  const file = path.join(cacheDir, "tooltips", `${kind}-${id}-${locale}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  while (tooltipActive >= 6) await new Promise((resolve) => tooltipQueue.push(resolve));
  tooltipActive++;
  try {
    const text = await fetchText(`https://nether.wowhead.com/tooltip/${kind}/${id}?dataEnv=1&locale=${locale}`);
    const value = text ? JSON.parse(text) : { missing: true };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
    return value;
  } finally { tooltipActive--; tooltipQueue.shift()?.(); }
}

async function collect(dir) {
  const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");
  const professions = slugs.map((slug) => JSON.parse(fs.readFileSync(professionFile(slug), "utf8")));
  const recipes = new Map(professions.flatMap((p) => p.recipes.map((r) => [r.spell, { ...r, profession: p.slug }])));

  // Recipe items: an item whose learn effect (trigger 6) is the recipe spell.
  const effects = new Map((await csv("ItemEffect")).filter((r) => r.TriggerType === "6" && recipes.has(Number(r.SpellID))).map((r) => [r.ID, Number(r.SpellID)]));
  const itemSpell = new Map();
  for (const row of await csv("ItemXItemEffect")) if (effects.has(row.ItemEffectID)) itemSpell.set(Number(row.ItemID), effects.get(row.ItemEffectID));

  const facts = new Map();
  const fact = (spell) => { if (!facts.has(spell)) facts.set(spell, {}); return facts.get(spell); };

  // Vendors: NPC "sells" tabs (cost, renown condition), then item "sold-by" tabs, then the list's own source notes.
  const vendorInfo = new Map();
  const offers = new Map(); // spell → [{ npc, cost, renown }]
  const offer = (spell, npc, cost, renown) => {
    if (!offers.has(spell)) offers.set(spell, []);
    const list = offers.get(spell);
    const old = list.find((o) => o.npc === npc);
    if (old) { old.cost ??= cost; old.renown ??= renown; } else list.push({ npc, cost, renown });
  };
  for (const file of fs.readdirSync(dir).filter((f) => /^npc=\d+\.html$/.test(f))) {
    const npc = Number(file.match(/\d+/)[0]);
    for (const row of parseListviewTab(read(file), "sells")) {
      const spell = itemSpell.get(row.id);
      if (spell) offer(spell, npc, row.cost ? parseCost(row.cost) : null, parseRenown((row.playerConditions ?? []).join(" ")));
    }
  }
  for (const file of fs.readdirSync(dir).filter((f) => /^item=\d+\.html$/.test(f))) {
    const html = read(file), spell = itemSpell.get(Number(file.match(/\d+/)[0]));
    if (!spell) continue;
    const renown = parseRenown(html);
    for (const row of parseListviewTab(html, "sold-by")) {
      vendorInfo.set(row.id, { tag: row.tag ?? "", zones: row.location ?? [] });
      offer(spell, row.id, row.cost ? parseCost(row.cost) : null, renown);
    }
  }
  const listItems = fs.existsSync(path.join(dir, "items-all.html")) ? parseListviewVar(read("items-all.html"), "items") : [];
  for (const item of listItems) {
    const spell = itemSpell.get(item.id);
    if (!spell) continue;
    const more = item.sourcemore ?? [];
    // The skill the recipe item requires (the recipe lists' "learned at" is only the recipe's yellow threshold).
    if (item.reqskillrank > 1) fact(spell).learnedAt = item.reqskillrank;
    if ((item.source ?? []).includes(5)) for (const m of more) if (m.t === 1 && m.ti) offer(spell, m.ti, item.buyprice > 10 ? { gold: item.buyprice } : null, null);
    if ((item.source ?? []).includes(2) && !(item.source ?? []).includes(5)) {
      const drops = more.filter((m) => m.t || m.z).map((m) => ({ kind: m.t === 1 ? "npc" : m.t === 2 ? "object" : m.t === 3 ? "container" : "zone", id: m.ti ?? null, zone: m.z ?? null, name: m.n ?? null }));
      fact(spell).dropsRaw = drops.length ? drops : [{ kind: "unknown" }];
    }
  }
  // Renown conditions also stand in the recipe item tooltips.
  for (const [item, spell] of itemSpell) {
    const tip = await tooltip("item", item, 0);
    const renown = parseRenown(tip.tooltip);
    if (renown) for (const o of offers.get(spell) ?? []) o.renown ??= renown;
    if (renown && !offers.has(spell)) fact(spell).renown = renown;
  }

  // Place of every NPC we name.
  const npcIds = new Set([...offers.values()].flat().map((o) => o.npc));
  Object.values(STATIONS).forEach((id) => npcIds.add(id));
  const areas = new Map((await csv("AreaTable")).map((r) => [Number(r.ID), r.AreaName_lang]));
  const areasRu = new Map((await csv("AreaTable", "ruRU")).map((r) => [Number(r.ID), r.AreaName_lang]));
  const uiMaps = new Map((await csv("UiMap")).map((r) => [Number(r.ID), r.Name_lang]));
  const uiMapsRu = new Map((await csv("UiMap", "ruRU")).map((r) => [Number(r.ID), r.Name_lang]));
  const zoneOf = (area) => {
    const map = AREA_MAPS[area];
    if (map) return { map, zone: { en: uiMaps.get(map) ?? "", ru: uiMapsRu.get(map) || uiMaps.get(map) || "" } };
    const en = areas.get(area);
    return en ? { zone: { en, ru: areasRu.get(area) || en } } : null;
  };
  const places = {};
  for (const npc of [...npcIds].sort((a, b) => a - b)) {
    const [en, ru] = await Promise.all([tooltip("npc", npc, 0), tooltip("npc", npc, 7)]);
    if (en.missing) continue;
    const area = en.map?.zone ?? vendorInfo.get(npc)?.zones?.[0];
    const where = area ? zoneOf(area) : null;
    const coords = en.map?.coords ? Object.values(en.map.coords)[0]?.[0] : null;
    places[npc] = { npc, name: { en: en.name, ru: ru.name || en.name }, ...(where?.zone ? { zone: where.zone } : {}),
      ...(where?.map && coords ? { map: where.map, x: coords[0], y: coords[1] } : {}) };
  }

  // Per recipe: vendors (those with a waypoint first, renown quartermasters in their own zone before Silvermoon; at most two), cost, renown.
  const silvermoon = 2393;
  for (const [spell, list] of offers) {
    const named = list.filter((o) => places[o.npc]);
    if (!named.length) continue;
    named.sort((a, b) => Number(!places[a.npc].map) - Number(!places[b.npc].map) || Number(places[a.npc].map === silvermoon) - Number(places[b.npc].map === silvermoon) || a.npc - b.npc);
    const f = fact(spell);
    f.vendors = named.slice(0, 2).map((o) => o.npc);
    const cost = named.find((o) => o.cost)?.cost;
    if (cost && Object.keys(cost).length) f.cost = cost;
    const renown = named.find((o) => o.renown)?.renown;
    if (renown) f.renown = renown;
  }

  // Drops: name the NPC, container or zone in both languages.
  for (const f of facts.values()) {
    if (!f.dropsRaw) continue;
    const drops = [];
    for (const d of f.dropsRaw) {
      if (d.kind === "npc" || d.kind === "container" || d.kind === "object") {
        const kind = d.kind === "container" ? "item" : d.kind;
        const [en, ru] = await Promise.all([tooltip(kind, d.id, 0), tooltip(kind, d.id, 7)]);
        const name = en.missing ? d.name : en.name;
        if (name) drops.push({ kind: d.kind, name: { en: name, ru: (!ru.missing && ru.name) || name }, ...(d.zone && zoneOf(d.zone) ? { zone: zoneOf(d.zone).zone } : {}) });
      } else if (d.kind === "zone" && zoneOf(d.zone)) drops.push({ kind: "zone", zone: zoneOf(d.zone).zone });
    }
    delete f.dropsRaw;
    f.drops = drops.length ? drops : [{ kind: "world" }];
  }

  // Discovery stations.
  for (const [spell, recipe] of recipes) {
    if (recipe.source !== "research") continue;
    const station = STATIONS[parseDiscovery((await tooltip("spell", spell, 0)).tooltip)];
    if (station) fact(spell).station = station;
  }

  // Currencies and items paid to vendors.
  const currencies = {}, costItems = {};
  for (const f of facts.values()) {
    for (const [id] of f.cost?.currencies ?? []) currencies[id] ??= null;
    for (const [id] of f.cost?.items ?? []) costItems[id] ??= null;
  }
  for (const id of Object.keys(currencies)) {
    const [en, ru] = await Promise.all([tooltip("currency", id, 0), tooltip("currency", id, 7)]);
    currencies[id] = { name: { en: en.name, ru: ru.name || en.name }, icon: en.icon ?? null };
  }
  for (const id of Object.keys(costItems)) {
    const [en, ru] = await Promise.all([tooltip("item", id, 0), tooltip("item", id, 7)]);
    costItems[id] = { name: { en: en.name, ru: ru.name || en.name }, icon: en.icon ?? null };
  }

  // Renown factions in Russian.
  const usedFactions = new Set([...facts.values()].map((f) => f.renown?.faction).filter(Boolean));
  const factionRows = await csv("Faction"), factionRu = new Map((await csv("Faction", "ruRU")).map((r) => [r.ID, r.Name_lang]));
  const factions = {};
  for (const name of [...usedFactions].sort()) {
    const row = factionRows.find((r) => r.Name_lang === name || r.Name_lang === `The ${name}`);
    factions[name] = { en: row?.Name_lang ?? name, ru: (row && factionRu.get(row.ID)) || name };
  }

  const sorted = Object.fromEntries([...facts].filter(([, f]) => Object.keys(f).length).sort((a, b) => a[0] - b[0]));
  return { places, currencies, costItems, factions, recipes: sorted };
}

const dir = option("--wowhead-dir");
if (dir) {
  const facts = await collect(dir);
  fs.writeFileSync(factsFile, `${JSON.stringify(facts, null, 0).replace(/},"(\d)/g, '},\n"$1')}\n`);
  log(`${Object.keys(facts.recipes).length} recipes, ${Object.keys(facts.places).length} places`);
}
const facts = JSON.parse(fs.readFileSync(factsFile, "utf8"));
for (const slug of slugs) {
  const data = JSON.parse(fs.readFileSync(professionFile(slug), "utf8"));
  fs.writeFileSync(professionFile(slug), `${JSON.stringify(applyRecipeSources(data, facts))}\n`);
}
log("applied to", slugs.length, "professions");
