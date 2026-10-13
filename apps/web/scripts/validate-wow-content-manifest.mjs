import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key.startsWith("--")) continue;
  args.set(key.slice(2), value?.startsWith("--") ? true : value ?? true);
  if (value && !value.startsWith("--")) index += 1;
}
const manifestPath = path.resolve(root, String(args.get("manifest") ?? "data/wow/content-manifest.json"));
const completionContractPath = path.resolve(root, String(args.get("contract") ?? "data/wow/completion-contract.json"));
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const completionContract = JSON.parse(await fs.readFile(completionContractPath, "utf8"));
const outputPath = path.resolve(root, String(args.get("output") ?? "docs/reports/wow/content-manifest-validation.json"));
const strict = args.has("strict");

const hierarchy = ["editions", "expansions", "patches", "seasons", "activities", "instances", "encounters", "phases", "abilities", "loot"];
const entityCollections = [...hierarchy, "classes", "specializations"];
const commonFields = ["id", "canonicalSlug", "names", "descriptions", "gameVersion", "build", "patch", "season", "status", "sourceUrl", "lastVerifiedAt", "verificationStatus", "refs", "history"];
const allowedStatuses = new Set(["live", "ptr", "legacy", "inactive", "unknown"]);
const allowedVerificationStatuses = new Set(["official", "verified", "source_tracked", "identity_only", "unverified", "missing"]);
const violations = [];
const ids = new Set();
const rowsById = new Map();
const requiredRefFields = ["spellId", "npcId", "encounterId", "journalId", "itemId", "iconId"];
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const supportedCompletionChecks = new Set([
  "record.exists", "identity.stableId", "identity.canonicalSlug", "locale.name.en", "locale.name.ru",
  "locale.description.en", "locale.description.ru", "version.gameVersion", "version.build", "version.patch",
  "version.season", "lifecycle.status", "provenance.sourceUrl", "provenance.lastVerifiedAt",
  "provenance.sourceKind", "provenance.verificationStatus", "provenance.history", "refs.shape", "page.sourceExists",
  "page.published.en", "page.published.ru", "page.required", "page.parentPublished", "page.itemRequired",
  "context.edition", "context.expansion", "context.patch", "context.season", "context.parentVersion", "activity.kind", "class.classId", "class.specializations",
  "specialization.class", "specialization.classId", "specialization.specId", "specialization.role",
  "specialization.talents", "specialization.pvpTalents", "instance.identity", "instance.encounterCoverage",
  "instance.activityContract", "encounter.instance", "encounter.encounterId", "encounter.strategy",
  "encounter.bossPageContract", "encounter.phases", "encounter.abilities", "encounter.loot", "phase.parent",
  "phase.order", "phase.timeline", "ability.parent", "ability.spellId", "ability.icon",
  "ability.descriptionVariants", "ability.mechanicTags", "ability.execution", "loot.parent", "loot.itemId", "loot.itemIdentity",
  "loot.eligibility", "loot.source", "loot.itemLevel", "loot.upgrade", "loot.restrictions",
  "loot.bonusIds", "loot.chanceEvidence",
]);
const validUrl = (value) => {
  if (typeof value !== "string" || !value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const validSha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const unresolvedDescription = (value) => typeof value === "string"
  && (/\$[A-Za-z?\[]/.test(value) || /\|(?:c[0-9A-Fa-f]{8}|Hspell:|h|r)/.test(value) || /\bX\b/.test(value));

if (manifest.schemaVersion !== 2) violations.push({ collection: "manifest", index: null, id: null, issue: "schemaVersion-unsupported" });
if (completionContract.schemaVersion !== 2) violations.push({ collection: "completionContract", index: null, id: null, issue: "schemaVersion-unsupported" });
if (JSON.stringify(completionContract.allowedChanceStatuses) !== JSON.stringify(manifest.allowedChanceStatuses)) {
  violations.push({ collection: "completionContract", index: null, id: null, issue: "chance-statuses-diverge-from-manifest" });
}
for (const field of [
  "commonRequirements", "pageRequirements", "bossPageFields", "mechanicExecutionFields", "mythicPlusFields", "lootFields",
  "descriptionDifficultyRegistryFields", "descriptionVariantEvidenceFields", "descriptionVariantFields", "descriptionVariantRenderedEvidenceFields",
]) {
  if (!Array.isArray(completionContract[field]) || completionContract[field].length === 0) {
    violations.push({ collection: "completionContract", index: null, id: null, issue: `field-invalid:${field}` });
  }
}
for (const [scope, requirements] of [
  ["commonRequirements", completionContract.commonRequirements],
  ["pageRequirements", completionContract.pageRequirements],
  ...Object.entries(completionContract.entityRequirements ?? {}).map(([name, requirements]) => [`entityRequirements.${name}`, requirements]),
]) {
  if (!Array.isArray(requirements)) {
    violations.push({ collection: "completionContract", index: null, id: null, issue: `requirements-invalid:${scope}` });
    continue;
  }
  for (const requirement of requirements) if (!supportedCompletionChecks.has(requirement)) {
    violations.push({ collection: "completionContract", index: null, id: null, issue: `requirement-unsupported:${scope}:${requirement}` });
  }
}
for (const objectType of ["edition", "expansion", "patch", "season", "activity", "class", "specialization", "instance", "encounter", "phase", "ability", "loot"]) {
  if (!Array.isArray(completionContract.entityRequirements?.[objectType])) {
    violations.push({ collection: "completionContract", index: null, id: null, issue: `entity-requirements-missing:${objectType}` });
  }
}
if (!Array.isArray(completionContract.mechanicTags) || new Set(completionContract.mechanicTags).size !== completionContract.mechanicTags.length) {
  violations.push({ collection: "completionContract", index: null, id: null, issue: "mechanicTags-invalid" });
}
const allowedDescriptionVariantStatuses = new Set(completionContract.descriptionVariantStatuses ?? []);
if (allowedDescriptionVariantStatuses.size !== 4
  || !["unknown", "not_required_verified", "required_unverified", "verified"].every((status) => allowedDescriptionVariantStatuses.has(status))) {
  violations.push({ collection: "completionContract", index: null, id: null, issue: "descriptionVariantStatuses-invalid" });
}
const allowedSourceKinds = new Set((completionContract.sourcePriority ?? []).flatMap((tier) => tier.kinds ?? []));
if (allowedSourceKinds.size === 0 || (completionContract.sourcePriority ?? []).some((tier) => !Number.isInteger(tier.rank) || tier.rank <= 0)) {
  violations.push({ collection: "completionContract", index: null, id: null, issue: "sourcePriority-invalid" });
}
const sourceIds = new Set();
for (const [index, source] of (manifest.sources ?? []).entries()) {
  if (!nonEmptyString(source.id) || sourceIds.has(source.id)) violations.push({ collection: "sources", index, id: source.id ?? null, issue: "id-invalid-or-duplicate" });
  else sourceIds.add(source.id);
  if (!allowedSourceKinds.has(source.kind)) violations.push({ collection: "sources", index, id: source.id ?? null, issue: `kind-invalid:${source.kind ?? "missing"}` });
  if (!validUrl(source.url)) violations.push({ collection: "sources", index, id: source.id ?? null, issue: "url-invalid" });
  if (!validDate(source.verifiedAt)) violations.push({ collection: "sources", index, id: source.id ?? null, issue: "verifiedAt-invalid" });
}

const difficultyRegistry = manifest.descriptionDifficultyRegistry;
for (const field of completionContract.descriptionDifficultyRegistryFields ?? []) {
  if (!difficultyRegistry || !Object.hasOwn(difficultyRegistry, field)) {
    violations.push({ collection: "descriptionDifficultyRegistry", index: null, id: null, issue: `field-missing:${field}` });
  }
}
if (difficultyRegistry) {
  if (!nonEmptyString(difficultyRegistry.scope) || !nonEmptyString(difficultyRegistry.gameBuild)) {
    violations.push({ collection: "descriptionDifficultyRegistry", index: null, id: null, issue: "identity-invalid" });
  }
  if (!allowedSourceKinds.has(difficultyRegistry.sourceKind) || !Number.isInteger(difficultyRegistry.sourcePriority) || difficultyRegistry.sourcePriority <= 0) {
    violations.push({ collection: "descriptionDifficultyRegistry", index: null, id: null, issue: "source-invalid" });
  }
  if (!validUrl(difficultyRegistry.sourceUrls?.en) || !validUrl(difficultyRegistry.sourceUrls?.ru)
    || !validSha256(difficultyRegistry.sourceSha256?.en) || !validSha256(difficultyRegistry.sourceSha256?.ru)
    || !validDate(difficultyRegistry.lastVerifiedAt) || difficultyRegistry.verificationStatus !== "verified") {
    violations.push({ collection: "descriptionDifficultyRegistry", index: null, id: null, issue: "provenance-invalid" });
  }
}
const difficultyEntries = Array.isArray(difficultyRegistry?.entries) ? difficultyRegistry.entries : [];
const difficultyById = new Map();
const difficultySlugs = new Set();
for (const [index, difficulty] of difficultyEntries.entries()) {
  if (!Number.isInteger(difficulty.difficultyId) || difficulty.difficultyId <= 0 || difficultyById.has(difficulty.difficultyId)) {
    violations.push({ collection: "descriptionDifficultyRegistry.entries", index, id: difficulty.difficultyId ?? null, issue: "difficultyId-invalid-or-duplicate" });
  } else difficultyById.set(difficulty.difficultyId, difficulty);
  if (!nonEmptyString(difficulty.canonicalSlug) || difficultySlugs.has(difficulty.canonicalSlug)) {
    violations.push({ collection: "descriptionDifficultyRegistry.entries", index, id: difficulty.difficultyId ?? null, issue: "canonicalSlug-invalid-or-duplicate" });
  } else difficultySlugs.add(difficulty.canonicalSlug);
  if (!nonEmptyString(difficulty.names?.en) || !nonEmptyString(difficulty.names?.ru)
    || !Number.isInteger(difficulty.instanceType) || !Number.isInteger(difficulty.orderIndex)
    || !Number.isInteger(difficulty.fallbackDifficultyId) || !Number.isInteger(difficulty.minPlayers)
    || !Number.isInteger(difficulty.maxPlayers) || difficulty.minPlayers <= 0 || difficulty.maxPlayers < difficulty.minPlayers) {
    violations.push({ collection: "descriptionDifficultyRegistry.entries", index, id: difficulty.difficultyId ?? null, issue: "difficulty-context-invalid" });
  }
}
if (!Array.isArray(difficultyRegistry?.requiredRaidDifficultyIds)
  || difficultyRegistry.requiredRaidDifficultyIds.length === 0
  || new Set(difficultyRegistry.requiredRaidDifficultyIds).size !== difficultyRegistry.requiredRaidDifficultyIds.length
  || difficultyRegistry.requiredRaidDifficultyIds.some((difficultyId) => !difficultyById.has(difficultyId))) {
  violations.push({ collection: "descriptionDifficultyRegistry", index: null, id: null, issue: "required-raid-difficulties-invalid" });
}

for (const collection of entityCollections) {
  const rows = manifest[collection];
  if (!Array.isArray(rows)) {
    violations.push({ collection, index: null, id: null, issue: "collection-missing" });
    continue;
  }
  rows.forEach((row, index) => {
    for (const field of commonFields) {
      if (!Object.hasOwn(row, field)) violations.push({ collection, index, id: row.id ?? null, issue: `field-missing:${field}` });
    }
    if (typeof row.id !== "string" || !row.id) violations.push({ collection, index, id: row.id ?? null, issue: "id-invalid" });
    else if (ids.has(row.id)) violations.push({ collection, index, id: row.id, issue: "id-duplicate" });
    else {
      ids.add(row.id);
      rowsById.set(row.id, { collection, row });
    }
    if (typeof row.canonicalSlug !== "string" || !row.canonicalSlug) violations.push({ collection, index, id: row.id ?? null, issue: "canonicalSlug-invalid" });
    if (!row.names || !Object.hasOwn(row.names, "en") || !Object.hasOwn(row.names, "ru")) violations.push({ collection, index, id: row.id ?? null, issue: "names-shape-invalid" });
    if (!row.descriptions || !Object.hasOwn(row.descriptions, "en") || !Object.hasOwn(row.descriptions, "ru")) violations.push({ collection, index, id: row.id ?? null, issue: "descriptions-shape-invalid" });
    if (!allowedStatuses.has(row.status)) violations.push({ collection, index, id: row.id ?? null, issue: `status-invalid:${row.status ?? "missing"}` });
    if (!allowedVerificationStatuses.has(row.verificationStatus)) violations.push({ collection, index, id: row.id ?? null, issue: `verificationStatus-invalid:${row.verificationStatus ?? "missing"}` });
    if (!row.refs || typeof row.refs !== "object" || Array.isArray(row.refs)) violations.push({ collection, index, id: row.id ?? null, issue: "refs-invalid" });
    else for (const field of requiredRefFields) {
      if (!Object.hasOwn(row.refs, field)) violations.push({ collection, index, id: row.id ?? null, issue: `refs-field-missing:${field}` });
    }
    if (!Array.isArray(row.history)) violations.push({ collection, index, id: row.id ?? null, issue: "history-invalid" });
    else row.history.forEach((entry, historyIndex) => {
      if (!entry || typeof entry !== "object" || !validDate(entry.at) || typeof entry.change !== "string" || !entry.change || !validUrl(entry.sourceUrl)) {
        violations.push({ collection, index, id: row.id ?? null, issue: `history-entry-invalid:${historyIndex}` });
      }
    });
    if (row.verificationStatus !== "unverified" && row.verificationStatus !== "missing" && (!row.sourceUrl || !row.lastVerifiedAt)) {
      violations.push({ collection, index, id: row.id ?? null, issue: "verified-record-without-source-and-date" });
    }
    if (row.sourceUrl != null && !validUrl(row.sourceUrl)) violations.push({ collection, index, id: row.id ?? null, issue: "sourceUrl-invalid" });
    if (row.sourceKind != null && !allowedSourceKinds.has(row.sourceKind)) violations.push({ collection, index, id: row.id ?? null, issue: `sourceKind-invalid:${row.sourceKind}` });
    if (row.lastVerifiedAt != null && !validDate(row.lastVerifiedAt)) violations.push({ collection, index, id: row.id ?? null, issue: "lastVerifiedAt-invalid" });
    if (collection === "abilities" && (!Number.isInteger(row.refs?.spellId) || row.refs.spellId <= 0)) violations.push({ collection, index, id: row.id ?? null, issue: "spellId-invalid" });
    if (collection === "abilities" && row.mechanicTags != null) {
      if (!Array.isArray(row.mechanicTags) || row.mechanicTags.length === 0 || row.mechanicTags.some((tag) => !completionContract.mechanicTags.includes(tag))) {
        violations.push({ collection, index, id: row.id ?? null, issue: "mechanicTags-invalid" });
      }
    }
    if (collection === "abilities" && row.execution != null && (!row.execution || typeof row.execution !== "object"
      || completionContract.mechanicExecutionFields.some((field) => !Object.hasOwn(row.execution, field)))) {
      violations.push({ collection, index, id: row.id ?? null, issue: "mechanic-execution-shape-invalid" });
    }
    if (collection === "abilities") {
      if (!Object.hasOwn(row, "descriptionVariantStatus") || !allowedDescriptionVariantStatuses.has(row.descriptionVariantStatus)) {
        violations.push({ collection, index, id: row.id ?? null, issue: "description-variant-status-invalid" });
      }
      if (!Object.hasOwn(row, "descriptionVariants") || !Array.isArray(row.descriptionVariants)) {
        violations.push({ collection, index, id: row.id ?? null, issue: "description-variants-shape-invalid" });
      }
      if (!Object.hasOwn(row, "descriptionVariantEvidence")) {
        violations.push({ collection, index, id: row.id ?? null, issue: "description-variant-evidence-missing" });
      }
      const variantEvidence = row.descriptionVariantEvidence;
      if (variantEvidence != null) {
        for (const field of completionContract.descriptionVariantEvidenceFields ?? []) if (!Object.hasOwn(variantEvidence, field)) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-evidence-field-missing:${field}` });
        }
        if (variantEvidence.gameBuild !== row.build || !validDate(variantEvidence.lastVerifiedAt)
          || !validUrl(variantEvidence.sourceUrls?.descriptionEn) || !validUrl(variantEvidence.sourceUrls?.descriptionRu)
          || Object.values(variantEvidence.sourceUrls ?? {}).some((url) => url != null && !validUrl(url))
          || !variantEvidence.auditSha256 || typeof variantEvidence.auditSha256 !== "object"
          || Object.keys(variantEvidence.auditSha256).length === 0
          || Object.values(variantEvidence.auditSha256).some((hash) => !validSha256(hash))
          || !Array.isArray(variantEvidence.requiredBy) || new Set(variantEvidence.requiredBy).size !== variantEvidence.requiredBy.length
          || variantEvidence.requiredBy.some((value) => !nonEmptyString(value))
          || !Array.isArray(variantEvidence.blockers) || new Set(variantEvidence.blockers).size !== variantEvidence.blockers.length
          || variantEvidence.blockers.some((value) => !nonEmptyString(value))) {
          violations.push({ collection, index, id: row.id ?? null, issue: "description-variant-evidence-invalid" });
        }
      }
      if (row.descriptionVariantStatus === "unknown"
        && (variantEvidence !== null || (row.descriptionVariants?.length ?? 0) !== 0
          || row.descriptions?.en != null || row.descriptions?.ru != null
          || row.descriptionVerificationStatus !== "withheld_unverified_source")) {
        violations.push({ collection, index, id: row.id ?? null, issue: "unknown-description-variant-not-fail-closed" });
      }
      if (row.descriptionVariantStatus === "not_required_verified"
        && (!variantEvidence || (variantEvidence.requiredBy?.length ?? -1) !== 0 || (variantEvidence.blockers?.length ?? -1) !== 0
          || (row.descriptionVariants?.length ?? 0) !== 0 || row.descriptionVerificationStatus !== "verified"
          || !nonEmptyString(row.descriptions?.en) || !nonEmptyString(row.descriptions?.ru))) {
        violations.push({ collection, index, id: row.id ?? null, issue: "not-required-description-variant-unproven" });
      }
      if (row.descriptionVariantStatus === "required_unverified"
        && (!variantEvidence || (variantEvidence.requiredBy?.length ?? 0) === 0 || (variantEvidence.blockers?.length ?? 0) === 0
          || (row.descriptionVariants?.length ?? 0) !== 0 || row.descriptions?.en != null || row.descriptions?.ru != null)) {
        violations.push({ collection, index, id: row.id ?? null, issue: "required-description-variant-not-fail-closed" });
      }
      if (row.descriptionVariantStatus === "verified" && (!variantEvidence || (row.descriptionVariants?.length ?? 0) === 0)) {
        violations.push({ collection, index, id: row.id ?? null, issue: "verified-description-variants-empty" });
      }
      const variantKeys = new Set();
      for (const [variantIndex, variant] of (row.descriptionVariants ?? []).entries()) {
        for (const field of completionContract.descriptionVariantFields ?? []) if (!Object.hasOwn(variant, field)) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-field-missing:${variantIndex}:${field}` });
        }
        const difficulty = difficultyById.get(variant.difficultyId);
        const expectedVariantKey = `${variant.build}:difficulty-${variant.difficultyId}:group-${variant.groupSize ?? "all"}`;
        if (!nonEmptyString(variant.variantKey) || variantKeys.has(variant.variantKey) || variant.variantKey !== expectedVariantKey) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-key-invalid:${variantIndex}` });
        } else variantKeys.add(variant.variantKey);
        if (!difficulty || variant.difficultySlug !== difficulty.canonicalSlug
          || (variant.groupSize != null && (!Number.isInteger(variant.groupSize)
            || variant.groupSize < difficulty.minPlayers || variant.groupSize > difficulty.maxPlayers))) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-context-invalid:${variantIndex}` });
        }
        if (variant.contentTuningId != null && (!Number.isInteger(variant.contentTuningId) || variant.contentTuningId <= 0)) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-content-tuning-invalid:${variantIndex}` });
        }
        if (variant.build !== row.build || variant.patch !== row.patch || variant.season !== row.season
          || variant.verificationStatus !== "verified" || !allowedSourceKinds.has(variant.sourceKind)
          || !validDate(variant.lastVerifiedAt) || !nonEmptyString(variant.descriptions?.en) || !nonEmptyString(variant.descriptions?.ru)
          || unresolvedDescription(variant.descriptions?.en) || unresolvedDescription(variant.descriptions?.ru)
          || !validUrl(variant.sourceUrls?.en) || !validUrl(variant.sourceUrls?.ru) || !validUrl(variant.sourceUrls?.renderer)) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-publication-invalid:${variantIndex}` });
        }
        const renderedEvidence = variant.renderedEvidence;
        for (const field of completionContract.descriptionVariantRenderedEvidenceFields ?? []) if (!renderedEvidence || !Object.hasOwn(renderedEvidence, field)) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-rendered-evidence-field-missing:${variantIndex}:${field}` });
        }
        if (!Number.isInteger(renderedEvidence?.sourceSpellId) || renderedEvidence.sourceSpellId <= 0
          || !Number.isInteger(renderedEvidence?.terminalSpellId) || renderedEvidence.terminalSpellId <= 0
          || !validSha256(renderedEvidence?.descriptionSha256?.en) || !validSha256(renderedEvidence?.descriptionSha256?.ru)
          || renderedEvidence?.directSpellLink !== true || !Array.isArray(renderedEvidence?.renderedValues)) {
          violations.push({ collection, index, id: row.id ?? null, issue: `description-variant-rendered-evidence-invalid:${variantIndex}` });
        }
      }
    }
    if (collection === "encounters" && row.bossPageContract != null && (!row.bossPageContract || typeof row.bossPageContract !== "object"
      || completionContract.bossPageFields.some((field) => !Object.hasOwn(row.bossPageContract, field)))) {
      violations.push({ collection, index, id: row.id ?? null, issue: "boss-page-contract-shape-invalid" });
    }
    if (collection === "instances" && row.mythicPlusContract != null && (!row.mythicPlusContract || typeof row.mythicPlusContract !== "object"
      || completionContract.mythicPlusFields.some((field) => !Object.hasOwn(row.mythicPlusContract, field)))) {
      violations.push({ collection, index, id: row.id ?? null, issue: "mythic-plus-contract-shape-invalid" });
    }
    if (collection === "loot") {
      if (!Number.isInteger(row.refs?.itemId) || row.refs.itemId <= 0) violations.push({ collection, index, id: row.id ?? null, issue: "itemId-invalid" });
      if (!manifest.allowedChanceStatuses.includes(row.chanceStatus)) violations.push({ collection, index, id: row.id ?? null, issue: `chanceStatus-invalid:${row.chanceStatus ?? "missing"}` });
      if (row.chanceStatus === "unknown" && row.chanceValue != null) violations.push({ collection, index, id: row.id ?? null, issue: "unknown-chance-has-value" });
      if (row.chanceStatus === "observed_percent" && (!row.sampleSize || !row.confidenceInterval || !row.observedAt)) violations.push({ collection, index, id: row.id ?? null, issue: "observed-chance-evidence-incomplete" });
      for (const field of completionContract.lootFields) {
        if (!Object.hasOwn(row, field)) violations.push({ collection, index, id: row.id ?? null, issue: `loot-field-missing:${field}` });
      }
    }
  });
}

for (const [id, entry] of rowsById) {
  const { collection, row } = entry;
  if (row.patch != null && !manifest.patches.some((candidate) => candidate.patch === row.patch
    && (!row.edition || candidate.edition === row.edition)
    && (!row.expansion || candidate.expansion === row.expansion))) {
    violations.push({ collection, index: null, id, issue: `patch-reference-invalid:${row.patch}` });
  }
  if (row.season != null && !manifest.seasons.some((candidate) => candidate.canonicalSlug === row.season
    && (!row.edition || candidate.edition === row.edition)
    && (!row.expansion || candidate.expansion === row.expansion))) {
    violations.push({ collection, index: null, id, issue: `season-context-invalid:${row.season}` });
  }
  if (["expansions", "patches", "seasons", "activities", "classes", "specializations", "instances", "encounters"].includes(collection)) {
    if (typeof row.edition !== "string" || !manifest.editions.some((candidate) => candidate.canonicalSlug === row.edition)) {
      violations.push({ collection, index: null, id, issue: `edition-reference-invalid:${row.edition ?? "missing"}` });
    }
  }
  if (["patches", "seasons", "activities", "classes", "specializations", "instances", "encounters"].includes(collection)) {
    if (typeof row.expansion !== "string" || !manifest.expansions.some((candidate) => candidate.canonicalSlug === row.expansion && candidate.edition === row.edition)) {
      violations.push({ collection, index: null, id, issue: `expansion-reference-invalid:${row.expansion ?? "missing"}` });
    }
  }
  if (["activities", "classes", "specializations", "instances", "encounters"].includes(collection)) {
    if (typeof row.season !== "string" || !manifest.seasons.some((candidate) => candidate.canonicalSlug === row.season && candidate.edition === row.edition && candidate.expansion === row.expansion)) {
      violations.push({ collection, index: null, id, issue: `season-reference-invalid:${row.season ?? "missing"}` });
    }
  }
  if (collection === "specializations") {
    if (!manifest.classes.some((candidate) => candidate.canonicalSlug === row.class && candidate.classId === row.classId)) {
      violations.push({ collection, index: null, id, issue: `class-reference-invalid:${row.class ?? "missing"}` });
    }
  }
  if (collection === "encounters" && !manifest.instances.some((candidate) => candidate.canonicalSlug === row.instance && candidate.edition === row.edition && candidate.expansion === row.expansion)) {
    violations.push({ collection, index: null, id, issue: `instance-reference-invalid:${row.instance ?? "missing"}` });
  }
  if (["phases", "abilities", "loot"].includes(collection)) {
    const parent = rowsById.get(row.parentId);
    const expectedParents = collection === "phases" ? ["encounters"] : collection === "abilities" ? ["encounters", "phases"] : ["encounters", "instances"];
    if (!parent || !expectedParents.includes(parent.collection)) {
      violations.push({ collection, index: null, id, issue: `parent-reference-invalid:${row.parentId ?? "missing"}` });
    } else if (parent.row.patch !== row.patch || parent.row.season !== row.season || parent.row.status !== row.status) {
      violations.push({ collection, index: null, id, issue: "parent-version-context-mismatch" });
    }
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  manifestVersion: manifest.manifestVersion,
  hierarchy,
  completionContractVersion: completionContract.schemaVersion,
  mechanicTags: completionContract.mechanicTags.length,
  collections: Object.fromEntries(entityCollections.map((name) => [name, Array.isArray(manifest[name]) ? manifest[name].length : null])),
  records: entityCollections.reduce((total, name) => total + (Array.isArray(manifest[name]) ? manifest[name].length : 0), 0),
  violations: violations.length,
  valid: violations.length === 0,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ summary, violations }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && violations.length) process.exitCode = 1;
