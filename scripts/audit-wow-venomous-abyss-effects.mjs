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
const tokenAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-token-audit.json"), "utf8"));
const auditPath = path.join(root, "data/wow/venomous-abyss-effect-audit.json");
const reportPath = path.join(root, "docs/reports/wow/venomous-abyss-effect-verification.json");
const gameBuild = tokenAudit.gameBuild;

const sources = [
  {
    kind: "spell_effect_en",
    table: "SpellEffect",
    locale: "en",
    url: `https://wago.tools/db2/SpellEffect/csv?build=${gameBuild}&locale=enUS`,
    sha256: "7c7072906b7743032270295f8bb070d7fe62f0f276231f6612c4eb43e35669a6",
    rows: 629395,
    fileName: `wago-spelleffect-${gameBuild.split(".").at(-1)}-enUS.csv`,
  },
  {
    kind: "spell_misc_en",
    table: "SpellMisc",
    locale: "en",
    url: `https://wago.tools/db2/SpellMisc/csv?build=${gameBuild}&locale=enUS`,
    sha256: "83e46ad55ed2cf1245a2358ecfb72889a434b1df5e1138b41208f4e134b65781",
    rows: 417612,
    fileName: `wago-spellmisc-${gameBuild.split(".").at(-1)}-enUS.csv`,
  },
  {
    kind: "spell_duration_en",
    table: "SpellDuration",
    locale: "en",
    url: `https://wago.tools/db2/SpellDuration/csv?build=${gameBuild}&locale=enUS`,
    sha256: "ba8dd9dfdbd9866523db2c5d467af3849ead709d7df2e9322829d7751b02b2c5",
    rows: 435,
    fileName: `wago-spellduration-${gameBuild.split(".").at(-1)}-enUS.csv`,
  },
  {
    kind: "spell_radius_en",
    table: "SpellRadius",
    locale: "en",
    url: `https://wago.tools/db2/SpellRadius/csv?build=${gameBuild}&locale=enUS`,
    sha256: "ab4b56313597b825f18225a63078c629ecfb19bc85e1e69f1d464f4c9c87a863",
    rows: 375,
    fileName: `wago-spellradius-${gameBuild.split(".").at(-1)}-enUS.csv`,
  },
  {
    kind: "difficulty_en",
    table: "Difficulty",
    locale: "en",
    url: `https://wago.tools/db2/Difficulty/csv?build=${gameBuild}&locale=enUS`,
    sha256: "5b5909ea3319a9596ba4472256ef8901e24c67d2b10638259bfabc652268a23e",
    rows: 60,
    fileName: `wago-difficulty-${gameBuild.split(".").at(-1)}-enUS.csv`,
  },
  {
    kind: "difficulty_ru",
    table: "Difficulty",
    locale: "ru",
    url: `https://wago.tools/db2/Difficulty/csv?build=${gameBuild}&locale=ruRU`,
    sha256: "4d75da7e1625bca4cb861ec3a1d8941abb5858a5da30b332fc670a859b7a3bd2",
    rows: 60,
    fileName: `wago-difficulty-${gameBuild.split(".").at(-1)}-ruRU.csv`,
  },
];

const auditedCategories = new Set(["effect_value", "effect_period", "duration", "radius"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const countBy = (values) => Object.fromEntries([...values.reduce((counts, value) => {
  counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}, new Map())].sort(([left], [right]) => left.localeCompare(right)));

function parseNumericCsv(buffer) {
  const lines = buffer.toString("utf8").split(/\r?\n/);
  const headers = (lines.shift() ?? "").split(",");
  const records = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.includes('"')) throw new Error("numeric DB2 export unexpectedly contains quoted fields");
    const fields = line.split(",");
    if (fields.length !== headers.length) throw new Error(`numeric DB2 row width mismatch: ${fields.length}/${headers.length}`);
    records.push(Object.fromEntries(headers.map((header, index) => [header, fields[index]])));
  }
  return records;
}

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
      continue;
    }
    if (character === '"') quoted = true;
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
  return records.filter((row) => row.length > 1 || row[0] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parseToken(category, token, terminalSpellId) {
  const patterns = {
    effect_value: /^\$(?:(\d+))?[sSwW](\d+)$/,
    effect_period: /^\$(?:(\d+))?[tT](\d+)$/,
    duration: /^\$(?:(\d+))?[dD]$/,
    radius: /^\$(?:(\d+))?[aA](\d+)$/,
  };
  const match = patterns[category]?.exec(token);
  if (!match) throw new Error(`unsupported ${category} token: ${token}`);
  return {
    targetSpellId: match[1] ? Number(match[1]) : terminalSpellId,
    effectIndex: category === "duration" ? null : Number(match[2]) - 1,
  };
}

function expectedEvidenceRecords() {
  const records = new Map();
  for (const ability of tokenAudit.abilities) {
    for (const locale of ["en", "ru"]) {
      const localeEvidence = ability.locales[locale];
      for (const tokenEvidence of localeEvidence.tokens.filter((candidate) => auditedCategories.has(candidate.category))) {
        const parsed = parseToken(tokenEvidence.category, tokenEvidence.token, localeEvidence.terminalSpellId);
        const key = [ability.spellId, tokenEvidence.category, tokenEvidence.token, parsed.targetSpellId, parsed.effectIndex ?? "duration"].join(":");
        const existing = records.get(key) ?? {
          key,
          abilitySpellId: ability.spellId,
          encounterSlug: ability.encounterSlug,
          category: tokenEvidence.category,
          token: tokenEvidence.token,
          targetSpellId: parsed.targetSpellId,
          effectIndex: parsed.effectIndex,
          locales: [],
        };
        if (!existing.locales.includes(locale)) existing.locales.push(locale);
        records.set(key, existing);
      }
    }
  }
  return [...records.values()].sort((left, right) => left.key.localeCompare(right.key));
}

async function loadBuffers() {
  if (!online && !inputDir) return null;
  const buffers = new Map();
  for (const source of sources) {
    let bytes;
    if (online) {
      const response = await fetch(source.url, {
        headers: { "user-agent": "GildraVenomousEffectAudit/1.0" },
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) throw new Error(`${source.kind} returned HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } else bytes = await fs.readFile(path.join(inputDir, source.fileName));
    const digest = sha256(bytes);
    if (digest !== source.sha256) throw new Error(`${source.kind} hash mismatch: ${digest}`);
    const rows = bytes.toString("utf8").split(/\r?\n/).filter(Boolean).length - 1;
    if (rows !== source.rows) throw new Error(`${source.kind} row count mismatch: ${rows}`);
    buffers.set(source.kind, bytes);
  }
  return buffers;
}

const effectFields = [
  "ID", "EffectAura", "DifficultyID", "EffectIndex", "Effect", "EffectAmplitude", "EffectAuraPeriod",
  "EffectBonusCoefficient", "EffectPointsPerResource", "EffectRealPointsPerLevel", "BonusCoefficientFromAP",
  "Coefficient", "Variance", "ResourceCoefficient", "GroupSizeBasePointsCoefficient", "EffectBasePointsF",
  "ScalingClass", "EffectRadiusIndex_0", "EffectRadiusIndex_1", "SpellID",
];
const miscFields = ["ID", "DifficultyID", "DurationIndex", "PvPDurationIndex", "MinDuration", "ContentTuningID", "SpellID"];
const durationFields = ["ID", "Duration", "MaxDuration", "DurationPerResource"];
const radiusFields = ["ID", "Radius", "RadiusPerLevel", "RadiusMin", "RadiusMax"];
const difficultyFields = [
  "ID", "InstanceType", "OrderIndex", "FallbackDifficultyID", "MinPlayers", "MaxPlayers", "Flags", "ItemContext",
];

function pickNumeric(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, numeric(row[field])]));
}

function distinct(values) {
  return [...new Set(values.map((value) => JSON.stringify(value)))].map((value) => JSON.parse(value));
}

function classifyEffectValue(rows) {
  if (!rows.length) return { classification: "missing", evidenceComplete: false, resolvedValues: [] };
  const values = rows.map((row) => ({
    effect: row.Effect,
    effectAura: row.EffectAura,
    basePoints: row.EffectBasePointsF,
    effectAmplitude: row.EffectAmplitude,
  }));
  const dynamic = rows.some((row) => [
    row.EffectBonusCoefficient, row.EffectPointsPerResource, row.EffectRealPointsPerLevel,
    row.BonusCoefficientFromAP, row.Coefficient, row.Variance, row.ResourceCoefficient,
    row.GroupSizeBasePointsCoefficient, row.ScalingClass,
  ].some((value) => value !== 0));
  const resolvedValues = distinct(values);
  if (resolvedValues.length > 1) return { classification: "difficulty_variant", evidenceComplete: true, resolvedValues };
  if (dynamic) return { classification: "scaled_or_dynamic", evidenceComplete: true, resolvedValues };
  return { classification: "static_metadata", evidenceComplete: true, resolvedValues };
}

function classifyPeriod(rows) {
  if (!rows.length || rows.every((row) => row.EffectAuraPeriod === 0)) {
    return { classification: "missing", evidenceComplete: false, resolvedValues: [] };
  }
  const resolvedValues = distinct(rows.map((row) => ({ periodMs: row.EffectAuraPeriod })));
  return {
    classification: resolvedValues.length > 1 ? "difficulty_variant" : "static_metadata",
    evidenceComplete: true,
    resolvedValues,
  };
}

function classifyRadius(rows, radiusById) {
  if (!rows.length) return { classification: "missing", evidenceComplete: false, resolvedValues: [], radiusRows: [] };
  const radiusIds = [...new Set(rows.flatMap((row) => [row.EffectRadiusIndex_0, row.EffectRadiusIndex_1]).filter((value) => value > 0))].sort((a, b) => a - b);
  const radiusRows = radiusIds.map((id) => radiusById.get(id)).filter(Boolean);
  if (!radiusIds.length || radiusRows.length !== radiusIds.length) {
    return { classification: "missing", evidenceComplete: false, resolvedValues: [], radiusRows };
  }
  const resolvedValues = distinct(rows.map((row) => ({
    radius0: row.EffectRadiusIndex_0 > 0 ? radiusById.get(row.EffectRadiusIndex_0) ?? null : null,
    radius1: row.EffectRadiusIndex_1 > 0 ? radiusById.get(row.EffectRadiusIndex_1) ?? null : null,
  })));
  return {
    classification: resolvedValues.length > 1 ? "difficulty_variant" : "static_metadata",
    evidenceComplete: true,
    resolvedValues,
    radiusRows,
  };
}

function classifyDuration(rows, durationById) {
  if (!rows.length) return { classification: "missing", evidenceComplete: false, resolvedValues: [], durationRows: [] };
  const durationIds = [...new Set(rows.map((row) => row.DurationIndex).filter((value) => value > 0))].sort((a, b) => a - b);
  const durationRows = durationIds.map((id) => durationById.get(id)).filter(Boolean);
  if (!durationIds.length || durationRows.length !== durationIds.length) {
    return { classification: "missing", evidenceComplete: false, resolvedValues: [], durationRows };
  }
  const resolvedValues = distinct(rows.map((row) => ({
    durationIndex: row.DurationIndex,
    duration: durationById.get(row.DurationIndex) ?? null,
    minDurationMs: row.MinDuration,
  })));
  const dynamic = durationRows.some((row) => row.DurationPerResource !== 0);
  return {
    classification: resolvedValues.length > 1 ? "difficulty_variant" : dynamic ? "scaled_or_dynamic" : "static_metadata",
    evidenceComplete: true,
    resolvedValues,
    durationRows,
  };
}

function buildAudit(buffers, lastVerifiedAt) {
  const expected = expectedEvidenceRecords();
  const targetSpellIds = new Set(expected.map((record) => record.targetSpellId));
  const effectRows = parseNumericCsv(buffers.get("spell_effect_en"))
    .filter((row) => targetSpellIds.has(numeric(row.SpellID)))
    .map((row) => pickNumeric(row, effectFields));
  const miscRows = parseNumericCsv(buffers.get("spell_misc_en"))
    .filter((row) => targetSpellIds.has(numeric(row.SpellID)))
    .map((row) => pickNumeric(row, miscFields));
  const durationRows = parseNumericCsv(buffers.get("spell_duration_en")).map((row) => pickNumeric(row, durationFields));
  const radiusRows = parseNumericCsv(buffers.get("spell_radius_en")).map((row) => pickNumeric(row, radiusFields));
  const difficultyRows = {
    en: parseCsv(buffers.get("difficulty_en")),
    ru: parseCsv(buffers.get("difficulty_ru")),
  };
  const difficultyNames = {
    en: new Map(difficultyRows.en.map((row) => [numeric(row.ID), row.Name_lang])),
    ru: new Map(difficultyRows.ru.map((row) => [numeric(row.ID), row.Name_lang])),
  };
  const durationById = new Map(durationRows.map((row) => [row.ID, row]));
  const radiusById = new Map(radiusRows.map((row) => [row.ID, row]));

  const withDifficultyContext = (result) => ({
    ...result,
    difficultyContexts: [...new Set(result.sourceRows.map((row) => row.DifficultyID))]
      .sort((left, right) => left - right)
      .map((difficultyId) => ({
        difficultyId,
        registeredDifficulty: difficultyNames.en.has(difficultyId) && difficultyNames.ru.has(difficultyId),
        names: {
          en: difficultyNames.en.get(difficultyId) ?? null,
          ru: difficultyNames.ru.get(difficultyId) ?? null,
        },
      })),
  });

  const evidence = expected.map((record) => {
    if (record.category === "duration") {
      const rows = miscRows.filter((row) => row.SpellID === record.targetSpellId).sort((left, right) => left.DifficultyID - right.DifficultyID || left.ID - right.ID);
      const result = classifyDuration(rows, durationById);
      return withDifficultyContext({ ...record, ...result, sourceRows: rows });
    }
    const rows = effectRows
      .filter((row) => row.SpellID === record.targetSpellId && row.EffectIndex === record.effectIndex)
      .sort((left, right) => left.DifficultyID - right.DifficultyID || left.ID - right.ID);
    const result = record.category === "effect_value"
      ? classifyEffectValue(rows)
      : record.category === "effect_period"
        ? classifyPeriod(rows)
        : classifyRadius(rows, radiusById);
    return withDifficultyContext({ ...record, ...result, sourceRows: rows });
  });

  const usedDifficultyIds = [...new Set(evidence.flatMap((record) => record.sourceRows.map((row) => row.DifficultyID)))].sort((left, right) => left - right);
  const difficulties = usedDifficultyIds.map((difficultyId) => {
    const en = difficultyRows.en.find((row) => numeric(row.ID) === difficultyId);
    const ru = difficultyRows.ru.find((row) => numeric(row.ID) === difficultyId);
    return {
      difficultyId,
      registeredDifficulty: Boolean(en && ru),
      names: { en: en?.Name_lang ?? null, ru: ru?.Name_lang ?? null },
      ...(en && ru ? {
        metadata: pickNumeric(en, difficultyFields),
        localeMetadataMatch: difficultyFields.every((field) => en[field] === ru[field]),
      } : {}),
    };
  });

  return {
    schemaVersion: 1,
    scope: "venomous-abyss-withheld-description-effect-metadata",
    gameBuild,
    lastVerifiedAt,
    method: "Every effect-value, period, radius, and duration token in the withheld EN/RU inventory is mapped to its terminal or explicitly referenced spell ID. All exact-build difficulty rows are retained and mapped to paired EN/RU Difficulty records when a registered ID exists. SpellEffect scaling fields, SpellMisc duration links, and referenced SpellDuration/SpellRadius rows are compared before classification.",
    publicationPolicy: "This audit is evidence, not a prose renderer. static_metadata means only that the selected DB2 fields are present and agree across available difficulty rows. No token is publication-safe from this audit alone: signed aura semantics, difficulty/content tuning, client rounding, units, and locale grammar still require an independently verified renderer contract. Raw damage values and difficulty variants remain withheld.",
    limitations: [
      "Wago DB2 exports mirror client data but are not an official Blizzard publication surface.",
      "DifficultyID=0 has no registered row in the pinned Difficulty table and is retained as an unnamed DB2 default row; it is not assumed to represent a published raid difficulty.",
      "A static numeric DB2 value does not by itself prove its player-facing sign, unit, rounding, or grammatical form.",
      "This audit does not prove tactics, mechanic tags, role assignments, timelines, or drop chances.",
    ],
    sources: sources.map(({ fileName: _fileName, ...source }) => ({ ...source, sourcePriority: 3 })),
    summary: {
      tokenizedAbilities: new Set(evidence.map((record) => record.abilitySpellId)).size,
      evidenceRecords: evidence.length,
      targetSpellIds: targetSpellIds.size,
      categoryRecordCounts: countBy(evidence.map((record) => record.category)),
      classificationRecordCounts: countBy(evidence.map((record) => record.classification)),
      difficultyIds: usedDifficultyIds,
      registeredDifficultyIds: difficulties.filter((difficulty) => difficulty.registeredDifficulty).map((difficulty) => difficulty.difficultyId),
      unregisteredDifficultyIds: difficulties.filter((difficulty) => !difficulty.registeredDifficulty).map((difficulty) => difficulty.difficultyId),
      completeMetadataRecords: evidence.filter((record) => record.evidenceComplete).length,
      incompleteMetadataRecords: evidence.filter((record) => !record.evidenceComplete).length,
      standalonePublicationSafeRecords: 0,
    },
    difficulties,
    evidence,
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
  } else check(JSON.stringify(stable(audit)) === JSON.stringify(stable(generated)), "pinned-effect-audit-does-not-match-source-bytes");
}

const expected = expectedEvidenceRecords();
check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
check(audit?.gameBuild === gameBuild, "audit-build-mismatch");
check(audit?.summary?.tokenizedAbilities === 27, `tokenized-ability-count-invalid:${audit?.summary?.tokenizedAbilities}`);
check(audit?.summary?.evidenceRecords === expected.length, `evidence-record-count-invalid:${audit?.summary?.evidenceRecords}/${expected.length}`);
check(audit?.summary?.standalonePublicationSafeRecords === 0, `standalone-publication-safe-records-invalid:${audit?.summary?.standalonePublicationSafeRecords}`);
check(JSON.stringify(audit?.summary?.difficultyIds) === JSON.stringify([0, 14, 15, 16, 17, 220]), `difficulty-ids-invalid:${audit?.summary?.difficultyIds}`);
check(JSON.stringify(audit?.summary?.registeredDifficultyIds) === JSON.stringify([14, 15, 16, 17, 220]), `registered-difficulty-ids-invalid:${audit?.summary?.registeredDifficultyIds}`);
check(JSON.stringify(audit?.summary?.unregisteredDifficultyIds) === JSON.stringify([0]), `unregistered-difficulty-ids-invalid:${audit?.summary?.unregisteredDifficultyIds}`);
check((audit?.evidence?.length ?? 0) === expected.length, `evidence-array-count-invalid:${audit?.evidence?.length}/${expected.length}`);
check(new Set((audit?.evidence ?? []).map((record) => record.key)).size === expected.length, "effect-evidence-keys-not-unique");
for (const expectedRecord of expected) {
  const record = audit?.evidence?.find((candidate) => candidate.key === expectedRecord.key);
  check(Boolean(record), `effect-evidence-missing:${expectedRecord.key}`);
  check(record?.abilitySpellId === expectedRecord.abilitySpellId, `effect-ability-mismatch:${expectedRecord.key}`);
  check(record?.targetSpellId === expectedRecord.targetSpellId, `effect-target-mismatch:${expectedRecord.key}`);
  check(record?.effectIndex === expectedRecord.effectIndex, `effect-index-mismatch:${expectedRecord.key}`);
  check(["static_metadata", "difficulty_variant", "scaled_or_dynamic", "missing"].includes(record?.classification), `effect-classification-invalid:${expectedRecord.key}`);
  check((record?.sourceRows?.length ?? 0) > 0 || record?.classification === "missing", `effect-source-rows-empty:${expectedRecord.key}`);
  check((record?.difficultyContexts?.length ?? 0) > 0 || record?.classification === "missing", `effect-difficulty-context-empty:${expectedRecord.key}`);
}
for (const difficulty of audit?.difficulties ?? []) {
  check(difficulty.difficultyId === 0 || difficulty.registeredDifficulty === true, `difficulty-unregistered:${difficulty.difficultyId}`);
  if (difficulty.registeredDifficulty) {
    check(Boolean(difficulty.names?.en && difficulty.names?.ru), `difficulty-name-missing:${difficulty.difficultyId}`);
    check(difficulty.localeMetadataMatch === true, `difficulty-locale-metadata-mismatch:${difficulty.difficultyId}`);
  }
}
check((audit?.sources?.length ?? 0) === sources.length, `source-count-invalid:${audit?.sources?.length}/${sources.length}`);
for (const expectedSource of sources) {
  const source = audit?.sources?.find((candidate) => candidate.kind === expectedSource.kind);
  check(Boolean(source), `source-missing:${expectedSource.kind}`);
  check(source?.url === expectedSource.url, `source-url-mismatch:${expectedSource.kind}`);
  check(source?.sha256 === expectedSource.sha256, `source-hash-mismatch:${expectedSource.kind}`);
  check(source?.rows === expectedSource.rows, `source-row-count-mismatch:${expectedSource.kind}`);
  check(source?.sourcePriority === 3, `source-priority-invalid:${expectedSource.kind}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  sourceBytesCompared: Boolean(buffers),
  evidenceRecords: audit?.summary?.evidenceRecords ?? null,
  targetSpellIds: audit?.summary?.targetSpellIds ?? null,
  categoryRecordCounts: audit?.summary?.categoryRecordCounts ?? null,
  classificationRecordCounts: audit?.summary?.classificationRecordCounts ?? null,
  difficultyIds: audit?.summary?.difficultyIds ?? null,
  registeredDifficultyIds: audit?.summary?.registeredDifficultyIds ?? null,
  unregisteredDifficultyIds: audit?.summary?.unregisteredDifficultyIds ?? null,
  completeMetadataRecords: audit?.summary?.completeMetadataRecords ?? null,
  incompleteMetadataRecords: audit?.summary?.incompleteMetadataRecords ?? null,
  standalonePublicationSafeRecords: audit?.summary?.standalonePublicationSafeRecords ?? null,
  verified: issues.length === 0,
  violations: issues.length,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify({ summary, issues }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length) process.exitCode = 1;
