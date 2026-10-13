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
const sourceAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-source-audit.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(root, "data/wow/content-manifest.json"), "utf8"));
const auditPath = path.join(root, "data/wow/venomous-abyss-journal-tree-audit.json");
const reportPath = path.join(root, "docs/reports/wow/venomous-abyss-journal-tree-verification.json");
const gameBuild = sourceAudit.gameBuild;

const sources = [
  {
    kind: "journal_section_en",
    locale: "en",
    url: `https://wago.tools/db2/JournalEncounterSection/csv?build=${gameBuild}&locale=enUS`,
    fileName: `wago-journal-section-${gameBuild.split(".").at(-1)}-enUS.csv`,
    sha256: "749743a68e984821ebcaf4c2619fc89fafb47217d59fd9e6299d8e0ccd27cf18",
  },
  {
    kind: "journal_section_ru",
    locale: "ru",
    url: `https://wago.tools/db2/JournalEncounterSection/csv?build=${gameBuild}&locale=ruRU`,
    fileName: `wago-journal-section-${gameBuild.split(".").at(-1)}-ruRU.csv`,
    sha256: "dfe7a41e9d066ae4002cbae51ee5907a58fd72bccddd899f1e077a00f4db3bd7",
  },
];

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
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field || record.length) records.push([...record, field.endsWith("\r") ? field.slice(0, -1) : field]);
  const headers = records.shift() ?? [];
  return records
    .filter((row) => row.length > 1 || row[0] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function number(row, field) {
  const value = Number(row[field]);
  if (!Number.isInteger(value)) throw new Error(`invalid integer ${field}=${row[field]}`);
  return value;
}

function titleClassification(title, locale) {
  if (!title) return "empty";
  if ((locale === "en" && /^Section \d+$/.test(title)) || (locale === "ru" && /^Раздел \d+$/.test(title))) return "generic";
  if (title.includes("$") || /\|(?:c[0-9A-Fa-f]{8}|Hspell:|h|r)/.test(title)) return "tokenized";
  return "localized_name";
}

function bodyClassification(body) {
  if (!body) return "empty";
  if (body.includes("$") || /\|(?:c[0-9A-Fa-f]{8}|Hspell:|h|r)/.test(body)) return "tokenized";
  return "publication_safe";
}

function explicitPhaseMarker(title, locale) {
  return locale === "en"
    ? /\b(?:phase|stage|intermission)\b/i.test(title)
    : /(?:фаза|этап|смена фаз|переходн\p{L}*)/iu.test(title);
}

function structuralProjection(row) {
  return {
    sectionId: number(row, "ID"),
    journalEncounterId: number(row, "JournalEncounterID"),
    orderIndex: number(row, "OrderIndex"),
    parentSectionId: number(row, "ParentSectionID"),
    firstChildSectionId: number(row, "FirstChildSectionID"),
    nextSiblingSectionId: number(row, "NextSiblingSectionID"),
    type: number(row, "Type"),
    spellId: number(row, "SpellID"),
    iconFileDataId: number(row, "IconFileDataID"),
    flags: number(row, "Flags"),
    iconFlags: number(row, "IconFlags"),
    difficultyMask: number(row, "DifficultyMask"),
  };
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function reachableSectionIds(rows, firstSectionId) {
  const byId = new Map(rows.map((row) => [number(row, "ID"), row]));
  const visited = new Set();
  const cycles = [];
  const missing = [];
  function visitChain(startId, ancestry = new Set()) {
    let sectionId = startId;
    const siblingChain = new Set();
    while (sectionId !== 0) {
      if (siblingChain.has(sectionId) || ancestry.has(sectionId)) {
        cycles.push(sectionId);
        return;
      }
      siblingChain.add(sectionId);
      const row = byId.get(sectionId);
      if (!row) {
        missing.push(sectionId);
        return;
      }
      visited.add(sectionId);
      const childId = number(row, "FirstChildSectionID");
      if (childId) visitChain(childId, new Set([...ancestry, sectionId]));
      sectionId = number(row, "NextSiblingSectionID");
    }
  }
  visitChain(firstSectionId);
  return { ids: [...visited].sort((left, right) => left - right), cycles: [...new Set(cycles)], missing: [...new Set(missing)] };
}

async function loadBuffers() {
  const buffers = new Map();
  for (const source of sources) {
    let bytes;
    if (online) {
      const response = await fetch(source.url, {
        headers: { "user-agent": "GildraVenomousJournalTreeAudit/1.0" },
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`${source.kind} returned HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } else if (inputDir) {
      bytes = await fs.readFile(path.join(inputDir, source.fileName));
    } else {
      return null;
    }
    const digest = sha256(bytes);
    if (digest !== source.sha256) throw new Error(`${source.kind} hash mismatch: ${digest}`);
    buffers.set(source.locale, bytes);
  }
  return buffers;
}

function buildAudit(buffers, lastVerifiedAt) {
  const localizedRows = Object.fromEntries([...buffers].map(([locale, bytes]) => [locale, parseCsv(bytes)]));
  const encounters = sourceAudit.encounters.map((encounter) => {
    const rows = Object.fromEntries(["en", "ru"].map((locale) => [locale,
      localizedRows[locale].filter((row) => number(row, "JournalEncounterID") === encounter.journalEncounterId),
    ]));
    const structureEn = rows.en.map(structuralProjection).sort((left, right) => left.sectionId - right.sectionId);
    const structureRu = rows.ru.map(structuralProjection).sort((left, right) => left.sectionId - right.sectionId);
    if (JSON.stringify(structureEn) !== JSON.stringify(structureRu)) {
      throw new Error(`EN/RU structure mismatch for ${encounter.canonicalSlug}`);
    }
    const ruById = new Map(rows.ru.map((row) => [number(row, "ID"), row]));
    const reachable = reachableSectionIds(rows.en, encounter.firstSectionId);
    const sections = rows.en.map((enRow) => {
      const structure = structuralProjection(enRow);
      const ruRow = ruById.get(structure.sectionId);
      if (!ruRow) throw new Error(`RU section ${structure.sectionId} missing`);
      const titles = { en: enRow.Title_lang, ru: ruRow.Title_lang };
      const bodies = { en: enRow.BodyText_lang, ru: ruRow.BodyText_lang };
      const classifications = {
        en: { title: titleClassification(titles.en, "en"), body: bodyClassification(bodies.en) },
        ru: { title: titleClassification(titles.ru, "ru"), body: bodyClassification(bodies.ru) },
      };
      const explicitPhase = explicitPhaseMarker(titles.en, "en") && explicitPhaseMarker(titles.ru, "ru")
        && classifications.en.title === "localized_name" && classifications.ru.title === "localized_name";
      return {
        ...structure,
        reachableFromFirstSection: reachable.ids.includes(structure.sectionId),
        titles: {
          en: {
            classification: classifications.en.title,
            length: [...titles.en].length,
            sha256: sha256(Buffer.from(titles.en)),
            ...(classifications.en.title === "localized_name" ? { text: titles.en } : {}),
          },
          ru: {
            classification: classifications.ru.title,
            length: [...titles.ru].length,
            sha256: sha256(Buffer.from(titles.ru)),
            ...(classifications.ru.title === "localized_name" ? { text: titles.ru } : {}),
          },
        },
        bodies: {
          en: { classification: classifications.en.body, length: [...bodies.en].length, sha256: sha256(Buffer.from(bodies.en)) },
          ru: { classification: classifications.ru.body, length: [...bodies.ru].length, sha256: sha256(Buffer.from(bodies.ru)) },
        },
        explicitPhase,
        ...(explicitPhase ? { phaseTitles: titles } : {}),
      };
    }).sort((left, right) => left.sectionId - right.sectionId);
    const phaseCandidates = sections
      .filter((section) => section.explicitPhase)
      .sort((left, right) => left.orderIndex - right.orderIndex || left.sectionId - right.sectionId);
    return {
      canonicalSlug: encounter.canonicalSlug,
      journalEncounterId: encounter.journalEncounterId,
      firstSectionId: encounter.firstSectionId,
      sectionRowsPerLocale: rows.en.length,
      reachableRows: reachable.ids.length,
      unreachableSectionIds: sections.filter((section) => !section.reachableFromFirstSection).map((section) => section.sectionId),
      traversalCycles: reachable.cycles,
      missingTraversalTargets: reachable.missing,
      typeCounts: countBy(sections.map((section) => section.type)),
      difficultyMaskCounts: countBy(sections.map((section) => section.difficultyMask)),
      titleClassifications: {
        en: countBy(sections.map((section) => section.titles.en.classification)),
        ru: countBy(sections.map((section) => section.titles.ru.classification)),
      },
      bodyClassifications: {
        en: countBy(sections.map((section) => section.bodies.en.classification)),
        ru: countBy(sections.map((section) => section.bodies.ru.classification)),
      },
      phaseCandidates: phaseCandidates.map((section) => ({
        sectionId: section.sectionId,
        orderIndex: section.orderIndex,
        parentSectionId: section.parentSectionId,
        difficultyMask: section.difficultyMask,
        titles: section.phaseTitles,
      })),
      sections,
    };
  });
  return {
    schemaVersion: 1,
    scope: "venomous-abyss-live-journal-section-trees",
    gameBuild,
    lastVerifiedAt,
    method: "Build-pinned EN/RU JournalEncounterSection rows are selected by exact JournalEncounterID, structurally compared across locales, and traversed from each JournalEncounter.FirstSectionID through FirstChildSectionID and NextSiblingSectionID.",
    phasePublicationPolicy: "Only a token-free title with an explicit phase, stage, or intermission marker in both EN and RU is a phase-identity candidate. Generic Section N labels and inferred tactical stages are never promoted.",
    limitations: [
      "A Journal section hierarchy does not by itself prove tactical timing, player execution, mechanic tags, or difficulty behavior.",
      "Rows not reachable from FirstSectionID are retained as evidence but cannot become canonical phases without an additional verified association.",
      "This audit does not resolve client tokens or WoW hyperlink/color markup in section body text.",
    ],
    sources: sources.map(({ fileName: _fileName, ...source }) => source),
    summary: {
      encounters: encounters.length,
      sectionRowsPerLocale: encounters.reduce((total, encounter) => total + encounter.sectionRowsPerLocale, 0),
      reachableRows: encounters.reduce((total, encounter) => total + encounter.reachableRows, 0),
      unreachableRows: encounters.reduce((total, encounter) => total + encounter.unreachableSectionIds.length, 0),
      traversalCycles: encounters.reduce((total, encounter) => total + encounter.traversalCycles.length, 0),
      missingTraversalTargets: encounters.reduce((total, encounter) => total + encounter.missingTraversalTargets.length, 0),
      explicitPhaseCandidates: encounters.reduce((total, encounter) => total + encounter.phaseCandidates.length, 0),
    },
    encounters,
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
if (buffers) {
  const generated = buildAudit(buffers, audit?.lastVerifiedAt ?? new Date().toISOString());
  if (write) {
    generated.lastVerifiedAt = new Date().toISOString();
    await fs.writeFile(auditPath, `${JSON.stringify(generated, null, 2)}\n`);
    audit = generated;
  } else if (JSON.stringify(stable(generated)) !== JSON.stringify(stable(audit))) {
    issues.push("pinned-journal-tree-audit-does-not-match-source-bytes");
  }
}

const check = (condition, issue) => { if (!condition) issues.push(issue); };
check(audit?.schemaVersion === 1, "audit-schema-invalid");
check(audit?.gameBuild === gameBuild, "audit-build-mismatch");
check(Number.isFinite(Date.parse(audit?.lastVerifiedAt)), "audit-date-invalid");
check(audit?.summary?.encounters === 8, `encounter-count-invalid:${audit?.summary?.encounters}`);
check(audit?.summary?.explicitPhaseCandidates === 11, `phase-candidate-count-invalid:${audit?.summary?.explicitPhaseCandidates}`);
check(audit?.summary?.traversalCycles === 0, `traversal-cycles:${audit?.summary?.traversalCycles}`);
check(audit?.summary?.missingTraversalTargets === 0, `missing-traversal-targets:${audit?.summary?.missingTraversalTargets}`);
const manifestPhases = manifest.phases.filter((phase) => phase.instance === "venomous-abyss");
check(manifestPhases.length === 11, `manifest-phase-count-invalid:${manifestPhases.length}`);
for (const encounter of audit?.encounters ?? []) {
  check(encounter.sectionRowsPerLocale > 0, `section-tree-empty:${encounter.canonicalSlug}`);
  check(encounter.reachableRows > 0, `reachable-tree-empty:${encounter.canonicalSlug}`);
  check(encounter.sections.length === encounter.sectionRowsPerLocale, `section-count-mismatch:${encounter.canonicalSlug}`);
  const manifestEncounter = manifest.encounters.find((row) =>
    row.instance === "venomous-abyss" && row.canonicalSlug === encounter.canonicalSlug);
  check(Boolean(manifestEncounter), `manifest-encounter-missing:${encounter.canonicalSlug}`);
  check(manifestEncounter?.explicitJournalPhaseCount === encounter.phaseCandidates.length, `manifest-phase-count-mismatch:${encounter.canonicalSlug}`);
  check(
    manifestEncounter?.phaseCoverageStatus === (encounter.phaseCandidates.length
      ? "explicit_journal_sections_only"
      : "no_explicit_journal_sections"),
    `manifest-phase-coverage-status-mismatch:${encounter.canonicalSlug}`,
  );
  for (const [index, candidate] of encounter.phaseCandidates.entries()) {
    const phase = manifestPhases.find((row) => row.journalSectionId === candidate.sectionId);
    check(Boolean(phase), `manifest-phase-missing:${candidate.sectionId}`);
    if (!phase) continue;
    check(phase.parentId === `wow:retail:midnight:encounter:venomous-abyss:${encounter.canonicalSlug}`, `manifest-phase-parent-mismatch:${candidate.sectionId}`);
    check(phase.refs?.encounterId === encounter.journalEncounterId && phase.refs?.journalId === 1320, `manifest-phase-refs-mismatch:${candidate.sectionId}`);
    check(phase.build === gameBuild && phase.patch === "12.1" && phase.season === "midnight-season-2" && phase.status === "live", `manifest-phase-version-mismatch:${candidate.sectionId}`);
    check(JSON.stringify(phase.names) === JSON.stringify(candidate.titles), `manifest-phase-title-mismatch:${candidate.sectionId}`);
    check(phase.order === index + 1 && phase.journalOrderIndex === candidate.orderIndex, `manifest-phase-order-mismatch:${candidate.sectionId}`);
    check(phase.difficultyMask === candidate.difficultyMask, `manifest-phase-difficulty-mismatch:${candidate.sectionId}`);
    check(phase.verificationStatus === "identity_only", `manifest-phase-status-overclaimed:${candidate.sectionId}`);
    check(phase.descriptions?.en == null && phase.descriptions?.ru == null && phase.timeline == null, `manifest-phase-content-overclaimed:${candidate.sectionId}`);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  sourceBytesCompared: Boolean(buffers),
  encounters: audit?.summary?.encounters ?? 0,
  sectionRowsPerLocale: audit?.summary?.sectionRowsPerLocale ?? null,
  reachableRows: audit?.summary?.reachableRows ?? null,
  unreachableRows: audit?.summary?.unreachableRows ?? null,
  explicitPhaseCandidates: audit?.summary?.explicitPhaseCandidates ?? null,
  verified: issues.length === 0,
  violations: issues.length,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify({ summary, issues }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length) process.exitCode = 1;
