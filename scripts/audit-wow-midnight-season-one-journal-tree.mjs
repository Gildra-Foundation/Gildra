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
const auditPath = path.resolve(root, option("audit") ?? "data/wow/midnight-season-one-journal-tree-audit.json");
const reportPath = path.resolve(root, option("report") ?? "docs/reports/wow/midnight-season-one-journal-tree-verification.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const expectedEncounterIds = [2733, 2734, 2735, 2736, 2737, 2738, 2739, 2740, 2795];
const targetEncounters = manifest.encounters
  .filter((encounter) => encounter.season === "midnight-season-1"
    && expectedEncounterIds.includes(encounter.refs?.encounterId))
  .sort((left, right) => left.refs.encounterId - right.refs.encounterId);

const sourceDefinitions = [
  ["journal_encounter_en", "JournalEncounter", "en", "enUS"],
  ["journal_encounter_ru", "JournalEncounter", "ru", "ruRU"],
  ["journal_section_en", "JournalEncounterSection", "en", "enUS"],
  ["journal_section_ru", "JournalEncounterSection", "ru", "ruRU"],
].map(([kind, table, locale, sourceLocale]) => ({
  kind,
  table,
  locale,
  sourceLocale,
  url: `https://wago.tools/db2/${table}/csv?build=${gameBuild}&locale=${sourceLocale}`,
  fileName: `${table}-${sourceLocale}.csv`,
}));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const positiveInteger = (value) => Number.isInteger(value) && value > 0;

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

function integer(row, field) {
  const value = Number(row[field]);
  if (!Number.isInteger(value)) throw new Error(`invalid integer ${field}=${row[field]}`);
  return value;
}

function normalizedRowsHash(rows) {
  const normalized = rows.map((row) => Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]])))
    .sort((left, right) => integer(left, "ID") - integer(right, "ID") || JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return sha256(JSON.stringify(normalized));
}

function classifyText(text) {
  if (!text) return "empty";
  if (text.includes("$") || /\|(?:c[0-9A-Fa-f]{8}|Hspell:|h|r)/.test(text)) return "tokenized";
  return "publication_safe";
}

function localizedEvidence(text) {
  return {
    classification: classifyText(text),
    length: [...text].length,
    sha256: sha256(text),
    ...(classifyText(text) === "publication_safe" ? { text } : {}),
  };
}

function encounterStructure(row) {
  return {
    journalEncounterId: integer(row, "ID"),
    journalInstanceId: integer(row, "JournalInstanceID"),
    dungeonEncounterId: integer(row, "DungeonEncounterID"),
    orderIndex: integer(row, "OrderIndex"),
    firstSectionId: integer(row, "FirstSectionID"),
    uiMapId: integer(row, "UiMapID"),
    mapDisplayConditionId: integer(row, "MapDisplayConditionID"),
    flags: integer(row, "Flags"),
    difficultyMask: integer(row, "DifficultyMask"),
  };
}

function sectionStructure(row) {
  return {
    sectionId: integer(row, "ID"),
    journalEncounterId: integer(row, "JournalEncounterID"),
    orderIndex: integer(row, "OrderIndex"),
    parentSectionId: integer(row, "ParentSectionID"),
    firstChildSectionId: integer(row, "FirstChildSectionID"),
    nextSiblingSectionId: integer(row, "NextSiblingSectionID"),
    type: integer(row, "Type"),
    spellId: integer(row, "SpellID"),
    iconCreatureDisplayInfoId: integer(row, "IconCreatureDisplayInfoID"),
    uiModelSceneId: integer(row, "UiModelSceneID"),
    iconFileDataId: integer(row, "IconFileDataID"),
    flags: integer(row, "Flags"),
    iconFlags: integer(row, "IconFlags"),
    difficultyMask: integer(row, "DifficultyMask"),
  };
}

function traverse(sections, firstSectionId) {
  const byId = new Map(sections.map((section) => [section.sectionId, section]));
  const visited = new Set();
  const cycles = new Set();
  const missingTargets = new Set();

  function visitChain(startId, ancestry = new Set()) {
    let sectionId = startId;
    const siblings = new Set();
    while (sectionId !== 0) {
      if (siblings.has(sectionId) || ancestry.has(sectionId)) {
        cycles.add(sectionId);
        return;
      }
      siblings.add(sectionId);
      const section = byId.get(sectionId);
      if (!section) {
        missingTargets.add(sectionId);
        return;
      }
      visited.add(sectionId);
      if (section.firstChildSectionId !== 0) {
        visitChain(section.firstChildSectionId, new Set([...ancestry, sectionId]));
      }
      sectionId = section.nextSiblingSectionId;
    }
  }

  visitChain(firstSectionId);
  return {
    reachableSectionIds: [...visited].sort((left, right) => left - right),
    traversalCycles: [...cycles].sort((left, right) => left - right),
    missingTraversalTargets: [...missingTargets].sort((left, right) => left - right),
  };
}

function uniqueSortedPositive(values) {
  return [...new Set(values.filter(positiveInteger))].sort((left, right) => left - right);
}

function manifestSpellIds(encounter) {
  return uniqueSortedPositive(manifest.abilities
    .filter((ability) => ability.parentId === encounter.id)
    .map((ability) => ability.refs?.spellId));
}

async function loadSources() {
  return Promise.all(sourceDefinitions.map(async (definition) => {
    let bytes;
    if (inputDir) bytes = await fs.readFile(path.join(inputDir, definition.fileName));
    else {
      const response = await fetch(definition.url, {
        headers: { "user-agent": "GildraMidnightSeasonOneJournalTreeAudit/1.0" },
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`${definition.kind}:http-${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    const rows = parseCsv(bytes);
    const selectedRows = definition.table === "JournalEncounter"
      ? rows.filter((row) => expectedEncounterIds.includes(integer(row, "ID")))
      : rows.filter((row) => expectedEncounterIds.includes(integer(row, "JournalEncounterID")));
    return {
      ...definition,
      bytes,
      rows,
      sourceEvidence: {
        kind: definition.kind,
        table: definition.table,
        locale: definition.locale,
        url: definition.url,
        transportSha256: sha256(bytes),
        canonicalRowsSha256: normalizedRowsHash(rows),
        selectedRowsSha256: normalizedRowsHash(selectedRows),
        bytes: bytes.length,
        rows: rows.length,
        selectedRows: selectedRows.length,
      },
    };
  }));
}

function buildAudit(loadedSources) {
  const sourceByKind = new Map(loadedSources.map((source) => [source.kind, source]));
  const encounterRows = Object.fromEntries(["en", "ru"].map((locale) => [locale,
    sourceByKind.get(`journal_encounter_${locale}`).rows.filter((row) => expectedEncounterIds.includes(integer(row, "ID"))),
  ]));
  const sectionRows = Object.fromEntries(["en", "ru"].map((locale) => [locale,
    sourceByKind.get(`journal_section_${locale}`).rows.filter((row) => expectedEncounterIds.includes(integer(row, "JournalEncounterID"))),
  ]));
  const encounters = targetEncounters.map((manifestEncounter) => {
    const journalEncounterId = manifestEncounter.refs.encounterId;
    const localizedEncounterRows = Object.fromEntries(["en", "ru"].map((locale) => [locale,
      encounterRows[locale].filter((row) => integer(row, "ID") === journalEncounterId),
    ]));
    if (localizedEncounterRows.en.length !== 1 || localizedEncounterRows.ru.length !== 1) {
      throw new Error(`expected one EN and RU JournalEncounter row for ${journalEncounterId}`);
    }
    const encounterStructures = Object.fromEntries(["en", "ru"].map((locale) => [locale,
      encounterStructure(localizedEncounterRows[locale][0]),
    ]));
    const localizedSectionRows = Object.fromEntries(["en", "ru"].map((locale) => [locale,
      sectionRows[locale].filter((row) => integer(row, "JournalEncounterID") === journalEncounterId),
    ]));
    const sectionStructures = Object.fromEntries(["en", "ru"].map((locale) => [locale,
      localizedSectionRows[locale].map(sectionStructure).sort((left, right) => left.sectionId - right.sectionId),
    ]));
    const ruById = new Map(localizedSectionRows.ru.map((row) => [integer(row, "ID"), row]));
    const sections = localizedSectionRows.en.map((enRow) => {
      const structure = sectionStructure(enRow);
      const ruRow = ruById.get(structure.sectionId);
      if (!ruRow) throw new Error(`RU section ${structure.sectionId} missing for ${journalEncounterId}`);
      return {
        ...structure,
        titles: { en: localizedEvidence(enRow.Title_lang), ru: localizedEvidence(ruRow.Title_lang) },
        bodies: { en: localizedEvidence(enRow.BodyText_lang), ru: localizedEvidence(ruRow.BodyText_lang) },
      };
    }).sort((left, right) => left.sectionId - right.sectionId);
    const traversal = traverse(sections, encounterStructures.en.firstSectionId);
    const reachableSet = new Set(traversal.reachableSectionIds);
    const reachableSpellIds = uniqueSortedPositive(sections
      .filter((section) => reachableSet.has(section.sectionId))
      .map((section) => section.spellId));
    const unreachableSpellIds = uniqueSortedPositive(sections
      .filter((section) => !reachableSet.has(section.sectionId))
      .map((section) => section.spellId));
    const recordedSpellIds = manifestSpellIds(manifestEncounter);
    const missingFromManifestSpellIds = reachableSpellIds.filter((spellId) => !recordedSpellIds.includes(spellId));
    const manifestOnlySpellIds = recordedSpellIds.filter((spellId) => !reachableSpellIds.includes(spellId));
    const abilityIdentityCoverageComplete = missingFromManifestSpellIds.length === 0
      && manifestOnlySpellIds.length === 0
      && traversal.traversalCycles.length === 0
      && traversal.missingTraversalTargets.length === 0
      && JSON.stringify(encounterStructures.en) === JSON.stringify(encounterStructures.ru)
      && JSON.stringify(sectionStructures.en) === JSON.stringify(sectionStructures.ru);
    return {
      manifestId: manifestEncounter.id,
      canonicalSlug: manifestEncounter.canonicalSlug,
      instance: manifestEncounter.instance,
      journalEncounterId,
      encounterStructure: encounterStructures.en,
      localeEncounterStructureSha256: {
        en: sha256(JSON.stringify(encounterStructures.en)),
        ru: sha256(JSON.stringify(encounterStructures.ru)),
      },
      names: {
        en: localizedEvidence(localizedEncounterRows.en[0].Name_lang),
        ru: localizedEvidence(localizedEncounterRows.ru[0].Name_lang),
      },
      descriptions: {
        en: localizedEvidence(localizedEncounterRows.en[0].Description_lang),
        ru: localizedEvidence(localizedEncounterRows.ru[0].Description_lang),
      },
      sectionRowsPerLocale: { en: localizedSectionRows.en.length, ru: localizedSectionRows.ru.length },
      localeSectionStructureSha256: {
        en: sha256(JSON.stringify(sectionStructures.en)),
        ru: sha256(JSON.stringify(sectionStructures.ru)),
      },
      ...traversal,
      unreachableSectionIds: sections.filter((section) => !reachableSet.has(section.sectionId)).map((section) => section.sectionId),
      reachableSpellIds,
      unreachableSpellIds,
      manifestRecordedSpellIds: recordedSpellIds,
      missingFromManifestSpellIds,
      manifestOnlySpellIds,
      abilityIdentityCoverageComplete,
      coverageStatus: abilityIdentityCoverageComplete ? "complete" : "incomplete",
      sections,
    };
  });
  return {
    schemaVersion: 1,
    scope: "Midnight Season 1 exact-build EN/RU Encounter Journal trees and overview-linked spell identity coverage",
    gameBuild,
    sourceKind: "verified_database",
    sourcePriority: 3,
    method: "Select exact JournalEncounter IDs in EN/RU, obtain FirstSectionID from the build-pinned JournalEncounter row, compare locale structures, traverse FirstChildSectionID and NextSiblingSectionID, and compare every nonzero reachable SpellID with the canonical manifest.",
    coveragePolicy: "Ability identity coverage is complete only when both locale structures are identical, traversal has no cycles or missing targets, and the manifest SpellID set exactly equals the nonzero SpellID set reachable from FirstSectionID. This does not prove descriptions, tactics, icons, phases, or difficulty behavior.",
    sources: loadedSources.map((source) => source.sourceEvidence),
    summary: {
      encounters: encounters.length,
      sectionRowsPerLocale: {
        en: encounters.reduce((total, encounter) => total + encounter.sectionRowsPerLocale.en, 0),
        ru: encounters.reduce((total, encounter) => total + encounter.sectionRowsPerLocale.ru, 0),
      },
      reachableSections: encounters.reduce((total, encounter) => total + encounter.reachableSectionIds.length, 0),
      unreachableSections: encounters.reduce((total, encounter) => total + encounter.unreachableSectionIds.length, 0),
      traversalCycles: encounters.reduce((total, encounter) => total + encounter.traversalCycles.length, 0),
      missingTraversalTargets: encounters.reduce((total, encounter) => total + encounter.missingTraversalTargets.length, 0),
      reachableSpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.reachableSpellIds)).length,
      manifestRecordedSpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.manifestRecordedSpellIds)).length,
      missingFromManifestSpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.missingFromManifestSpellIds)).length,
      manifestOnlySpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.manifestOnlySpellIds)).length,
      encountersWithCompleteAbilityIdentityCoverage: encounters.filter((encounter) => encounter.abilityIdentityCoverageComplete).length,
      abilityIdentityCoverageComplete: encounters.every((encounter) => encounter.abilityIdentityCoverageComplete),
    },
    encounters,
  };
}

function comparable(audit) {
  return {
    ...audit,
    lastVerifiedAt: undefined,
    sources: audit.sources.map(({ transportSha256: _transportSha256, bytes: _bytes, ...source }) => source),
  };
}

function validateAudit(audit) {
  const issues = [];
  const check = (condition, issue) => { if (!condition) issues.push(issue); };
  check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
  check(audit?.gameBuild === gameBuild, "audit-build-invalid");
  check(audit?.sourceKind === "verified_database" && audit?.sourcePriority === 3, "audit-source-classification-invalid");
  check(Number.isFinite(Date.parse(audit?.lastVerifiedAt)), "audit-last-verified-at-invalid");
  check(targetEncounters.length === expectedEncounterIds.length, `manifest-encounter-scope-invalid:${targetEncounters.length}`);
  check(JSON.stringify(targetEncounters.map((encounter) => encounter.refs.encounterId)) === JSON.stringify(expectedEncounterIds), "manifest-encounter-id-set-invalid");
  check(audit?.sources?.length === sourceDefinitions.length, `source-count-invalid:${audit?.sources?.length}`);
  for (const definition of sourceDefinitions) {
    const source = audit?.sources?.find((candidate) => candidate.kind === definition.kind);
    check(source?.table === definition.table && source?.locale === definition.locale && source?.url === definition.url,
      `source-identity-invalid:${definition.kind}`);
    check(/^[a-f0-9]{64}$/.test(source?.transportSha256 ?? "")
      && /^[a-f0-9]{64}$/.test(source?.canonicalRowsSha256 ?? "")
      && /^[a-f0-9]{64}$/.test(source?.selectedRowsSha256 ?? "")
      && positiveInteger(source?.bytes) && positiveInteger(source?.rows) && positiveInteger(source?.selectedRows),
    `source-evidence-invalid:${definition.kind}`);
  }
  check(audit?.encounters?.length === expectedEncounterIds.length, `encounter-count-invalid:${audit?.encounters?.length}`);
  check(JSON.stringify(audit?.encounters?.map((encounter) => encounter.journalEncounterId)) === JSON.stringify(expectedEncounterIds), "encounter-id-set-invalid");

  for (const encounter of audit?.encounters ?? []) {
    const manifestEncounter = targetEncounters.find((candidate) => candidate.refs.encounterId === encounter.journalEncounterId);
    check(Boolean(manifestEncounter), `manifest-encounter-missing:${encounter.journalEncounterId}`);
    check(encounter.manifestId === manifestEncounter?.id && encounter.canonicalSlug === manifestEncounter?.canonicalSlug
      && encounter.instance === manifestEncounter?.instance, `manifest-encounter-identity-mismatch:${encounter.journalEncounterId}`);
    check(encounter.encounterStructure?.journalEncounterId === encounter.journalEncounterId
      && positiveInteger(encounter.encounterStructure?.journalInstanceId)
      && positiveInteger(encounter.encounterStructure?.dungeonEncounterId)
      && positiveInteger(encounter.encounterStructure?.firstSectionId), `encounter-structure-invalid:${encounter.journalEncounterId}`);
    check(encounter.localeEncounterStructureSha256?.en === encounter.localeEncounterStructureSha256?.ru,
      `encounter-locale-structure-divergence:${encounter.journalEncounterId}`);
    check(encounter.localeSectionStructureSha256?.en === encounter.localeSectionStructureSha256?.ru,
      `section-locale-structure-divergence:${encounter.journalEncounterId}`);
    check(encounter.sectionRowsPerLocale?.en === encounter.sectionRowsPerLocale?.ru
      && encounter.sections?.length === encounter.sectionRowsPerLocale?.en,
    `section-row-count-invalid:${encounter.journalEncounterId}`);
    const sectionIds = encounter.sections?.map((section) => section.sectionId) ?? [];
    check(new Set(sectionIds).size === sectionIds.length, `duplicate-section-id:${encounter.journalEncounterId}`);
    check(encounter.sections?.every((section) => section.journalEncounterId === encounter.journalEncounterId
      && /^[a-f0-9]{64}$/.test(section.titles?.en?.sha256 ?? "")
      && /^[a-f0-9]{64}$/.test(section.titles?.ru?.sha256 ?? "")
      && /^[a-f0-9]{64}$/.test(section.bodies?.en?.sha256 ?? "")
      && /^[a-f0-9]{64}$/.test(section.bodies?.ru?.sha256 ?? "")),
    `section-evidence-invalid:${encounter.journalEncounterId}`);
    const traversal = traverse(encounter.sections ?? [], encounter.encounterStructure?.firstSectionId ?? 0);
    check(JSON.stringify(traversal.reachableSectionIds) === JSON.stringify(encounter.reachableSectionIds),
      `reachable-section-set-invalid:${encounter.journalEncounterId}`);
    check(JSON.stringify(traversal.traversalCycles) === JSON.stringify(encounter.traversalCycles)
      && traversal.traversalCycles.length === 0, `traversal-cycle-invalid:${encounter.journalEncounterId}`);
    check(JSON.stringify(traversal.missingTraversalTargets) === JSON.stringify(encounter.missingTraversalTargets)
      && traversal.missingTraversalTargets.length === 0, `missing-traversal-target-invalid:${encounter.journalEncounterId}`);
    const reachableSet = new Set(traversal.reachableSectionIds);
    const derivedReachableSpellIds = uniqueSortedPositive((encounter.sections ?? [])
      .filter((section) => reachableSet.has(section.sectionId)).map((section) => section.spellId));
    const derivedUnreachableSectionIds = (encounter.sections ?? [])
      .filter((section) => !reachableSet.has(section.sectionId)).map((section) => section.sectionId);
    const derivedUnreachableSpellIds = uniqueSortedPositive((encounter.sections ?? [])
      .filter((section) => !reachableSet.has(section.sectionId)).map((section) => section.spellId));
    const derivedManifestSpellIds = manifestEncounter ? manifestSpellIds(manifestEncounter) : [];
    const missingFromManifest = derivedReachableSpellIds.filter((spellId) => !derivedManifestSpellIds.includes(spellId));
    const manifestOnly = derivedManifestSpellIds.filter((spellId) => !derivedReachableSpellIds.includes(spellId));
    const complete = missingFromManifest.length === 0 && manifestOnly.length === 0;
    check(JSON.stringify(encounter.unreachableSectionIds) === JSON.stringify(derivedUnreachableSectionIds),
      `unreachable-section-set-invalid:${encounter.journalEncounterId}`);
    check(JSON.stringify(encounter.reachableSpellIds) === JSON.stringify(derivedReachableSpellIds)
      && JSON.stringify(encounter.unreachableSpellIds) === JSON.stringify(derivedUnreachableSpellIds),
    `spell-universe-invalid:${encounter.journalEncounterId}`);
    check(JSON.stringify(encounter.manifestRecordedSpellIds) === JSON.stringify(derivedManifestSpellIds),
      `manifest-spell-set-invalid:${encounter.journalEncounterId}`);
    check(JSON.stringify(encounter.missingFromManifestSpellIds) === JSON.stringify(missingFromManifest)
      && JSON.stringify(encounter.manifestOnlySpellIds) === JSON.stringify(manifestOnly),
    `coverage-delta-invalid:${encounter.journalEncounterId}`);
    check(encounter.abilityIdentityCoverageComplete === complete
      && encounter.coverageStatus === (complete ? "complete" : "incomplete"),
    `coverage-verdict-invalid:${encounter.journalEncounterId}`);
  }

  const encounters = audit?.encounters ?? [];
  const derivedSummary = {
    encounters: encounters.length,
    sectionRowsPerLocale: {
      en: encounters.reduce((total, encounter) => total + encounter.sectionRowsPerLocale.en, 0),
      ru: encounters.reduce((total, encounter) => total + encounter.sectionRowsPerLocale.ru, 0),
    },
    reachableSections: encounters.reduce((total, encounter) => total + encounter.reachableSectionIds.length, 0),
    unreachableSections: encounters.reduce((total, encounter) => total + encounter.unreachableSectionIds.length, 0),
    traversalCycles: encounters.reduce((total, encounter) => total + encounter.traversalCycles.length, 0),
    missingTraversalTargets: encounters.reduce((total, encounter) => total + encounter.missingTraversalTargets.length, 0),
    reachableSpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.reachableSpellIds)).length,
    manifestRecordedSpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.manifestRecordedSpellIds)).length,
    missingFromManifestSpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.missingFromManifestSpellIds)).length,
    manifestOnlySpellIdentities: uniqueSortedPositive(encounters.flatMap((encounter) => encounter.manifestOnlySpellIds)).length,
    encountersWithCompleteAbilityIdentityCoverage: encounters.filter((encounter) => encounter.abilityIdentityCoverageComplete).length,
    abilityIdentityCoverageComplete: encounters.every((encounter) => encounter.abilityIdentityCoverageComplete),
  };
  check(JSON.stringify(audit?.summary) === JSON.stringify(derivedSummary), "summary-invalid");
  return issues;
}

let audit;
const issues = [];
if (online) {
  const loadedSources = await loadSources();
  const generated = buildAudit(loadedSources);
  if (write) {
    audit = { ...generated, lastVerifiedAt: new Date().toISOString() };
    await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  } else {
    audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
    if (JSON.stringify(comparable(audit)) !== JSON.stringify(comparable(generated))) issues.push("online-source-evidence-drift");
  }
} else audit = JSON.parse(await fs.readFile(auditPath, "utf8"));

issues.push(...validateAudit(audit));
const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  write,
  sourceRowsCompared: online,
  encounters: audit?.summary?.encounters ?? 0,
  reachableSections: audit?.summary?.reachableSections ?? null,
  unreachableSections: audit?.summary?.unreachableSections ?? null,
  reachableSpellIdentities: audit?.summary?.reachableSpellIdentities ?? null,
  manifestRecordedSpellIdentities: audit?.summary?.manifestRecordedSpellIdentities ?? null,
  missingFromManifestSpellIdentities: audit?.summary?.missingFromManifestSpellIdentities ?? null,
  manifestOnlySpellIdentities: audit?.summary?.manifestOnlySpellIdentities ?? null,
  encountersWithCompleteAbilityIdentityCoverage: audit?.summary?.encountersWithCompleteAbilityIdentityCoverage ?? null,
  abilityIdentityCoverageComplete: audit?.summary?.abilityIdentityCoverageComplete ?? false,
  auditVerified: issues.length === 0,
  violations: issues,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
