import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const online = process.argv.includes("--online");
const write = process.argv.includes("--write");
const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const inputDir = option("input-dir") ? path.resolve(root, option("input-dir")) : null;
const descriptionAuditPath = path.resolve(root, option("description-audit") ?? "data/wow/midnight-season-one-description-audit.json");
const effectAuditPath = path.resolve(root, option("effect-audit") ?? "data/wow/midnight-season-one-effect-audit.json");
const candidateAuditPath = path.resolve(root, option("candidate-audit") ?? "data/wow/midnight-season-one-description-candidate-ranking.json");
const auditPath = path.resolve(root, option("audit") ?? "data/wow/midnight-season-one-guardian-edict-continuity.json");
const reportPath = path.resolve(root, option("report") ?? "docs/reports/wow/midnight-season-one-guardian-edict-continuity-verification.json");

const [descriptionAuditSource, effectAuditSource, candidateAuditSource] = await Promise.all([
  fs.readFile(descriptionAuditPath, "utf8"),
  fs.readFile(effectAuditPath, "utf8"),
  fs.readFile(candidateAuditPath, "utf8"),
]);
const descriptionAudit = JSON.parse(descriptionAuditSource);
const effectAudit = JSON.parse(effectAuditSource);
const candidateAudit = JSON.parse(candidateAuditSource);
const spellId = 1260763;
const dependencySpellId = 1260826;
const targetBuild = descriptionAudit.gameBuild;
const expectedCurrentBuild = "12.1.0.69814";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const buildDefinitions = [targetBuild, expectedCurrentBuild].flatMap((build) => [
  ["spell_en", "Spell", "enUS", "ID", spellId],
  ["spell_ru", "Spell", "ruRU", "ID", spellId],
  ["spell_effect", "SpellEffect", "enUS", "SpellID", dependencySpellId],
  ["spell_misc", "SpellMisc", "enUS", "SpellID", dependencySpellId],
  ["spell_duration_5", "SpellDuration", "enUS", "ID", 5],
  ["spell_duration_9", "SpellDuration", "enUS", "ID", 9],
].map(([kind, table, locale, filterField, filterValue]) => ({
  kind: `${kind}_${build.replaceAll(".", "_")}`,
  semanticKind: kind,
  build,
  table,
  locale,
  filterField,
  filterValue,
  url: `https://wago.tools/db2/${table}/csv?build=${build}&locale=${locale}&filter[${filterField}]=${filterValue}`,
  fileName: `${table}-${locale}-${filterField}-${filterValue}-${build}.csv`,
})));
const renderedDefinitions = [
  { kind: "wowhead_en", url: `https://www.wowhead.com/spell=${spellId}`, fileName: `wowhead-${spellId}-en.html`, locale: "en" },
  { kind: "wowhead_ru", url: `https://www.wowhead.com/ru/spell=${spellId}`, fileName: `wowhead-${spellId}-ru.html`, locale: "ru" },
  { kind: "warcraft_wiki_en", url: "https://warcraft.wiki.gg/wiki/Belo%27ren,_Child_of_Al%27ar", fileName: "warcraft-wiki-beloren.html", locale: "en" },
];
const buildsDefinition = { kind: "retail_build_index", url: "https://wago.tools/api/builds", fileName: "wago-builds.json" };

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
        if (input[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { record.push(field); field = ""; }
    else if (character === "\n") {
      record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      records.push(record); record = []; field = "";
    } else field += character;
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field || record.length) { record.push(field.endsWith("\r") ? field.slice(0, -1) : field); records.push(record); }
  const headers = records.shift() ?? [];
  return records.filter((row) => row.length > 1 || row[0] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function selectRelevantRows(definition, buffer) {
  const rows = parseCsv(buffer);
  if (definition.table === "Spell") return rows.filter((row) => Number(row.ID) === spellId);
  if (definition.table === "SpellEffect" || definition.table === "SpellMisc") {
    return rows.filter((row) => Number(row.SpellID) === dependencySpellId)
      .sort((left, right) => Number(left.DifficultyID) - Number(right.DifficultyID) || Number(left.ID) - Number(right.ID));
  }
  if (definition.table === "SpellDuration") return rows.filter((row) => Number(row.ID) === definition.filterValue);
  return [];
}

function decodeHtmlFragment(fragment) {
  return fragment.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'").replaceAll("&nbsp;", " ").replace(/\s+/g, " ").trim();
}

function readJavaScriptString(input, assignmentEnd) {
  const quoteStart = input.indexOf('"', assignmentEnd);
  if (quoteStart < 0) throw new Error("JavaScript string start is missing");
  let escaped = false;
  for (let index = quoteStart + 1; index < input.length; index += 1) {
    if (escaped) escaped = false;
    else if (input[index] === "\\") escaped = true;
    else if (input[index] === '"') return JSON.parse(input.slice(quoteStart, index + 1));
  }
  throw new Error("JavaScript string end is missing");
}

function extractDescription(tooltipHtml) {
  const match = /<div class="q">([\s\S]*?)<\/div>/.exec(tooltipHtml);
  return match ? decodeHtmlFragment(match[1]) : null;
}

function extractWowheadRender(buffer, locale) {
  const html = buffer.toString("utf8");
  const suffix = locale === "ru" ? "ruru" : "enus";
  const initialDifficulty = Number(new RegExp(`g_spells\\[${spellId}\\]\\.initial_dd = (\\d+)`).exec(html)?.[1]);
  const initialGroupSize = Number(new RegExp(`g_spells\\[${spellId}\\]\\.initial_ddSize = (\\d+)`).exec(html)?.[1]);
  const marker = `g_spells[${spellId}].tooltip_${suffix} = `;
  const markerIndex = html.indexOf(marker);
  if (!initialDifficulty || !initialGroupSize || markerIndex < 0) throw new Error(`Wowhead ${locale} initial render missing`);
  const entries = [{ difficultyId: initialDifficulty, groupSize: initialGroupSize,
    description: extractDescription(readJavaScriptString(html, markerIndex + marker.length)) }];
  const pattern = new RegExp(`g_spells\\[${spellId}\\]\\.server_tooltip_${suffix}\\["dd(\\d+)ddsize(\\d+)"\\] = `, "g");
  for (const match of html.matchAll(pattern)) entries.push({
    difficultyId: Number(match[1]),
    groupSize: Number(match[2]),
    description: extractDescription(readJavaScriptString(html, match.index + match[0].length)),
  });
  return entries.map((entry) => {
    const semanticMatch = locale === "ru"
      ? /урон увеличивается на ([\d,.]+)% на ([^.]+)\./.exec(entry.description ?? "")
      : /increasing all damage done by ([\d,.]+)% for ([^.]+)\./.exec(entry.description ?? "");
    if (!semanticMatch) throw new Error(`Wowhead ${locale} semantic render missing for difficulty ${entry.difficultyId}`);
    return {
      difficultyId: entry.difficultyId,
      groupSize: entry.groupSize,
      effectPercent: Number(semanticMatch[1].replace(",", ".")),
      durationText: semanticMatch[2],
      normalizedDescriptionSha256: sha256(Buffer.from(entry.description)),
    };
  }).sort((left, right) => left.difficultyId - right.difficultyId);
}

function extractGuideRender(buffer) {
  const html = buffer.toString("utf8");
  const needle = `href="https://www.wowhead.com/spell=${spellId}"`;
  const linkIndex = html.indexOf(needle);
  const start = html.lastIndexOf('<span id="Ability:', linkIndex);
  const end = html.indexOf("</span>", linkIndex);
  if (linkIndex < 0 || start < 0 || end < 0) throw new Error("same-ID Warcraft Wiki guide fragment missing");
  const fragment = decodeHtmlFragment(html.slice(start, end + "</span>".length));
  const semanticMatch = /increasing all damage done by ([\d,.]+)% for ([^.]+)\./.exec(fragment);
  if (!semanticMatch) throw new Error("Warcraft Wiki semantic render missing");
  return {
    exactSameIdLink: true,
    effectPercent: Number(semanticMatch[1].replace(",", ".")),
    durationText: semanticMatch[2],
    normalizedFragmentSha256: sha256(Buffer.from(fragment)),
  };
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "GildraGuardianEdictContinuityAudit/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function loadSources() {
  if (!online && !inputDir) return null;
  const sources = new Map();
  for (const definition of [buildsDefinition, ...buildDefinitions, ...renderedDefinitions]) {
    const bytes = online ? await fetchBuffer(definition.url) : await fs.readFile(path.join(inputDir, definition.fileName));
    sources.set(definition.kind, bytes);
  }
  return sources;
}

function stableAuditProjection(audit) {
  return {
    schemaVersion: audit.schemaVersion,
    scope: audit.scope,
    spellId: audit.spellId,
    dependencySpellId: audit.dependencySpellId,
    targetBuild: audit.targetBuild,
    currentBuild: audit.currentBuild,
    dependencyAuditSha256: audit.dependencyAuditSha256,
    method: audit.method,
    publicationPolicy: audit.publicationPolicy,
    sources: audit.sources,
    buildWindow: audit.buildWindow,
    rawContinuity: audit.rawContinuity,
    renderedEvidence: audit.renderedEvidence,
    conflicts: audit.conflicts,
    blockers: audit.blockers,
    publicationSafe: audit.publicationSafe,
    promotionAllowed: audit.promotionAllowed,
  };
}

function buildAudit(sourceBuffers, verifiedAt) {
  const buildIndex = JSON.parse(sourceBuffers.get(buildsDefinition.kind).toString("utf8"));
  const retailBuilds = buildIndex.wow ?? [];
  const targetIndex = retailBuilds.findIndex((build) => build.version === targetBuild);
  const currentIndex = retailBuilds.findIndex((build) => build.version === expectedCurrentBuild);
  const buildWindow = retailBuilds.slice(currentIndex, targetIndex + 1).map((build) => ({
    version: build.version,
    createdAt: `${build.created_at.replace(" ", "T")}Z`,
    buildConfig: build.build_config,
    productConfig: build.product_config,
    cdnConfig: build.cdn_config,
    backgroundDownload: build.is_bgdl,
  }));
  if (currentIndex !== 0 || targetIndex !== 1 || buildWindow.length !== 2) {
    throw new Error(`expected consecutive retail build window ${targetBuild} -> ${expectedCurrentBuild}`);
  }

  const byBuild = {};
  const sources = [{
    kind: buildsDefinition.kind,
    url: buildsDefinition.url,
    sourceKind: "verified_database",
    sourcePriority: 3,
    relevantBuildWindowSha256: sha256(Buffer.from(JSON.stringify(buildWindow))),
  }];
  for (const build of [targetBuild, expectedCurrentBuild]) {
    byBuild[build] = {};
    for (const definition of buildDefinitions.filter((candidate) => candidate.build === build)) {
      const bytes = sourceBuffers.get(definition.kind);
      const rows = selectRelevantRows(definition, bytes);
      const normalizedResponseRows = parseCsv(bytes)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      if (rows.length === 0) throw new Error(`${definition.kind} has no exact relevant rows`);
      byBuild[build][definition.semanticKind] = rows;
      sources.push({
        kind: definition.kind,
        semanticKind: definition.semanticKind,
        url: definition.url,
        sourceKind: "verified_database",
        sourcePriority: 3,
        build,
        locale: definition.locale,
        normalizedResponseSha256: sha256(Buffer.from(JSON.stringify(normalizedResponseRows))),
        rawResponseBytes: bytes.length,
        exactRows: rows.length,
        exactRowsSha256: sha256(Buffer.from(JSON.stringify(rows))),
      });
    }
  }

  const semanticKinds = [...new Set(buildDefinitions.map((definition) => definition.semanticKind))];
  const rawContinuity = Object.fromEntries(semanticKinds.map((kind) => {
    const targetRows = byBuild[targetBuild][kind];
    const currentRows = byBuild[expectedCurrentBuild][kind];
    return [kind, {
      targetRowsSha256: sha256(Buffer.from(JSON.stringify(targetRows))),
      currentRowsSha256: sha256(Buffer.from(JSON.stringify(currentRows))),
      unchanged: JSON.stringify(targetRows) === JSON.stringify(currentRows),
    }];
  }));

  const wowheadEn = extractWowheadRender(sourceBuffers.get("wowhead_en"), "en");
  const wowheadRu = extractWowheadRender(sourceBuffers.get("wowhead_ru"), "ru");
  const guide = extractGuideRender(sourceBuffers.get("warcraft_wiki_en"));
  for (const definition of renderedDefinitions) {
    const evidence = definition.kind === "wowhead_en" ? wowheadEn : definition.kind === "wowhead_ru" ? wowheadRu : guide;
    sources.push({
      kind: definition.kind,
      url: definition.url,
      locale: definition.locale,
      sourceKind: definition.kind.startsWith("wowhead") ? "verified_database" : "expert_guide",
      sourcePriority: 3,
      normalizedEvidenceSha256: sha256(Buffer.from(JSON.stringify(evidence))),
    });
  }

  const currentByDifficulty = Object.fromEntries(wowheadEn.map((entry) => [entry.difficultyId, entry]));
  const conflicts = {
    guideEffectPercentDiffersFromCurrentRenderer: !wowheadEn.every((entry) => entry.effectPercent === guide.effectPercent),
    guideDurationDiffersFromCurrentRenderer: !wowheadEn.every((entry) => entry.durationText === guide.durationText),
    lfrDurationHasNoExactSpellMiscDifficultyRow: !(byBuild[targetBuild].spell_misc ?? [])
      .some((row) => Number(row.DifficultyID) === 17),
    lfrDurationRenderDiffersFromDefault: currentByDifficulty[17]?.durationText !== currentByDifficulty[14]?.durationText,
  };

  return {
    schemaVersion: 1,
    scope: "midnight-season-one-guardian-edict-raw-build-continuity-and-render-conflict",
    spellId,
    dependencySpellId,
    targetBuild,
    currentBuild: expectedCurrentBuild,
    lastVerifiedAt: verifiedAt,
    dependencyAuditSha256: {
      description: sha256(descriptionAuditSource),
      effect: sha256(effectAuditSource),
      candidate: sha256(candidateAuditSource),
    },
    method: "Verifies that every exact DB2 row used by Guardian's Edict value and duration tokens is byte-normalized and unchanged between consecutive Retail builds 12.1.0.69587 and 12.1.0.69814. It then compares current same-ID EN/RU per-difficulty Wowhead renders and the same-ID Warcraft Wiki guide fragment. This proves raw-data continuity only; it does not backdate a mutable renderer to the target build.",
    publicationPolicy: "Remain withheld when the renderer lacks exact-build provenance, when exact same-ID rendered sources conflict, or when a difficulty render depends on fallback semantics that are not reproduced from selected exact DB2 rows. Raw row continuity cannot by itself authorize publication.",
    sources,
    buildWindow: {
      product: "wow",
      consecutive: true,
      builds: buildWindow,
    },
    rawContinuity,
    renderedEvidence: {
      wowheadReportedLiveVersion: candidateAudit.candidates.find((candidate) => candidate.spellId === spellId)?.localizedRenders?.en?.reportedLiveVersion ?? null,
      exactBuildExposed: false,
      wowhead: { en: wowheadEn, ru: wowheadRu },
      warcraftWiki: guide,
    },
    conflicts,
    blockers: [
      "exact_build_renderer_provenance_missing",
      "same_id_rendered_sources_conflict",
      "lfr_duration_fallback_semantics_unresolved",
      "publication_requires_explicit_per_spell_allowlist",
    ],
    publicationSafe: false,
    promotionAllowed: false,
  };
}

const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
let audit;
try { audit = JSON.parse(await fs.readFile(auditPath, "utf8")); }
catch (error) { if (!write) throw error; }

const sourceBuffers = await loadSources();
if (sourceBuffers) {
  const generated = buildAudit(sourceBuffers, audit?.lastVerifiedAt ?? new Date().toISOString());
  if (write) {
    generated.lastVerifiedAt = new Date().toISOString();
    await fs.writeFile(auditPath, `${JSON.stringify(generated, null, 2)}\n`);
    audit = generated;
  } else check(JSON.stringify(stableAuditProjection(audit)) === JSON.stringify(stableAuditProjection(generated)),
    "pinned-continuity-audit-does-not-match-source-evidence");
}

check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
check(audit?.scope === "midnight-season-one-guardian-edict-raw-build-continuity-and-render-conflict", "audit-scope-invalid");
check(audit?.spellId === spellId && audit?.dependencySpellId === dependencySpellId, "spell-identity-invalid");
check(audit?.targetBuild === targetBuild && audit?.currentBuild === expectedCurrentBuild, "build-window-invalid");
check(audit?.dependencyAuditSha256?.description === sha256(descriptionAuditSource), "description-audit-hash-mismatch");
check(audit?.dependencyAuditSha256?.effect === sha256(effectAuditSource), "effect-audit-hash-mismatch");
check(audit?.dependencyAuditSha256?.candidate === sha256(candidateAuditSource), "candidate-audit-hash-mismatch");
check(Number.isFinite(Date.parse(audit?.lastVerifiedAt)), "last-verified-invalid");
check(audit?.buildWindow?.consecutive === true && audit?.buildWindow?.builds?.length === 2, "retail-builds-not-consecutive");
check(JSON.stringify(audit?.buildWindow?.builds?.map((build) => build.version)) === JSON.stringify([expectedCurrentBuild, targetBuild]),
  "retail-build-order-invalid");
for (const [kind, continuity] of Object.entries(audit?.rawContinuity ?? {})) {
  check(/^[0-9a-f]{64}$/.test(continuity.targetRowsSha256 ?? ""), `target-row-hash-invalid:${kind}`);
  check(/^[0-9a-f]{64}$/.test(continuity.currentRowsSha256 ?? ""), `current-row-hash-invalid:${kind}`);
  check(continuity.unchanged === true && continuity.targetRowsSha256 === continuity.currentRowsSha256, `raw-row-drift:${kind}`);
}
check(Object.keys(audit?.rawContinuity ?? {}).length === 6, "raw-continuity-scope-invalid");
check(audit?.renderedEvidence?.wowheadReportedLiveVersion === "12.1.0", "wowhead-live-version-invalid");
check(audit?.renderedEvidence?.exactBuildExposed === false, "exact-build-renderer-overclaimed");
for (const locale of ["en", "ru"]) {
  const rows = audit?.renderedEvidence?.wowhead?.[locale] ?? [];
  check(JSON.stringify(rows.map((row) => row.difficultyId)) === JSON.stringify([14, 15, 16, 17]), `render-difficulties-invalid:${locale}`);
  for (const row of rows) check(/^[0-9a-f]{64}$/.test(row.normalizedDescriptionSha256 ?? ""), `render-hash-invalid:${locale}:${row.difficultyId}`);
}
const enByDifficulty = Object.fromEntries((audit?.renderedEvidence?.wowhead?.en ?? []).map((row) => [row.difficultyId, row]));
check(enByDifficulty[14]?.effectPercent === 20 && enByDifficulty[14]?.durationText === "30 sec", "normal-render-invalid");
check(enByDifficulty[15]?.effectPercent === 20 && enByDifficulty[15]?.durationText === "5 min", "heroic-render-invalid");
check(enByDifficulty[16]?.effectPercent === 20 && enByDifficulty[16]?.durationText === "30 sec", "mythic-render-invalid");
check(enByDifficulty[17]?.effectPercent === 10 && enByDifficulty[17]?.durationText === "until canceled", "lfr-render-invalid");
check(audit?.renderedEvidence?.warcraftWiki?.effectPercent === 30
  && audit?.renderedEvidence?.warcraftWiki?.durationText === "30 sec", "guide-render-invalid");
check(Object.values(audit?.conflicts ?? {}).every((value) => value === true), "required-render-conflict-missing");
for (const blocker of ["exact_build_renderer_provenance_missing", "same_id_rendered_sources_conflict",
  "lfr_duration_fallback_semantics_unresolved", "publication_requires_explicit_per_spell_allowlist"]) {
  check(audit?.blockers?.includes(blocker), `blocker-missing:${blocker}`);
}
check(audit?.publicationSafe === false && audit?.promotionAllowed === false, "unsafe-publication-state");
for (const source of audit?.sources ?? []) {
  check(source.sourcePriority === 3, `source-priority-invalid:${source.kind}`);
  check(/^[0-9a-f]{64}$/.test(source.relevantBuildWindowSha256 ?? source.normalizedResponseSha256
    ?? source.normalizedEvidenceSha256 ?? ""), `source-hash-invalid:${source.kind}`);
  if (source.kind === buildsDefinition.kind) {
    check(source.relevantBuildWindowSha256 === sha256(Buffer.from(JSON.stringify(audit.buildWindow.builds))),
      "build-window-source-index-drift");
  } else if (source.build && source.semanticKind) {
    const continuity = audit.rawContinuity?.[source.semanticKind];
    const expectedHash = source.build === targetBuild ? continuity?.targetRowsSha256 : continuity?.currentRowsSha256;
    check(source.exactRowsSha256 === expectedHash, `db2-source-index-drift:${source.kind}`);
  } else if (source.kind === "wowhead_en") {
    check(source.normalizedEvidenceSha256 === sha256(Buffer.from(JSON.stringify(audit.renderedEvidence.wowhead.en))),
      "rendered-source-index-drift:wowhead_en");
  } else if (source.kind === "wowhead_ru") {
    check(source.normalizedEvidenceSha256 === sha256(Buffer.from(JSON.stringify(audit.renderedEvidence.wowhead.ru))),
      "rendered-source-index-drift:wowhead_ru");
  } else if (source.kind === "warcraft_wiki_en") {
    check(source.normalizedEvidenceSha256 === sha256(Buffer.from(JSON.stringify(audit.renderedEvidence.warcraftWiki))),
      "rendered-source-index-drift:warcraft_wiki_en");
  }
}
check(audit?.sources?.length === 16, `source-count-invalid:${audit?.sources?.length}`);

const summary = {
  generatedAt: new Date().toISOString(),
  spellId,
  targetBuild,
  currentBuild: expectedCurrentBuild,
  online,
  sourceBytesCompared: Boolean(sourceBuffers),
  consecutiveRetailBuilds: audit?.buildWindow?.consecutive ?? false,
  unchangedRawDependencies: Object.values(audit?.rawContinuity ?? {}).filter((continuity) => continuity.unchanged).length,
  renderedSourceConflicts: Object.values(audit?.conflicts ?? {}).filter(Boolean).length,
  promotionAllowed: audit?.promotionAllowed ?? null,
  verified: issues.length === 0,
  violations: issues,
};
await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length) process.exitCode = 1;
