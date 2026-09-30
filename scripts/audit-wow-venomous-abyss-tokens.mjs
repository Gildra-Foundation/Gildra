import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const online = process.argv.includes("--online");
const write = process.argv.includes("--write");
const inputDirArgument = process.argv.find((argument) => argument.startsWith("--input-dir="));
const inputDir = inputDirArgument ? inputDirArgument.slice("--input-dir=".length) : null;
const descriptionAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-description-audit.json"), "utf8"));
const auditPath = path.join(root, "data/wow/venomous-abyss-token-audit.json");
const reportPath = path.join(root, "docs/reports/wow/venomous-abyss-token-verification.json");
const gameBuild = descriptionAudit.gameBuild;

const sources = descriptionAudit.sources
  .filter((source) => source.table === "Spell")
  .map((source) => ({
    ...source,
    fileName: `wago-spell-${gameBuild.split(".").at(-1)}-${source.locale === "en" ? "enUS" : "ruRU"}.csv`,
  }));

const categoryRequirements = {
  effect_value: ["SpellEffect", "difficulty/scaling context"],
  effect_period: ["SpellEffect"],
  duration: ["SpellMisc", "SpellDuration"],
  radius: ["SpellEffect", "SpellRadius"],
  difficulty_conditional: ["difficulty-specific publication variants"],
  grammar: ["resolved controlling value", "locale grammar selection"],
  spell_description_reference: ["Spell"],
  spell_aura_reference: ["Spell"],
  unknown_client_token: ["documented client token semantics"],
  wow_markup: ["WoW markup parser"],
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
  if (field || record.length) records.push([...record, field.endsWith("\r") ? field.slice(0, -1) : field]);
  const headers = records.shift() ?? [];
  return records
    .filter((row) => row.length > 1 || row[0] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function collectMatches(text, regex, category, tokens) {
  for (const match of text.matchAll(regex)) tokens.push({ category, token: match[0] });
}

function classifyTokens(text) {
  const tokens = [];
  collectMatches(text, /\$@spellname\d+/gi, "spell_name_reference", tokens);
  collectMatches(text, /\$@spelldesc\d+/gi, "spell_description_reference", tokens);
  collectMatches(text, /\$@spellaura\d+/gi, "spell_aura_reference", tokens);
  collectMatches(text, /\$\?[A-Z0-9|!]+/g, "difficulty_conditional", tokens);
  collectMatches(text, /\$[Ll][^;]*;/gu, "grammar", tokens);
  collectMatches(text, /\$(?:\d+)?[sSwW]\d+/g, "effect_value", tokens);
  collectMatches(text, /\$(?:\d+)?[tT]\d+/g, "effect_period", tokens);
  collectMatches(text, /\$(?:\d+)?[dD](?![A-Za-z0-9])/g, "duration", tokens);
  collectMatches(text, /\$(?:\d+)?[aA]\d+/g, "radius", tokens);

  let residue = text;
  for (const { token } of [...tokens].sort((left, right) => right.token.length - left.token.length)) {
    residue = residue.replaceAll(token, "");
  }
  collectMatches(residue, /\$[^\s,.;:()[\]]*/g, "unknown_client_token", tokens);
  collectMatches(text, /\|(?:c[0-9A-Fa-f]{8}|Hspell:\d+|h|r)/g, "wow_markup", tokens);
  return tokens;
}

function terminalDescription(spellRows, spellId) {
  const chain = [];
  let currentId = spellId;
  while (true) {
    if (chain.includes(currentId)) return { chain: [...chain, currentId], cycle: true, missing: false, text: "" };
    chain.push(currentId);
    const row = spellRows.get(currentId);
    if (!row) return { chain, cycle: false, missing: true, text: "" };
    const text = row.Description_lang;
    const reference = /^\$@spelldesc(\d+)$/.exec(text);
    if (!reference) return { chain, cycle: false, missing: false, text };
    currentId = Number(reference[1]);
  }
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

async function loadBuffers() {
  const buffers = new Map();
  for (const source of sources) {
    let bytes;
    if (online) {
      const response = await fetch(source.url, {
        headers: { "user-agent": "GildraVenomousTokenAudit/1.0" },
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`${source.kind} returned HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } else if (inputDir) bytes = await fs.readFile(path.join(inputDir, source.fileName));
    else return null;
    const digest = sha256(bytes);
    if (digest !== source.sha256) throw new Error(`${source.kind} hash mismatch: ${digest}`);
    buffers.set(source.locale, bytes);
  }
  return buffers;
}

function buildAudit(buffers, lastVerifiedAt) {
  const rows = Object.fromEntries([...buffers].map(([locale, bytes]) => [
    locale,
    new Map(parseCsv(bytes).map((row) => [Number(row.ID), row])),
  ]));
  const abilities = descriptionAudit.abilities.map((ability) => {
    const locales = Object.fromEntries(["en", "ru"].map((locale) => {
      const terminal = terminalDescription(rows[locale], ability.spellId);
      const tokens = classifyTokens(terminal.text);
      const categories = [...new Set(tokens.map((token) => token.category))].sort();
      const blockingCategories = categories.filter((category) => category !== "spell_name_reference");
      return [locale, {
        rootSpellId: ability.spellId,
        terminalSpellId: terminal.chain.at(-1),
        descriptionReferenceChain: terminal.chain,
        referenceCycle: terminal.cycle,
        missingReferenceTarget: terminal.missing,
        terminalTextLength: [...terminal.text].length,
        terminalTextSha256: sha256(Buffer.from(terminal.text)),
        categories,
        blockingCategories,
        tokenCounts: countBy(tokens.map((token) => token.category)),
        tokens: tokens.map(({ category, token }) => ({ category, token })),
      }];
    }));
    return {
      spellId: ability.spellId,
      encounterSlug: ability.encounterSlug,
      publicationSafe: ability.publicationSafe,
      publicationSourceKind: ability.publicationCandidate?.sourceKind ?? null,
      locales,
    };
  });
  const withheld = abilities.filter((ability) => !ability.publicationSafe);
  const allBlockingCategories = withheld.flatMap((ability) => [
    ...new Set([...ability.locales.en.blockingCategories, ...ability.locales.ru.blockingCategories]),
  ]);
  const requiredTables = [...new Set(allBlockingCategories.flatMap((category) => categoryRequirements[category] ?? []))].sort();
  return {
    schemaVersion: 1,
    scope: "venomous-abyss-withheld-description-client-token-inventory",
    gameBuild,
    lastVerifiedAt,
    method: "Build-pinned EN/RU Spell rows are selected by exact spell ID. Full-string $@spelldesc<ID> chains are followed only within the same locale export. Terminal text is hashed and tokenized; tokenized prose is not copied into the audit.",
    publicationPolicy: "This inventory never publishes text. A description remains withheld whenever either locale has an unresolved blocking category. Spell-name references are marked non-blocking only because the separate description audit proves exact build-pinned EN/RU SpellName substitution.",
    categoryRequirements,
    sources: sources.map(({ fileName: _fileName, ...source }) => source),
    summary: {
      abilities: abilities.length,
      publicationSafeAbilities: abilities.length - withheld.length,
      withheldAbilities: withheld.length,
      unresolvedCategoryAbilityCounts: countBy(allBlockingCategories),
      requiredTables,
      referenceCycles: abilities.filter((ability) => ability.locales.en.referenceCycle || ability.locales.ru.referenceCycle).length,
      missingReferenceTargets: abilities.filter((ability) => ability.locales.en.missingReferenceTarget || ability.locales.ru.missingReferenceTarget).length,
    },
    abilities,
  };
}

function stable(audit) {
  const { lastVerifiedAt: _lastVerifiedAt, ...projection } = audit;
  return projection;
}

let audit;
try {
  audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
} catch (error) {
  if (!write) throw error;
}
const buffers = await loadBuffers();
const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
if (buffers) {
  const generated = buildAudit(buffers, audit?.lastVerifiedAt ?? new Date().toISOString());
  if (write) {
    generated.lastVerifiedAt = new Date().toISOString();
    await fs.writeFile(auditPath, `${JSON.stringify(generated, null, 2)}\n`);
    audit = generated;
  } else check(JSON.stringify(stable(audit)) === JSON.stringify(stable(generated)), "pinned-token-audit-does-not-match-source-bytes");
}

check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
check(audit?.gameBuild === gameBuild, "audit-build-mismatch");
check(audit?.summary?.abilities === 37, `ability-count-invalid:${audit?.summary?.abilities}`);
check(audit?.summary?.publicationSafeAbilities === 12, `safe-count-invalid:${audit?.summary?.publicationSafeAbilities}`);
check(audit?.summary?.withheldAbilities === 25, `withheld-count-invalid:${audit?.summary?.withheldAbilities}`);
check(audit?.summary?.referenceCycles === 0, `reference-cycles:${audit?.summary?.referenceCycles}`);
check(audit?.summary?.missingReferenceTargets === 0, `missing-reference-targets:${audit?.summary?.missingReferenceTargets}`);
for (const ability of audit?.abilities ?? []) {
  const descriptionAbility = descriptionAudit.abilities.find((candidate) => candidate.spellId === ability.spellId);
  check(Boolean(descriptionAbility), `description-audit-ability-missing:${ability.spellId}`);
  check(ability.publicationSafe === descriptionAbility?.publicationSafe, `publication-state-mismatch:${ability.spellId}`);
  for (const locale of ["en", "ru"]) {
    const evidence = ability.locales?.[locale];
    check(/^[0-9a-f]{64}$/.test(evidence?.terminalTextSha256 ?? ""), `terminal-hash-invalid:${locale}:${ability.spellId}`);
    check(!evidence?.referenceCycle, `reference-cycle:${locale}:${ability.spellId}`);
    check(!evidence?.missingReferenceTarget, `missing-reference-target:${locale}:${ability.spellId}`);
    if (!ability.publicationSafe) check((evidence?.blockingCategories?.length ?? 0) > 0, `withheld-without-blocker:${locale}:${ability.spellId}`);
    check(!evidence?.categories?.includes("unknown_client_token"), `unknown-token:${locale}:${ability.spellId}`);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  sourceBytesCompared: Boolean(buffers),
  abilities: audit?.summary?.abilities ?? null,
  publicationSafeAbilities: audit?.summary?.publicationSafeAbilities ?? null,
  withheldAbilities: audit?.summary?.withheldAbilities ?? null,
  unresolvedCategoryAbilityCounts: audit?.summary?.unresolvedCategoryAbilityCounts ?? null,
  requiredTables: audit?.summary?.requiredTables ?? null,
  verified: issues.length === 0,
  violations: issues.length,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify({ summary, issues }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length) process.exitCode = 1;
