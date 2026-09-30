import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const write = process.argv.includes("--write");
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const inputDir = option("input-dir") ? path.resolve(root, option("input-dir")) : null;
const online = process.argv.includes("--online");
const descriptionAuditPath = path.resolve(root, option("description-audit") ?? "data/wow/midnight-season-one-description-audit.json");
const auditPath = path.resolve(root, option("audit") ?? "data/wow/midnight-season-one-effect-audit.json");
const reportPath = path.resolve(root, option("report") ?? "docs/reports/wow/midnight-season-one-effect-verification.json");
const descriptionAuditSource = await fs.readFile(descriptionAuditPath, "utf8");
const descriptionAudit = JSON.parse(descriptionAuditSource);
const gameBuild = descriptionAudit.gameBuild;

const sourceDefinitions = [
  ["spell_effect", "SpellEffect", "enUS"],
  ["spell_misc", "SpellMisc", "enUS"],
  ["spell_duration", "SpellDuration", "enUS"],
  ["spell_radius", "SpellRadius", "enUS"],
  ["difficulty_en", "Difficulty", "enUS"],
  ["difficulty_ru", "Difficulty", "ruRU"],
].map(([kind, table, locale]) => ({
  kind,
  table,
  locale,
  url: `https://wago.tools/db2/${table}/csv?build=${gameBuild}&locale=${locale}`,
  fileName: `${table}-${locale}.csv`,
}));

const numericCategories = new Set(["effect_value", "effect_period", "duration", "radius"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
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
  return records.filter((row) => row.length > 1 || row[0] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

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

function numericTokens(text) {
  const tokens = [];
  const patterns = {
    effect_value: /\$(?:(\d+))?[sSwW](\d+)/g,
    effect_period: /\$(?:(\d+))?[tT](\d*)/g,
    duration: /\$(?:(\d+))?[dD](?![A-Za-z0-9])/g,
    radius: /\$(?:(\d+))?[aA](\d+)/g,
  };
  for (const [category, pattern] of Object.entries(patterns)) {
    for (const match of text.matchAll(pattern)) {
      tokens.push({ category, token: match[0], explicitSpellId: match[1] ? Number(match[1]) : null, clientIndex: match[2] ?? null });
    }
  }
  return tokens;
}

function expectedEvidenceRecords() {
  const records = new Map();
  for (const ability of descriptionAudit.abilities.filter((candidate) => !candidate.publicationSafe)) {
    for (const locale of ["en", "ru"]) {
      const source = ability.source[locale];
      for (const token of numericTokens(source.description ?? "")) {
        const targetSpellId = token.explicitSpellId ?? source.terminalSpellId;
        const clientIndex = token.category === "duration" ? null : token.clientIndex;
        const effectIndex = token.category === "duration" || clientIndex === "" || Number(clientIndex) === 0
          ? null
          : Number(clientIndex) - 1;
        const indexResolution = token.category === "duration"
          ? "not_applicable"
          : clientIndex === ""
            ? "implicit_client_index_unresolved"
            : Number(clientIndex) === 0
              ? "client_index_zero_unresolved"
              : "exact_effect_index";
        const key = [ability.spellId, token.category, token.token, targetSpellId, effectIndex ?? indexResolution].join(":");
        const existing = records.get(key) ?? {
          key,
          abilitySpellId: ability.spellId,
          encounterId: ability.encounterId,
          category: token.category,
          token: token.token,
          targetSpellId,
          effectIndex,
          indexResolution,
          locales: [],
        };
        if (!existing.locales.includes(locale)) existing.locales.push(locale);
        records.set(key, existing);
      }
    }
  }
  return [...records.values()].sort((left, right) => left.key.localeCompare(right.key));
}

async function readStoredAudit() {
  try {
    return JSON.parse(await fs.readFile(auditPath, "utf8"));
  } catch (error) {
    if (!write) throw error;
    return null;
  }
}

async function loadSources(storedAudit) {
  if (!online && !inputDir) return null;
  const loaded = [];
  for (const definition of sourceDefinitions) {
    let bytes;
    if (online) {
      const response = await fetch(definition.url, {
        headers: { "user-agent": "GildraMidnightSeasonOneEffectAudit/1.0" },
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) throw new Error(`${definition.kind} returned HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } else bytes = await fs.readFile(path.join(inputDir, definition.fileName));
    const metadata = {
      ...definition,
      sha256: sha256(bytes),
      bytes: bytes.length,
      rows: bytes.toString("utf8").split(/\r?\n/).filter(Boolean).length - 1,
      sourceKind: "verified_database",
      sourcePriority: 3,
    };
    if (!write && storedAudit) {
      const pinned = storedAudit.sources?.find((source) => source.kind === definition.kind);
      if (!pinned || pinned.sha256 !== metadata.sha256 || pinned.bytes !== metadata.bytes || pinned.rows !== metadata.rows) {
        throw new Error(`${definition.kind} source evidence drift`);
      }
    }
    loaded.push({ ...metadata, raw: bytes });
  }
  return loaded;
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
const difficultyFields = ["ID", "InstanceType", "OrderIndex", "FallbackDifficultyID", "MinPlayers", "MaxPlayers", "Flags", "ItemContext"];

function pickNumeric(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, numeric(row[field])]));
}

function distinct(values) {
  return [...new Set(values.map((value) => JSON.stringify(value)))].map((value) => JSON.parse(value));
}

function classifyEffectValue(rows) {
  if (!rows.length) return { classification: "missing", metadataComplete: false, observedValues: [] };
  const observedValues = distinct(rows.map((row) => ({
    effect: row.Effect,
    effectAura: row.EffectAura,
    basePoints: row.EffectBasePointsF,
    effectAmplitude: row.EffectAmplitude,
  })));
  const dynamic = rows.some((row) => [
    row.EffectBonusCoefficient, row.EffectPointsPerResource, row.EffectRealPointsPerLevel,
    row.BonusCoefficientFromAP, row.Coefficient, row.Variance, row.ResourceCoefficient,
    row.GroupSizeBasePointsCoefficient, row.ScalingClass,
  ].some((value) => value !== 0));
  if (observedValues.length > 1) return { classification: "difficulty_variant", metadataComplete: true, observedValues };
  if (dynamic) return { classification: "scaled_or_dynamic", metadataComplete: true, observedValues };
  return { classification: "static_metadata", metadataComplete: true, observedValues };
}

function classifyPeriod(rows) {
  if (!rows.length || rows.every((row) => row.EffectAuraPeriod === 0)) {
    return { classification: "missing", metadataComplete: false, observedValues: [] };
  }
  const observedValues = distinct(rows.map((row) => ({ periodMs: row.EffectAuraPeriod })));
  return {
    classification: observedValues.length > 1 ? "difficulty_variant" : "static_metadata",
    metadataComplete: true,
    observedValues,
  };
}

function classifyRadius(rows, radiusById) {
  if (!rows.length) return { classification: "missing", metadataComplete: false, observedValues: [], radiusRows: [] };
  const radiusIds = [...new Set(rows.flatMap((row) => [row.EffectRadiusIndex_0, row.EffectRadiusIndex_1]).filter((value) => value > 0))].sort((a, b) => a - b);
  const radiusRows = radiusIds.map((id) => radiusById.get(id)).filter(Boolean);
  if (!radiusIds.length || radiusRows.length !== radiusIds.length) {
    return { classification: "missing", metadataComplete: false, observedValues: [], radiusRows };
  }
  const observedValues = distinct(rows.map((row) => ({
    radius0: row.EffectRadiusIndex_0 > 0 ? radiusById.get(row.EffectRadiusIndex_0) ?? null : null,
    radius1: row.EffectRadiusIndex_1 > 0 ? radiusById.get(row.EffectRadiusIndex_1) ?? null : null,
  })));
  return {
    classification: observedValues.length > 1 ? "difficulty_variant" : "static_metadata",
    metadataComplete: true,
    observedValues,
    radiusRows,
  };
}

function classifyDuration(rows, durationById) {
  if (!rows.length) return { classification: "missing", metadataComplete: false, observedValues: [], durationRows: [] };
  const durationIds = [...new Set(rows.map((row) => row.DurationIndex).filter((value) => value > 0))].sort((a, b) => a - b);
  const durationRows = durationIds.map((id) => durationById.get(id)).filter(Boolean);
  if (!durationIds.length || durationRows.length !== durationIds.length) {
    return { classification: "missing", metadataComplete: false, observedValues: [], durationRows };
  }
  const observedValues = distinct(rows.map((row) => ({
    durationIndex: row.DurationIndex,
    duration: durationById.get(row.DurationIndex) ?? null,
    minDurationMs: row.MinDuration,
  })));
  const dynamic = durationRows.some((row) => row.DurationPerResource !== 0);
  return {
    classification: observedValues.length > 1 ? "difficulty_variant" : dynamic ? "scaled_or_dynamic" : "static_metadata",
    metadataComplete: true,
    observedValues,
    durationRows,
  };
}

function buildAudit(loadedSources, lastVerifiedAt) {
  const sourceByKind = new Map(loadedSources.map((source) => [source.kind, source]));
  const expected = expectedEvidenceRecords();
  const targetSpellIds = new Set(expected.map((record) => record.targetSpellId));
  const effectRows = parseNumericCsv(sourceByKind.get("spell_effect").raw)
    .filter((row) => targetSpellIds.has(numeric(row.SpellID)))
    .map((row) => pickNumeric(row, effectFields));
  const miscRows = parseNumericCsv(sourceByKind.get("spell_misc").raw)
    .filter((row) => targetSpellIds.has(numeric(row.SpellID)))
    .map((row) => pickNumeric(row, miscFields));
  const durationRows = parseNumericCsv(sourceByKind.get("spell_duration").raw).map((row) => pickNumeric(row, durationFields));
  const radiusRows = parseNumericCsv(sourceByKind.get("spell_radius").raw).map((row) => pickNumeric(row, radiusFields));
  const difficultyRows = {
    en: parseCsv(sourceByKind.get("difficulty_en").raw),
    ru: parseCsv(sourceByKind.get("difficulty_ru").raw),
  };
  const difficultyNames = {
    en: new Map(difficultyRows.en.map((row) => [numeric(row.ID), row.Name_lang])),
    ru: new Map(difficultyRows.ru.map((row) => [numeric(row.ID), row.Name_lang])),
  };
  const durationById = new Map(durationRows.map((row) => [row.ID, row]));
  const radiusById = new Map(radiusRows.map((row) => [row.ID, row]));

  const evidence = expected.map((record) => {
    let sourceRows;
    let result;
    if (record.category === "duration") {
      sourceRows = miscRows.filter((row) => row.SpellID === record.targetSpellId)
        .sort((left, right) => left.DifficultyID - right.DifficultyID || left.ID - right.ID);
      result = classifyDuration(sourceRows, durationById);
    } else if (record.indexResolution !== "exact_effect_index") {
      sourceRows = effectRows.filter((row) => row.SpellID === record.targetSpellId)
        .sort((left, right) => left.DifficultyID - right.DifficultyID || left.EffectIndex - right.EffectIndex || left.ID - right.ID);
      result = {
        classification: "client_index_unresolved",
        metadataComplete: false,
        observedValues: [],
      };
    } else {
      sourceRows = effectRows.filter((row) => row.SpellID === record.targetSpellId && row.EffectIndex === record.effectIndex)
        .sort((left, right) => left.DifficultyID - right.DifficultyID || left.ID - right.ID);
      result = record.category === "effect_value"
        ? classifyEffectValue(sourceRows)
        : record.category === "effect_period"
          ? classifyPeriod(sourceRows)
          : classifyRadius(sourceRows, radiusById);
    }
    const difficultyContexts = [...new Set(sourceRows.map((row) => row.DifficultyID))]
      .sort((left, right) => left - right)
      .map((difficultyId) => ({
        difficultyId,
        registeredDifficulty: difficultyNames.en.has(difficultyId) && difficultyNames.ru.has(difficultyId),
        names: { en: difficultyNames.en.get(difficultyId) ?? null, ru: difficultyNames.ru.get(difficultyId) ?? null },
      }));
    return {
      ...record,
      ...result,
      independentlyRendered: false,
      publicationSafe: false,
      sourceRows,
      difficultyContexts,
    };
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
    scope: "Midnight Season 1 unresolved raid-description numeric client tokens recorded by the canonical manifest",
    gameBuild,
    descriptionAuditSha256: sha256(descriptionAuditSource),
    lastVerifiedAt,
    method: "Every effect-value, period, duration, and radius token in the exact-build EN/RU terminal descriptions is mapped to its explicit or terminal spell ID. Effect suffixes 1+ map to zero-based SpellEffect.EffectIndex. Suffix 0 and omitted period suffixes are retained as unresolved client-index semantics instead of being guessed. Every source row and difficulty context is retained.",
    publicationPolicy: "This audit is dependency evidence, not a tooltip renderer. No numeric token becomes publication-safe from DB2 metadata alone. Player-facing sign, unit, scaling, content tuning, rounding, locale grammar, and difficulty rendering require an independent exact-context render before publication.",
    limitations: [
      "Wago DB2 exports mirror client data but are not an official Blizzard publication surface.",
      "DifficultyID=0 is retained as an unnamed DB2 default when the pinned Difficulty table has no corresponding row; it is not labeled as a raid difficulty.",
      "Client tokens with suffix 0 or no effect suffix are explicitly unresolved; no EffectIndex is inferred.",
      "Static metadata does not prove player-facing values, tactics, mechanic tags, role assignments, timelines, or drop chances.",
    ],
    sources: loadedSources.map(({ raw: _raw, fileName: _fileName, ...source }) => source),
    summary: {
      withheldAbilities: descriptionAudit.abilities.filter((ability) => !ability.publicationSafe).length,
      tokenizedAbilities: new Set(evidence.map((record) => record.abilitySpellId)).size,
      evidenceRecords: evidence.length,
      targetSpellIds: targetSpellIds.size,
      categoryRecordCounts: countBy(evidence.map((record) => record.category)),
      classificationRecordCounts: countBy(evidence.map((record) => record.classification)),
      indexResolutionCounts: countBy(evidence.map((record) => record.indexResolution)),
      difficultyIds: usedDifficultyIds,
      registeredDifficultyIds: difficulties.filter((difficulty) => difficulty.registeredDifficulty).map((difficulty) => difficulty.difficultyId),
      unregisteredDifficultyIds: difficulties.filter((difficulty) => !difficulty.registeredDifficulty).map((difficulty) => difficulty.difficultyId),
      metadataCompleteRecords: evidence.filter((record) => record.metadataComplete).length,
      metadataIncompleteRecords: evidence.filter((record) => !record.metadataComplete).length,
      independentlyRenderedRecords: evidence.filter((record) => record.independentlyRendered).length,
      standalonePublicationSafeRecords: evidence.filter((record) => record.publicationSafe).length,
    },
    difficulties,
    evidence,
  };
}

function comparable(audit) {
  const { lastVerifiedAt: _lastVerifiedAt, ...projection } = audit;
  return projection;
}

const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
let audit = await readStoredAudit();
const loadedSources = await loadSources(audit);
if (loadedSources) {
  const generated = buildAudit(loadedSources, audit?.lastVerifiedAt ?? new Date().toISOString());
  if (write) {
    audit = { ...generated, lastVerifiedAt: new Date().toISOString() };
    await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  } else check(JSON.stringify(comparable(audit)) === JSON.stringify(comparable(generated)), "online-source-evidence-drift");
}

const expected = expectedEvidenceRecords();
check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
check(audit?.gameBuild === gameBuild, "audit-build-invalid");
check(audit?.descriptionAuditSha256 === sha256(descriptionAuditSource), "description-audit-hash-mismatch");
check(audit?.summary?.withheldAbilities === 28, `withheld-ability-count-invalid:${audit?.summary?.withheldAbilities}`);
check(audit?.summary?.tokenizedAbilities === 28, `tokenized-ability-count-invalid:${audit?.summary?.tokenizedAbilities}`);
check(audit?.summary?.evidenceRecords === expected.length, `evidence-record-count-invalid:${audit?.summary?.evidenceRecords}/${expected.length}`);
check(audit?.summary?.standalonePublicationSafeRecords === 0, `standalone-publication-safe-records-invalid:${audit?.summary?.standalonePublicationSafeRecords}`);
check(audit?.summary?.independentlyRenderedRecords === 0, `independently-rendered-records-invalid:${audit?.summary?.independentlyRenderedRecords}`);
check((audit?.evidence?.length ?? 0) === expected.length, `evidence-array-count-invalid:${audit?.evidence?.length}/${expected.length}`);
check(new Set((audit?.evidence ?? []).map((record) => record.key)).size === expected.length, "effect-evidence-keys-not-unique");
const recordedEvidence = audit?.evidence ?? [];
const recordedTargetSpellIds = [...new Set(recordedEvidence.map((record) => record.targetSpellId))].sort((left, right) => left - right);
const recordedDifficultyIds = [...new Set(recordedEvidence.flatMap((record) => record.sourceRows ?? []).map((row) => row.DifficultyID))]
  .sort((left, right) => left - right);
check(audit?.summary?.targetSpellIds === recordedTargetSpellIds.length, `target-spell-count-invalid:${audit?.summary?.targetSpellIds}/${recordedTargetSpellIds.length}`);
check(JSON.stringify(audit?.summary?.categoryRecordCounts) === JSON.stringify(countBy(recordedEvidence.map((record) => record.category))), "category-record-counts-invalid");
check(JSON.stringify(audit?.summary?.classificationRecordCounts) === JSON.stringify(countBy(recordedEvidence.map((record) => record.classification))), "classification-record-counts-invalid");
check(JSON.stringify(audit?.summary?.indexResolutionCounts) === JSON.stringify(countBy(recordedEvidence.map((record) => record.indexResolution))), "index-resolution-counts-invalid");
check(audit?.summary?.metadataCompleteRecords === recordedEvidence.filter((record) => record.metadataComplete).length, "metadata-complete-count-invalid");
check(audit?.summary?.metadataIncompleteRecords === recordedEvidence.filter((record) => !record.metadataComplete).length, "metadata-incomplete-count-invalid");
check(JSON.stringify(audit?.summary?.difficultyIds) === JSON.stringify(recordedDifficultyIds), "difficulty-id-summary-invalid");
check(JSON.stringify(recordedDifficultyIds) === JSON.stringify([0, 14, 15, 16, 17, 220]), `difficulty-id-scope-invalid:${recordedDifficultyIds}`);
for (const expectedRecord of expected) {
  const record = audit?.evidence?.find((candidate) => candidate.key === expectedRecord.key);
  check(Boolean(record), `effect-evidence-missing:${expectedRecord.key}`);
  check(record?.abilitySpellId === expectedRecord.abilitySpellId && record?.targetSpellId === expectedRecord.targetSpellId,
    `effect-identity-mismatch:${expectedRecord.key}`);
  check(record?.effectIndex === expectedRecord.effectIndex && record?.indexResolution === expectedRecord.indexResolution,
    `effect-index-mismatch:${expectedRecord.key}`);
  check(["static_metadata", "difficulty_variant", "scaled_or_dynamic", "client_index_unresolved", "missing"].includes(record?.classification),
    `effect-classification-invalid:${expectedRecord.key}`);
  check(record?.publicationSafe === false && record?.independentlyRendered === false,
    `unsafe-effect-publication-state:${expectedRecord.key}`);
  if (["static_metadata", "difficulty_variant", "scaled_or_dynamic"].includes(record?.classification)) {
    check(record?.metadataComplete === true && (record?.sourceRows?.length ?? 0) > 0,
      `complete-effect-metadata-invalid:${expectedRecord.key}`);
  }
  if (["client_index_unresolved", "missing"].includes(record?.classification)) {
    check(record?.metadataComplete === false, `incomplete-effect-metadata-invalid:${expectedRecord.key}`);
  }
  if (expectedRecord.indexResolution !== "exact_effect_index" && expectedRecord.indexResolution !== "not_applicable") {
    check(record?.classification === "client_index_unresolved" && record?.metadataComplete === false && record?.effectIndex === null,
      `unresolved-client-index-promoted:${expectedRecord.key}`);
  }
  check(Array.isArray(record?.sourceRows) && Array.isArray(record?.difficultyContexts), `effect-evidence-shape-invalid:${expectedRecord.key}`);
}
check((audit?.sources?.length ?? 0) === sourceDefinitions.length, `source-count-invalid:${audit?.sources?.length}/${sourceDefinitions.length}`);
for (const definition of sourceDefinitions) {
  const source = audit?.sources?.find((candidate) => candidate.kind === definition.kind);
  check(source?.url === definition.url && source?.sourceKind === "verified_database" && source?.sourcePriority === 3
    && /^[a-f0-9]{64}$/.test(source?.sha256 ?? "") && Number.isInteger(source?.bytes) && source.bytes > 0
    && Number.isInteger(source?.rows) && source.rows > 0, `source-evidence-invalid:${definition.kind}`);
}
for (const difficulty of audit?.difficulties ?? []) {
  check(difficulty.difficultyId === 0 || difficulty.registeredDifficulty === true, `difficulty-unregistered:${difficulty.difficultyId}`);
  if (difficulty.registeredDifficulty) {
    check(nonEmptyString(difficulty.names?.en) && nonEmptyString(difficulty.names?.ru), `difficulty-name-missing:${difficulty.difficultyId}`);
    check(difficulty.localeMetadataMatch === true, `difficulty-locale-metadata-mismatch:${difficulty.difficultyId}`);
  }
}
check((audit?.difficulties?.length ?? 0) === recordedDifficultyIds.length, "difficulty-record-count-invalid");
check(JSON.stringify(audit?.summary?.registeredDifficultyIds) === JSON.stringify((audit?.difficulties ?? [])
  .filter((difficulty) => difficulty.registeredDifficulty).map((difficulty) => difficulty.difficultyId)), "registered-difficulty-summary-invalid");
check(JSON.stringify(audit?.summary?.unregisteredDifficultyIds) === JSON.stringify((audit?.difficulties ?? [])
  .filter((difficulty) => !difficulty.registeredDifficulty).map((difficulty) => difficulty.difficultyId)), "unregistered-difficulty-summary-invalid");
for (const ability of descriptionAudit.abilities.filter((candidate) => !candidate.publicationSafe)) {
  const requiredNumeric = new Set(ability.requiredBy.filter((category) => numericCategories.has(category)));
  const recordedNumeric = new Set((audit?.evidence ?? []).filter((record) => record.abilitySpellId === ability.spellId).map((record) => record.category));
  for (const category of requiredNumeric) check(recordedNumeric.has(category), `required-numeric-category-missing:${ability.spellId}:${category}`);
  for (const category of recordedNumeric) check(requiredNumeric.has(category), `numeric-category-not-required:${ability.spellId}:${category}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  write,
  sourceBytesCompared: Boolean(loadedSources),
  evidenceRecords: audit?.summary?.evidenceRecords ?? null,
  targetSpellIds: audit?.summary?.targetSpellIds ?? null,
  categoryRecordCounts: audit?.summary?.categoryRecordCounts ?? null,
  classificationRecordCounts: audit?.summary?.classificationRecordCounts ?? null,
  indexResolutionCounts: audit?.summary?.indexResolutionCounts ?? null,
  difficultyIds: audit?.summary?.difficultyIds ?? null,
  registeredDifficultyIds: audit?.summary?.registeredDifficultyIds ?? null,
  unregisteredDifficultyIds: audit?.summary?.unregisteredDifficultyIds ?? null,
  metadataCompleteRecords: audit?.summary?.metadataCompleteRecords ?? null,
  metadataIncompleteRecords: audit?.summary?.metadataIncompleteRecords ?? null,
  independentlyRenderedRecords: audit?.summary?.independentlyRenderedRecords ?? null,
  standalonePublicationSafeRecords: audit?.summary?.standalonePublicationSafeRecords ?? null,
  verified: issues.length === 0,
  violations: issues,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
