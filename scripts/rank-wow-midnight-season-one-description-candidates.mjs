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
const auditPath = path.resolve(root, option("audit") ?? "data/wow/midnight-season-one-description-candidate-ranking.json");
const reportPath = path.resolve(root, option("report") ?? "docs/reports/wow/midnight-season-one-description-candidate-ranking-verification.json");

const [descriptionAuditSource, effectAuditSource] = await Promise.all([
  fs.readFile(descriptionAuditPath, "utf8"),
  fs.readFile(effectAuditPath, "utf8"),
]);
const descriptionAudit = JSON.parse(descriptionAuditSource);
const effectAudit = JSON.parse(effectAuditSource);
const gameBuild = descriptionAudit.gameBuild;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const guidePages = [
  [2733, "imperator-averzian", "https://warcraft.wiki.gg/wiki/Imperator_Averzian"],
  [2734, "vorasius", "https://warcraft.wiki.gg/wiki/Vorasius"],
  [2735, "vaelgor-ezzorak", "https://warcraft.wiki.gg/wiki/Vaelgor_%26_Ezzorak"],
  [2736, "fallen-king-salhadaar", "https://warcraft.wiki.gg/wiki/Fallen-King_Salhadaar"],
  [2737, "lightblinded-vanguard", "https://warcraft.wiki.gg/wiki/Lightblinded_Vanguard"],
  [2738, "crown-of-the-cosmos", "https://warcraft.wiki.gg/wiki/Crown_of_the_Cosmos"],
  [2739, "beloren", "https://warcraft.wiki.gg/wiki/Belo%27ren,_Child_of_Al%27ar"],
  [2740, "midnight-falls", "https://warcraft.wiki.gg/wiki/Midnight_Falls"],
  [2795, "chimaerus", "https://warcraft.wiki.gg/wiki/Chimaerus"],
].map(([encounterId, encounterSlug, url]) => ({
  encounterId,
  encounterSlug,
  url,
  fileName: `warcraft-wiki-${encounterSlug}.html`,
}));

const localeDefinitions = {
  en: { wowheadLocale: "enus", pathPrefix: "", sourceLocale: "en-US" },
  ru: { wowheadLocale: "ruru", pathPrefix: "ru/", sourceLocale: "ru-RU" },
};
const requiredRaidDifficultyIds = [17, 14, 15, 16];

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function decodeHtmlFragment(fragment) {
  return fragment
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJavaScriptString(input, assignmentEnd) {
  const quoteStart = input.indexOf('"', assignmentEnd);
  if (quoteStart < 0) throw new Error("JavaScript string start is missing");
  let escaped = false;
  for (let index = quoteStart + 1; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return JSON.parse(input.slice(quoteStart, index + 1));
  }
  throw new Error("JavaScript string end is missing");
}

function extractElementText(html, className) {
  const pattern = new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  const match = pattern.exec(html);
  return match ? decodeHtmlFragment(match[2]) : null;
}

function numericLiterals(text) {
  return [...new Set((text?.match(/\d[\d\s,.]*(?:%|\b)/g) ?? [])
    .map((value) => value.replace(/\s+/g, " ").trim()))]
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function extractWowheadEvidence(buffer, spellId, locale, expectedName) {
  const html = buffer.toString("utf8");
  const localeDefinition = localeDefinitions[locale];
  const suffix = localeDefinition.wowheadLocale;
  const initialDifficultyMatch = new RegExp(`g_spells\\[${spellId}\\]\\.initial_dd = (\\d+)`).exec(html);
  const initialGroupSizeMatch = new RegExp(`g_spells\\[${spellId}\\]\\.initial_ddSize = (\\d+)`).exec(html);
  const initialTooltipMarker = `g_spells[${spellId}].tooltip_${suffix} = `;
  const initialTooltipIndex = html.indexOf(initialTooltipMarker);
  if (!initialDifficultyMatch || !initialGroupSizeMatch || initialTooltipIndex < 0) {
    throw new Error(`Wowhead ${locale} initial tooltip metadata missing for spell ${spellId}`);
  }

  const entries = [{
    difficultyId: Number(initialDifficultyMatch[1]),
    groupSize: Number(initialGroupSizeMatch[1]),
    tooltipHtml: readJavaScriptString(html, initialTooltipIndex + initialTooltipMarker.length),
  }];
  const assignmentPattern = new RegExp(`g_spells\\[${spellId}\\]\\.server_tooltip_${suffix}\\["dd(\\d+)ddsize(\\d+)"\\] = `, "g");
  for (const match of html.matchAll(assignmentPattern)) {
    entries.push({
      difficultyId: Number(match[1]),
      groupSize: Number(match[2]),
      tooltipHtml: readJavaScriptString(html, match.index + match[0].length),
    });
  }

  const renderedDifficulties = entries.map((entry) => {
    const name = extractElementText(entry.tooltipHtml, "whtt-name");
    const description = extractElementText(entry.tooltipHtml, "q");
    const exactSpellLink = new RegExp(`href=["']\/(?:ru\/)?spell=${spellId}(?:\/|["'])`).test(entry.tooltipHtml);
    return {
      difficultyId: entry.difficultyId,
      groupSize: entry.groupSize,
      exactSpellLink,
      localizedNameMatches: name === expectedName,
      renderedNameSha256: name ? sha256(Buffer.from(name)) : null,
      normalizedDescriptionSha256: description ? sha256(Buffer.from(description)) : null,
      normalizedDescriptionLength: description ? [...description].length : 0,
      numericLiterals: numericLiterals(description),
      placeholderCounts: {
        genericValue: (description?.match(/\b[XY]\b/g) ?? []).length,
        clientToken: (description?.match(/\$[A-Za-z0-9?\[]/g) ?? []).length,
      },
    };
  }).sort((left, right) => left.difficultyId - right.difficultyId || left.groupSize - right.groupSize);

  const difficultyIds = [...new Set(renderedDifficulties.map((entry) => entry.difficultyId))].sort((left, right) => left - right);
  const liveVersionMatch = /"dataEnv":\{[\s\S]*?"versions":\{"1":"([^"]+)"/.exec(html)
    ?? /title="Currently viewing the Live \(([^)]+)\) version of this page"/.exec(html);
  return {
    locale: localeDefinition.sourceLocale,
    reportedLiveVersion: liveVersionMatch?.[1] ?? null,
    exactBuildExposed: html.includes(gameBuild),
    difficultyIds,
    renderedDifficulties,
    normalizedDifficultyTooltipIndexSha256: sha256(Buffer.from(JSON.stringify(renderedDifficulties))),
  };
}

function extractRenderedGuideEvidence(buffer, spellId, abilityName) {
  const html = buffer.toString("utf8");
  const needles = [
    `href="https://www.wowhead.com/spell=${spellId}"`,
    `href="https://www.wowhead.com/spell=${spellId}/`,
  ];
  const normalizedFragments = new Set();
  let exactLinkOccurrences = 0;
  for (const needle of needles) {
    let cursor = 0;
    while (cursor < html.length) {
      const linkIndex = html.indexOf(needle, cursor);
      if (linkIndex < 0) break;
      exactLinkOccurrences += 1;
      cursor = linkIndex + needle.length;
      const start = html.lastIndexOf('<span id="Ability:', linkIndex);
      const end = html.indexOf("</span>", linkIndex);
      if (start < 0 || end < 0) continue;
      const normalized = decodeHtmlFragment(html.slice(start, end + "</span>".length));
      if (normalized === abilityName || normalized.startsWith(`${abilityName} —`)) normalizedFragments.add(normalized);
    }
  }
  const fragments = [...normalizedFragments].sort();
  const canonicalFragment = fragments.length === 1 ? fragments[0] : null;
  return {
    directSameIdLink: canonicalFragment !== null,
    exactLinkOccurrences,
    matchingFragmentCount: fragments.length,
    normalizedFragmentSha256: canonicalFragment ? sha256(Buffer.from(canonicalFragment)) : null,
    normalizedFragmentLength: canonicalFragment ? [...canonicalFragment].length : 0,
    numericLiterals: numericLiterals(canonicalFragment),
    placeholderCounts: {
      genericValue: (canonicalFragment?.match(/\b[XY]\b/g) ?? []).length,
      clientToken: (canonicalFragment?.match(/\$[A-Za-z0-9?\[]/g) ?? []).length,
    },
  };
}

function stableAuditProjection(audit) {
  return {
    schemaVersion: audit.schemaVersion,
    scope: audit.scope,
    gameBuild: audit.gameBuild,
    descriptionAuditSha256: audit.descriptionAuditSha256,
    effectAuditSha256: audit.effectAuditSha256,
    method: audit.method,
    publicationPolicy: audit.publicationPolicy,
    limitations: audit.limitations,
    sources: audit.sources,
    summary: audit.summary,
    candidates: audit.candidates,
  };
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "GildraMidnightSeasonOneDescriptionCandidateAudit/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function loadSourceBuffers() {
  if (!online && !inputDir) return null;
  const guideBuffers = new Map();
  for (const page of guidePages) {
    const bytes = online ? await fetchBuffer(page.url) : await fs.readFile(path.join(inputDir, page.fileName));
    guideBuffers.set(page.encounterId, bytes);
  }
  const tooltipBuffers = new Map();
  const withheld = descriptionAudit.abilities.filter((ability) => !ability.publicationSafe);
  for (let index = 0; index < withheld.length; index += 4) {
    const chunk = withheld.slice(index, index + 4);
    const loaded = await Promise.all(chunk.flatMap((ability) => Object.keys(localeDefinitions).map(async (locale) => {
      const definition = localeDefinitions[locale];
      const url = `https://www.wowhead.com/${definition.pathPrefix}spell=${ability.spellId}`;
      const fileName = `wowhead-${ability.spellId}-${locale}.html`;
      const bytes = online ? await fetchBuffer(url) : await fs.readFile(path.join(inputDir, fileName));
      return [`${ability.spellId}:${locale}`, bytes];
    })));
    for (const [key, bytes] of loaded) tooltipBuffers.set(key, bytes);
  }
  return { guideBuffers, tooltipBuffers };
}

function determineRankGroup({ wowheadByLocale, guide, missingEffectDifficulties, effectClassifications }) {
  if (Object.values(wowheadByLocale).some((evidence) => evidence.renderedDifficulties.some((entry) => !entry.exactSpellLink))) {
    return "localized_render_identity_incomplete";
  }
  if (Object.values(wowheadByLocale).some((evidence) => evidence.renderedDifficulties.some((entry) => !entry.localizedNameMatches))) {
    return "localized_name_mismatch";
  }
  if (missingEffectDifficulties.length > 0) return "difficulty_render_incomplete";
  if (effectClassifications.client_index_unresolved) return "client_index_semantics_unresolved";
  if (effectClassifications.scaled_or_dynamic) return "scaled_or_dynamic_render_crosscheck";
  if (!guide.directSameIdLink) return "bilingual_render_without_guide_fragment";
  if (guide.placeholderCounts.genericValue || guide.placeholderCounts.clientToken) return "bilingual_render_with_guide_placeholder";
  return "bilingual_per_difficulty_render_build_unpinned";
}

const rankGroupPriority = {
  bilingual_per_difficulty_render_build_unpinned: 1,
  bilingual_render_with_guide_placeholder: 2,
  bilingual_render_without_guide_fragment: 3,
  scaled_or_dynamic_render_crosscheck: 4,
  client_index_semantics_unresolved: 5,
  difficulty_render_incomplete: 6,
  localized_name_mismatch: 7,
  localized_render_identity_incomplete: 8,
};

function buildAudit(sourceBuffers, verifiedAt) {
  const candidates = descriptionAudit.abilities.filter((ability) => !ability.publicationSafe).map((ability) => {
    const page = guidePages.find((candidate) => candidate.encounterId === ability.encounterId);
    if (!page) throw new Error(`rendered guide page missing for encounter ${ability.encounterId}`);
    const guide = extractRenderedGuideEvidence(sourceBuffers.guideBuffers.get(ability.encounterId), ability.spellId, ability.names.en);
    const wowheadByLocale = Object.fromEntries(Object.keys(localeDefinitions).map((locale) => [
      locale,
      extractWowheadEvidence(sourceBuffers.tooltipBuffers.get(`${ability.spellId}:${locale}`), ability.spellId, locale, ability.names[locale]),
    ]));
    const effectRows = effectAudit.evidence.filter((record) => record.abilitySpellId === ability.spellId);
    const effectClassifications = countBy(effectRows.map((record) => record.classification));
    const registeredEffectDifficultyIds = [...new Set(effectRows.flatMap((record) => (record.difficultyContexts ?? [])
      .filter((context) => context.registeredDifficulty).map((context) => context.difficultyId)))].sort((left, right) => left - right);
    const renderedInBothLocales = wowheadByLocale.en.difficultyIds.filter((difficultyId) => wowheadByLocale.ru.difficultyIds.includes(difficultyId));
    const missingRequiredRaidDifficulties = requiredRaidDifficultyIds.filter((difficultyId) => !renderedInBothLocales.includes(difficultyId));
    const missingEffectDifficulties = registeredEffectDifficultyIds.filter((difficultyId) => !renderedInBothLocales.includes(difficultyId));
    const rankGroup = determineRankGroup({ wowheadByLocale, guide, missingEffectDifficulties, effectClassifications });
    const blockers = ["rendered_source_exact_build_unproven"];
    if (!guide.directSameIdLink) blockers.push("same_id_rendered_guide_fragment_missing");
    if (guide.placeholderCounts.genericValue) blockers.push("rendered_guide_contains_generic_value_placeholder");
    if (guide.placeholderCounts.clientToken) blockers.push("rendered_guide_contains_client_token");
    if (missingRequiredRaidDifficulties.length) blockers.push("required_raid_difficulty_render_missing");
    if (missingEffectDifficulties.length) blockers.push("effect_difficulty_render_missing");
    if (effectClassifications.client_index_unresolved) blockers.push("client_index_semantics_unresolved");
    if (effectClassifications.scaled_or_dynamic) blockers.push("scaled_value_semantics_unproven");
    if (effectClassifications.difficulty_variant) blockers.push("difficulty_specific_variant_not_selected");
    if (ability.requiredBy.includes("grammar")) blockers.push("locale_grammar_selection_unproven");
    if (ability.requiredBy.includes("difficulty_conditional")) blockers.push("difficulty_conditional_not_merged");
    if (ability.requiredBy.includes("journal_supplement")) blockers.push("journal_supplement_not_merged");
    if (Object.values(wowheadByLocale).some((evidence) => evidence.renderedDifficulties.some((entry) => !entry.exactSpellLink))) {
      blockers.push("localized_render_exact_spell_link_missing");
    }
    if (Object.values(wowheadByLocale).some((evidence) => evidence.renderedDifficulties.some((entry) => !entry.localizedNameMatches))) {
      blockers.push("localized_render_name_mismatch");
    }
    blockers.push("publication_requires_explicit_per_spell_allowlist");

    return {
      spellId: ability.spellId,
      encounterId: ability.encounterId,
      encounterSlug: page.encounterSlug,
      names: ability.names,
      rawDescriptionReferenceChains: {
        en: ability.source.en.referenceChain,
        ru: ability.source.ru.referenceChain,
      },
      requiredBy: ability.requiredBy,
      effectEvidence: {
        records: effectRows.length,
        completeRecords: effectRows.filter((record) => record.metadataComplete).length,
        classifications: effectClassifications,
        registeredDifficultyIds: registeredEffectDifficultyIds,
        missingRenderedDifficultyIds: missingEffectDifficulties,
      },
      renderedGuide: { sourceUrl: page.url, ...guide },
      localizedRenders: Object.fromEntries(Object.keys(localeDefinitions).map((locale) => [locale, {
        sourceUrl: `https://www.wowhead.com/${localeDefinitions[locale].pathPrefix}spell=${ability.spellId}`,
        ...wowheadByLocale[locale],
      }])),
      renderedInBothLocalesDifficultyIds: renderedInBothLocales,
      missingRequiredRaidDifficultyIds: missingRequiredRaidDifficulties,
      rankGroup,
      rankGroupPriority: rankGroupPriority[rankGroup],
      blockers: [...new Set(blockers)].sort(),
      publicationSafe: false,
      promotionAllowed: false,
    };
  }).sort((left, right) => left.rankGroupPriority - right.rankGroupPriority || left.spellId - right.spellId);

  const guideSources = guidePages.map((page) => {
    const fragmentIndex = candidates.filter((candidate) => candidate.encounterId === page.encounterId).map((candidate) => ({
      spellId: candidate.spellId,
      directSameIdLink: candidate.renderedGuide.directSameIdLink,
      normalizedFragmentSha256: candidate.renderedGuide.normalizedFragmentSha256,
    })).sort((left, right) => left.spellId - right.spellId);
    return {
      kind: `rendered_guide_${page.encounterSlug}_en`,
      url: page.url,
      sourceKind: "expert_guide",
      sourcePriority: 3,
      relevantAbilities: fragmentIndex.length,
      sameIdLinkedAbilities: fragmentIndex.filter((entry) => entry.directSameIdLink).length,
      relevantFragmentIndexSha256: sha256(Buffer.from(JSON.stringify(fragmentIndex))),
    };
  });
  const tooltipSources = candidates.flatMap((candidate) => Object.keys(localeDefinitions).map((locale) => ({
    kind: `rendered_spell_${candidate.spellId}_${locale}`,
    url: candidate.localizedRenders[locale].sourceUrl,
    locale: localeDefinitions[locale].sourceLocale,
    sourceKind: "verified_database",
    sourcePriority: 3,
    reportedLiveVersion: candidate.localizedRenders[locale].reportedLiveVersion,
    exactBuildExposed: candidate.localizedRenders[locale].exactBuildExposed,
    renderedDifficulties: candidate.localizedRenders[locale].renderedDifficulties.length,
    normalizedDifficultyTooltipIndexSha256: candidate.localizedRenders[locale].normalizedDifficultyTooltipIndexSha256,
  })));

  return {
    schemaVersion: 1,
    scope: "midnight-season-one-withheld-description-candidate-ranking",
    gameBuild,
    descriptionAuditSha256: sha256(descriptionAuditSource),
    effectAuditSha256: sha256(effectAuditSource),
    lastVerifiedAt: verifiedAt,
    method: "Ranks every withheld Midnight Season 1 ability using exact-ID English Warcraft Wiki guide fragments and exact-ID EN/RU per-difficulty Wowhead spell renders. Hashes cover normalized relevant fragments and tooltips rather than mutable page chrome. Registered exact-build DB2 difficulty contexts are compared with rendered difficulty IDs. Rendered numeric literals are diagnostic evidence only and are never substituted automatically.",
    publicationPolicy: "This artifact is triage evidence only. Every candidate remains withheld. Promotion requires an explicit per-spell allowlist, exact build continuity, complete EN/RU render identity for each required difficulty, semantic resolution of every client token, and any required Journal merge. A current live version label without an exact build is insufficient.",
    limitations: [
      "Warcraft Wiki and Wowhead are priority-3 expert/database sources, not official Blizzard publication surfaces.",
      `Wowhead identifies these pages as live ${candidates[0]?.localizedRenders.en.reportedLiveVersion ?? "unknown"}, but none exposes exact build ${gameBuild}; the renders can reject or rank candidates but cannot authorize publication for that build.`,
      "Wowhead supplies raid renders for difficulty IDs 14, 15, 16, and 17; story difficulty 220 is absent and is reported where exact-build effect evidence references it.",
      "A direct same-ID link proves fragment identity only; it does not prove tactics, role assignments, mechanic tags, timings, or difficulty deltas.",
      "Numeric literals are inventories only. Locale punctuation, scaling, group size, and server-side rendering semantics are not inferred from raw DB2 base points.",
    ],
    sources: [...guideSources, ...tooltipSources],
    summary: {
      withheldAbilities: candidates.length,
      renderedGuidePages: guidePages.length,
      localizedSpellPages: tooltipSources.length,
      sameIdGuideLinkedAbilities: candidates.filter((candidate) => candidate.renderedGuide.directSameIdLink).length,
      sameIdGuideMissingAbilities: candidates.filter((candidate) => !candidate.renderedGuide.directSameIdLink).length,
      bilingualRequiredRaidDifficultyRenders: candidates.filter((candidate) => candidate.missingRequiredRaidDifficultyIds.length === 0).length,
      exactBuildExposedSpellPages: tooltipSources.filter((source) => source.exactBuildExposed).length,
      effectDifficultyIncompleteAbilities: candidates.filter((candidate) => candidate.effectEvidence.missingRenderedDifficultyIds.length > 0).length,
      promotionAllowedAbilities: candidates.filter((candidate) => candidate.promotionAllowed).length,
      rankGroups: countBy(candidates.map((candidate) => candidate.rankGroup)),
      rankedCandidateSpellIds: candidates.map((candidate) => candidate.spellId),
    },
    candidates,
  };
}

const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
let audit;
try {
  audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
} catch (error) {
  if (!write) throw error;
}

const sourceBuffers = await loadSourceBuffers();
if (sourceBuffers) {
  const generated = buildAudit(sourceBuffers, audit?.lastVerifiedAt ?? new Date().toISOString());
  if (write) {
    generated.lastVerifiedAt = new Date().toISOString();
    await fs.writeFile(auditPath, `${JSON.stringify(generated, null, 2)}\n`);
    audit = generated;
  } else {
    check(JSON.stringify(stableAuditProjection(audit)) === JSON.stringify(stableAuditProjection(generated)),
      "pinned-candidate-ranking-does-not-match-rendered-sources");
  }
}

const expectedWithheldIds = descriptionAudit.abilities.filter((ability) => !ability.publicationSafe)
  .map((ability) => ability.spellId).sort((left, right) => left - right);
const candidateIds = (audit?.candidates ?? []).map((candidate) => candidate.spellId).sort((left, right) => left - right);
check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
check(audit?.scope === "midnight-season-one-withheld-description-candidate-ranking", "audit-scope-invalid");
check(audit?.gameBuild === gameBuild, "audit-build-mismatch");
check(audit?.descriptionAuditSha256 === sha256(descriptionAuditSource), "description-audit-hash-mismatch");
check(audit?.effectAuditSha256 === sha256(effectAuditSource), "effect-audit-hash-mismatch");
check(Number.isFinite(Date.parse(audit?.lastVerifiedAt)), "audit-last-verified-invalid");
check(JSON.stringify(candidateIds) === JSON.stringify(expectedWithheldIds), "candidate-id-set-does-not-match-description-audit");
check(new Set(candidateIds).size === candidateIds.length, "candidate-spell-id-duplicate");
check(audit?.summary?.withheldAbilities === expectedWithheldIds.length, `withheld-count-invalid:${audit?.summary?.withheldAbilities}`);
check(audit?.summary?.renderedGuidePages === guidePages.length, `guide-page-count-invalid:${audit?.summary?.renderedGuidePages}`);
check(audit?.summary?.localizedSpellPages === expectedWithheldIds.length * 2, `localized-page-count-invalid:${audit?.summary?.localizedSpellPages}`);
check(audit?.summary?.bilingualRequiredRaidDifficultyRenders === expectedWithheldIds.length,
  `bilingual-required-render-count-invalid:${audit?.summary?.bilingualRequiredRaidDifficultyRenders}`);
check(audit?.summary?.exactBuildExposedSpellPages === 0, `exact-build-exposure-overclaimed:${audit?.summary?.exactBuildExposedSpellPages}`);
check(audit?.summary?.promotionAllowedAbilities === 0, `promotion-count-invalid:${audit?.summary?.promotionAllowedAbilities}`);

for (const candidate of audit?.candidates ?? []) {
  const sourceAbility = descriptionAudit.abilities.find((ability) => ability.spellId === candidate.spellId);
  const effectRows = effectAudit.evidence.filter((record) => record.abilitySpellId === candidate.spellId);
  check(sourceAbility?.publicationSafe === false, `candidate-is-not-withheld:${candidate.spellId}`);
  check(candidate.publicationSafe === false && candidate.promotionAllowed === false, `candidate-overclaimed:${candidate.spellId}`);
  check(rankGroupPriority[candidate.rankGroup] === candidate.rankGroupPriority, `rank-priority-invalid:${candidate.spellId}`);
  check(candidate.effectEvidence?.records === effectRows.length, `effect-record-count-mismatch:${candidate.spellId}`);
  check(candidate.blockers?.includes("rendered_source_exact_build_unproven"), `exact-build-blocker-missing:${candidate.spellId}`);
  check(candidate.blockers?.includes("publication_requires_explicit_per_spell_allowlist"), `allowlist-blocker-missing:${candidate.spellId}`);
  check(candidate.missingRequiredRaidDifficultyIds?.length === 0, `required-raid-render-missing:${candidate.spellId}`);
  check(/^https:\/\/warcraft\.wiki\.gg\/wiki\//.test(candidate.renderedGuide?.sourceUrl ?? ""), `guide-source-invalid:${candidate.spellId}`);
  if (candidate.renderedGuide?.directSameIdLink) {
    check(/^[0-9a-f]{64}$/.test(candidate.renderedGuide.normalizedFragmentSha256 ?? ""), `guide-fragment-hash-invalid:${candidate.spellId}`);
  } else {
    check(candidate.renderedGuide?.normalizedFragmentSha256 === null, `missing-guide-fragment-has-hash:${candidate.spellId}`);
    check(candidate.blockers?.includes("same_id_rendered_guide_fragment_missing"), `missing-guide-blocker-absent:${candidate.spellId}`);
  }
  for (const locale of Object.keys(localeDefinitions)) {
    const evidence = candidate.localizedRenders?.[locale];
    check(evidence?.reportedLiveVersion === "12.1.0", `live-version-invalid:${candidate.spellId}:${locale}`);
    check(evidence?.exactBuildExposed === false, `exact-build-overclaimed:${candidate.spellId}:${locale}`);
    check(JSON.stringify(evidence?.difficultyIds) === JSON.stringify([14, 15, 16, 17]), `difficulty-set-invalid:${candidate.spellId}:${locale}`);
    check(evidence?.renderedDifficulties?.length === 4, `difficulty-render-count-invalid:${candidate.spellId}:${locale}`);
    check(/^[0-9a-f]{64}$/.test(evidence?.normalizedDifficultyTooltipIndexSha256 ?? ""), `tooltip-index-hash-invalid:${candidate.spellId}:${locale}`);
    for (const rendered of evidence?.renderedDifficulties ?? []) {
      check(rendered.exactSpellLink === true, `exact-spell-link-missing:${candidate.spellId}:${locale}:${rendered.difficultyId}`);
      check(rendered.localizedNameMatches === true, `localized-name-mismatch:${candidate.spellId}:${locale}:${rendered.difficultyId}`);
      check(/^[0-9a-f]{64}$/.test(rendered.normalizedDescriptionSha256 ?? ""), `description-hash-invalid:${candidate.spellId}:${locale}:${rendered.difficultyId}`);
      check(rendered.normalizedDescriptionLength > 0, `description-empty:${candidate.spellId}:${locale}:${rendered.difficultyId}`);
    }
  }
  if (candidate.effectEvidence?.missingRenderedDifficultyIds?.length > 0) {
    check(candidate.blockers?.includes("effect_difficulty_render_missing"), `effect-difficulty-blocker-missing:${candidate.spellId}`);
  }
}

for (const source of audit?.sources ?? []) {
  check(source.sourcePriority === 3, `source-priority-invalid:${source.kind}`);
  check(/^[0-9a-f]{64}$/.test(source.relevantFragmentIndexSha256 ?? source.normalizedDifficultyTooltipIndexSha256 ?? ""),
    `source-evidence-hash-invalid:${source.kind}`);
  if (source.kind.startsWith("rendered_guide_")) {
    const page = guidePages.find((candidate) => `rendered_guide_${candidate.encounterSlug}_en` === source.kind);
    const fragmentIndex = (audit?.candidates ?? []).filter((candidate) => candidate.encounterId === page?.encounterId).map((candidate) => ({
      spellId: candidate.spellId,
      directSameIdLink: candidate.renderedGuide.directSameIdLink,
      normalizedFragmentSha256: candidate.renderedGuide.normalizedFragmentSha256,
    })).sort((left, right) => left.spellId - right.spellId);
    check(Boolean(page), `guide-source-definition-missing:${source.kind}`);
    check(source.relevantAbilities === fragmentIndex.length, `guide-source-ability-count-mismatch:${source.kind}`);
    check(source.sameIdLinkedAbilities === fragmentIndex.filter((entry) => entry.directSameIdLink).length,
      `guide-source-link-count-mismatch:${source.kind}`);
    check(source.relevantFragmentIndexSha256 === sha256(Buffer.from(JSON.stringify(fragmentIndex))),
      `guide-source-index-drift:${source.kind}`);
  }
  if (source.kind.startsWith("rendered_spell_")) {
    const match = /^rendered_spell_(\d+)_(en|ru)$/.exec(source.kind);
    const candidate = match ? audit?.candidates?.find((record) => record.spellId === Number(match[1])) : null;
    const locale = match?.[2];
    check(Boolean(candidate && locale), `spell-source-definition-invalid:${source.kind}`);
    check(source.exactBuildExposed === false, `source-exact-build-overclaimed:${source.kind}`);
    check(source.normalizedDifficultyTooltipIndexSha256 === candidate?.localizedRenders?.[locale]?.normalizedDifficultyTooltipIndexSha256,
      `spell-source-index-drift:${source.kind}`);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  sourceBytesCompared: Boolean(sourceBuffers),
  withheldAbilities: audit?.summary?.withheldAbilities ?? null,
  sameIdGuideLinkedAbilities: audit?.summary?.sameIdGuideLinkedAbilities ?? null,
  bilingualRequiredRaidDifficultyRenders: audit?.summary?.bilingualRequiredRaidDifficultyRenders ?? null,
  effectDifficultyIncompleteAbilities: audit?.summary?.effectDifficultyIncompleteAbilities ?? null,
  promotionAllowedAbilities: audit?.summary?.promotionAllowedAbilities ?? null,
  verified: issues.length === 0,
  violations: issues,
};
await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
