import { createHash } from "node:crypto";
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
const routeManifestPath = path.resolve(root, String(args.get("route-manifest") ?? "data/wow/route-manifest.json"));
const contractPath = path.resolve(root, String(args.get("contract") ?? "data/wow/completion-contract.json"));
const label = String(args.get("label") ?? process.env.WOW_COVERAGE_LABEL ?? "worktree");
const routeReportPath = path.resolve(root, String(args.get("route-report")
  ?? process.env.WOW_ROUTE_REPORT
  ?? `docs/reports/wow/route-inventory-${label}.json`));
const outputDir = path.resolve(root, String(args.get("output-dir") ?? "docs/reports/wow"));
const requireComplete = args.has("require-complete");

const [manifestSource, routeManifestSource, contractSource, routeReportSource] = await Promise.all([
  fs.readFile(manifestPath, "utf8"),
  fs.readFile(routeManifestPath, "utf8"),
  fs.readFile(contractPath, "utf8"),
  fs.readFile(routeReportPath, "utf8"),
]);
const manifest = JSON.parse(manifestSource);
const routeManifest = JSON.parse(routeManifestSource);
const contract = JSON.parse(contractSource);
const routeReport = JSON.parse(routeReportSource);
const verifiedStatuses = new Set(contract.verifiedStatuses);
const mechanicTags = new Set(contract.mechanicTags);
const lifecycleStatuses = new Set(contract.allowedLifecycleStatuses);
const sourceRanks = new Map(contract.sourcePriority.flatMap((tier) => tier.kinds.map((kind) => [kind, tier.rank])));
const refFields = ["spellId", "npcId", "encounterId", "journalId", "itemId", "iconId"];

const validUrl = (value) => {
  if (typeof value !== "string" || !value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const evidenceValue = (value) => nonEmptyString(value)
  || (Array.isArray(value) && value.length > 0)
  || (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0)
  || (typeof value === "number" && Number.isFinite(value));

const collectionKinds = {
  editions: "edition",
  expansions: "expansion",
  patches: "patch",
  seasons: "season",
  activities: "activity",
  classes: "class",
  specializations: "specialization",
  instances: "instance",
  encounters: "encounter",
  phases: "phase",
  abilities: "ability",
  loot: "loot",
};
const canonicalEntries = Object.entries(collectionKinds).flatMap(([collection, objectType]) =>
  manifest[collection].map((entity) => ({ objectType, collection, entity, recordExists: true })),
);
const canonicalById = new Map(canonicalEntries.map((entry) => [entry.entity.id, entry]));

const group = (id) => routeManifest.routeGroups.find((entry) => entry.id === id);
const values = (id, key) => group(id)?.parameters?.[key] ?? [];
const seasonOneDelves = new Set([
  "the-shadow-enclave", "collegiate-calamity", "parhelion-plaza", "the-darkway", "twilight-crypts",
  "atalaman", "the-grudge-pit", "the-gulf-of-memory", "sunkiller-sanctum", "shadowguard-point",
]);
const derivedEntries = [
  ...values("edition", "edition").map((slug) => ({
    objectType: "edition", collection: "editions", recordExists: false,
    entity: { id: `wow:edition:${slug}`, canonicalSlug: slug, edition: slug, pagePath: `/wow/versions/${slug}` },
  })),
  ...values("expansion", "expansion").map((slug) => ({
    objectType: "expansion", collection: "expansions", recordExists: false,
    entity: { id: `wow:retail:expansion:${slug}`, canonicalSlug: slug, edition: "retail", expansion: slug, pagePath: `/wow/expansions/${slug}` },
  })),
  ...values("delve", "delve").map((slug) => ({
    objectType: "instance", collection: "instances", recordExists: false,
    entity: {
      id: `wow:retail:midnight:delve:${slug}`, canonicalSlug: slug, edition: "retail", expansion: "midnight",
      season: seasonOneDelves.has(slug) ? "midnight-season-1" : "midnight-season-2", activity: "delve",
      pagePath: `/wow/delves/${slug}`,
    },
  })),
  ...values("midnight-season-2-lairs-and-world", "boss").map((slug, index) => ({
    objectType: "encounter", collection: "encounters", recordExists: false,
    entity: {
      id: `wow:retail:midnight:${index === 0 ? "lair" : "world-boss"}:${slug}`, canonicalSlug: slug,
      edition: "retail", expansion: "midnight", season: "midnight-season-2",
      activity: index === 0 ? "lair" : "world-boss", instance: index === 0 ? "tidebound-grotto" : null,
      pagePath: `/wow/lairs/${slug}`,
    },
  })),
  ...values("talent-specs", "spec").map((slug) => ({
    objectType: "specialization", collection: "specializations", recordExists: false,
    entity: {
      id: `wow:retail:midnight:specialization:${slug}`, canonicalSlug: slug, edition: "retail", expansion: "midnight",
      season: "midnight-season-2", pagePath: `/talents/${slug}`,
    },
  })),
];

const nonDuplicateDerivedEntries = derivedEntries.filter((derived) => !canonicalEntries.some((canonical) =>
  canonical.objectType === derived.objectType
  && (canonical.entity.id === derived.entity.id
    || (canonical.entity.pagePath && canonical.entity.pagePath === derived.entity.pagePath)),
));
const entries = [...new Map([...nonDuplicateDerivedEntries, ...canonicalEntries].map((entry) => [entry.entity.id, entry])).values()];
const entryById = new Map(entries.map((entry) => [entry.entity.id, entry]));
const routeByPath = new Map(routeReport.routes.map((route) => [route.path, route]));

function parentEncounter(entity) {
  let parent = entryById.get(entity.parentId);
  if (parent?.objectType === "phase") parent = entryById.get(parent.entity.parentId);
  return parent?.objectType === "encounter" ? parent.entity : null;
}

function pagePathFor(entry) {
  const { objectType, entity } = entry;
  if (entity.pagePath) return entity.pagePath;
  if (objectType === "edition") return `/wow/versions/${entity.canonicalSlug}`;
  if (objectType === "expansion") return `/wow/expansions/${entity.canonicalSlug}`;
  if (objectType === "patch") return `/wow/patches/${entity.canonicalSlug}`;
  if (objectType === "season") return entity.canonicalSlug === "midnight-season-2"
    ? "/wow/midnight/season-2"
    : `/wow/mythic-plus/seasons/${entity.canonicalSlug}`;
  if (objectType === "activity") return ({
    raid: "/wow/raids", "mythic-plus": "/wow/mythic-plus", delve: "/wow/delves", lair: "/wow/lairs", prey: "/wow/prey",
  })[entity.kind] ?? null;
  if (objectType === "class") return `/wow/classes/${entity.canonicalSlug}`;
  if (objectType === "specialization") return entity.class
    ? `/wow/classes/${entity.class}/${entity.canonicalSlug}`
    : entity.pagePath ?? null;
  if (objectType === "instance") {
    if (entity.activity === "raid") return `/wow/raids/${entity.canonicalSlug}`;
    if (entity.activity === "mythic-plus") return `/wow/mythic-plus/${entity.season}/${entity.canonicalSlug}`;
    if (entity.activity === "delve") return `/wow/delves/${entity.canonicalSlug}`;
    if (entity.activity === "lair") return `/wow/lairs/${entity.canonicalSlug}`;
  }
  if (objectType === "encounter") {
    if (["lair", "world-boss"].includes(entity.activity)) return `/wow/lairs/${entity.canonicalSlug}`;
    return entity.instance ? `/wow/raids/${entity.instance}/${entity.canonicalSlug}` : null;
  }
  if (["phase", "ability"].includes(objectType)) return pagePathFor({ objectType: "encounter", entity: parentEncounter(entity) ?? {} });
  if (objectType === "loot") return `/wow/items/${entity.canonicalSlug}`;
  return null;
}

function localizedRoute(pathname, locale) {
  if (!pathname) return null;
  return routeByPath.get(locale === "ru" ? `/ru${pathname}` : pathname) ?? null;
}

function fieldSetComplete(object, fields) {
  return Boolean(object) && fields.every((field) => evidenceValue(object[field]));
}

function lootChanceComplete(row) {
  if (!contract.allowedChanceStatuses.includes(row.chanceStatus)) return false;
  if (row.chanceStatus === "guaranteed") return row.chanceValue == null || row.chanceValue === 100;
  if (row.chanceStatus === "official_percent") return typeof row.chanceValue === "number"
    && row.chanceValue >= 0 && row.chanceValue <= 100 && validUrl(row.sourceUrl) && validDate(row.observedAt);
  if (row.chanceStatus === "observed_percent") return typeof row.chanceValue === "number"
    && row.chanceValue >= 0 && row.chanceValue <= 100 && positiveInteger(row.sampleSize)
    && evidenceValue(row.confidenceInterval) && validUrl(row.sourceUrl) && validDate(row.observedAt);
  return row.chanceValue == null
    && row.sampleSize == null
    && row.confidenceInterval == null
    && row.chanceDisclosure?.ru === "Точный шанс выпадения не опубликован";
}

function descriptionVariantsComplete(row) {
  if (!contract.descriptionVariantStatuses.includes(row.descriptionVariantStatus)) return false;
  if (!Array.isArray(row.descriptionVariants)) return false;
  if (row.descriptionVariantStatus === "not_required_verified") {
    return row.descriptionVariants.length === 0
      && row.descriptionVerificationStatus === "verified"
      && nonEmptyString(row.descriptions?.en)
      && nonEmptyString(row.descriptions?.ru)
      && row.descriptionVariantEvidence?.gameBuild === row.build
      && validDate(row.descriptionVariantEvidence?.lastVerifiedAt)
      && Array.isArray(row.descriptionVariantEvidence?.requiredBy)
      && row.descriptionVariantEvidence.requiredBy.length === 0
      && Array.isArray(row.descriptionVariantEvidence?.blockers)
      && row.descriptionVariantEvidence.blockers.length === 0;
  }
  if (row.descriptionVariantStatus !== "verified" || row.descriptionVariants.length === 0) return false;
  const requiredDifficultyIds = parentEncounter(row)?.activity === "raid"
    ? manifest.descriptionDifficultyRegistry?.requiredRaidDifficultyIds ?? []
    : [];
  const verifiedDifficultyIds = new Set(row.descriptionVariants
    .filter((variant) => variant.verificationStatus === "verified"
      && variant.build === row.build && variant.patch === row.patch && variant.season === row.season
      && nonEmptyString(variant.descriptions?.en) && nonEmptyString(variant.descriptions?.ru)
      && validDate(variant.lastVerifiedAt) && validUrl(variant.sourceUrls?.renderer))
    .map((variant) => variant.difficultyId));
  return requiredDifficultyIds.length > 0
    && requiredDifficultyIds.every((difficultyId) => verifiedDifficultyIds.has(difficultyId));
}

function evaluate(entry) {
  const { objectType, entity, recordExists } = entry;
  const pagePath = pagePathFor(entry);
  const enRoute = localizedRoute(pagePath, "en");
  const ruRoute = localizedRoute(pagePath, "ru");
  const checks = {};
  const detailBlockers = [];
  const set = (id, passed) => { checks[id] = Boolean(passed); };

  set("record.exists", recordExists);
  set("identity.stableId", nonEmptyString(entity.id) && entity.id.startsWith("wow:"));
  set("identity.canonicalSlug", nonEmptyString(entity.canonicalSlug));
  set("locale.name.en", nonEmptyString(entity.names?.en));
  set("locale.name.ru", nonEmptyString(entity.names?.ru));
  set("locale.description.en", nonEmptyString(entity.descriptions?.en));
  set("locale.description.ru", nonEmptyString(entity.descriptions?.ru));
  set("version.gameVersion", nonEmptyString(entity.gameVersion));
  set("version.build", nonEmptyString(entity.build));
  set("version.patch", nonEmptyString(entity.patch));
  set("version.season", nonEmptyString(entity.season));
  set("lifecycle.status", lifecycleStatuses.has(entity.status));
  set("provenance.sourceUrl", validUrl(entity.sourceUrl));
  const registeredSource = manifest.sources.find((source) => source.url === entity.sourceUrl);
  const sourceKind = entity.sourceKind ?? registeredSource?.kind ?? null;
  set("provenance.sourceKind", sourceRanks.has(sourceKind));
  set("provenance.lastVerifiedAt", validDate(entity.lastVerifiedAt));
  set("provenance.verificationStatus", verifiedStatuses.has(entity.verificationStatus));
  set("provenance.history", Array.isArray(entity.history) && entity.history.length > 0);
  set("refs.shape", entity.refs && refFields.every((field) => Object.hasOwn(entity.refs, field)));

  set("page.sourceExists", Boolean(enRoute?.sourceExists && ruRoute?.sourceExists));
  set("page.published.en", enRoute?.status === 200 && !enRoute.soft404);
  set("page.published.ru", ruRoute?.status === 200 && !ruRoute.soft404);
  set("page.required", contract.pageRequirements.every((requirement) => checks[requirement]));
  set("page.parentPublished", checks["page.required"]);
  set("page.itemRequired", checks["page.required"]);

  set("context.edition", nonEmptyString(entity.edition)
    && manifest.editions.some((candidate) => candidate.canonicalSlug === entity.edition));
  set("context.expansion", nonEmptyString(entity.expansion)
    && manifest.expansions.some((candidate) => candidate.canonicalSlug === entity.expansion && candidate.edition === entity.edition));
  set("context.patch", nonEmptyString(entity.patch) && manifest.patches.some((candidate) => candidate.patch === entity.patch
    && (!entity.edition || candidate.edition === entity.edition)
    && (!entity.expansion || candidate.expansion === entity.expansion)));
  set("context.season", nonEmptyString(entity.season) && manifest.seasons.some((candidate) => candidate.canonicalSlug === entity.season
    && (!entity.edition || candidate.edition === entity.edition)
    && (!entity.expansion || candidate.expansion === entity.expansion)));
  set("activity.kind", nonEmptyString(entity.kind ?? entity.activity));

  const linkedSpecs = manifest.specializations.filter((row) => row.class === entity.canonicalSlug);
  set("class.classId", positiveInteger(entity.classId));
  set("class.specializations", linkedSpecs.length > 0 && linkedSpecs.every((row) => positiveInteger(row.specId)));
  set("specialization.class", nonEmptyString(entity.class)
    && manifest.classes.some((candidate) => candidate.canonicalSlug === entity.class));
  set("specialization.classId", positiveInteger(entity.classId));
  set("specialization.specId", positiveInteger(entity.specId));
  set("specialization.role", ["tank", "healer", "melee", "ranged", "support"].includes(entity.role));
  set("specialization.talents", entity.talentCoverageStatus === "verified_complete");
  set("specialization.pvpTalents", entity.pvpTalentCoverageStatus === "verified_complete");

  const linkedEncounters = manifest.encounters.filter((row) => row.instance === entity.canonicalSlug);
  const identityRefs = [entity.refs?.journalId, entity.refs?.encounterId, entity.refs?.npcId];
  set("instance.identity", identityRefs.some(positiveInteger));
  set("instance.encounterCoverage", entity.encounterCoverageStatus === "complete"
    && Number.isInteger(entity.encounterCount)
    && entity.encounterCount === linkedEncounters.length);
  if (entity.activity === "mythic-plus") {
    const missing = contract.mythicPlusFields.filter((field) => !evidenceValue(entity.mythicPlusContract?.[field]));
    set("instance.activityContract", missing.length === 0);
    detailBlockers.push(...missing.map((field) => `instance.activityContract.missing:${field}`));
  } else if (entity.activity === "raid") {
    set("instance.activityContract", checks["instance.encounterCoverage"]);
  } else {
    set("instance.activityContract", entity.activityContractVerificationStatus === "verified");
  }

  set("encounter.instance", nonEmptyString(entity.instance)
    && manifest.instances.some((candidate) => candidate.canonicalSlug === entity.instance));
  set("encounter.encounterId", positiveInteger(entity.refs?.encounterId));
  set("encounter.strategy", verifiedStatuses.has(entity.strategyVerificationStatus) && validUrl(entity.strategySourceUrl));
  const missingBossFields = contract.bossPageFields.filter((field) => !evidenceValue(entity.bossPageContract?.[field]));
  set("encounter.bossPageContract", missingBossFields.length === 0);
  detailBlockers.push(...missingBossFields.map((field) => `encounter.bossPageContract.missing:${field}`));

  const linkedPhases = manifest.phases.filter((row) => row.parentId === entity.id);
  const linkedAbilities = manifest.abilities.filter((row) => {
    if (row.parentId === entity.id) return true;
    const parent = canonicalById.get(row.parentId);
    return parent?.objectType === "phase" && parent.entity.parentId === entity.id;
  });
  const linkedLoot = manifest.loot.filter((row) => row.parentId === entity.id);
  set("encounter.phases", entity.phaseCoverageStatus === "complete" && linkedPhases.length > 0);
  set("encounter.abilities", entity.abilityCoverageStatus === "complete" && linkedAbilities.length > 0
    && linkedAbilities.every((row) => positiveInteger(row.refs?.spellId)
      && row.iconVerificationStatus === "verified"
      && descriptionVariantsComplete(row)
      && Array.isArray(row.mechanicTags) && row.mechanicTags.length > 0 && row.mechanicTags.every((tag) => mechanicTags.has(tag))
      && fieldSetComplete(row.execution, contract.mechanicExecutionFields)));
  const explicitNoLoot = entity.lootCoverageStatus === "complete"
    && validUrl(entity.lootEmptyEvidence?.sourceUrl) && validDate(entity.lootEmptyEvidence?.verifiedAt);
  set("encounter.loot", entity.lootCoverageStatus === "complete" && (linkedLoot.length > 0 || explicitNoLoot));

  const parent = canonicalById.get(entity.parentId);
  set("context.parentVersion", Boolean(parent)
    && parent.entity.patch === entity.patch
    && parent.entity.season === entity.season
    && parent.entity.status === entity.status);
  set("phase.parent", parent?.objectType === "encounter");
  set("phase.order", positiveInteger(entity.order));
  set("phase.timeline", evidenceValue(entity.timeline));
  set("ability.parent", parent?.objectType === "encounter" || parent?.objectType === "phase");
  set("ability.spellId", positiveInteger(entity.refs?.spellId) && entity.refs.spellId === entity.spellId);
  set("ability.icon", positiveInteger(entity.refs?.iconId) && entity.refs.iconId === entity.iconId
    && nonEmptyString(entity.iconName) && nonEmptyString(entity.iconUrl) && validUrl(entity.iconSourceUrl)
    && entity.iconVerificationStatus === "verified");
  set("ability.descriptionVariants", descriptionVariantsComplete(entity));
  if (!checks["ability.descriptionVariants"]) detailBlockers.push(`ability.descriptionVariants.status:${entity.descriptionVariantStatus ?? "missing"}`);
  set("ability.mechanicTags", Array.isArray(entity.mechanicTags) && entity.mechanicTags.length > 0
    && entity.mechanicTags.every((tag) => mechanicTags.has(tag)));
  const missingExecutionFields = contract.mechanicExecutionFields.filter((field) => !evidenceValue(entity.execution?.[field]));
  set("ability.execution", missingExecutionFields.length === 0);
  detailBlockers.push(...missingExecutionFields.map((field) => `ability.execution.missing:${field}`));

  set("loot.parent", parent?.objectType === "encounter" || parent?.objectType === "instance");
  set("loot.itemId", positiveInteger(entity.refs?.itemId) && entity.refs.itemId === entity.itemId);
  set("loot.itemIdentity", nonEmptyString(entity.names?.en) && nonEmptyString(entity.names?.ru)
    && positiveInteger(entity.iconId) && nonEmptyString(entity.iconUrl) && entity.iconVerificationStatus === "verified"
    && nonEmptyString(entity.slot) && nonEmptyString(entity.itemType));
  set("loot.eligibility", Array.isArray(entity.eligibleClasses) && entity.eligibleClasses.length > 0
    && Array.isArray(entity.eligibleSpecs) && entity.eligibleSpecs.length > 0);
  set("loot.source", nonEmptyString(entity.encounterSource) && nonEmptyString(entity.difficulty) && validUrl(entity.sourceUrl));
  set("loot.itemLevel", positiveInteger(entity.itemLevel));
  set("loot.upgrade", nonEmptyString(entity.upgradeTrack));
  set("loot.restrictions", typeof entity.warbound === "boolean" && typeof entity.unique === "boolean"
    && Object.hasOwn(entity, "restrictions"));
  set("loot.bonusIds", Array.isArray(entity.bonusIds));
  set("loot.chanceEvidence", lootChanceComplete(entity));

  const requirements = [...contract.commonRequirements, ...(contract.entityRequirements[objectType] ?? [])];
  const missingEvaluators = requirements.filter((requirement) => !Object.hasOwn(checks, requirement));
  if (missingEvaluators.length > 0) {
    throw new Error(`Completion contract has no evaluator for ${objectType}: ${missingEvaluators.join(", ")}`);
  }
  const blockers = requirements.filter((requirement) => !checks[requirement]);
  const relevantDetails = detailBlockers.filter((blocker) => {
    if (blocker.startsWith("instance.activityContract")) return objectType === "instance" && !checks["instance.activityContract"];
    if (blocker.startsWith("encounter.bossPageContract")) return objectType === "encounter" && !checks["encounter.bossPageContract"];
    if (blocker.startsWith("ability.execution")) return objectType === "ability" && !checks["ability.execution"];
    if (blocker.startsWith("ability.descriptionVariants")) return objectType === "ability" && !checks["ability.descriptionVariants"];
    return true;
  });
  const names = entity.names ?? {};
  const descriptions = entity.descriptions ?? {};
  const abilityRows = objectType === "encounter" ? linkedAbilities : [];
  const lootRows = objectType === "encounter" ? linkedLoot : [];
  const inheritedContext = ["phase", "ability"].includes(objectType)
    ? parentEncounter(entity)
    : objectType === "loot" ? parent?.entity : null;
  const rowEdition = entity.edition ?? inheritedContext?.edition ?? null;
  const rowExpansion = entity.expansion ?? inheritedContext?.expansion ?? null;
  const rowSeason = entity.season ?? inheritedContext?.season ?? null;
  const rowActivity = entity.activity ?? entity.kind ?? inheritedContext?.activity ?? null;
  const rowInstance = entity.instance
    ?? inheritedContext?.instance
    ?? (objectType === "instance" ? entity.canonicalSlug : null);
  const rowEncounter = objectType === "encounter"
    ? entity.canonicalSlug
    : ["phase", "ability"].includes(objectType) ? inheritedContext?.canonicalSlug ?? null : null;

  return {
    objectType,
    id: entity.id,
    edition: rowEdition,
    expansion: rowExpansion,
    patch: entity.patch ?? null,
    season: rowSeason,
    activity: rowActivity,
    instance: rowInstance,
    encounter: rowEncounter,
    hierarchyPath: [rowEdition, rowExpansion, rowSeason, rowActivity, rowInstance, rowEncounter]
      .map((value) => value ?? "∅").join(" > "),
    recordExists,
    pagePath,
    pageExists: checks["page.sourceExists"],
    publishedEn: checks["page.published.en"],
    publishedRu: checks["page.published.ru"],
    hasEn: nonEmptyString(names.en),
    hasRu: nonEmptyString(names.ru),
    hasEnDescription: nonEmptyString(descriptions.en),
    hasRuDescription: nonEmptyString(descriptions.ru),
    hasStrategy: objectType === "encounter" ? checks["encounter.strategy"] : null,
    abilityRows: abilityRows.length,
    hasAbilitiesWithGameIds: objectType === "encounter" ? checks["encounter.abilities"] : objectType === "ability" ? checks["ability.spellId"] : null,
    hasCorrectIconsProven: objectType === "encounter"
      ? abilityRows.length > 0 && abilityRows.every((row) => row.iconVerificationStatus === "verified" && positiveInteger(row.refs?.iconId))
      : objectType === "ability" ? checks["ability.icon"] : null,
    descriptionVariantStatus: objectType === "ability" ? entity.descriptionVariantStatus ?? null : null,
    descriptionVariantRows: objectType === "ability" && Array.isArray(entity.descriptionVariants) ? entity.descriptionVariants.length : null,
    hasDescriptionVariantCoverage: objectType === "ability" ? checks["ability.descriptionVariants"] : null,
    lootRows: lootRows.length,
    hasCanonicalLoot: objectType === "encounter" ? checks["encounter.loot"] : objectType === "loot" ? checks["loot.itemId"] && checks["loot.itemIdentity"] : null,
    dropChanceFidelity: objectType === "encounter"
      ? lootRows.length > 0 && lootRows.every(lootChanceComplete)
      : objectType === "loot" ? checks["loot.chanceEvidence"] : null,
    lastVerifiedAt: entity.lastVerifiedAt ?? null,
    sourceUrl: entity.sourceUrl ?? null,
    sourceKind,
    sourcePriority: sourceRanks.get(sourceKind) ?? null,
    verificationStatus: entity.verificationStatus ?? (recordExists ? "unverified" : "missing"),
    requirements,
    checks,
    completionBlockers: [...blockers, ...relevantDetails],
    automaticallyComplete: blockers.length === 0,
  };
}

const rows = entries.map(evaluate).sort((a, b) => a.objectType.localeCompare(b.objectType) || a.id.localeCompare(b.id));
const completeRows = rows.filter((row) => row.automaticallyComplete);
const blockerCounts = {};
for (const row of rows) for (const blocker of row.completionBlockers) blockerCounts[blocker] = (blockerCounts[blocker] ?? 0) + 1;
const byObjectType = Object.fromEntries([...new Set(Object.values(collectionKinds))].map((objectType) => [
  objectType,
  { rows: 0, complete: 0 },
]));
for (const row of rows) {
  const bucket = byObjectType[row.objectType] ?? { rows: 0, complete: 0 };
  bucket.rows += 1;
  if (row.automaticallyComplete) bucket.complete += 1;
  byObjectType[row.objectType] = bucket;
}
const summary = {
  generatedAt: new Date().toISOString(),
  scope: contract.scope,
  label,
  manifestVersion: manifest.manifestVersion,
  manifestSha256: createHash("sha256").update(manifestSource).digest("hex"),
  routeManifestSha256: createHash("sha256").update(routeManifestSource).digest("hex"),
  completionContractSha256: createHash("sha256").update(contractSource).digest("hex"),
  routeReportPath,
  routeReportGeneratedAt: routeReport.summary?.generatedAt ?? null,
  routeViolations: routeReport.summary?.routeViolations ?? null,
  coverageRows: rows.length,
  automaticallyCompleteRows: completeRows.length,
  coveragePercent: rows.length ? Number(((completeRows.length / rows.length) * 100).toFixed(2)) : 0,
  byObjectType,
  hierarchyPaths: rows.reduce((counts, row) => {
    const bucket = counts[row.hierarchyPath] ?? { rows: 0, complete: 0 };
    bucket.rows += 1;
    if (row.automaticallyComplete) bucket.complete += 1;
    counts[row.hierarchyPath] = bucket;
    return counts;
  }, {}),
  blockerCounts: Object.fromEntries(Object.entries(blockerCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  releaseCompletenessProven: rows.length > 0 && completeRows.length === rows.length,
};

function csv(data) {
  const columns = [
    "objectType", "id", "edition", "expansion", "patch", "season", "activity", "instance", "encounter", "hierarchyPath",
    "recordExists", "pagePath", "pageExists", "publishedEn", "publishedRu", "hasEn", "hasRu",
    "hasEnDescription", "hasRuDescription", "hasStrategy", "abilityRows", "hasAbilitiesWithGameIds",
    "hasCorrectIconsProven", "descriptionVariantStatus", "descriptionVariantRows", "hasDescriptionVariantCoverage",
    "lootRows", "hasCanonicalLoot", "dropChanceFidelity", "lastVerifiedAt", "sourceUrl",
    "sourceKind", "sourcePriority", "verificationStatus", "automaticallyComplete", "completionBlockers",
  ];
  const quote = (value) => `"${String(Array.isArray(value) ? value.join("|") : value ?? "").replaceAll('"', '""')}"`;
  return `${columns.map(quote).join(",")}\n${data.map((row) => columns.map((column) => quote(row[column])).join(",")).join("\n")}\n`;
}

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDir, `coverage-matrix-${label}.json`), `${JSON.stringify({ summary, rows }, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, `coverage-matrix-${label}.csv`), csv(rows)),
]);
console.log(JSON.stringify(summary, null, 2));
if (requireComplete && !summary.releaseCompletenessProven) process.exitCode = 1;
