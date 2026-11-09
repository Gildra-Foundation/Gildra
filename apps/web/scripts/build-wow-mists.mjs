#!/usr/bin/env node
/**
 * Builds apps/web/data/wow/mists/*.json — the Mists of Pandaria Classic portal: classes, specializations
 * and the class talents (6 tiers × 3 choices) with their game descriptions in English and Russian.
 *
 *   node apps/web/scripts/build-wow-mists.mjs                 rebuild from cached inputs (downloads what is missing)
 *   node apps/web/scripts/build-wow-mists.mjs --refresh       download everything again
 *   node apps/web/scripts/build-wow-mists.mjs --max-characters N  stop the ladder walk after N characters (default 6000)
 *   node apps/web/scripts/build-wow-mists.mjs --db2 catalog   read the game tables from the local catalog database
 *                                                             (read-only, `sudo docker exec gildra-postgres-1 psql`)
 *
 * Inputs (facts only):
 *  - Blizzard Game Data API, namespace static-classic-us (BATTLENET_CLIENT_ID / BATTLENET_CLIENT_SECRET in the env):
 *    classes, specializations, roles, talent tiers and talent names in both languages; the namespace names the build;
 *  - Blizzard character profile API (profile-classic): the spell and the game's resolved tooltip of each talent, in both
 *    languages, read from characters of the current arena and rated battleground ladders (see talentTooltips);
 *  - game tables (DB2) of that build: wago.tools CSV (`--db2 wago`, default) or the catalog's imported rows of the same
 *    build (`--db2 catalog`): spell icons (SpellMisc) and class colours (ChrClasses).
 *  - icon names: the community listfile (wowdev/wow-listfile) or the catalog's file table.
 * Caches live in .artifacts/mists-cache (git-ignored).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.resolve(here, "..");
const outDir = path.join(web, "data/wow/mists");
const cacheDir = path.resolve(web, "../../.artifacts/mists-cache");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const refresh = flag("--refresh");
const db2Source = option("--db2") ?? "wago";
const log = (...parts) => console.log("[mists]", ...parts);
for (const dir of ["bnet", "db2"]) fs.mkdirSync(path.join(cacheDir, dir), { recursive: true });

const LOCALES = ["en_US", "ru_RU"];

/* ── Blizzard APIs ──────────────────────────────────────────────────── */
let token;
async function bnetToken() {
  if (token) return token;
  const id = process.env.BATTLENET_CLIENT_ID, secret = process.env.BATTLENET_CLIENT_SECRET;
  if (!id || !secret) throw new Error("BATTLENET_CLIENT_ID / BATTLENET_CLIENT_SECRET are required to download Blizzard data");
  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Battle.net token: HTTP ${response.status}`);
  token = (await response.json()).access_token;
  return token;
}

let requests = 0;
/** A cached Blizzard API document; null on 404 (a character that moved or was deleted). */
async function blizzard(region, route, namespace, locale = "en_US", { cache = true } = {}) {
  const file = path.join(cacheDir, "bnet", `${region}.${namespace}.${route.replace(/[^a-z0-9]+/gi, "_")}.${locale}.json`);
  if (cache && !refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const url = `https://${region}.api.blizzard.com/${route}?namespace=${namespace}-${region}&locale=${locale}`;
  for (let attempt = 0; ; attempt++) {
    requests++;
    const response = await fetch(url, { headers: { authorization: `Bearer ${await bnetToken()}` } });
    if (response.status === 429 && attempt < 5) { await new Promise((done) => setTimeout(done, 1000 * (attempt + 1))); continue; }
    const body = response.status === 404 || response.status === 403 ? null : response.ok ? await response.json() : undefined;
    if (body === undefined) throw new Error(`${route} ${locale}: HTTP ${response.status}`);
    if (cache) fs.writeFileSync(file, JSON.stringify(body));
    return body;
  }
}
const bnet = (route, locale) => blizzard("us", `data/wow/${route}`, "static-classic", locale);

/* ── Game tables ────────────────────────────────────────────────────── */
/** Minimal RFC 4180 CSV reader (wago.tools exports). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
}

function catalogRows(table, locale, version) {
  const sql = `copy (select r.payload from catalog_db2_rows r join game_builds b on b.id = r.build_id
    where b.product_id = 2 and b.version = '${version}' and r.table_name = '${table}' and r.locale = '${locale}' order by r.row_id) to stdout`;
  const out = execFileSync("sudo", ["-n", "docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on", "gildra-postgres-1",
    "psql", "-U", "gildra", "-d", "gildra", "-At", "-c", sql], { maxBuffer: 1 << 30, encoding: "utf8" });
  // COPY text format escapes backslashes; the payload is JSON on one line.
  return out.split("\n").filter(Boolean).map((line) => JSON.parse(line.replace(/\\\\/g, "\\")));
}

async function wagoRows(table, locale, version) {
  const url = `https://wago.tools/db2/${table}/csv?build=${version}${locale === "en_US" ? "" : `&locale=${locale.replace("_", "")}`}`;
  const response = await fetch(url, { headers: { "user-agent": "wowarcana.com data build" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`wago.tools ${table} ${locale}: HTTP ${response.status}`);
  return parseCsv(await response.text());
}

/** One game table of the build, cached as JSON lines; null when the source does not have it. */
async function db2(table, locale, version, { optional = false } = {}) {
  const file = path.join(cacheDir, "db2", `${version}.${table}.${locale}.jsonl`);
  if (!refresh && fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    return text === "null" ? null : text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  }
  let rows = db2Source === "catalog" ? catalogRows(table, locale, version) : await wagoRows(table, locale, version);
  if (rows && rows.length === 0) rows = null;
  if (!rows && !optional) throw new Error(`${table} ${locale} is missing in ${db2Source} for ${version}`);
  fs.writeFileSync(file, rows ? rows.map((row) => JSON.stringify(row)).join("\n") : "null");
  log(`${table} ${locale}: ${rows ? rows.length : "absent"}`);
  return rows;
}

const byId = (rows, key = "ID") => new Map((rows ?? []).map((row) => [Number(row[key]), row]));

/** Icon names of file data ids. */
async function iconNames(fileIds, version) {
  const file = path.join(cacheDir, `${version}.icons.json`);
  const known = !refresh && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const missing = [...fileIds].filter((id) => !(id in known));
  if (missing.length) {
    if (db2Source === "catalog") {
      const sql = `copy (select file_data_id, icon_name from catalog_file_assets where file_data_id in (${missing.join(",")})) to stdout`;
      const out = execFileSync("sudo", ["-n", "docker", "exec", "-i", "gildra-postgres-1", "psql", "-U", "gildra", "-d", "gildra", "-At", "-c", sql], { encoding: "utf8" });
      for (const line of out.split("\n").filter(Boolean)) { const [id, name] = line.split("\t"); known[id] = name.toLowerCase(); }
    } else {
      const response = await fetch("https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv");
      if (!response.ok) throw new Error(`listfile: HTTP ${response.status}`);
      const wanted = new Set(missing.map(String));
      for (const line of (await response.text()).split("\n")) {
        const [id, filePath] = line.split(";");
        if (wanted.has(id) && filePath?.startsWith("interface/icons/")) known[id] = path.basename(filePath, ".blp").toLowerCase();
      }
    }
    fs.writeFileSync(file, JSON.stringify(known));
  }
  return known;
}

/* ── Talent tooltips from characters ────────────────────────────────── */
/**
 * The static API lists each class's talents by tier but has no spell or tooltip for them. The character profile API
 * returns, for every talent a character has chosen, its spell and the game's resolved tooltip (values filled in) in
 * the requested language. Arena and rated battleground ladders of both regions name enough characters to see every
 * talent; only talent facts are kept, never who the characters are.
 */
async function talentTooltips(wanted) {
  const found = new Map();
  const seen = new Set();
  const cap = Number(option("--max-characters") ?? 6000);
  let walked = 0;
  const record = (document, person, locale) => {
    for (const spec of document?.specializations ?? []) for (const talent of spec.talents ?? []) {
      if (!wanted.has(talent.talent?.id) || !talent.spell_tooltip?.spell) continue;
      const entry = found.get(talent.talent.id) ?? { person, tooltips: {} };
      if (!entry.tooltips[locale]) entry.tooltips[locale] = talent.spell_tooltip;
      if (!found.has(talent.talent.id)) found.set(talent.talent.id, entry);
    }
  };
  const route = (person) => `profile/wow/character/${encodeURIComponent(person.realm)}/${encodeURIComponent(person.name)}/specializations`;
  async function walk(queue) {
    for (let i = 0; i < queue.length && walked < cap && found.size < wanted.size; i += 8, walked += 8) {
      const batch = queue.slice(i, i + 8);
      const documents = await Promise.all(batch.map((person) => blizzard(person.region, route(person), "profile-classic")));
      documents.forEach((document, k) => record(document, batch[k], "en_US"));
      if (walked % 800 === 0) log(`characters ${walked}: ${found.size}/${wanted.size} talents`);
    }
  }
  // The current season first; earlier seasons of the same expansion only while a rarely taken talent is still missing.
  for (let back = 0; back < 4 && found.size < wanted.size && walked < cap; back++) {
    const queue = [];
    for (const region of ["us", "eu"]) {
      const seasons = await blizzard(region, "data/wow/pvp-season/index", "dynamic-classic");
      const season = (seasons.current_season?.id ?? seasons.seasons.at(-1).id) - back;
      const boards = await blizzard(region, `data/wow/pvp-season/${season}/pvp-leaderboard/index`, "dynamic-classic");
      for (const board of boards?.leaderboards ?? []) {
        const ladder = await blizzard(region, `data/wow/pvp-season/${season}/pvp-leaderboard/${board.name}`, "dynamic-classic");
        for (const entry of ladder?.entries ?? []) {
          const person = { region, realm: entry.character.realm.slug, name: entry.character.name.toLowerCase() };
          const key = `${person.region}/${person.realm}/${person.name}`;
          if (!seen.has(key)) { seen.add(key); queue.push(person); }
        }
      }
    }
    await walk(queue);
  }
  for (const entry of found.values()) {
    if (!entry.tooltips.ru_RU) record(await blizzard(entry.person.region, route(entry.person), "profile-classic", "ru_RU"), entry.person, "ru_RU");
  }
  return found;
}

/** The icon on Blizzard's render server: the Classic set first, the live game's set for icons Classic does not serve. */
const iconChecks = (() => {
  const file = path.join(cacheDir, "icon-urls.json");
  const known = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return { known, save: () => fs.writeFileSync(file, JSON.stringify(known)) };
})();
async function iconUrl(name) {
  if (!name) return null;
  if (!(name in iconChecks.known) || refresh) {
    iconChecks.known[name] = null;
    for (const set of ["classic-us", "us"]) {
      const url = `https://render.worldofwarcraft.com/${set}/icons/56/${name}.jpg`;
      if ((await fetch(url, { method: "HEAD" })).ok) { iconChecks.known[name] = url; break; }
    }
    iconChecks.save();
  }
  return iconChecks.known[name];
}

/* ── Build ──────────────────────────────────────────────────────────── */
const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ROLE = { TANK: "tank", HEALER: "healer", DAMAGE: "damage" };
const STAT = { STRENGTH: "strength", AGILITY: "agility", INTELLECT: "intellect" };
const iconOf = (media) => path.basename(media.assets.find((asset) => asset.key === "icon").value, ".jpg");
/** Tooltip text as the game prints it: CRLF to LF, no trailing spaces, no colour codes. */
const clean = (text) => (text ?? "").replace(/\r\n/g, "\n").replace(/\|c[0-9a-f]{8}|\|r/gi, "").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim();

async function main() {
  const index = await bnet("playable-class/index");
  const version = index._links.self.href.match(/static-(\d+\.\d+\.\d+)_(\d+)-classic/)?.slice(1).join(".");
  if (!version) throw new Error("the namespace does not name a build");
  log(`build ${version}`);

  const problems = [];
  const classes = [];
  for (const entry of index.classes) {
    const cls = Object.fromEntries(await Promise.all(LOCALES.map(async (locale) => [locale, await bnet(`playable-class/${entry.id}`, locale)])));
    const specs = [];
    let tiers = null;
    for (const specRef of cls.en_US.specializations) {
      const spec = Object.fromEntries(await Promise.all(LOCALES.map(async (locale) => [locale, await bnet(`playable-specialization/${specRef.id}`, locale)])));
      specs.push({
        id: specRef.id,
        slug: slugify(spec.en_US.name),
        name: { en: spec.en_US.name, ru: spec.ru_RU.name },
        role: ROLE[spec.en_US.role.type],
        primaryStat: STAT[spec.en_US.primary_stat_type?.type] ?? null,
        icon: iconOf(await bnet(`media/playable-specialization/${specRef.id}`)),
        description: { en: spec.en_US.gender_description.male, ru: spec.ru_RU.gender_description.male },
      });
      // Every specialization of a class lists the same class talents; keep the first and check the rest.
      const specTiers = spec.en_US.talent_tiers.filter((tier) => tier.talents?.length).map((tier) => ({
        level: tier.level,
        talents: tier.talents.map((talent) => {
          const ru = spec.ru_RU.talent_tiers.flatMap((t) => t.talents ?? []).find((other) => other.talent.id === talent.talent.id);
          return { id: talent.talent.id, en: talent.talent.name, ru: ru?.talent.name ?? talent.talent.name };
        }),
      }));
      if (!tiers) tiers = specTiers;
      else if (JSON.stringify(tiers.map((tier) => tier.talents.map((talent) => talent.id))) !== JSON.stringify(specTiers.map((tier) => tier.talents.map((talent) => talent.id)))) {
        problems.push(`${cls.en_US.name}: specializations disagree on talents`);
      }
    }
    if (tiers.length !== 6 || tiers.some((tier) => tier.talents.length !== 3)) problems.push(`${cls.en_US.name}: not 6 tiers of 3 talents`);
    classes.push({
      id: entry.id,
      slug: slugify(cls.en_US.name),
      name: { en: cls.en_US.name, ru: cls.ru_RU.name },
      color: null,
      icon: iconOf(await bnet(`media/playable-class/${entry.id}`)),
      specs,
      tiers,
    });
  }

  const wanted = new Set(classes.flatMap((cls) => cls.tiers.flatMap((tier) => tier.talents.map((talent) => talent.id))));
  const tooltips = await talentTooltips(wanted);
  log(`talent tooltips: ${tooltips.size}/${wanted.size} (${requests} requests)`);

  // Icons and class colours come from the game tables of the same build.
  const misc = byId(await db2("SpellMisc", "en_US", version), "SpellID");
  const chrClasses = byId(await db2("ChrClasses", "en_US", version));
  const fileIds = new Set();
  for (const cls of classes) {
    const row = chrClasses.get(cls.id);
    if (row) cls.color = `#${[row.ClassColorR, row.ClassColorG, row.ClassColorB].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
    else problems.push(`${cls.name.en}: no class colour`);
    cls.tiers = cls.tiers.map((tier) => ({
      level: tier.level,
      talents: tier.talents.map((talent) => {
        const tip = tooltips.get(talent.id)?.tooltips ?? {};
        if (!tip.en_US || !tip.ru_RU) { problems.push(`${cls.name.en} ${talent.en}: no ${tip.en_US ? "Russian" : ""} tooltip`); }
        const spellId = tip.en_US?.spell.id ?? 0;
        const iconFile = Number(misc.get(spellId)?.SpellIconFileDataID ?? 0);
        if (iconFile) fileIds.add(iconFile);
        const line = (key) => (tip.en_US?.[key] ? { en: clean(tip.en_US[key]), ru: clean(tip.ru_RU?.[key] ?? tip.en_US[key]) } : null);
        return {
          id: talent.id,
          spellId,
          name: { en: talent.en, ru: talent.ru },
          iconFile,
          castTime: line("cast_time"),
          cooldown: line("cooldown"),
          range: line("range"),
          cost: line("power_cost"),
          description: { en: clean(tip.en_US?.description), ru: clean(tip.ru_RU?.description) },
        };
      }),
    }));
  }

  const icons = await iconNames(fileIds, version);
  for (const cls of classes) {
    cls.icon = await iconUrl(cls.icon);
    for (const spec of cls.specs) spec.icon = await iconUrl(spec.icon);
    if (!cls.icon || cls.specs.some((spec) => !spec.icon)) problems.push(`${cls.name.en}: class or specialization icon missing`);
  }
  for (const cls of classes) for (const tier of cls.tiers) for (const talent of tier.talents) {
    // Blizzard's icon server drops spaces from file names ("spell_frost_ring of frost" → "spell_frost_ringoffrost").
    talent.icon = icons[talent.iconFile] ? await iconUrl(icons[talent.iconFile].replace(/\s+/g, "")) : null;
    if (!talent.icon) problems.push(`${cls.name.en} ${talent.name.en}: no icon for file ${talent.iconFile}`);
    delete talent.iconFile;
    for (const key of ["castTime", "cooldown", "range", "cost"]) if (!talent[key]) delete talent[key];
  }

  if (problems.length) {
    for (const problem of problems) console.error("[mists] problem:", problem);
    if (!flag("--allow-problems")) { console.error(`[mists] ${problems.length} problems; nothing written`); process.exit(1); }
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "classes.json"), `${JSON.stringify({ build: version, classes }, null, 1)}\n`);
  log(`wrote ${classes.length} classes, ${classes.reduce((n, c) => n + c.tiers.length * 3, 0)} talents`);
}

main().catch((error) => { console.error(error); process.exit(1); });
