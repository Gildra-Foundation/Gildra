#!/usr/bin/env node
/**
 * Builds apps/web/data/wow/professions/*.json — the Midnight professions pages' data.
 *
 *   node apps/web/scripts/build-wow-professions.mjs                 rebuild from cached inputs (downloads what is missing)
 *   node apps/web/scripts/build-wow-professions.mjs --refresh       download the game tables again
 *   node apps/web/scripts/build-wow-professions.mjs --wowhead-dir D parse saved Wowhead recipe lists (wh-spells-<slug>.html)
 *   SCRAPE_DO_TOKEN=… node … --scrape                               fetch the 13 Wowhead recipe lists through Scrape.do
 *
 * Inputs (facts only, no prose):
 *  - game tables (DB2) from wago.tools: skill lines, recipes with skill-up ranges, reagents and their quality ranks,
 *    crafted items, knowledge items and their points/flag quests, specialization trees with perks;
 *  - Wowhead recipe lists: how each recipe is learned (trainer, vendor, drop) and the trainer's price —
 *    extracted once into data/wow/professions/sources/wowhead-recipes.json so rebuilds cost nothing;
 *  - Wowhead tooltips (public JSON): Russian item names, icons, NPC names and coordinates;
 *  - HandyNotes: Midnight Treasures (pinned commit): treasure coordinates and flag quests;
 *  - sources/curated.json: trainers and book vendors checked on Wowhead;
 *  - sources/recipe-sources.json: where each recipe is learned (scripts/build-wow-profession-sources.mjs).
 * Caches live in .artifacts/professions-cache (git-ignored).
 */
import fs from "node:fs";
import path from "node:path";
import { parseHandyNotesKnowledge, parseWowheadSpellList } from "./wow-professions-parsers.mjs";
import { applyRecipeSources } from "./wow-profession-sources.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.resolve(here, "..");
const outDir = path.join(web, "data/wow/professions");
const sourcesDir = path.join(outDir, "sources");
const cacheDir = path.resolve(web, "../../.artifacts/professions-cache");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const refresh = flag("--refresh");
fs.mkdirSync(path.join(cacheDir, "db2"), { recursive: true });
fs.mkdirSync(path.join(cacheDir, "tooltips"), { recursive: true });

const curated = JSON.parse(fs.readFileSync(path.join(sourcesDir, "curated.json"), "utf8"));
const log = (...parts) => console.log("[professions]", ...parts);
const warnings = [];
const warn = (message) => { warnings.push(message); };

/* ---------------- fetching ---------------- */

async function fetchText(url, { headers = {}, attempts = 3, timeout = 120_000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Gildra professions builder)", ...headers }, signal: AbortSignal.timeout(timeout) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= attempts) throw new Error(`${url.replace(/token=[^&]+/, "token=…")}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

/** One game table as CSV from wago.tools (latest live build), cached. */
async function db2File(table, locale = "enUS") {
  const file = path.join(cacheDir, "db2", `${table}${locale === "enUS" ? "" : `.${locale}`}.csv`);
  if (refresh || !fs.existsSync(file)) {
    log("download", table, locale);
    const text = await fetchText(`https://wago.tools/db2/${table}/csv${locale === "enUS" ? "" : `?locale=${locale}`}`, { timeout: 600_000 });
    if (!text) throw new Error(`table ${table} not found`);
    fs.writeFileSync(file, text);
  }
  return file;
}

/** Streams a CSV and keeps the rows `keep` accepts (rows are objects keyed by the header). */
async function table(name, keep = () => true, locale = "enUS") {
  const text = fs.readFileSync(await db2File(name, locale), "utf8");
  const rows = [];
  let header = null, field = "", fields = [], quoted = false;
  const push = () => {
    if (!header) { header = fields; return; }
    if (fields.length === 1 && fields[0] === "") return;
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = fields[i] ?? "";
    if (keep(row)) rows.push(row);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { fields.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      fields.push(field); field = ""; push(); fields = [];
    } else field += ch;
  }
  if (field || fields.length) { fields.push(field); push(); }
  return rows;
}
const int = (value) => Number.parseInt(value, 10) || 0;
const num = (value) => Number.parseFloat(value) || 0;
const groupBy = (rows, key) => { const map = new Map(); for (const row of rows) { const k = row[key]; if (!map.has(k)) map.set(k, []); map.get(k).push(row); } return map; };

/** Wowhead tooltip JSON (public, no proxy): names in a locale, icon, quality, NPC coordinates. */
const tooltipQueue = [];
let tooltipActive = 0;
async function tooltip(kind, id, locale) {
  const file = path.join(cacheDir, "tooltips", `${kind}-${id}-${locale}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  while (tooltipActive >= 6) await new Promise((resolve) => tooltipQueue.push(resolve));
  tooltipActive++;
  try {
    const text = await fetchText(`https://nether.wowhead.com/tooltip/${kind}/${id}?dataEnv=1&locale=${locale}`, { timeout: 30_000 });
    const value = text ? JSON.parse(text) : { missing: true };
    fs.writeFileSync(file, JSON.stringify(value));
    return value;
  } finally { tooltipActive--; tooltipQueue.shift()?.(); }
}

/* ---------------- Wowhead recipe lists ---------------- */

const wowheadUrl = (slug) => slug === "cooking" ? "https://www.wowhead.com/spells/secondary-skills/cooking/midnight-cooking"
  : `https://www.wowhead.com/spells/professions/${slug}/midnight-${slug}`;

async function wowheadFacts(professions, recipeSpells) {
  const file = path.join(sourcesDir, "wowhead-recipes.json");
  const dir = option("--wowhead-dir");
  if (!dir && !flag("--scrape")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const facts = {};
  for (const profession of professions) {
    if (profession.slug === "fishing") continue;
    let html;
    const saved = dir && path.join(dir, `wh-spells-${profession.slug}.html`);
    if (saved && fs.existsSync(saved)) html = fs.readFileSync(saved, "utf8");
    else {
      const token = process.env.SCRAPE_DO_TOKEN;
      if (!token) throw new Error(`no saved list for ${profession.slug} and SCRAPE_DO_TOKEN is not set`);
      html = await fetchText(`https://api.scrape.do/?token=${token}&url=${encodeURIComponent(wowheadUrl(profession.slug))}`, { attempts: 2 });
    }
    for (const entry of parseWowheadSpellList(html)) {
      if (!recipeSpells.has(entry.id)) continue;
      facts[entry.id] = {
        source: entry.source ?? [],
        ...(entry.trainingcost ? { trainingCost: entry.trainingcost } : {}),
        ...(entry.creates ? { creates: entry.creates } : {}),
        ...(entry.reagents ? { reagents: entry.reagents } : {}),
        ...(entry.colors ? { colors: entry.colors } : {}),
      };
    }
  }
  const sorted = Object.fromEntries(Object.entries(facts).sort((a, b) => Number(a[0]) - Number(b[0])));
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 0).replace(/},"/g, '},\n"')}\n`);
  return sorted;
}

/* ---------------- HandyNotes treasures ---------------- */

async function handyNotes(name) {
  const { repo, commit } = curated.handynotes;
  const file = path.join(cacheDir, `handynotes-${commit.slice(0, 8)}-${name.replaceAll("/", "-")}`);
  if (!fs.existsSync(file)) {
    const text = await fetchText(`https://raw.githubusercontent.com/${repo}/${commit}/${name}`);
    if (!text) throw new Error(`HandyNotes file ${name} not found`);
    fs.writeFileSync(file, text);
  }
  return fs.readFileSync(file, "utf8");
}

/* ---------------- text helpers ---------------- */

/** Russian plural form for a number. */
function ruPlural(n, forms) {
  const [one, few, many] = [forms[0], forms[1] ?? forms[0], forms[2] ?? forms[1] ?? forms[0]];
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** Game text with its tokens resolved: effect values/names, spell names, colours, line breaks, plurals. */
function resolveText(text, { effects = [], spellName = () => null, lang }) {
  if (!text) return "";
  let value = text
    .replace(/\$@spellname(\d+)/g, (_, id) => spellName(Number(id)) ?? "")
    .replace(/\$ev(\d)/g, (_, i) => String(effects[Number(i) - 1]?.amount ?? ""))
    .replace(/\$en(\d)/g, (_, i) => effects[Number(i) - 1]?.name ?? "")
    .replace(/\|c[0-9a-fA-F]{8}/g, "").replace(/\|r/g, "").replace(/\|n/g, "\n")
    .replace(/\|T[^|]*\|t/g, "");
  // Plurals: "|4point:points;" (EN) and "|4очко:очка:очков;" (RU) follow the number before them.
  value = value.replace(/(\d+)([^\d|]*?)\|4([^;]+);/g, (_, n, gap, forms) => {
    const list = forms.split(":");
    return `${n}${gap}${lang === "ru" ? ruPlural(Number(n), list) : Number(n) === 1 ? list[0] : list[1] ?? list[0]}`;
  });
  return value.replace(/\$[a-zA-Z]+\d*/g, "").replace(/[ \t]+/g, " ").replace(/ +\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const clean = (value) => (value ?? "").trim();

/* ---------------- build ---------------- */

const professions = curated.professions;
const skillLines = new Set(professions.map((p) => String(p.skillLine)));
const baseSkillLines = new Set(professions.map((p) => String(p.id)));

log("reading game tables…");
const skillLineRows = await table("SkillLine", (r) => skillLines.has(r.ID) || baseSkillLines.has(r.ID));
const skillLineRu = new Map((await table("SkillLine", (r) => skillLines.has(r.ID) || baseSkillLines.has(r.ID), "ruRU")).map((r) => [r.ID, r.DisplayName_lang]));
const abilities = await table("SkillLineAbility", (r) => skillLines.has(r.SkillupSkillLineID) || skillLines.has(r.SkillLine));
const recipeSpells = new Set(abilities.map((r) => int(r.Spell)));

// Specialization trees and their spells.
const lineTrees = groupBy(await table("SkillLineXTraitTree", (r) => skillLines.has(r.SkillLineID)), "SkillLineID");
const treeIds = new Set([...lineTrees.values()].flat().map((r) => r.TraitTreeID));
const traitNodes = await table("TraitNode", (r) => treeIds.has(r.TraitTreeID));
const nodeIds = new Set(traitNodes.map((n) => n.ID));
const nodeEntries = groupBy(await table("TraitNodeXTraitNodeEntry", (r) => nodeIds.has(r.TraitNodeID)), "TraitNodeID");
const entryIds = new Set([...nodeEntries.values()].flat().map((r) => r.TraitNodeEntryID));
const entries = new Map((await table("TraitNodeEntry", (r) => entryIds.has(r.ID))).map((r) => [r.ID, r]));
const definitionIds = new Set([...entries.values()].map((e) => e.TraitDefinitionID));
const definitions = new Map((await table("TraitDefinition", (r) => definitionIds.has(r.ID))).map((r) => [r.ID, r]));
const definitionsRu = new Map((await table("TraitDefinition", (r) => definitionIds.has(r.ID), "ruRU")).map((r) => [r.ID, r]));
const edges = (await table("TraitEdge", (r) => nodeIds.has(r.LeftTraitNodeID) && nodeIds.has(r.RightTraitNodeID)));
const nodeConds = groupBy(await table("TraitNodeXTraitCond", (r) => nodeIds.has(r.TraitNodeID)), "TraitNodeID");
const condIds = new Set([...nodeConds.values()].flat().map((r) => r.TraitCondID));
const conds = new Map((await table("TraitCond", (r) => condIds.has(r.ID))).map((r) => [r.ID, r]));
const professionTraits = new Map((await table("ProfessionTrait", (r) => definitionIds.has(r.TraitDefinitionID))).map((r) => [r.TraitDefinitionID, r.ID]));
const traitIds = new Set(professionTraits.values());
const traitEffects = groupBy(await table("ProfessionTraitXEffect", (r) => traitIds.has(r.ProfessionTraitID)), "ProfessionTraitID");
const effectRows = new Map((await table("ProfessionEffect")).map((r) => [r.ID, r]));
const effectTypes = new Map((await table("ProfessionEffectType")).map((r) => [r.EnumID, r.Name_lang]));
const effectTypesRu = new Map((await table("ProfessionEffectType", () => true, "ruRU")).map((r) => [r.EnumID, r.Name_lang]));
for (const def of definitions.values()) if (int(def.SpellID)) recipeSpells.add(int(def.SpellID));

// Knowledge spells and their items.
const knowledgePattern = /Study to increase your Midnight (\w+) Knowledge/;
const knowledgeSpells = new Map((await table("Spell", (r) => knowledgePattern.test(r.Description_lang))).map((r) => [int(r.ID), r.Description_lang.match(knowledgePattern)[1].toLowerCase()]));
const spellIds = new Set([...recipeSpells, ...knowledgeSpells.keys()].map(String));
const spellNames = new Map((await table("SpellName", (r) => spellIds.has(r.ID))).map((r) => [int(r.ID), r.Name_lang]));
const spellNamesRu = new Map((await table("SpellName", (r) => spellIds.has(r.ID), "ruRU")).map((r) => [int(r.ID), r.Name_lang]));
const spellEffects = groupBy(await table("SpellEffect", (r) => spellIds.has(r.SpellID)), "SpellID");
const spellReagents = new Map((await table("SpellReagents", (r) => spellIds.has(r.SpellID))).map((r) => [r.SpellID, r]));
const spellSlots = groupBy(await table("ModifiedCraftingSpellSlot", (r) => spellIds.has(r.SpellID)), "SpellID");
const reagentSlots = new Map((await table("ModifiedCraftingReagentSlot")).map((r) => [r.ID, r]));
const slotCategories = groupBy(await table("MCRSlotXMCRCategory"), "ModifiedCraftingReagentSlotID");
const qualityRows = await table("CraftingReagentQuality");
const categoryItems = groupBy(qualityRows, "ModifiedCraftingCategoryID");
const itemCategory = new Map(qualityRows.map((r) => [int(r.ItemID), r.ModifiedCraftingCategoryID]));
const craftingData = new Map((await table("CraftingData")).map((r) => [r.ID, r]));
const craftingItems = groupBy(await table("CraftingDataItemQuality"), "CraftingDataID");
const enchantItems = groupBy(await table("CraftingDataEnchantQuality"), "CraftingDataID");
const categories = new Map((await table("TradeSkillCategory")).map((r) => [r.ID, r]));
const categoriesRu = new Map((await table("TradeSkillCategory", () => true, "ruRU")).map((r) => [r.ID, r.Name_lang]));
const itemEffects = new Map((await table("ItemEffect", (r) => knowledgeSpells.has(int(r.SpellID)))).map((r) => [r.ID, int(r.SpellID)]));
const knowledgeItems = new Map();
for (const row of await table("ItemXItemEffect", (r) => itemEffects.has(r.ItemEffectID))) {
  const spell = itemEffects.get(row.ItemEffectID);
  if (!knowledgeItems.has(spell)) knowledgeItems.set(spell, []);
  knowledgeItems.get(spell).push(int(row.ItemID));
}
const uiMaps = new Map((await table("UiMap")).map((r) => [int(r.ID), r.Name_lang]));
const uiMapsRu = new Map((await table("UiMap", () => true, "ruRU")).map((r) => [int(r.ID), r.Name_lang]));

const spellName = (lang) => (id) => (lang === "ru" ? spellNamesRu.get(id) : null) || spellNames.get(id) || null;
const rankItems = (itemId) => {
  const category = itemCategory.get(itemId);
  if (!category) return [itemId];
  return categoryItems.get(category).sort((a, b) => int(a.OrderIndex) - int(b.OrderIndex)).map((r) => int(r.ItemID));
};

/** Required reagents of a recipe: plain reagents plus the quality-ranked basic slots, each with every rank. */
function reagentsOf(spell) {
  const list = [];
  const plain = spellReagents.get(String(spell));
  if (plain) for (let i = 0; i < 8; i++) {
    const item = int(plain[`Reagent_${i}`]), qty = int(plain[`ReagentCount_${i}`]);
    if (item > 0 && qty > 0) list.push({ item, qty, ranks: rankItems(item) });
  }
  for (const slot of (spellSlots.get(String(spell)) ?? []).sort((a, b) => int(a.Slot) - int(b.Slot))) {
    const meta = reagentSlots.get(slot.ModifiedCraftingReagentSlotID);
    if (!meta || meta.ReagentType !== "1" || int(slot.ReagentCount) < 1) continue;
    const category = (slotCategories.get(slot.ModifiedCraftingReagentSlotID) ?? []).sort((a, b) => int(a._Order) - int(b._Order))[0];
    const items = category ? (categoryItems.get(category.ModifiedCraftingCategoryID) ?? []).sort((a, b) => int(a.OrderIndex) - int(b.OrderIndex)).map((r) => int(r.ItemID)) : [];
    if (!items.length) { warn(`spell ${spell}: required slot ${meta.Name_lang} has no items`); continue; }
    list.push({ item: items[0], qty: int(slot.ReagentCount), ranks: items });
  }
  return list;
}

/** What a recipe makes: item ranks and quantity per craft. */
function outputOf(spell, wowhead) {
  for (const effect of spellEffects.get(String(spell)) ?? []) {
    const qty = num(effect.EffectBasePointsF);
    if (effect.Effect === "288") {
      const data = craftingData.get(effect.EffectMiscValue_0);
      let ranks = (craftingItems.get(effect.EffectMiscValue_0) ?? []).map((r) => int(r.ItemID)).sort((a, b) => a - b);
      if (!ranks.length) ranks = (enchantItems.get(effect.EffectMiscValue_0) ?? []).sort((a, b) => int(a.Rank) - int(b.Rank)).map((r) => int(r.ItemID)).filter(Boolean);
      if (!ranks.length && data && int(data.CraftedItemID)) ranks = [int(data.CraftedItemID)];
      if (ranks.length) return { item: ranks[0], qty: Math.max(1, qty), ranks };
    }
    if (effect.Effect === "24" && int(effect.EffectItemType)) return { item: int(effect.EffectItemType), qty: Math.max(1, qty), ranks: [int(effect.EffectItemType)] };
  }
  if (wowhead?.creates?.[0]) return { item: wowhead.creates[0], qty: Math.max(1, (wowhead.creates[1] + wowhead.creates[2]) / 2), ranks: [wowhead.creates[0]] };
  return null;
}

const wowhead = await wowheadFacts(professions, recipeSpells);

log("specialization trees…");
const specRecipeSpells = new Set();
function effectsOf(definitionId, lang) {
  const trait = professionTraits.get(definitionId);
  return (traitEffects.get(trait) ?? []).sort((a, b) => int(a.ID) - int(b.ID)).map((link) => {
    const effect = effectRows.get(link.ProfessionEffectID);
    const typeId = effect?.ProfessionEffectTypeEnumID;
    return { amount: num(effect?.Amount), name: (lang === "ru" ? effectTypesRu.get(typeId) : null) || effectTypes.get(typeId) || "" };
  });
}
function definitionText(definitionId) {
  const en = definitions.get(definitionId), ru = definitionsRu.get(definitionId);
  const text = (lang) => resolveText(lang === "ru" ? ru?.OverrideDescription_lang || en?.OverrideDescription_lang : en?.OverrideDescription_lang,
    { effects: effectsOf(definitionId, lang), spellName: spellName(lang), lang });
  return { name: { en: clean(en?.OverrideName_lang), ru: clean(ru?.OverrideName_lang) || clean(en?.OverrideName_lang) }, text: { en: text("en"), ru: text("ru") }, spell: int(en?.SpellID) };
}
function specializationTrees(skillLine) {
  const trees = (lineTrees.get(String(skillLine)) ?? []).map((r) => r.TraitTreeID);
  return trees.map((treeId) => {
    const nodes = traitNodes.filter((n) => n.TraitTreeID === treeId);
    const ids = new Set(nodes.map((n) => n.ID));
    const ranked = new Map(), perks = [];
    for (const node of nodes) {
      const list = (nodeEntries.get(node.ID) ?? []).map((x) => entries.get(x.TraitNodeEntryID)).filter(Boolean);
      const rank = list.find((e) => e.NodeEntryType === "7");
      if (rank) {
        const info = definitionText(rank.TraitDefinitionID);
        const intro = list.find((e) => e.NodeEntryType === "9");
        const introText = intro ? definitionText(intro.TraitDefinitionID).text : null;
        ranked.set(node.ID, { id: int(node.ID), name: info.name, text: info.text.en ? info.text : introText ?? info.text, ranks: int(rank.MaxRanks), perks: [], children: [] });
        continue;
      }
      const perk = list.find((e) => e.NodeEntryType === "8");
      if (!perk) continue;
      const cond = (nodeConds.get(node.ID) ?? []).map((x) => conds.get(x.TraitCondID)).find((c) => c && c.CondType === "2" && ids.has(c.TraitNodeID));
      if (!cond) { warn(`tree ${treeId}: perk node ${node.ID} has no threshold`); continue; }
      const info = definitionText(perk.TraitDefinitionID);
      if (info.spell && recipeSpells.has(info.spell)) specRecipeSpells.add(info.spell);
      perks.push({ parent: cond.TraitNodeID, at: int(cond.SpentAmountRequired), text: info.text, ...(info.spell ? { recipe: info.spell } : {}) });
    }
    for (const perk of perks) {
      const parent = ranked.get(perk.parent);
      if (!parent) { warn(`tree ${treeId}: perk parent ${perk.parent} is not a ranked node`); continue; }
      parent.perks.push({ at: perk.at, text: perk.text, ...(perk.recipe ? { recipe: perk.recipe } : {}) });
    }
    const childIds = new Set();
    for (const edge of edges) {
      const parent = ranked.get(edge.LeftTraitNodeID), child = ranked.get(edge.RightTraitNodeID);
      if (parent && child) { parent.children.push(child); childIds.add(edge.RightTraitNodeID); }
    }
    for (const node of ranked.values()) {
      node.perks.sort((a, b) => a.at - b.at);
      node.children.sort((a, b) => a.id - b.id);
    }
    const roots = [...ranked.entries()].filter(([id]) => !childIds.has(id)).map(([, node]) => node);
    if (roots.length !== 1) warn(`tree ${treeId}: ${roots.length} roots`);
    return roots[0];
  }).filter(Boolean);
}

/** How a recipe is learned. */
function sourceOf(spell, ability) {
  const facts = wowhead[spell]?.source ?? [];
  if (facts.includes(6)) return "trainer";
  if (facts.includes(10) || ability.AcquireMethod === "1") return "start";
  if (specRecipeSpells.has(spell)) return "specialization";
  if (facts.includes(5)) return "vendor";
  if (facts.includes(4)) return "quest";
  if (facts.length) return "drop";
  return "research";
}

/* ---------------- per profession ---------------- */

const zoneMaps = { SILVERMOONCITY: 2393, EVERSONGWOODS: 2395, ZULAMAN: 2437, ATALAMAN: 2536, HARANDAR: 2413, HARANDARDEN: 2576, VOIDSTORM: 2405,
  SLAYERSRISE: 2444, ISLEOFQUELDANAS: 2424, ARCANTINA: 2541, VOIDSTORM_VAL: 2599, VOIDSTORM_NAIGTAL: 2600, COILEDISLE: 2512, VAULTSOFATALUTEK: 2509, QUELTHALAS: 2537 };
/** Wowhead zone (area) → the world map TomTom's /way understands. */
const areaMaps = { 15969: 2393, 15968: 2395, 15947: 2437, 15355: 2413, 15458: 2405, 16365: 2512 };
const zoneName = (map) => ({ en: uiMaps.get(map) ?? "", ru: uiMapsRu.get(map) || uiMaps.get(map) || "" });

async function npcPlace(id) {
  const [en, ru] = await Promise.all([tooltip("npc", id, 0), tooltip("npc", id, 7)]);
  if (en.missing || !en.map?.zone) throw new Error(`NPC ${id} has no location`);
  const map = areaMaps[en.map.zone];
  if (!map) throw new Error(`NPC ${id}: unknown zone ${en.map.zone}`);
  const [x, y] = Object.values(en.map.coords)[0][0];
  return { npc: id, name: { en: en.name, ru: ru.name || en.name }, map, zone: zoneName(map), x, y };
}

const itemSparse = new Map();
const itemBase = new Map();
const items = new Map();
function wantItem(id) { if (id) items.set(id, null); }

const results = [];
const hn = Object.fromEntries(await Promise.all(professions.filter((p) => p.handynotes).map(async (p) => [p.slug, parseHandyNotesKnowledge(await handyNotes(`professions/${p.handynotes}.lua`), zoneMaps)])));

for (const profession of professions) {
  const line = String(profession.skillLine);
  const base = skillLineRows.find((r) => r.ID === String(profession.id));
  const name = { en: clean(base?.DisplayName_lang), ru: clean(skillLineRu.get(String(profession.id))) || clean(base?.DisplayName_lang) };
  const specializations = specializationTrees(profession.skillLine);
  const recipes = [];
  let mismatches = 0;
  for (const ability of abilities.filter((r) => r.SkillupSkillLineID === line)) {
    const spell = int(ability.Spell);
    const reagents = reagentsOf(spell);
    if (!reagents.length) continue;
    const facts = wowhead[spell];
    if (facts?.reagents) {
      const ours = new Map(reagents.map((r) => [r.item, r.qty]));
      if (facts.reagents.length !== reagents.length || facts.reagents.some(([item, qty]) => ours.get(item) !== qty)) mismatches++;
    }
    const output = outputOf(spell, facts);
    const category = categories.get(ability.TradeSkillCategoryID);
    const recipe = {
      id: int(ability.ID), spell,
      name: { en: spellNames.get(spell) ?? "", ru: spellNamesRu.get(spell) || spellNames.get(spell) || "" },
      category: { en: clean(category?.Name_lang), ru: clean(categoriesRu.get(ability.TradeSkillCategoryID)) || clean(category?.Name_lang) },
      yellow: int(ability.TrivialSkillLineRankLow), grey: int(ability.TrivialSkillLineRankHigh), ups: Math.max(1, int(ability.NumSkillUps)),
      source: sourceOf(spell, ability),
      ...(facts?.trainingCost ? { trainingCost: facts.trainingCost } : {}),
      reagents: reagents.map((r) => [r.item, r.qty]),
      ...(output ? { output: { item: output.item, qty: output.qty, ...(output.ranks.length > 1 ? { ranks: output.ranks } : {}) } } : {}),
    };
    if (!recipe.name.en) { warn(`${profession.slug}: recipe ${spell} has no name`); continue; }
    for (const reagent of reagents) { wantItem(reagent.item); itemBase.set(reagent.item, reagent.ranks); }
    if (output) { wantItem(output.item); itemBase.set(output.item, output.ranks); }
    recipes.push(recipe);
  }
  if (mismatches) warn(`${profession.slug}: ${mismatches} recipes whose reagents differ from Wowhead`);
  recipes.sort((a, b) => a.yellow - b.yellow || a.grey - b.grey || a.name.en.localeCompare(b.name.en));

  // Knowledge.
  const weekly = [], oneTime = [];
  const groups = [...knowledgeSpells].filter(([, prof]) => prof === profession.slug).map(([spell]) => {
    const effects = spellEffects.get(String(spell)) ?? [];
    return { spell, points: int(effects.find((e) => e.Effect === "157")?.EffectBasePointsF), quest: int(effects.find((e) => e.Effect === "16")?.EffectMiscValue_0), items: (knowledgeItems.get(spell) ?? []).sort((a, b) => a - b) };
  }).filter((g) => g.items.length && g.points > 0);
  const treasureItems = new Set((hn[profession.slug] ?? []).map((p) => p.item));
  for (const group of groups) {
    const names = await Promise.all(group.items.map((id) => tooltip("item", id, 0)));
    // An item Wowhead does not know is not in the game yet.
    group.items = group.items.filter((_, i) => !names[i].missing);
    const first = names.find((n) => !n.missing)?.name ?? "";
    if (!group.items.length) continue;
    if (group.items.some((id) => treasureItems.has(id))) continue;
    if (/^Flicker of|^Glimmer of/.test(first)) continue;
    const entry = (kind, extra = {}) => ({ kind, items: group.items, points: group.points, ...extra });
    if (/^Thalassian Treatise on /.test(first)) weekly.push(entry("treatise"));
    else if (/^Thalassian .*(Notebook|Notes|Folio|Journal|Notepad)$/.test(first)) weekly.push(entry("quest"));
    else if (group.points === 10) {
      const series = Object.keys(curated.bookVendors).find((key) => first.startsWith(`${key}:`));
      if (!series) { warn(`${profession.slug}: book ${first} has no checked vendor`); continue; }
      oneTime.push(entry("book", { vendor: await npcPlace(curated.bookVendors[series].npc) }));
    } else if (profession.kind === "gathering" || profession.slug === "enchanting") weekly.push(entry(profession.slug === "enchanting" ? "disenchanting" : "gathering"));
    else if (group.items.length === 2) weekly.push(entry("cache"));
    else warn(`${profession.slug}: unclassified knowledge item ${first}`);
    group.items.forEach(wantItem);
  }
  const treasures = (hn[profession.slug] ?? []).map((p) => ({ ...p, zone: zoneName(p.map), points: groups.find((g) => g.items.includes(p.item))?.points ?? 0 }));
  for (const t of treasures) { wantItem(t.item); if (!t.points) warn(`${profession.slug}: treasure item ${t.item} gives no knowledge`); }
  const order = { quest: 0, treatise: 1, cache: 2, gathering: 3, disenchanting: 3 };
  weekly.sort((a, b) => order[a.kind] - order[b.kind]);
  oneTime.sort((a, b) => a.items[0] - b.items[0]);

  results.push({ profession, name, recipes, specializations, knowledge: { weekly, oneTime, treasures }, trainer: await npcPlace(profession.trainer) });
}

log("items…");
const sparseIds = new Set();
for (const id of items.keys()) for (const rank of itemBase.get(id) ?? [id]) sparseIds.add(String(rank));
// Gathered goods: Midnight trade goods of the profession's subclass, rank 1 of each.
const gatherRows = await table("Item", (r) => professions.some((p) => p.gathers && r.ClassID === String(p.gathers.classId) && r.SubclassID === String(p.gathers.subclassId)));
const gatherCandidates = new Set(gatherRows.map((r) => r.ID));
for (const row of await table("ItemSparse", (r) => sparseIds.has(r.ID) || (gatherCandidates.has(r.ID) && r.ExpansionID === "11"))) itemSparse.set(int(row.ID), row);
const itemClass = new Map(gatherRows.map((r) => [int(r.ID), `${r.ClassID}:${r.SubclassID}`]));
for (const result of results) {
  const gathers = result.profession.gathers;
  if (!gathers) continue;
  const key = `${gathers.classId}:${gathers.subclassId}`;
  const ids = [...itemSparse.keys()].filter((id) => itemClass.get(id) === key && itemSparse.get(id).ExpansionID === "11");
  // Smelted bars and other crafted goods of the same subclass are not gathered.
  const crafted = new Set(results.flatMap((r) => r.recipes.flatMap((recipe) => recipe.output ? [recipe.output.item, ...(recipe.output.ranks ?? [])] : [])));
  const firsts = [...new Set(ids.map((id) => rankItems(id)[0]))].filter((id) => ids.includes(id) && !crafted.has(id) && !(curated.vendorReagents ?? []).includes(id) && int(itemSparse.get(id)?.Stackable) > 1)
    .filter((id) => result.profession.slug !== "fishing" || (curated.fish ?? []).includes(id));
  result.gathered = firsts.sort((a, b) => a - b);
  for (const id of firsts) { wantItem(id); itemBase.set(id, rankItems(id)); }
}

const itemList = [...items.keys()].sort((a, b) => a - b);
const itemInfo = new Map();
const vendorReagents = new Set(curated.vendorReagents ?? []);
await Promise.all(itemList.map(async (id) => {
  const [en, ru] = await Promise.all([tooltip("item", id, 0), tooltip("item", id, 7)]);
  const sparse = itemSparse.get(id);
  const nameEn = en.missing ? clean(sparse?.Display_lang) : en.name;
  if (!nameEn) { warn(`item ${id} has no name`); return; }
  const ranks = itemBase.get(id) ?? [id];
  const buy = int(sparse?.BuyPrice);
  itemInfo.set(id, {
    name: { en: nameEn, ru: (!ru.missing && ru.name) || nameEn }, icon: (!en.missing && en.icon) || (!ru.missing && ru.icon) || null,
    quality: en.missing ? int(sparse?.OverallQualityID) : en.quality ?? 1,
    ...(ranks.length > 1 ? { ranks } : {}),
    // Reagents checked on Wowhead as sold for gold by profession vendors; the page takes the cheaper of vendor and auction.
    ...(vendorReagents.has(id) && buy > 0 ? { vendor: buy } : {}),
  });
}));

/* ---------------- write ---------------- */

fs.mkdirSync(outDir, { recursive: true });
const recipeSourcesFile = path.join(sourcesDir, "recipe-sources.json");
const recipeSources = fs.existsSync(recipeSourcesFile) ? JSON.parse(fs.readFileSync(recipeSourcesFile, "utf8")) : null;
const index = [];
for (const result of results) {
  const { profession } = result;
  const used = new Set();
  for (const r of result.recipes) { r.reagents.forEach(([id]) => used.add(id)); if (r.output) used.add(r.output.item); }
  for (const k of [...result.knowledge.weekly, ...result.knowledge.oneTime]) k.items.forEach((id) => used.add(id));
  for (const t of result.knowledge.treasures) used.add(t.item);
  for (const id of result.gathered ?? []) used.add(id);
  const ownItems = Object.fromEntries([...used].sort((a, b) => a - b).filter((id) => itemInfo.has(id)).map((id) => [id, itemInfo.get(id)]));
  for (const r of result.recipes) for (const [id] of r.reagents) if (!ownItems[id]) warn(`${profession.slug}: reagent ${id} has no item record`);
  const raw = {
    slug: profession.slug, id: profession.id, kind: profession.kind, name: result.name, icon: profession.icon, maxSkill: 100,
    trainer: result.trainer, recipes: result.recipes, ...(result.gathered ? { gathered: result.gathered } : {}),
    knowledge: result.knowledge, specializations: result.specializations, items: ownItems,
  };
  const data = recipeSources ? applyRecipeSources(raw, recipeSources) : raw;
  fs.writeFileSync(path.join(outDir, `${profession.slug}.json`), `${JSON.stringify(data)}\n`);
  index.push({ slug: profession.slug, kind: profession.kind, name: result.name, icon: profession.icon, recipes: result.recipes.length,
    treasures: result.knowledge.treasures.length, specializations: result.specializations.length });
  log(profession.slug, `${result.recipes.length} recipes, ${result.knowledge.treasures.length} treasures, ${result.knowledge.weekly.length} weekly, ${result.knowledge.oneTime.length} one-time, ${result.specializations.length} trees`);
}
fs.writeFileSync(path.join(outDir, "index.json"), `${JSON.stringify(index, null, 1)}\n`);
if (warnings.length) { console.log(`[professions] ${warnings.length} warnings:`); for (const w of warnings) console.log("  -", w); }
