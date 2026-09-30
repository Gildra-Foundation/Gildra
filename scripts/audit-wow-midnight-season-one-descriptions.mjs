import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const write = process.argv.includes("--write");
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const inputDir = option("input-dir") ? path.resolve(root, option("input-dir")) : null;
const online = process.argv.includes("--online") || inputDir != null;
const gameBuild = "12.1.0.69587";
const manifestPath = path.resolve(root, option("manifest") ?? "data/wow/content-manifest.json");
const auditPath = path.resolve(root, option("audit") ?? "data/wow/midnight-season-one-description-audit.json");
const reportPath = path.resolve(root, option("report") ?? "docs/reports/wow/midnight-season-one-description-verification.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const sourceDefinitions = [
  ["spell_en", "Spell", "en", "enUS"],
  ["spell_ru", "Spell", "ru", "ruRU"],
  ["journal_section_en", "JournalEncounterSection", "en", "enUS"],
  ["journal_section_ru", "JournalEncounterSection", "ru", "ruRU"],
  ["spell_name_en", "SpellName", "en", "enUS"],
  ["spell_name_ru", "SpellName", "ru", "ruRU"],
].map(([kind, table, locale, sourceLocale]) => ({
  kind,
  table,
  locale,
  sourceLocale,
  url: `https://wago.tools/db2/${table}/csv?build=${gameBuild}&locale=${sourceLocale}`,
  fileName: `${table}-${sourceLocale}.csv`,
}));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function parseCsv(buffer) {
  const input = buffer.toString("utf8");
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      records.push(record);
      record = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field || record.length > 0) {
    record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    records.push(record);
  }
  const headers = records.shift() ?? [];
  return records
    .filter((row) => row.length > 1 || row[0] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function extractTokens(text) {
  if (!text) return [];
  return [...new Set(text.match(/\$\{[^}]+\}|\$\[[\s\S]*?\$\]|\$@[A-Za-z]+\d+|\$[A-Za-z0-9_]+/g) ?? [])].sort();
}

function tokenCategories(tokens) {
  const categories = new Set();
  for (const token of tokens) {
    if (token.startsWith("$[")) categories.add("difficulty_conditional");
    if (/\$@spellname/i.test(token)) categories.add("spell_name");
    if (/\$@spelldesc/i.test(token)) categories.add("description_reference");
    if (/\$@spellaura/i.test(token)) categories.add("aura_reference");
    if (/\$\{/.test(token)) categories.add("expression");
    if (/\$\d*d\b/i.test(token)) categories.add("duration");
    if (/\$\d*A\d+/i.test(token)) categories.add("radius");
    if (/\$\d*s\d+/i.test(token)) categories.add("effect_value");
    if (/\$\d*t\d*/i.test(token)) categories.add("effect_period");
    if (/\$l/i.test(token)) categories.add("grammar");
  }
  return [...categories].sort();
}

function classify(text) {
  if (!nonEmptyString(text)) return "empty";
  if (/^\$@spelldesc\d+$/.test(text)) return "description_reference";
  if (/^\$@spellaura\d+$/.test(text)) return "aura_reference";
  if (text.includes("$") || /\|(?:c[0-9A-Fa-f]{8}|Hspell:|h|r)/.test(text)) return "tokenized";
  return "publication_safe";
}

function resolveDescription(rowsById, spellId, visited = []) {
  if (visited.includes(spellId)) return { status: "cycle", terminalSpellId: null, chain: [...visited, spellId], text: null };
  const rows = rowsById.get(spellId) ?? [];
  if (rows.length !== 1) return { status: rows.length === 0 ? "missing" : "duplicate", terminalSpellId: null, chain: [...visited, spellId], text: null };
  const text = rows[0].Description_lang;
  const reference = /^\$@spelldesc(\d+)$/.exec(text);
  if (!reference) return { status: classify(text), terminalSpellId: spellId, chain: [...visited, spellId], text };
  return resolveDescription(rowsById, Number(reference[1]), [...visited, spellId]);
}

function selectTargets() {
  return manifest.abilities
    .filter((ability) => ability.season === "midnight-season-1"
      && ability.parentId.includes(":encounter:"))
    .sort((left, right) => left.refs.spellId - right.refs.spellId);
}

async function fetchSources() {
  return Promise.all(sourceDefinitions.map(async (definition) => {
    let bytes;
    if (inputDir) bytes = await fs.readFile(path.join(inputDir, definition.fileName));
    else {
      const response = await fetch(definition.url, {
        headers: { "user-agent": "GildraMidnightSeasonOneDescriptionAudit/1.0" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`${definition.kind}:http-${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    return { ...definition, bytes, sha256: sha256(bytes), rows: parseCsv(bytes) };
  }));
}

function groupRows(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const id = Number(row[key]);
    if (!Number.isInteger(id)) continue;
    const values = grouped.get(id) ?? [];
    values.push(row);
    grouped.set(id, values);
  }
  return grouped;
}

function buildEvidence(loadedSources) {
  const sourceByKind = new Map(loadedSources.map((source) => [source.kind, source]));
  const spellEn = groupRows(sourceByKind.get("spell_en").rows, "ID");
  const spellRu = groupRows(sourceByKind.get("spell_ru").rows, "ID");
  const nameEn = groupRows(sourceByKind.get("spell_name_en").rows, "ID");
  const nameRu = groupRows(sourceByKind.get("spell_name_ru").rows, "ID");
  const journalEn = groupRows(sourceByKind.get("journal_section_en").rows, "SpellID");
  const journalRu = groupRows(sourceByKind.get("journal_section_ru").rows, "SpellID");
  const abilities = selectTargets().map((ability) => {
    const spellId = ability.refs.spellId;
    const resolvedEn = resolveDescription(spellEn, spellId);
    const resolvedRu = resolveDescription(spellRu, spellId);
    const namesEn = (nameEn.get(spellId) ?? []).map((row) => row.Name_lang);
    const namesRu = (nameRu.get(spellId) ?? []).map((row) => row.Name_lang);
    const sectionsEn = (journalEn.get(spellId) ?? []).map((row) => ({
      id: Number(row.ID),
      encounterId: Number(row.JournalEncounterID),
      difficultyMask: Number(row.DifficultyMask),
      title: row.Title_lang,
      body: row.BodyText_lang,
      bodySha256: sha256(row.BodyText_lang),
      tokens: extractTokens(row.BodyText_lang),
    })).sort((left, right) => left.id - right.id);
    const sectionsRu = (journalRu.get(spellId) ?? []).map((row) => ({
      id: Number(row.ID),
      encounterId: Number(row.JournalEncounterID),
      difficultyMask: Number(row.DifficultyMask),
      title: row.Title_lang,
      body: row.BodyText_lang,
      bodySha256: sha256(row.BodyText_lang),
      tokens: extractTokens(row.BodyText_lang),
    })).sort((left, right) => left.id - right.id);
    const descriptionTokens = [...new Set([
      ...extractTokens(resolvedEn.text),
      ...extractTokens(resolvedRu.text),
    ])].sort();
    const journalTokens = [...new Set([
      ...sectionsEn.flatMap((section) => section.tokens),
      ...sectionsRu.flatMap((section) => section.tokens),
    ])].sort();
    const blockers = [];
    if (namesEn.length !== 1 || namesEn[0] !== ability.names.en) blockers.push("spell_name_en_mismatch");
    if (namesRu.length !== 1 || namesRu[0] !== ability.names.ru) blockers.push("spell_name_ru_mismatch");
    if (resolvedEn.status !== "publication_safe") blockers.push(`description_en_${resolvedEn.status}`);
    if (resolvedRu.status !== "publication_safe") blockers.push(`description_ru_${resolvedRu.status}`);
    if (resolvedEn.chain.join(":") !== resolvedRu.chain.join(":")) blockers.push("locale_reference_chain_mismatch");
    const sectionShape = (sections) => sections.map((section) => [section.id, section.encounterId, section.difficultyMask]);
    if (JSON.stringify(sectionShape(sectionsEn)) !== JSON.stringify(sectionShape(sectionsRu))) blockers.push("journal_locale_structure_mismatch");
    if (sectionsEn.some((section) => nonEmptyString(section.body)) || sectionsRu.some((section) => nonEmptyString(section.body))) {
      blockers.push("journal_supplement_unmerged");
    }
    const requiredBy = [...new Set([
      ...tokenCategories(descriptionTokens),
      ...tokenCategories(journalTokens),
      ...(blockers.includes("journal_supplement_unmerged") ? ["journal_supplement"] : []),
    ])].sort();
    const publicationSafe = blockers.length === 0;
    return {
      spellId,
      manifestId: ability.id,
      encounterId: ability.refs.encounterId,
      names: { en: namesEn[0] ?? null, ru: namesRu[0] ?? null },
      source: {
        en: {
          rawSpellId: spellId,
          terminalSpellId: resolvedEn.terminalSpellId,
          referenceChain: resolvedEn.chain,
          classification: resolvedEn.status,
          description: resolvedEn.text,
          descriptionSha256: resolvedEn.text == null ? null : sha256(resolvedEn.text),
          tokens: extractTokens(resolvedEn.text),
        },
        ru: {
          rawSpellId: spellId,
          terminalSpellId: resolvedRu.terminalSpellId,
          referenceChain: resolvedRu.chain,
          classification: resolvedRu.status,
          description: resolvedRu.text,
          descriptionSha256: resolvedRu.text == null ? null : sha256(resolvedRu.text),
          tokens: extractTokens(resolvedRu.text),
        },
      },
      journalSections: { en: sectionsEn, ru: sectionsRu },
      requiredBy,
      blockers: [...new Set(blockers)].sort(),
      publicationSafe,
      proposedVariantStatus: publicationSafe ? "not_required_verified" : "required_unverified",
    };
  });
  return {
    schemaVersion: 1,
    scope: "Midnight Season 1 raid ability descriptions recorded by the canonical manifest",
    gameBuild,
    sourceKind: "verified_database",
    sourcePriority: 3,
    sources: loadedSources.map((source) => ({
      kind: source.kind,
      table: source.table,
      locale: source.locale,
      url: source.url,
      sha256: source.sha256,
      bytes: source.bytes.length,
      rows: source.rows.length,
    })),
    abilities,
  };
}

function comparable(audit) {
  return {
    schemaVersion: audit.schemaVersion,
    scope: audit.scope,
    gameBuild: audit.gameBuild,
    sourceKind: audit.sourceKind,
    sourcePriority: audit.sourcePriority,
    sources: audit.sources,
    abilities: audit.abilities,
  };
}

const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
let audit;
let sourceBytesCompared = false;

if (online) {
  const loadedSources = await fetchSources();
  const generated = buildEvidence(loadedSources);
  sourceBytesCompared = true;
  if (write) {
    audit = { ...generated, lastVerifiedAt: new Date().toISOString() };
    await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  } else {
    audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
    check(JSON.stringify(comparable(audit)) === JSON.stringify(comparable(generated)), "online-source-evidence-drift");
  }
} else {
  audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
}

const targets = selectTargets();
check(audit.schemaVersion === 1, "audit-schema-version-invalid");
check(audit.gameBuild === gameBuild, "audit-build-invalid");
check(audit.sourceKind === "verified_database" && audit.sourcePriority === 3, "audit-source-classification-invalid");
check(audit.sources.length === sourceDefinitions.length, "audit-source-count-invalid");
for (const definition of sourceDefinitions) {
  const source = audit.sources.find((candidate) => candidate.kind === definition.kind);
  check(source?.url === definition.url && /^[a-f0-9]{64}$/.test(source?.sha256 ?? "")
    && Number.isInteger(source?.bytes) && source.bytes > 0 && Number.isInteger(source?.rows) && source.rows > 0,
  `audit-source-invalid:${definition.kind}`);
}
check(audit.abilities.length === targets.length, "audit-ability-count-invalid");
check(JSON.stringify(audit.abilities.map((ability) => ability.spellId)) === JSON.stringify(targets.map((ability) => ability.refs.spellId)), "audit-ability-scope-invalid");
for (const ability of audit.abilities) {
  check(Number.isInteger(ability.spellId) && ability.spellId > 0, `ability-spell-id-invalid:${ability.spellId}`);
  check(nonEmptyString(ability.names?.en) && nonEmptyString(ability.names?.ru), `ability-name-evidence-invalid:${ability.spellId}`);
  check(["not_required_verified", "required_unverified"].includes(ability.proposedVariantStatus), `ability-proposed-status-invalid:${ability.spellId}`);
  check(ability.publicationSafe === (ability.blockers.length === 0), `ability-publication-verdict-invalid:${ability.spellId}`);
  for (const locale of ["en", "ru"]) {
    const source = ability.source?.[locale];
    check(Array.isArray(source?.referenceChain) && source.referenceChain[0] === ability.spellId
      && nonEmptyString(source?.description) && /^[a-f0-9]{64}$/.test(source?.descriptionSha256 ?? "")
      && source.descriptionSha256 === sha256(source.description) && Array.isArray(source.tokens),
    `ability-description-evidence-invalid:${ability.spellId}:${locale}`);
  }
  check(Array.isArray(ability.journalSections?.en) && Array.isArray(ability.journalSections?.ru)
    && Array.isArray(ability.requiredBy) && Array.isArray(ability.blockers), `ability-evidence-shape-invalid:${ability.spellId}`);
  if (ability.publicationSafe) {
    check(ability.proposedVariantStatus === "not_required_verified"
      && ability.requiredBy.length === 0 && ability.blockers.length === 0
      && ability.source.en.classification === "publication_safe" && ability.source.ru.classification === "publication_safe"
      && ability.source.en.tokens.length === 0 && ability.source.ru.tokens.length === 0
      && ability.journalSections.en.every((section) => !nonEmptyString(section.body))
      && ability.journalSections.ru.every((section) => !nonEmptyString(section.body)),
    `ability-publication-safe-evidence-invalid:${ability.spellId}`);
  } else {
    check(ability.proposedVariantStatus === "required_unverified"
      && ability.requiredBy.length > 0 && ability.blockers.length > 0,
    `ability-withheld-evidence-invalid:${ability.spellId}`);
  }
}

const publicationSafeAbilities = audit.abilities.filter((ability) => ability.publicationSafe);
const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  write,
  sourceBytesCompared,
  abilities: audit.abilities.length,
  directDescriptions: audit.abilities.filter((ability) => ability.source.en.referenceChain.length === 1).length,
  referencedDescriptions: audit.abilities.filter((ability) => ability.source.en.referenceChain.length > 1).length,
  publicationSafeAbilities: publicationSafeAbilities.length,
  publicationSafeSpellIds: publicationSafeAbilities.map((ability) => ability.spellId),
  withheldAbilities: audit.abilities.length - publicationSafeAbilities.length,
  requiredCategoryAbilityCounts: Object.fromEntries([...new Set(audit.abilities.flatMap((ability) => ability.requiredBy))]
    .sort().map((category) => [category, audit.abilities.filter((ability) => ability.requiredBy.includes(category)).length])),
  verified: issues.length === 0,
  violations: issues,
};
await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
