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
const gameBuild = "12.1.0.69814";
const tokenAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-token-audit.json"), "utf8"));
const effectAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-effect-audit.json"), "utf8"));
const descriptionAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-description-audit.json"), "utf8"));
const auditPath = path.join(root, "data/wow/venomous-abyss-description-candidate-ranking.json");
const reportPath = path.join(root, "docs/reports/wow/venomous-abyss-description-candidate-ranking-verification.json");

const pages = [
  { encounterSlug: "nekzali-the-soulcoiler", url: "https://warcraft.wiki.gg/wiki/Nek%27zali_the_Soulcoiler", fileName: "warcraft-wiki-nekzali-the-soulcoiler.html" },
  { encounterSlug: "entombed-sentinels", url: "https://warcraft.wiki.gg/wiki/Entombed_Sentinels", fileName: "warcraft-wiki-entombed-sentinels.html" },
  { encounterSlug: "the-lost-explorers", url: "https://warcraft.wiki.gg/wiki/The_Lost_Explorers", fileName: "warcraft-wiki-the-lost-explorers.html" },
  { encounterSlug: "vashnik-the-malignant", url: "https://warcraft.wiki.gg/wiki/Vashnik_the_Malignant", fileName: "warcraft-wiki-vashnik-the-malignant.html" },
  { encounterSlug: "sszorak", url: "https://warcraft.wiki.gg/wiki/Sszorak", fileName: "warcraft-wiki-sszorak.html" },
  { encounterSlug: "the-twin-fangs", url: "https://warcraft.wiki.gg/wiki/The_Twin_Fangs", fileName: "warcraft-wiki-the-twin-fangs.html" },
  { encounterSlug: "the-coiled-altar", url: "https://warcraft.wiki.gg/wiki/The_Coiled_Altar", fileName: "warcraft-wiki-the-coiled-altar.html" },
  { encounterSlug: "ulatek", url: "https://warcraft.wiki.gg/wiki/Ula-Tek", fileName: "warcraft-wiki-ulatek.html" },
];
const dreadmarchWowheadSource = {
  kind: "rendered_spell_dreadmarch_en",
  url: "https://www.wowhead.com/spell=1285647/dreadmarch",
  fileName: "wowhead-dreadmarch-1285647.html",
  sourceSpellId: 1285647,
  terminalSpellId: 1297445,
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeHtmlFragment(fragment) {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)))
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
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') return JSON.parse(input.slice(quoteStart, index + 1));
  }
  throw new Error("JavaScript string end is missing");
}

function extractWowheadDreadmarchEvidence(buffer) {
  const html = buffer.toString("utf8");
  const sourceSpellId = dreadmarchWowheadSource.sourceSpellId;
  const terminalSpellId = dreadmarchWowheadSource.terminalSpellId;
  const initialDifficultyMatch = new RegExp(`g_spells\\[${sourceSpellId}\\]\\.initial_dd = (\\d+)`).exec(html);
  const initialGroupSizeMatch = new RegExp(`g_spells\\[${sourceSpellId}\\]\\.initial_ddSize = (\\d+)`).exec(html);
  const initialTooltipMarker = `g_spells[${sourceSpellId}].tooltip_enus = `;
  const initialTooltipIndex = html.indexOf(initialTooltipMarker);
  if (!initialDifficultyMatch || !initialGroupSizeMatch || initialTooltipIndex < 0) {
    throw new Error("Wowhead Dreadmarch initial tooltip metadata is missing");
  }

  const tooltipEntries = [{
    difficultyId: Number(initialDifficultyMatch[1]),
    groupSize: Number(initialGroupSizeMatch[1]),
    tooltipHtml: readJavaScriptString(html, initialTooltipIndex + initialTooltipMarker.length),
  }];
  const assignmentPattern = new RegExp(`g_spells\\[${sourceSpellId}\\]\\.server_tooltip_enus\\["dd(\\d+)ddsize(\\d+)"\\] = `, "g");
  for (const match of html.matchAll(assignmentPattern)) {
    tooltipEntries.push({
      difficultyId: Number(match[1]),
      groupSize: Number(match[2]),
      tooltipHtml: readJavaScriptString(html, match.index + match[0].length),
    });
  }

  const renderedDifficulties = tooltipEntries.map((entry) => {
    const target = `href="/spell=${terminalSpellId}/dreadmarch"`;
    const linkIndex = entry.tooltipHtml.indexOf(target);
    const bodyStart = linkIndex >= 0 ? entry.tooltipHtml.indexOf(">", linkIndex) + 1 : -1;
    const bodyEnd = bodyStart > 0 ? entry.tooltipHtml.indexOf("</a>", bodyStart) : -1;
    if (linkIndex < 0 || bodyStart <= 0 || bodyEnd < 0) {
      throw new Error(`Wowhead Dreadmarch terminal spell link missing for difficulty ${entry.difficultyId}`);
    }
    const normalized = decodeHtmlFragment(entry.tooltipHtml.slice(bodyStart, bodyEnd));
    const absorbMatch = /causing them to absorb ([\d,]+) damage/.exec(normalized);
    const manifestationsMatch = /Upon removal,\s*(multiple|\d+)?\s*Manifestations of Dread/.exec(normalized);
    if (!absorbMatch || !manifestationsMatch) {
      throw new Error(`Wowhead Dreadmarch rendered values missing for difficulty ${entry.difficultyId}`);
    }
    return {
      difficultyId: entry.difficultyId,
      groupSize: entry.groupSize,
      terminalSpellId,
      terminalSpellLink: true,
      absorbDamage: Number(absorbMatch[1].replaceAll(",", "")),
      manifestations: /^\d+$/.test(manifestationsMatch[1] ?? "") ? Number(manifestationsMatch[1]) : manifestationsMatch[1] ?? null,
      normalizedDescriptionSha256: sha256(Buffer.from(normalized)),
    };
  }).sort((left, right) => left.difficultyId - right.difficultyId || left.groupSize - right.groupSize);

  return {
    sourceSpellId,
    terminalSpellId,
    renderedDifficulties,
    normalizedDifficultyTooltipIndexSha256: sha256(Buffer.from(JSON.stringify(renderedDifficulties))),
  };
}

function extractRenderedEvidence(buffer, spellId, abilityName) {
  const html = buffer.toString("utf8");
  const needle = `href="https://www.wowhead.com/spell=${spellId}"`;
  const normalizedFragments = new Set();
  let exactLinkOccurrences = 0;
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
    if (normalized === abilityName || normalized.startsWith(`${abilityName} —`)) {
      normalizedFragments.add(normalized);
    }
  }

  const fragments = [...normalizedFragments].sort();
  const canonicalFragment = fragments.length === 1 ? fragments[0] : null;
  const numericLiterals = canonicalFragment
    ? [...new Set(canonicalFragment.match(/\b\d+(?:\.\d+)?(?:%|\b)/g) ?? [])].sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    : [];
  const placeholderCounts = canonicalFragment
    ? {
        genericValue: (canonicalFragment.match(/\bX\b/g) ?? []).length,
        clientToken: (canonicalFragment.match(/\$[A-Za-z?\[]/g) ?? []).length,
      }
    : { genericValue: 0, clientToken: 0 };

  return {
    directSameIdLink: canonicalFragment !== null,
    exactLinkOccurrences,
    matchingFragmentCount: fragments.length,
    normalizedFragmentSha256: canonicalFragment ? sha256(Buffer.from(canonicalFragment)) : null,
    normalizedFragmentLength: canonicalFragment ? [...canonicalFragment].length : 0,
    placeholderCounts,
    numericLiterals,
  };
}

function countBy(values) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map())]
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function determineRankGroup({ renderedEvidence, classifications, blockingCategories, semanticCrossCheck }) {
  if (!renderedEvidence.directSameIdLink) return "missing_same_id_rendered_evidence";
  if (semanticCrossCheck?.rawBasePointsMatchRenderedValues === false) return "rendered_same_id_scaled_value_conflict";
  if (renderedEvidence.placeholderCounts.genericValue === 0 && renderedEvidence.placeholderCounts.clientToken === 0) {
    return "rendered_same_id_candidate";
  }
  if (blockingCategories.includes("grammar") || blockingCategories.includes("difficulty_conditional")) {
    return "grammar_or_difficulty_conditional";
  }
  if ((classifications.scaled_or_dynamic ?? 0) > 0) return "scaled_or_dynamic";
  if ((classifications.difficulty_variant ?? 0) > 0) return "difficulty_variant";
  return "static_metadata_needs_rendered_crosscheck";
}

const rankGroupPriority = {
  rendered_same_id_candidate: 1,
  static_metadata_needs_rendered_crosscheck: 2,
  difficulty_variant: 3,
  rendered_same_id_scaled_value_conflict: 4,
  scaled_or_dynamic: 4,
  grammar_or_difficulty_conditional: 5,
  missing_same_id_rendered_evidence: 6,
};

function stableAuditProjection(audit) {
  return {
    schemaVersion: audit.schemaVersion,
    scope: audit.scope,
    gameBuild: audit.gameBuild,
    method: audit.method,
    publicationPolicy: audit.publicationPolicy,
    limitations: audit.limitations,
    sources: audit.sources,
    summary: audit.summary,
    candidates: audit.candidates,
  };
}

async function loadPageBuffers() {
  if (!online && !inputDir) return null;
  const buffers = new Map();
  for (const page of pages) {
    let buffer;
    if (online) {
      const response = await fetch(page.url, {
        headers: { "user-agent": "GildraDescriptionCandidateAudit/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${page.encounterSlug} returned HTTP ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      buffer = await fs.readFile(path.join(inputDir, page.fileName));
    }
    buffers.set(page.encounterSlug, buffer);
  }
  let wowheadBuffer;
  if (online) {
    const response = await fetch(dreadmarchWowheadSource.url, {
      headers: { "user-agent": "GildraDescriptionCandidateAudit/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`${dreadmarchWowheadSource.kind} returned HTTP ${response.status}`);
    wowheadBuffer = Buffer.from(await response.arrayBuffer());
  } else {
    wowheadBuffer = await fs.readFile(path.join(inputDir, dreadmarchWowheadSource.fileName));
  }
  buffers.set(dreadmarchWowheadSource.kind, wowheadBuffer);
  return buffers;
}

function buildAudit(pageBuffers, verifiedAt) {
  const withheldAbilities = tokenAudit.abilities.filter((ability) => !ability.publicationSafe);
  const descriptionBySpellId = new Map(descriptionAudit.abilities.map((ability) => [ability.spellId, ability]));
  const effectRowsByAbility = Map.groupBy(effectAudit.evidence, (record) => record.abilitySpellId);
  const dreadmarchRenderedEvidence = extractWowheadDreadmarchEvidence(pageBuffers.get(dreadmarchWowheadSource.kind));

  const candidates = withheldAbilities.map((ability) => {
    const description = descriptionBySpellId.get(ability.spellId);
    const page = pages.find((candidate) => candidate.encounterSlug === ability.encounterSlug);
    if (!description || !page) throw new Error(`candidate input missing for spell ${ability.spellId}`);
    const renderedEvidence = extractRenderedEvidence(pageBuffers.get(ability.encounterSlug), ability.spellId, description.names.en);
    const effectRows = effectRowsByAbility.get(ability.spellId) ?? [];
    const classifications = countBy(effectRows.map((record) => record.classification));
    const difficultyIds = [...new Set(effectRows.flatMap((record) => record.difficultyContexts?.map((context) => context.difficultyId) ?? []))]
      .sort((left, right) => left - right);
    const difficultyContexts = difficultyIds.map((difficultyId) => {
      const context = effectAudit.difficulties?.find((difficulty) => difficulty.difficultyId === difficultyId);
      return {
        difficultyId,
        registeredDifficulty: context?.registeredDifficulty ?? false,
        names: context?.names ?? { en: null, ru: null },
      };
    });
    const blockingCategories = [...new Set(Object.values(ability.locales)
      .flatMap((locale) => locale.blockingCategories ?? []))].sort();
    const tokenCounts = Object.fromEntries([...new Set(Object.values(ability.locales)
      .flatMap((locale) => Object.keys(locale.tokenCounts ?? {})))].sort()
      .map((category) => [category, Math.max(...Object.values(ability.locales).map((locale) => locale.tokenCounts?.[category] ?? 0))]));
    const semanticCrossCheck = ability.spellId === 1285643
      ? (() => {
          const effect = effectRows.find((record) => record.token === "$s1");
          const rawBasePoints = [...new Set(effect?.sourceRows?.map((row) => row.EffectBasePointsF) ?? [])].sort((left, right) => left - right);
          const renderedAbsorbValues = [...new Set(dreadmarchRenderedEvidence.renderedDifficulties.map((row) => row.absorbDamage))]
            .sort((left, right) => left - right);
          return {
            sourceUrl: dreadmarchWowheadSource.url,
            descriptionReferenceChainMatches:
              JSON.stringify(ability.locales.en.descriptionReferenceChain) === JSON.stringify([1285643, 1285647, 1297445])
              && JSON.stringify(ability.locales.ru.descriptionReferenceChain) === JSON.stringify([1285643, 1285647, 1297445]),
            ...dreadmarchRenderedEvidence,
            rawBasePoints,
            renderedAbsorbValues,
            rawBasePointsMatchRenderedValues: rawBasePoints.some((value) => renderedAbsorbValues.includes(value)),
          };
        })()
      : null;
    const rankGroup = determineRankGroup({ renderedEvidence, classifications, blockingCategories, semanticCrossCheck });
    const blockers = [];
    if (!renderedEvidence.directSameIdLink) blockers.push("same_id_rendered_fragment_missing");
    if (renderedEvidence.placeholderCounts.genericValue > 0) blockers.push("rendered_fragment_contains_generic_value_placeholder");
    if (renderedEvidence.placeholderCounts.clientToken > 0) blockers.push("rendered_fragment_contains_client_token");
    if ((classifications.scaled_or_dynamic ?? 0) > 0) blockers.push("scaled_or_dynamic_effect_semantics_unproven");
    if ((classifications.difficulty_variant ?? 0) > 0) blockers.push("difficulty_specific_variant_not_selected");
    if (semanticCrossCheck?.rawBasePointsMatchRenderedValues === false) blockers.push("independent_renderer_disproves_raw_basepoint_substitution");
    if (blockingCategories.includes("difficulty_conditional")) blockers.push("difficulty_conditional_not_rendered_per_difficulty");
    if (blockingCategories.includes("grammar")) blockers.push("locale_grammar_selection_unproven");
    if (renderedEvidence.directSameIdLink
      && renderedEvidence.placeholderCounts.genericValue === 0
      && renderedEvidence.placeholderCounts.clientToken === 0) {
      blockers.push("locale_native_token_rendering_not_yet_reproduced");
    }
    blockers.push("publication_requires_explicit_per_spell_allowlist");

    return {
      spellId: ability.spellId,
      encounterSlug: ability.encounterSlug,
      names: description.names,
      descriptionReferenceChains: Object.fromEntries(Object.entries(ability.locales)
        .map(([locale, value]) => [locale, value.descriptionReferenceChain])),
      terminalSpellIds: Object.fromEntries(Object.entries(ability.locales)
        .map(([locale, value]) => [locale, value.terminalSpellId])),
      blockingCategories,
      tokenCounts,
      effectEvidence: {
        records: effectRows.length,
        completeRecords: effectRows.filter((record) => record.evidenceComplete).length,
        classifications,
        difficultyContexts,
      },
      renderedGuide: {
        sourceUrl: page.url,
        ...renderedEvidence,
      },
      semanticCrossCheck,
      rankGroup,
      rankGroupPriority: rankGroupPriority[rankGroup],
      blockers,
      publicationSafe: false,
      promotionAllowed: false,
    };
  }).sort((left, right) =>
    left.rankGroupPriority - right.rankGroupPriority
      || left.renderedGuide.placeholderCounts.genericValue - right.renderedGuide.placeholderCounts.genericValue
      || left.renderedGuide.placeholderCounts.clientToken - right.renderedGuide.placeholderCounts.clientToken
      || (left.effectEvidence.classifications.scaled_or_dynamic ?? 0) - (right.effectEvidence.classifications.scaled_or_dynamic ?? 0)
      || (left.effectEvidence.classifications.difficulty_variant ?? 0) - (right.effectEvidence.classifications.difficulty_variant ?? 0)
      || left.effectEvidence.records - right.effectEvidence.records
      || left.spellId - right.spellId,
  );

  const sources = pages.map((page) => {
    const pageCandidates = candidates.filter((candidate) => candidate.encounterSlug === page.encounterSlug);
    const fragmentIndex = pageCandidates.map((candidate) => ({
      spellId: candidate.spellId,
      directSameIdLink: candidate.renderedGuide.directSameIdLink,
      normalizedFragmentSha256: candidate.renderedGuide.normalizedFragmentSha256,
    })).sort((left, right) => left.spellId - right.spellId);
    return {
      kind: `rendered_guide_${page.encounterSlug}_en`,
      url: page.url,
      sourcePriority: 3,
      relevantAbilities: fragmentIndex.length,
      sameIdLinkedAbilities: fragmentIndex.filter((entry) => entry.directSameIdLink).length,
      relevantFragmentIndexSha256: sha256(Buffer.from(JSON.stringify(fragmentIndex))),
    };
  });
  sources.push({
    kind: dreadmarchWowheadSource.kind,
    url: dreadmarchWowheadSource.url,
    sourcePriority: 3,
    sourceSpellId: dreadmarchWowheadSource.sourceSpellId,
    terminalSpellId: dreadmarchWowheadSource.terminalSpellId,
    normalizedDifficultyTooltipIndexSha256: dreadmarchRenderedEvidence.normalizedDifficultyTooltipIndexSha256,
    renderedDifficulties: dreadmarchRenderedEvidence.renderedDifficulties.length,
  });

  return {
    schemaVersion: 1,
    scope: "venomous-abyss-withheld-description-candidate-ranking",
    gameBuild,
    lastVerifiedAt: verifiedAt,
    method: "Ranks every withheld overview ability by exact-build token/effect evidence and an independently rendered English Adventure Guide fragment. A rendered fragment is associated only when its ability heading links directly to the same Wowhead spell ID; hashes are calculated from normalized per-ability fragments, not mutable page chrome. Dreadmarch additionally uses its exact DB2 description-reference chain and per-difficulty Wowhead render to detect whether raw EffectBasePoints values are valid player-facing substitutions.",
    publicationPolicy: "This artifact is triage only. Every candidate remains withheld. Promotion requires an explicit per-spell allowlist, exact difficulty selection, semantic interpretation of every effect token, reproducible locale-native EN/RU rendering, and independently rendered same-ID evidence for every substituted value. Generic X placeholders and unresolved client tokens are never published.",
    limitations: [
      "Warcraft Wiki is a priority-3 expert/community source, not an official Blizzard publication surface.",
      "The rendered English guide can cross-check values but cannot establish Russian grammar or locale rendering by itself.",
      "A direct same-ID link establishes fragment identity only; it does not prove tactics, role assignments, mechanic tags, timing, or difficulty deltas.",
      "Numeric literals are inventory evidence only and are not promoted automatically from this report.",
      "The Wowhead Dreadmarch tooltip is current live priority-3 evidence rather than a build-pinned Blizzard source; it may reject a naive substitution but cannot authorize publication for build 12.1.0.69814.",
    ],
    sources,
    summary: {
      withheldAbilities: candidates.length,
      renderedGuidePages: pages.length,
      supplementalRenderedSources: 1,
      sameIdLinkedAbilities: candidates.filter((candidate) => candidate.renderedGuide.directSameIdLink).length,
      sameIdMissingAbilities: candidates.filter((candidate) => !candidate.renderedGuide.directSameIdLink).length,
      renderedWithoutPlaceholders: candidates.filter((candidate) => candidate.renderedGuide.directSameIdLink
        && candidate.renderedGuide.placeholderCounts.genericValue === 0
        && candidate.renderedGuide.placeholderCounts.clientToken === 0).length,
      promotionAllowedAbilities: candidates.filter((candidate) => candidate.promotionAllowed).length,
      rejectedBySemanticCrossCheck: candidates.filter((candidate) => candidate.semanticCrossCheck?.rawBasePointsMatchRenderedValues === false).length,
      rankGroups: countBy(candidates.map((candidate) => candidate.rankGroup)),
      nextCandidateSpellIds: candidates.filter((candidate) => candidate.rankGroup === "rendered_same_id_candidate").map((candidate) => candidate.spellId),
      rejectedCandidateSpellIds: candidates.filter((candidate) => candidate.semanticCrossCheck?.rawBasePointsMatchRenderedValues === false).map((candidate) => candidate.spellId),
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

const pageBuffers = await loadPageBuffers();
if (pageBuffers) {
  const generated = buildAudit(pageBuffers, audit?.lastVerifiedAt ?? new Date().toISOString());
  if (write) {
    generated.lastVerifiedAt = new Date().toISOString();
    await fs.writeFile(auditPath, `${JSON.stringify(generated, null, 2)}\n`);
    audit = generated;
  } else {
    check(
      JSON.stringify(stableAuditProjection(audit)) === JSON.stringify(stableAuditProjection(generated)),
      "pinned-candidate-ranking-does-not-match-rendered-source-bytes",
    );
  }
}

check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
check(audit?.gameBuild === gameBuild, "audit-build-mismatch");
check(Number.isFinite(Date.parse(audit?.lastVerifiedAt)), "audit-last-verified-invalid");
check(audit?.summary?.withheldAbilities === 25, `withheld-count-invalid:${audit?.summary?.withheldAbilities}`);
check(audit?.summary?.renderedGuidePages === 8, `page-count-invalid:${audit?.summary?.renderedGuidePages}`);
check(audit?.summary?.supplementalRenderedSources === 1, `supplemental-source-count-invalid:${audit?.summary?.supplementalRenderedSources}`);
check(audit?.summary?.sameIdLinkedAbilities === 22, `same-id-linked-count-invalid:${audit?.summary?.sameIdLinkedAbilities}`);
check(audit?.summary?.sameIdMissingAbilities === 3, `same-id-missing-count-invalid:${audit?.summary?.sameIdMissingAbilities}`);
check(audit?.summary?.renderedWithoutPlaceholders === 1, `placeholder-free-count-invalid:${audit?.summary?.renderedWithoutPlaceholders}`);
check(audit?.summary?.promotionAllowedAbilities === 0, `promotion-count-invalid:${audit?.summary?.promotionAllowedAbilities}`);
check(audit?.summary?.rejectedBySemanticCrossCheck === 1, `semantic-rejection-count-invalid:${audit?.summary?.rejectedBySemanticCrossCheck}`);
check(JSON.stringify(audit?.summary?.nextCandidateSpellIds) === JSON.stringify([]), "next-candidate-set-invalid");
check(JSON.stringify(audit?.summary?.rejectedCandidateSpellIds) === JSON.stringify([1285643]), "rejected-candidate-set-invalid");

const expectedWithheldIds = tokenAudit.abilities.filter((ability) => !ability.publicationSafe).map((ability) => ability.spellId).sort((left, right) => left - right);
const rankedIds = (audit?.candidates ?? []).map((candidate) => candidate.spellId).sort((left, right) => left - right);
check(JSON.stringify(rankedIds) === JSON.stringify(expectedWithheldIds), "candidate-id-set-does-not-match-token-audit");
check(new Set(rankedIds).size === rankedIds.length, "candidate-spell-id-duplicate");

for (const candidate of audit?.candidates ?? []) {
  const tokenAbility = tokenAudit.abilities.find((ability) => ability.spellId === candidate.spellId);
  const descriptionAbility = descriptionAudit.abilities.find((ability) => ability.spellId === candidate.spellId);
  const effectRows = effectAudit.evidence.filter((record) => record.abilitySpellId === candidate.spellId);
  check(tokenAbility?.publicationSafe === false, `candidate-is-not-withheld:${candidate.spellId}`);
  check(descriptionAbility?.publicationSafe === false, `description-is-not-withheld:${candidate.spellId}`);
  check(candidate.publicationSafe === false && candidate.promotionAllowed === false, `candidate-overclaimed:${candidate.spellId}`);
  check(rankGroupPriority[candidate.rankGroup] === candidate.rankGroupPriority, `rank-priority-invalid:${candidate.spellId}`);
  check(candidate.effectEvidence?.records === effectRows.length, `effect-record-count-mismatch:${candidate.spellId}`);
  check(candidate.effectEvidence?.completeRecords === effectRows.filter((record) => record.evidenceComplete).length, `effect-complete-count-mismatch:${candidate.spellId}`);
  check(candidate.blockers?.includes("publication_requires_explicit_per_spell_allowlist"), `allowlist-blocker-missing:${candidate.spellId}`);
  check(/^https:\/\/warcraft\.wiki\.gg\/wiki\//.test(candidate.renderedGuide?.sourceUrl ?? ""), `rendered-source-invalid:${candidate.spellId}`);
  if (candidate.renderedGuide?.directSameIdLink) {
    check(/^[0-9a-f]{64}$/.test(candidate.renderedGuide.normalizedFragmentSha256 ?? ""), `rendered-fragment-hash-invalid:${candidate.spellId}`);
  } else {
    check(candidate.renderedGuide?.normalizedFragmentSha256 === null, `missing-fragment-has-hash:${candidate.spellId}`);
    check(candidate.blockers?.includes("same_id_rendered_fragment_missing"), `missing-fragment-blocker-absent:${candidate.spellId}`);
  }
  if (candidate.spellId === 1285643) {
    check(candidate.semanticCrossCheck?.descriptionReferenceChainMatches === true, "dreadmarch-reference-chain-mismatch");
    check(candidate.semanticCrossCheck?.sourceSpellId === 1285647, "dreadmarch-source-spell-id-mismatch");
    check(candidate.semanticCrossCheck?.terminalSpellId === 1297445, "dreadmarch-terminal-spell-id-mismatch");
    check(candidate.semanticCrossCheck?.renderedDifficulties?.length === 5, "dreadmarch-rendered-difficulty-count-invalid");
    check(candidate.semanticCrossCheck?.rawBasePointsMatchRenderedValues === false, "dreadmarch-semantic-conflict-missing");
    check(candidate.blockers?.includes("independent_renderer_disproves_raw_basepoint_substitution"), "dreadmarch-semantic-blocker-missing");
    check(candidate.rankGroup === "rendered_same_id_scaled_value_conflict", `dreadmarch-rank-group-invalid:${candidate.rankGroup}`);
  }
}

for (const source of audit?.sources ?? []) {
  check(source.sourcePriority === 3, `source-priority-invalid:${source.kind}`);
  check(
    /^[0-9a-f]{64}$/.test(source.relevantFragmentIndexSha256 ?? "")
      || /^[0-9a-f]{64}$/.test(source.normalizedDifficultyTooltipIndexSha256 ?? ""),
    `source-fragment-index-hash-invalid:${source.kind}`,
  );
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  sourceBytesCompared: Boolean(pageBuffers),
  withheldAbilities: audit?.summary?.withheldAbilities ?? null,
  sameIdLinkedAbilities: audit?.summary?.sameIdLinkedAbilities ?? null,
  renderedWithoutPlaceholders: audit?.summary?.renderedWithoutPlaceholders ?? null,
  nextCandidateSpellIds: audit?.summary?.nextCandidateSpellIds ?? [],
  rejectedCandidateSpellIds: audit?.summary?.rejectedCandidateSpellIds ?? [],
  promotionAllowedAbilities: audit?.summary?.promotionAllowedAbilities ?? null,
  verified: issues.length === 0,
  violations: issues,
};

await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
