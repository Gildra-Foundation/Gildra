import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const write = process.argv.includes("--write");
const strict = process.argv.includes("--strict");
const manifestPath = path.join(root, "data/wow/content-manifest.json");
const tokenAuditPath = path.join(root, "data/wow/venomous-abyss-token-audit.json");
const effectAuditPath = path.join(root, "data/wow/venomous-abyss-effect-audit.json");
const rankingAuditPath = path.join(root, "data/wow/venomous-abyss-description-candidate-ranking.json");
const seasonOneAuditPath = path.join(root, "data/wow/midnight-season-one-description-audit.json");
const seasonOneEffectAuditPath = path.join(root, "data/wow/midnight-season-one-effect-audit.json");
const seasonOneCandidateRankingPath = path.join(root, "data/wow/midnight-season-one-description-candidate-ranking.json");
const seasonOneGuardianEdictContinuityPath = path.join(root, "data/wow/midnight-season-one-guardian-edict-continuity.json");
const seasonOnePublicationPath = path.join(root, "data/wow/midnight-season-one-publication.json");
const reportPath = path.join(root, "docs/reports/wow/description-variant-contract-verification.json");

const [manifestSource, tokenAuditSource, effectAuditSource, rankingAuditSource, seasonOneAuditSource, seasonOneEffectAuditSource,
  seasonOneCandidateRankingSource, seasonOneGuardianEdictContinuitySource] = await Promise.all([
  fs.readFile(manifestPath, "utf8"),
  fs.readFile(tokenAuditPath, "utf8"),
  fs.readFile(effectAuditPath, "utf8"),
  fs.readFile(rankingAuditPath, "utf8"),
  fs.readFile(seasonOneAuditPath, "utf8"),
  fs.readFile(seasonOneEffectAuditPath, "utf8"),
  fs.readFile(seasonOneCandidateRankingPath, "utf8"),
  fs.readFile(seasonOneGuardianEdictContinuityPath, "utf8"),
]);
const manifest = JSON.parse(manifestSource);
const tokenAudit = JSON.parse(tokenAuditSource);
const effectAudit = JSON.parse(effectAuditSource);
const rankingAudit = JSON.parse(rankingAuditSource);
const seasonOneAudit = JSON.parse(seasonOneAuditSource);
const seasonOneEffectAudit = JSON.parse(seasonOneEffectAuditSource);
const seasonOneCandidateRanking = JSON.parse(seasonOneCandidateRankingSource);
const seasonOneGuardianEdictContinuity = JSON.parse(seasonOneGuardianEdictContinuitySource);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const difficultySlugs = new Map([
  [14, "normal"],
  [15, "heroic"],
  [16, "mythic"],
  [17, "raid-finder"],
  [220, "story"],
]);

function maxDate(...values) {
  return values.filter(Boolean).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function buildRegistry() {
  const sourceEn = effectAudit.sources.find((source) => source.kind === "difficulty_en");
  const sourceRu = effectAudit.sources.find((source) => source.kind === "difficulty_ru");
  const entries = effectAudit.difficulties
    .filter((difficulty) => difficulty.registeredDifficulty)
    .map((difficulty) => ({
      difficultyId: difficulty.difficultyId,
      canonicalSlug: difficultySlugs.get(difficulty.difficultyId),
      names: difficulty.names,
      instanceType: difficulty.metadata.InstanceType,
      orderIndex: difficulty.metadata.OrderIndex,
      fallbackDifficultyId: difficulty.metadata.FallbackDifficultyID,
      minPlayers: difficulty.metadata.MinPlayers,
      maxPlayers: difficulty.metadata.MaxPlayers,
    }))
    .sort((left, right) => left.orderIndex - right.orderIndex || left.difficultyId - right.difficultyId);
  if (entries.some((entry) => !entry.canonicalSlug)) throw new Error("registered description difficulty lacks a canonical slug");
  return {
    scope: "registered raid difficulty contexts observed by the exact-build description effect audit",
    gameBuild: effectAudit.gameBuild,
    sourceKind: "verified_database",
    sourcePriority: 3,
    sourceUrls: { en: sourceEn.url, ru: sourceRu.url },
    sourceSha256: { en: sourceEn.sha256, ru: sourceRu.sha256 },
    lastVerifiedAt: effectAudit.lastVerifiedAt,
    verificationStatus: "verified",
    requiredRaidDifficultyIds: [17, 14, 15, 16],
    entries,
  };
}

function evidenceFor(ability, tokenAbility) {
  const effectRows = effectAudit.evidence.filter((record) => record.abilitySpellId === ability.refs.spellId);
  const candidate = rankingAudit.candidates.find((record) => record.spellId === ability.refs.spellId);
  const blockingCategories = [...new Set(Object.values(tokenAbility.locales)
    .flatMap((locale) => locale.blockingCategories ?? []))].sort();
  const effectClassifications = [...new Set(effectRows.map((record) => record.classification))].sort();
  const requiredBy = tokenAbility.publicationSafe
    ? []
    : [...new Set([
        ...blockingCategories,
        ...effectClassifications.filter((classification) => classification !== "static_metadata"),
      ])].sort();
  return {
    gameBuild: tokenAudit.gameBuild,
    sourceUrls: {
      descriptionEn: tokenAudit.sources.find((source) => source.kind === "spell_en")?.url ?? null,
      descriptionRu: tokenAudit.sources.find((source) => source.kind === "spell_ru")?.url ?? null,
      spellEffect: effectAudit.sources.find((source) => source.kind === "spell_effect_en")?.url ?? null,
      difficultyEn: effectAudit.sources.find((source) => source.kind === "difficulty_en")?.url ?? null,
      difficultyRu: effectAudit.sources.find((source) => source.kind === "difficulty_ru")?.url ?? null,
      renderedGuide: candidate?.renderedGuide?.sourceUrl ?? null,
      semanticCrossCheck: candidate?.semanticCrossCheck?.sourceUrl ?? null,
    },
    auditSha256: {
      token: sha256(tokenAuditSource),
      effect: sha256(effectAuditSource),
      candidateRanking: sha256(rankingAuditSource),
    },
    lastVerifiedAt: maxDate(tokenAudit.lastVerifiedAt, effectAudit.lastVerifiedAt, rankingAudit.lastVerifiedAt),
    requiredBy,
    blockers: candidate?.blockers ?? [],
  };
}

function seasonOneSource(kind) {
  return seasonOneAudit.sources.find((source) => source.kind === kind)?.url ?? null;
}

function evidenceForSeasonOne(auditedAbility) {
  const effectRows = seasonOneEffectAudit.evidence.filter((record) => record.abilitySpellId === auditedAbility.spellId);
  const hasEffectEvidence = effectRows.length > 0;
  const candidate = seasonOneCandidateRanking.candidates.find((record) => record.spellId === auditedAbility.spellId);
  const continuity = auditedAbility.spellId === seasonOneGuardianEdictContinuity.spellId ? seasonOneGuardianEdictContinuity : null;
  const classifications = [...new Set(effectRows.map((record) => record.classification))].sort();
  const blockers = [...new Set([
    ...auditedAbility.blockers,
    ...(candidate?.blockers ?? []),
    ...(continuity?.blockers ?? []),
    ...(classifications.includes("client_index_unresolved") ? ["client_index_semantics_unresolved"] : []),
    ...(classifications.includes("difficulty_variant") ? ["difficulty_specific_rendering_unverified"] : []),
    ...(classifications.includes("scaled_or_dynamic") ? ["scaled_value_rendering_unverified"] : []),
    ...(classifications.includes("missing") ? ["numeric_metadata_missing"] : []),
  ])].sort();
  return {
    gameBuild: seasonOneAudit.gameBuild,
    sourceUrls: {
      descriptionEn: seasonOneSource("spell_en"),
      descriptionRu: seasonOneSource("spell_ru"),
      journalEn: seasonOneSource("journal_section_en"),
      journalRu: seasonOneSource("journal_section_ru"),
      ...(hasEffectEvidence ? {
        spellEffect: seasonOneEffectAudit.sources.find((source) => source.kind === "spell_effect")?.url ?? null,
        spellMisc: seasonOneEffectAudit.sources.find((source) => source.kind === "spell_misc")?.url ?? null,
        spellDuration: seasonOneEffectAudit.sources.find((source) => source.kind === "spell_duration")?.url ?? null,
        spellRadius: seasonOneEffectAudit.sources.find((source) => source.kind === "spell_radius")?.url ?? null,
        difficultyEn: seasonOneEffectAudit.sources.find((source) => source.kind === "difficulty_en")?.url ?? null,
        difficultyRu: seasonOneEffectAudit.sources.find((source) => source.kind === "difficulty_ru")?.url ?? null,
        renderedGuide: candidate?.renderedGuide?.sourceUrl ?? null,
        renderedSpellEn: candidate?.localizedRenders?.en?.sourceUrl ?? null,
        renderedSpellRu: candidate?.localizedRenders?.ru?.sourceUrl ?? null,
        ...(continuity ? {
          renderContinuityBuildIndex: continuity.sources.find((source) => source.kind === "retail_build_index")?.url ?? null,
          renderContinuityGuide: continuity.sources.find((source) => source.kind === "warcraft_wiki_en")?.url ?? null,
        } : {}),
      } : {}),
    },
    auditSha256: {
      description: sha256(seasonOneAuditSource),
      ...(hasEffectEvidence ? { effect: sha256(seasonOneEffectAuditSource) } : {}),
      ...(candidate ? { candidateRanking: sha256(seasonOneCandidateRankingSource) } : {}),
      ...(continuity ? { renderContinuity: sha256(seasonOneGuardianEdictContinuitySource) } : {}),
    },
    lastVerifiedAt: hasEffectEvidence
      ? maxDate(seasonOneAudit.lastVerifiedAt, seasonOneEffectAudit.lastVerifiedAt, candidate?.lastVerifiedAt,
          seasonOneCandidateRanking.lastVerifiedAt, continuity?.lastVerifiedAt)
      : seasonOneAudit.lastVerifiedAt,
    requiredBy: [...new Set([
      ...auditedAbility.requiredBy,
      ...classifications.filter((classification) => classification !== "static_metadata"),
    ])].sort(),
    blockers,
  };
}

function appendDescriptionHistory(ability, auditedAbility) {
  const change = auditedAbility.publicationSafe
    ? "exact_build_description_verified"
    : "exact_build_description_withheld_unresolved_client_tokens";
  const history = ability.history.some((entry) => entry.change === change && entry.at === seasonOneAudit.lastVerifiedAt)
    ? ability.history
    : [...ability.history, {
        at: seasonOneAudit.lastVerifiedAt,
        change,
        sourceUrl: seasonOneSource("spell_en"),
        referencedSpellIds: auditedAbility.source.en.referenceChain.slice(1),
      }];
  const effectRows = seasonOneEffectAudit.evidence.filter((record) => record.abilitySpellId === auditedAbility.spellId);
  let nextHistory = history;
  if (effectRows.length && !nextHistory.some((entry) => entry.change === "exact_build_description_dependencies_classified"
    && entry.at === seasonOneEffectAudit.lastVerifiedAt)) nextHistory = [...nextHistory, {
      at: seasonOneEffectAudit.lastVerifiedAt,
      change: "exact_build_description_dependencies_classified",
      sourceUrl: seasonOneEffectAudit.sources.find((source) => source.kind === "spell_effect")?.url ?? seasonOneSource("spell_en"),
      referencedSpellIds: [...new Set(effectRows.map((record) => record.targetSpellId))].sort((left, right) => left - right),
    }];
  if (auditedAbility.spellId === seasonOneGuardianEdictContinuity.spellId
    && !nextHistory.some((entry) => entry.change === "exact_build_raw_continuity_verified_render_conflict_withheld"
      && entry.at === seasonOneGuardianEdictContinuity.lastVerifiedAt)) nextHistory = [
        ...nextHistory.filter((entry) => entry.change !== "exact_build_raw_continuity_verified_render_conflict_withheld"), {
        at: seasonOneGuardianEdictContinuity.lastVerifiedAt,
        change: "exact_build_raw_continuity_verified_render_conflict_withheld",
        sourceUrl: seasonOneGuardianEdictContinuity.sources.find((source) => source.kind === "retail_build_index")?.url,
        referencedSpellIds: [seasonOneGuardianEdictContinuity.dependencySpellId],
      }];
  return nextHistory;
}

const registry = buildRegistry();
const abilities = manifest.abilities.map((ability) => {
  const tokenAbility = tokenAudit.abilities.find((record) => record.spellId === ability.refs?.spellId);
  const seasonOneAbility = seasonOneAudit.abilities.find((record) => record.spellId === ability.refs?.spellId);
  if (seasonOneAbility) {
    const publicationSafe = seasonOneAbility.publicationSafe === true;
    return {
      ...ability,
      descriptions: publicationSafe
        ? { en: seasonOneAbility.source.en.description, ru: seasonOneAbility.source.ru.description }
        : { en: null, ru: null },
      lastVerifiedAt: maxDate(ability.lastVerifiedAt, seasonOneAudit.lastVerifiedAt,
        publicationSafe ? null : seasonOneEffectAudit.lastVerifiedAt),
      history: appendDescriptionHistory(ability, seasonOneAbility),
      sourceUrls: {
        ...(ability.sourceUrls ?? {}),
        descriptionEn: seasonOneSource("spell_en"),
        descriptionRu: seasonOneSource("spell_ru"),
        descriptionJournalEn: seasonOneSource("journal_section_en"),
        descriptionJournalRu: seasonOneSource("journal_section_ru"),
      },
      descriptionVerificationStatus: publicationSafe ? "verified" : "withheld_unresolved_tokens",
      descriptionSourceKind: publicationSafe ? "exact_build_spell_description" : "exact_build_unresolved",
      descriptionVerifiedAt: seasonOneAudit.lastVerifiedAt,
      descriptionRawClassifications: {
        en: seasonOneAbility.source.en.classification,
        ru: seasonOneAbility.source.ru.classification,
      },
      descriptionVariantStatus: publicationSafe ? "not_required_verified" : "required_unverified",
      descriptionVariants: [],
      descriptionVariantEvidence: evidenceForSeasonOne(seasonOneAbility),
    };
  }
  if (!tokenAbility) {
    return {
      ...ability,
      descriptions: { en: null, ru: null },
      descriptionVerificationStatus: "withheld_unverified_source",
      descriptionVariantStatus: "unknown",
      descriptionVariants: [],
      descriptionVariantEvidence: null,
    };
  }
  const publicationSafe = tokenAbility.publicationSafe === true;
  return {
    ...ability,
    descriptionVariantStatus: publicationSafe ? "not_required_verified" : "required_unverified",
    descriptionVariants: [],
    descriptionVariantEvidence: evidenceFor(ability, tokenAbility),
  };
});

const generated = {
  ...manifest,
  schemaVersion: 2,
  manifestVersion: "2026-09-13.baseline.17",
  lastVerifiedAt: maxDate(manifest.lastVerifiedAt, registry.lastVerifiedAt, rankingAudit.lastVerifiedAt, seasonOneAudit.lastVerifiedAt,
    seasonOneEffectAudit.lastVerifiedAt, seasonOneCandidateRanking.lastVerifiedAt, seasonOneGuardianEdictContinuity.lastVerifiedAt),
  descriptionDifficultyRegistry: registry,
  abilities,
};

const seasonOnePublication = {
  schemaVersion: 1,
  manifestVersion: generated.manifestVersion,
  sourceAuditSha256: sha256(seasonOneAuditSource),
  encounterCoverage: [...Map.groupBy(generated.abilities.filter((ability) => ability.season === "midnight-season-1"),
    (ability) => ability.refs.encounterId)]
    .map(([encounterId, encounterAbilities]) => ({
      encounterId,
      recordedAbilities: encounterAbilities.length,
      publicationSafeAbilities: encounterAbilities.filter((ability) => ability.descriptionVariantStatus === "not_required_verified"
        && ability.descriptionVerificationStatus === "verified" && ability.iconVerificationStatus === "verified").length,
      withheldAbilities: encounterAbilities.filter((ability) => ability.descriptionVariantStatus !== "not_required_verified"
        || ability.descriptionVerificationStatus !== "verified" || ability.iconVerificationStatus !== "verified").length,
    }))
    .sort((left, right) => left.encounterId - right.encounterId),
  abilities: generated.abilities
    .filter((ability) => ability.season === "midnight-season-1"
      && ability.descriptionVariantStatus === "not_required_verified"
      && ability.descriptionVerificationStatus === "verified"
      && ability.iconVerificationStatus === "verified")
    .map((ability) => ({
      encounterId: ability.refs.encounterId,
      spellId: ability.refs.spellId,
      role: ability.role,
      nameEn: ability.names.en,
      nameRu: ability.names.ru,
      descriptionEn: ability.descriptions.en,
      descriptionRu: ability.descriptions.ru,
      iconName: ability.iconName,
      iconUrl: ability.iconUrl,
      descriptionSourceUrlEn: ability.sourceUrls.descriptionEn,
      descriptionSourceUrlRu: ability.sourceUrls.descriptionRu,
      descriptionVerifiedAt: ability.descriptionVerifiedAt,
      descriptionBuild: ability.build,
    }))
    .sort((left, right) => left.encounterId - right.encounterId || left.spellId - right.spellId),
};

const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
check(seasonOneEffectAudit.gameBuild === seasonOneAudit.gameBuild, "season-one-effect-audit-build-mismatch");
check(seasonOneEffectAudit.descriptionAuditSha256 === sha256(seasonOneAuditSource), "season-one-effect-audit-description-hash-mismatch");
check(seasonOneEffectAudit.summary?.standalonePublicationSafeRecords === 0, "season-one-effect-audit-unsafe-publication-state");
check(seasonOneCandidateRanking.gameBuild === seasonOneAudit.gameBuild, "season-one-candidate-ranking-build-mismatch");
check(seasonOneCandidateRanking.descriptionAuditSha256 === sha256(seasonOneAuditSource), "season-one-candidate-description-hash-mismatch");
check(seasonOneCandidateRanking.effectAuditSha256 === sha256(seasonOneEffectAuditSource), "season-one-candidate-effect-hash-mismatch");
check(seasonOneCandidateRanking.summary?.promotionAllowedAbilities === 0, "season-one-candidate-ranking-unsafe-promotion-state");
check(seasonOneGuardianEdictContinuity.targetBuild === seasonOneAudit.gameBuild, "guardian-edict-continuity-target-build-mismatch");
check(seasonOneGuardianEdictContinuity.dependencyAuditSha256?.description === sha256(seasonOneAuditSource),
  "guardian-edict-continuity-description-hash-mismatch");
check(seasonOneGuardianEdictContinuity.dependencyAuditSha256?.effect === sha256(seasonOneEffectAuditSource),
  "guardian-edict-continuity-effect-hash-mismatch");
check(seasonOneGuardianEdictContinuity.dependencyAuditSha256?.candidate === sha256(seasonOneCandidateRankingSource),
  "guardian-edict-continuity-candidate-hash-mismatch");
check(seasonOneGuardianEdictContinuity.publicationSafe === false && seasonOneGuardianEdictContinuity.promotionAllowed === false,
  "guardian-edict-continuity-unsafe-publication-state");
for (const auditedAbility of seasonOneAudit.abilities.filter((ability) => !ability.publicationSafe)) {
  const numericCategories = new Set(auditedAbility.requiredBy.filter((category) => ["effect_value", "effect_period", "duration", "radius"].includes(category)));
  const effectRows = seasonOneEffectAudit.evidence.filter((record) => record.abilitySpellId === auditedAbility.spellId);
  for (const category of numericCategories) {
    check(effectRows.some((record) => record.category === category), `season-one-effect-evidence-missing:${auditedAbility.spellId}:${category}`);
  }
  const candidate = seasonOneCandidateRanking.candidates.find((record) => record.spellId === auditedAbility.spellId);
  check(candidate?.publicationSafe === false && candidate?.promotionAllowed === false,
    `season-one-candidate-missing-or-overclaimed:${auditedAbility.spellId}`);
  check(candidate?.blockers?.includes("rendered_source_exact_build_unproven"),
    `season-one-candidate-exact-build-blocker-missing:${auditedAbility.spellId}`);
}
if (write) await Promise.all([
  fs.writeFile(manifestPath, `${JSON.stringify(generated, null, 2)}\n`),
  fs.writeFile(seasonOnePublicationPath, `${JSON.stringify(seasonOnePublication, null, 2)}\n`),
]);
else {
  check(JSON.stringify(manifest) === JSON.stringify(generated), "manifest-description-variant-contract-not-normalized");
  const storedPublication = JSON.parse(await fs.readFile(seasonOnePublicationPath, "utf8"));
  check(JSON.stringify(storedPublication) === JSON.stringify(seasonOnePublication), "season-one-publication-projection-not-normalized");
}

const summary = {
  generatedAt: new Date().toISOString(),
  write,
  schemaVersion: generated.schemaVersion,
  manifestVersion: generated.manifestVersion,
  difficultyContexts: generated.descriptionDifficultyRegistry.entries.length,
  requiredRaidDifficultyIds: generated.descriptionDifficultyRegistry.requiredRaidDifficultyIds,
  abilities: generated.abilities.length,
  statusCounts: Object.fromEntries([...Map.groupBy(generated.abilities, (ability) => ability.descriptionVariantStatus)]
    .map(([status, rows]) => [status, rows.length]).sort(([left], [right]) => left.localeCompare(right))),
  withheldUnverifiedSourceDescriptions: generated.abilities
    .filter((ability) => ability.descriptionVerificationStatus === "withheld_unverified_source")
    .map((ability) => ability.refs.spellId),
  seasonOnePublicationAbilities: seasonOnePublication.abilities.length,
  populatedVariants: generated.abilities.reduce((total, ability) => total + ability.descriptionVariants.length, 0),
  verified: issues.length === 0,
  violations: issues,
};
await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
