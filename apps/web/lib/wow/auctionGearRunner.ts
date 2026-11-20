import "server-only";
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from "./auctionGearDiagnostics";
const runDiagnostics = new WeakMap<object, ReturnType<typeof createAuctionGearDiagnostics>>();
const comparedOptions = new WeakMap<object, Set<string>>();
function metricsFor(key: object) {
  let metrics = runDiagnostics.get(key);
  if (!metrics) { metrics = createAuctionGearDiagnostics(); runDiagnostics.set(key, metrics); }
  return metrics;
}
/** Private, in-process diagnostics; reset on process recovery, never contain identity or tokens. */
export function auctionGearRunDiagnostics(entry: AuctionGearSearchEntry) {
  return metricsFor(entry.context.armory ?? entry.context).snapshot();
}
import { parseAuctionGearEncounter, parseAuctionGearCompareScenarios, type AuctionGearEncounter } from "./auctionGearScenarios";
import { evaluateAuctionGearScenarios } from "./auctionGearScenarioExecution";
import { evaluateAuctionEnhancementStage, auctionEnhancementScenarioFinalists } from "./auctionGearEnhancementStage";
import { advanceAuctionGearExhaustiveEnhancements } from "./auctionGearExhaustiveEnhancements";
import { quickAuctionStatChoices } from "./auctionGearStatChoices";
import { auctionAppliedStatsKey, auctionSelectionEffectKey } from "./auctionGearEffects";
import { parseAuctionGearEnhancementMode, type AuctionGearEnhancementMode } from "./auctionGearEnhancementMode";
import type { OwnedAuctionGearChange } from "./auctionGearEnhancementOptimizer";
import { applyOwnedAuctionGearChanges, ownedAuctionGearChanges, customizedAuctionGearOptions } from "./auctionGearEnhancedConfiguration";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { getBattleNetCharacterBySlug, type BattleNetCharacter } from "./battleNetCharacters";
import { getBattleNetSimulationSnapshot, type BattleNetSimulationSnapshot } from "./battleNetCharacterDetails";
import { auctionGearProfileFingerprint } from "./auctionGearFingerprint";
import { getCharacterAuctionMarket } from "./auctionMarketProvider";
import { assertFreshMarket, MARKET_MAX_AGE_MS } from "./auctionMarket";
import { auctionGearVariantSelectionKey } from "./auctionGearExclusions";
import { equippedAuctionReferences } from "./auctionItemReference";
import { auctionVariantKey, validAuctionWeapon } from "./auctionItemVariant";
import { schedulePlannerItemIcons } from "./gearPlannerMedia";
import { resolveAuctionVariants } from "./auctionVariantResolver";
import { auctionGearMechanicalCache, auctionGearMechanicalKey } from "./auctionGearMechanicalCache";
import { getAuctionEquippedPresentation } from "./auctionGearEquipment";
import { auctionGearSlots, parseAuctionGearSlots, type AuctionGearSlot } from "./auctionGearSelection";
import { currentGearSeason, lookupGearEntities } from "./gearCandidateRepository";
import { catalogLoadoutItem, gearSlotCategoryPaths } from "./gearCandidates";
import { prepareGearLoadout, nativeGearSimulationMeasurement, type GearSimulationScenario } from "./gearSimulation";
import { planAuctionGear, searchAuctionGearOptions, assembleAuctionGear, captureAuctionGearIncumbents, type AuctionEquippedItem, type AuctionGearOption, type AuctionPlanProgress, type GearPlanSimulation } from "./auctionGearPlanner";
import type { AuctionGearSearchResult, AuctionGearAssemblyResult } from "./auctionGearTypes";
import { createAuctionGearSearch, deleteAuctionGearSearch, scheduleAuctionGearSearchSave, flushAuctionGearSearch, flushPendingAuctionGearSearch, type AuctionGearSearchEntry } from "./auctionGearSearchStore";
import type { GearLoadoutItem } from "./gearCompatibility";
import type { AuctionSnapshot } from "./auctionMarket";
import { createAuctionGearDiscovery, advanceAuctionGearDiscovery, refreshAuctionGearDiscovery, auctionGearDiscoveryCoverage, auctionGearDiscoveryOptions } from "./auctionGearDiscovery";
export type AuctionGearRunInput = {
  enhancementMode?: AuctionGearEnhancementMode;
  characterSlug: string;
  budgetCopper: number;
  scenario: GearSimulationScenario;
  locale: "ru" | "en";
  selectedSlots?: AuctionGearSlot[];
  objective?: "value" | "dps";
  fightLengthSeconds?: number;
  targets?: number;
  compareScenarios?: AuctionGearEncounter[];
};
export type AuctionGearRunMetadata = { enhancementMode?: AuctionGearEnhancementMode; fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[]; market: AuctionGearContext["publicMarket"]; profileFingerprint: string; scenario: GearSimulationScenario; objective: "value" | "dps"; coverage: AuctionGearContext["coverage"] };
export type AuctionGearRunResult = (AuctionGearSearchResult | AuctionGearAssemblyResult) & AuctionGearRunMetadata;
export async function runAuctionGearPlan(input: AuctionGearRunInput, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const check = () => signal.throwIfAborted();
  check();
  progress({
    phase: "market",
    completed: 0,
    total: 1
  });
  const diagnostics = createAuctionGearDiagnostics();
  const character = await diagnostics.measureStage("ownership", () => getBattleNetCharacterBySlug(token, input.locale, input.characterSlug, signal));
  if (!character) throw new Error("character_not_found");
  const armory = await diagnostics.measureStage("armory", () => getBattleNetSimulationSnapshot(token, character, signal, { professions: true }));
  runDiagnostics.set(armory, diagnostics);
  return runAuctionGearPlanFromSnapshot(input, character, armory, token, signal, progress);
}

/** Internal runner for a trusted snapshot. HTTP entry points must resolve ownership first. */
export async function createAuctionGearContextFromSnapshot(input: AuctionGearRunInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  parseAuctionGearEnhancementMode(input.enhancementMode);
  const check = () => signal.throwIfAborted();
  const diagnostics = metricsFor(armory);
  check();
  const theme = talentSpecThemes.find(t => t.classId === character.playableClass.id && t.specId === armory.activeSpecializationId);
  if (!theme) throw new Error("specialization_unresolved");
  if (!["melee", "ranged"].includes(theme.role)) throw new Error("damage_specialization_required");
  const selectedSlots = parseAuctionGearSlots(input.selectedSlots ?? [...auctionGearSlots]);
  check();
  const raw = armory.equipment.equipped_items as Array<{
    slot?: {
      type?: string;
    };
    item?: {
      id?: number;
    };
    name?: string;
    quality?: { type?: string };
    level?: { value?: number };
    requirements?: { level?: { value?: number } };
    stats?: Array<{ type?: { type?: string }; value?: number; is_negated?: boolean }>;
    armor?: { value?: number };
    spells?: Array<{ description?: string }>;
    weapon?: { damage?: { min_value?: number; max_value?: number }; attack_speed?: { value?: number }; dps?: { value?: number } };
  }> | undefined;
  if (!Array.isArray(raw) || !raw.length) throw new Error("equipment_constraints_unverified");
  const equipped = raw.filter(i => i.item?.id && i.slot?.type && gearSlotCategoryPaths[i.slot.type]);
  const locale = input.locale === "en" ? "en_US" : "ru_RU";
  const [market, localizedEquipped, baselineEntities] = await Promise.all([
    diagnostics.measureStage("market", () => getCharacterAuctionMarket(character, token, { signal })),
    diagnostics.measureStage("equippedPresentation", () => getAuctionEquippedPresentation({ character, equipment: armory.equipment, locale: input.locale, token, signal })),
    diagnostics.measureStage("equippedCatalog", () => lookupGearEntities(equipped.map(i => i.item!.id!), locale, signal, { includeSources: false, auctionCache: true })),
  ]);
  check();
  const qualityIds: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };
  const statKeys: Record<string, string> = { STRENGTH: "strength", AGILITY: "agility", INTELLECT: "intellect", STAMINA: "stamina", CRIT_RATING: "crit_rating", HASTE_RATING: "haste_rating", MASTERY_RATING: "mastery_rating", VERSATILITY: "versatility_rating", LIFESTEAL: "leech_rating", AVOIDANCE: "avoidance_rating", SPEED: "speed_rating" };
  const currentBySlot = new Map<string, AuctionEquippedItem>();
  const loadout = equipped.map(item => {
    const entity = baselineEntities.find(e => e.externalId === item.item!.id);
    if (!entity) throw new Error("equipment_constraints_unverified");
    // Snapshot stats and levels describe the actual equipped variant. Catalog
    // defaults supply presentation only and never substitute their stats.
    const stats = Object.fromEntries((item.stats ?? []).flatMap(stat => {
      const key = statKeys[stat.type?.type ?? ""];
      return key && !stat.is_negated && Number.isFinite(stat.value) ? [[key, Number(stat.value)]] : [];
    }));
    if (Number.isFinite(item.armor?.value)) stats.armor = Number(item.armor!.value);
    const weapon = item.weapon ? { minDamage: Number(item.weapon.damage?.min_value), maxDamage: Number(item.weapon.damage?.max_value),
      dps: Number(item.weapon.dps?.value), speedSeconds: Number(item.weapon.attack_speed?.value) / 1000 } : undefined;
    currentBySlot.set(item.slot!.type!, {
      itemId: item.item!.id!, name: localizedEquipped.get(item.slot!.type!)?.name || item.name || entity.name, slotType: item.slot!.type!,
      iconUrl: entity.iconUrl, quality: qualityIds[item.quality?.type ?? ""] ?? entity.quality,
      itemClassId: [13, 15, 17, 21, 22, 26].includes(catalogLoadoutItem(entity, item.slot!.type!).inventoryType) ? 2 : undefined,
      ...(Number.isInteger(item.level?.value) ? { itemLevel: Number(item.level!.value) } : {}),
      ...(Number.isInteger(item.requirements?.level?.value) ? { requiredLevel: Number(item.requirements!.level!.value) } : {}),
      ...(Object.keys(stats).length ? { stats } : {}),
      effects: localizedEquipped.get(item.slot!.type!)?.effects ?? [],
      effectsVerified: true,
      ...(validAuctionWeapon(weapon) ? { weapon } : {}),
    });
    return catalogLoadoutItem(entity, item.slot!.type!);
  });
  const season = currentGearSeason();
  const discovery = createAuctionGearDiscovery(market, input.budgetCopper);
  progress({ phase: "catalog", completed: 0, total: discovery.itemIds.length });
  const discoveryContext = (slotType: string) => ({
    classId: character.playableClass.id, specId: theme.specId, characterLevel: character.level,
    raceId: character.playableRace.id, faction: character.faction.type, professions: armory.professions, slotType,
    currentItemLevel: 0, anchorItemClassId: -1, anchorItemSubclassId: -1, season,
    acquisition: { type: "auction" as const, evidence: "auction" as const },
  });
  const { fightLengthSeconds, targets } = parseAuctionGearEncounter(input);
  parseAuctionGearCompareScenarios(input.compareScenarios);
  const encounter = { fightLengthSeconds, targets };
  const retainedMarket = { ...market, offers: [] };
  const simulate = createAuctionSimulator({ armory, loadout, specId: theme.specId, specSlug: theme.slug,
    scenario: input.scenario, encounter, market: retainedMarket, engine: () => discovery.engine });
  schedulePlannerItemIcons([...currentBySlot.values()], character.region, token, signal);
  check();
  const coverage = auctionGearDiscoveryCoverage(discovery);
  return {
    input: { ...input, selectedSlots }, character, armory, options: [] as AuctionGearOption[], loadout,
    specId: theme.specId, specSlug: theme.slug, market: retainedMarket, currentBySlot, simulate,
    discovery, discoveryContext, discoverySeason: season, encounter, coverage, searchLimited: true, engineVerificationRequired: false,
    publicMarket: { snapshotId: market.id, region: character.region, realm: character.realm.name,
      connectedRealmId: market.connectedRealmId, updatedAt: market.sourceUpdatedAt,
      discoveredSnapshotId: discovery.discoveredSnapshotId, validatedAt: market.fetchedAt },
    profileFingerprint: auctionGearProfileFingerprint(armory), scenario: input.scenario,
    marketChange: { removedLots: 0, repricedLots: 0, quantityChangedLots: 0, variantsChangedLots: 0 },
  };
}

export type AuctionGearContext = Awaited<ReturnType<typeof createAuctionGearContextFromSnapshot>>;

function publicAuctionResult(context: AuctionGearContext, result: AuctionGearSearchResult): AuctionGearSearchResult & AuctionGearRunMetadata;
function publicAuctionResult(context: AuctionGearContext, result: AuctionGearAssemblyResult): AuctionGearAssemblyResult & AuctionGearRunMetadata;
function publicAuctionResult(context: AuctionGearContext, result: AuctionGearSearchResult | AuctionGearAssemblyResult): AuctionGearRunResult {
  const metadata: AuctionGearRunMetadata = { market: context.publicMarket,
    profileFingerprint: context.profileFingerprint, scenario: context.input.scenario,
    ...(context.input.enhancementMode !== undefined ? { enhancementMode: context.input.enhancementMode } : {}),
    ...(context.input.fightLengthSeconds !== undefined ? { fightLengthSeconds: context.input.fightLengthSeconds } : {}),
    ...(context.input.targets !== undefined ? { targets: context.input.targets } : {}),
    ...(context.input.compareScenarios ? { compareScenarios: context.input.compareScenarios } : {}), objective: context.input.objective ?? "dps", coverage: context.coverage };
  const discoveryComplete = context.discovery ? context.coverage.discoveryComplete : true;
  const dataComplete = context.discovery ? context.coverage.dataComplete : !context.searchLimited;
  return result.kind === "search"
    ? { ...result, ...metadata, discoveryComplete, dataComplete,
      searchComplete: result.searchComplete && discoveryComplete, searchLimited: result.searchLimited || context.searchLimited }
    : { ...result, ...metadata, discoveryComplete, dataComplete,
      exhaustiveComplete: result.exhaustiveComplete && discoveryComplete, searchLimited: result.searchLimited || context.searchLimited };
}

function retainAuctionSimulations(entry: AuctionGearSearchEntry) {
  entry.retainedSimulationCache = { ...entry.retainedSimulationCache, ...entry.searchCheckpoint?.simulationCache,
    ...entry.assemblyCheckpoint?.simulationCache };
  entry.retainedBaseline ??= entry.searchCheckpoint?.baseline ?? entry.assemblyCheckpoint?.baseline;
  return entry.retainedSimulationCache;
}

function retainAuctionIncumbents(entry: AuctionGearSearchEntry) {
  const captured = captureAuctionGearIncumbents(entry.assemblyCheckpoint, entry.context.options);
  const unique = new Map([...captured, ...(entry.retainedIncumbents ?? [])].map(incumbent =>
    [JSON.stringify([...incumbent.effects].sort()), incumbent]));
  // These are warm-start proposals only; the exhaustive domain stays intact.
  entry.retainedIncumbents = [...unique.values()].slice(0, 4);
  return entry.retainedIncumbents;
}

function invalidateAuctionCursors(entry: AuctionGearSearchEntry) {
  retainAuctionSimulations(entry);
  retainAuctionIncumbents(entry);
  entry.searchCheckpoint = undefined;
  entry.assemblyCheckpoint = undefined;
  entry.enhancementPreview = undefined;
  entry.exhaustiveEnhancementState = undefined;
  entry.allowedKey = undefined;
}

const auctionFactsKey = (options: AuctionGearOption[]) => JSON.stringify(options.map(option =>
  [option.id, option.auctionId, option.costCopper, option.quantity, option.variantKey]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

function synchronizeAuctionOptions(entry: AuctionGearSearchEntry, options: AuctionGearOption[]) {
  const context = entry.context;
  entry.knownOptionIds ??= new Set(context.options.map(option => option.id));
  for (const option of options) {
    if (!entry.knownOptionIds.has(option.id)) metricsFor(context.armory ?? context).candidate();
    entry.knownOptionIds.add(option.id);
  }
  entry.knownVariantKeys ??= new Set(context.options.map(option => auctionGearVariantSelectionKey({ itemId: option.candidate.itemId, variantKey: option.variantKey })));
  for (const option of options) entry.knownVariantKeys.add(auctionGearVariantSelectionKey({ itemId: option.candidate.itemId, variantKey: option.variantKey }));
  if (auctionFactsKey(context.options) !== auctionFactsKey(options)) invalidateAuctionCursors(entry);
  context.options = options;
  if (context.discovery) {
    context.coverage = auctionGearDiscoveryCoverage(context.discovery);
    context.searchLimited = !context.coverage.discoveryComplete || !context.coverage.dataComplete;
    context.publicMarket.discoveredSnapshotId = context.discovery.discoveredSnapshotId;
  }
}

async function discoverAuctionOptions(entry: AuctionGearSearchEntry, token: string | undefined, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, shouldYield: () => boolean, maxSteps = 12, fullMarket = false) {
  const context = entry.context;
  if (!context.discovery) return; // Backward-compatible trusted in-memory fixtures.
  if (context.engineVerificationRequired) {
    // A persisted engine label is historical, not proof about today's worker.
    const candidate = auctionGearDiscoveryOptions(context.discovery).find(option => option.candidate.variants.some(variant =>
      variant.key === option.variantKey && variant.resolution?.engine === context.discovery.engine));
    const offer = candidate && context.discovery.offers.get(candidate.variantKey)?.find(row => row.auctionId === candidate.auctionId);
    if (offer && candidate) {
      const slot = ({ FINGER_1: "finger1", FINGER_2: "finger2", TRINKET_1: "trinket1", TRINKET_2: "trinket2" } as Record<string, string>)[candidate.candidate.slotType] ?? candidate.candidate.slotType.toLowerCase();
      const validation = await metricsFor(context.armory ?? context).measureStage("variants", () => resolveAuctionVariants({ offers: [{ offer, slot }],
        spec: context.specSlug, characterLevel: context.character.level, signal }));
      if (!validation.engine || context.discovery.engine && validation.engine !== context.discovery.engine) throw new Error("simulation_version_changed");
      context.discovery.engine = validation.engine;
    } else {
      await context.simulate([], signal);
    }
    context.engineVerificationRequired = false;
    scheduleAuctionGearSearchSave(entry);
  }
  if (!context.coverage.discoveryComplete) {
    if (!token) throw new Error("auction_discovery_authorization_required");
    await metricsFor(context.armory ?? context).measure("discovery", () => advanceAuctionGearDiscovery(context.discovery, { locale: context.input.locale === "en" ? "en_US" : "ru_RU",
      equipment: context.armory?.equipment, region: context.character.region, token, spec: context.specSlug, characterLevel: context.character.level,
      selectedSlots: context.input.selectedSlots, context: context.discoveryContext, signal, shouldYield, maxSteps, fullMarket,
      measure: (stage, work) => metricsFor(context.armory ?? context).measureStage(stage, work),
      stopAfterNewCandidates: !entry.latestSearchResult?.items.some(item => item.comparison), onProgress: progress,
      onCheckpoint: () => { synchronizeAuctionOptions(entry, auctionGearDiscoveryOptions(context.discovery)); scheduleAuctionGearSearchSave(entry); } }));
  }
  if (context.discovery.engine && entry.retainedBaseline && context.discovery.engine !== entry.retainedBaseline.engine) throw new Error("simulation_version_changed");
  const options = auctionGearDiscoveryOptions(context.discovery);
  if (token) schedulePlannerItemIcons(options.map(option => option.candidate), context.character.region, token, signal);
  synchronizeAuctionOptions(entry, options);
  scheduleAuctionGearSearchSave(entry);
}

async function updateAuctionSearchResult(entry: AuctionGearSearchEntry, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, shouldYield: () => boolean, maxNewSimulations?: number, verifiedCapacity?: 1 | 2, fullMarket = false) {
  const context = entry.context;
  const cache = retainAuctionSimulations(entry);
  if (entry.searchCheckpoint) Object.assign(entry.searchCheckpoint.simulationCache, cache);
  const diagnostics = metricsFor(context.armory ?? context);
  signal.throwIfAborted();
  const yielding = shouldYield();
  const max = maxNewSimulations ?? (entry.latestSearchResult ? 8 : 3);
  // Rendering a retained checkpoint or measuring one effect cannot overlap
  // native work, so neither operation needs a live capacity round trip.
  const simulationConcurrency = yielding || max <= 1 ? 1
    : verifiedCapacity ?? await diagnostics.measureStage("capacity", async () => await context.simulate.concurrency?.(signal) ?? 1);
  const { result, checkpoint } = await diagnostics.measureStage("search", () => searchAuctionGearOptions({
    searchId: entry.id, objective: context.input.objective, budgetCopper: context.input.budgetCopper, options: context.options,
    selectedSlots: context.input.selectedSlots, loadout: context.loadout, specId: context.specId,
    market: context.market, signal, simulate: fullMarket
      ? (selection, requestSignal) => context.simulate(selection, requestSignal, undefined, "certified-candidate")
      : context.simulate, checkpoint: entry.searchCheckpoint,
    statPriority: context.input.enhancementMode === "equipment",
    baseline: entry.retainedBaseline, simulationCache: cache,
    simulationConcurrency, simulationBatchSize: context.simulate.batchSize,
    // The initial response includes baseline plus two native comparisons.
    // Subsequent responses update the visible choices after eight new effects.
    maxNewSimulations: max,
    shouldYield: yielding ? () => true : shouldYield, onProgress: progress, onCacheHit: () => metricsFor(context.armory ?? context).cacheHit(),
    onCheckpoint: state => { entry.searchCheckpoint = state; scheduleAuctionGearSearchSave(entry); },
  }));
  signal.throwIfAborted();
  entry.searchCheckpoint = checkpoint;
  entry.retainedBaseline = checkpoint.baseline;
  entry.retainedSimulationCache = checkpoint.simulationCache;
  const discoveryComplete = context.discovery ? context.coverage.discoveryComplete : true;
  const dataComplete = context.discovery ? context.coverage.dataComplete : !context.searchLimited;
  entry.latestSearchResult = publicAuctionResult(context, { ...result, discoveryComplete, dataComplete,
    searchComplete: result.pendingItems === 0 && discoveryComplete, searchLimited: result.searchLimited || context.searchLimited,
    items: result.items.map(item => ({ ...item, currentItem: context.currentBySlot.get(item.slotType) })) });
  if (entry.metadataRebuildRequired && checkpoint.baseline) entry.metadataRebuildRequired = false;
  scheduleAuctionGearSearchSave(entry);
  return entry.latestSearchResult;
}
export async function startAuctionGearSearch(input: AuctionGearRunInput, owner: string, token: string, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, searchCreated?: (searchId: string) => void, publishResult?: (result: AuctionGearRunResult) => void, fullMarket = false) {
  progress({ phase: "market", completed: 0, total: 1 });
  const diagnostics = createAuctionGearDiagnostics();
  const character = await diagnostics.measureStage("ownership", () => getBattleNetCharacterBySlug(token, input.locale, input.characterSlug, signal));
  if (!character) throw new Error("character_not_found");
  const armory = await diagnostics.measureStage("armory", () => getBattleNetSimulationSnapshot(token, character, signal, { professions: true }));
  runDiagnostics.set(armory, diagnostics);
  return startAuctionGearSearchFromSnapshot(input, character, armory, owner, token, signal, progress, searchCreated, publishResult, fullMarket);
}

/** Trusted developer QA entry point. The HTTP route never accepts a snapshot. */
export async function startAuctionGearSearchFromSnapshot(input: AuctionGearRunInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot,
  owner: string, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void, searchCreated?: (searchId: string) => void, publishResult?: (result: AuctionGearRunResult) => void, fullMarket = false) {
  const context = await createAuctionGearContextFromSnapshot(input, character, armory, token, signal, progress);
  signal.throwIfAborted();
  const entry = createAuctionGearSearch(owner, context);
  try {
    searchCreated?.(entry.id);
    return await continueAuctionGearSearch(entry, signal, progress, token, publishResult, fullMarket);
  } catch (error) {
    if (!entry.latestSearchResult) deleteAuctionGearSearch(owner, entry.id);
    throw error;
  }
}

/** Phase transitions are durable state, including when no planner work follows. */
function setAuctionGearPhase(entry: AuctionGearSearchEntry, key: "nextSearchPhase" | "nextAssemblyPhase", value: "discovery" | "simulation") {
  if (entry[key] === value) return;
  entry[key] = value;
  scheduleAuctionGearSearchSave(entry);
}

export async function continueAuctionGearSearch(entry: AuctionGearSearchEntry, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, token?: string,
  publishResult?: (result: AuctionGearRunResult) => void, fullMarket = false) {
  const started = Date.now(), shouldYield = () => Date.now() - started >= 10_000;
  const diagnostics = metricsFor(entry.context.armory ?? entry.context);
  const finishStep = diagnostics.beginStep("search");
  const discoveryShouldYield = () => Date.now() - started >= 5_000;
  // Full assembly visits the single-item combinations as well. Once the first
  // comparison is visible, spend discovery turns completing the candidate pool.
  const prioritizeDiscovery = fullMarket && entry.context.discovery && !entry.context.coverage.discoveryComplete &&
    entry.retainedBaseline && entry.latestSearchResult?.items.some(item => item.comparison);
  const advanceComparisons = async () => {
    if (prioritizeDiscovery) return updateAuctionSearchResult(entry, signal, progress, () => true);
    let remaining = entry.latestSearchResult ? 8 : 3;
    let verifiedCapacity: 1 | 2 | undefined;
    if (fullMarket && entry.context.options.length > 1 && !shouldYield()) {
      verifiedCapacity = await entry.context.simulate.concurrency?.(signal);
      if (verifiedCapacity === 2 && entry.context.simulate.batchSize) remaining = 2 * entry.context.simulate.batchSize;
    }
    let result;
    while (remaining > 0) {
      // Publish the first useful comparison promptly. Once it is visible, use
      // the rest of this turn's budget in one planner pass instead of rebuilding
      // and durably writing every lot after each individual simulation.
      const batch = publishResult && !(fullMarket && entry.context.simulate.batchSize) && !entry.latestSearchResult?.items.some(item => item.comparison) ? 1 : remaining;
      result = await updateAuctionSearchResult(entry, signal, progress, shouldYield, publishResult || fullMarket ? batch : undefined, verifiedCapacity, fullMarket);
      remaining -= batch;
      if (publishResult) {
        // This comparison batch finishes before the deadline. Store the next
        // discovery turn in the same durable snapshot as its visible result.
        if ((remaining === 0 || result.pendingItems === 0) && !shouldYield()) setAuctionGearPhase(entry, "nextSearchPhase", "discovery");
        await metricsFor(entry.context.armory ?? entry.context).measureStage("checkpoint", () => flushPendingAuctionGearSearch(entry));
        signal.throwIfAborted();
        const diagnosticKey = entry.context.armory ?? entry.context;
        const seen = comparedOptions.get(diagnosticKey) ?? new Set<string>();
        for (const item of result.items) if (item.comparison && !seen.has(item.optionId)) {
          seen.add(item.optionId); metricsFor(diagnosticKey).comparison();
        }
        comparedOptions.set(diagnosticKey, seen);
        publishResult(publicAuctionResult(entry.context, result));
      }
      if (!publishResult || shouldYield() || result.pendingItems === 0) break;
    }
    return result!;
  };
  entry.busy = true;
  try {
    signal.throwIfAborted();
    if (entry.latestSearchResult) publishResult?.(publicAuctionResult(entry.context, entry.latestSearchResult));
    let simulated = false;
    // Alternate the first turn when discovery outlives its cooperative budget.
    // Retain this choice across recovery so slow upstream calls cannot starve
    // already-discovered comparisons on every continuation.
    if (!prioritizeDiscovery && entry.nextSearchPhase === "simulation" && entry.context.options.length) {
      setAuctionGearPhase(entry, "nextSearchPhase", "discovery");
      await advanceComparisons();
      simulated = true;
    }
    if (!shouldYield()) {
      setAuctionGearPhase(entry, "nextSearchPhase", "simulation");
      // Accumulate more candidates per full-market batch within the same discovery deadline.
      const ongoingDiscoverySteps = fullMarket ? 24 : 4;
      const discoverySteps = entry.latestSearchResult ? ongoingDiscoverySteps : 12;
      await discoverAuctionOptions(entry, token, signal, progress, discoveryShouldYield, discoverySteps, fullMarket);
    }
    signal.throwIfAborted();
    const result = simulated
      ? await updateAuctionSearchResult(entry, signal, progress, () => true)
      : await advanceComparisons();
    if (!shouldYield()) setAuctionGearPhase(entry, "nextSearchPhase", "discovery");
    return publicAuctionResult(entry.context, result);
  } catch (error) {
    // Cached/incompatible traversal can mutate an existing cursor between
    // planner callbacks. Preserve that progress even if the next yield aborts.
    scheduleAuctionGearSearchSave(entry);
    throw error;
  } finally {
    try { await metricsFor(entry.context.armory ?? entry.context).measureStage("checkpoint", () => flushPendingAuctionGearSearch(entry)); } finally {
      entry.busy = false; finishStep(); logAuctionGearDiagnostics(diagnostics.snapshot());
    }
  }
}
/** Refresh actual character and lot facts without trusting client prices/stats. */
export async function verifyAuctionGearSearch(entry: AuctionGearSearchEntry, token: string, signal: AbortSignal, verifyOwnership = true) {
  const context = entry.context;
  const diagnostics = metricsFor(context.armory ?? context);
  signal.throwIfAborted();
  if (verifyOwnership) {
    const owned = await diagnostics.measureStage("ownership", () => getBattleNetCharacterBySlug(token, context.input.locale, context.input.characterSlug, signal, { cache: "no-store" }));
    if (!owned || owned.id !== context.character.id || owned.realm.slug !== context.character.realm.slug || owned.region !== context.character.region) throw new Error("character_not_found");
  }
  // Ownership is verified above; these fresh reads are independent. Keep both
  // validations on every continuation without paying their latency in series.
  const [current, market] = await Promise.all([
    diagnostics.measureStage("armory", () => getBattleNetSimulationSnapshot(token, context.character, signal, { professions: true })),
    diagnostics.measureStage("market", () => getCharacterAuctionMarket(context.character, token, { refresh: true, signal })),
  ]);
  signal.throwIfAborted();
  if (auctionGearProfileFingerprint(current) !== context.profileFingerprint) throw new Error("character_snapshot_changed");
  if (market.region !== context.market.region || market.connectedRealmId !== context.market.connectedRealmId) throw new Error("auction_market_changed");
  const offers = new Map(market.offers.map(offer => [offer.auctionId, offer]));
  const previous = new Map(context.options.map(option => [option.auctionId, option]));
  const changes = { removedLots: 0, repricedLots: 0, quantityChangedLots: 0, variantsChangedLots: 0 };
  for (const [id, option] of previous) {
    const offer = offers.get(id);
    if (!offer) changes.removedLots++;
    else if (auctionVariantKey(offer) !== option.variantKey) changes.variantsChangedLots++;
    else {
      if (offer.buyoutCopper !== option.costCopper) changes.repricedLots++;
      if (offer.quantity !== option.quantity) changes.quantityChangedLots++;
    }
  }
  context.marketChange = changes;
  if (context.discovery) {
    if (entry.metadataMarketRefreshRequired) {
      // The persisted market omits raw offers. Rebuild from this authoritative
      // response even when its snapshot ID equals the saved one. Keep the object
      // identity used by the simulator's engine callback.
      Object.assign(context.discovery, createAuctionGearDiscovery(market, context.input.budgetCopper));
      entry.metadataMarketRefreshRequired = false;
    } else refreshAuctionGearDiscovery(context.discovery, market, { retryCatalog: entry.latestSearchResult?.searchComplete === true || Boolean(entry.latestAssemblyResult) });
    synchronizeAuctionOptions(entry, auctionGearDiscoveryOptions(context.discovery));
  } else {
    // Trusted historical contexts have no discovery state. Refresh only their
    // known variants, still never trusting a client-supplied price or quantity.
    const options = context.options.flatMap(option => {
      const offer = offers.get(option.auctionId);
      return offer && auctionVariantKey(offer) === option.variantKey && offer.buyoutCopper <= context.input.budgetCopper
        ? [{ ...option, costCopper: offer.buyoutCopper, quantity: offer.quantity }] : [];
    });
    synchronizeAuctionOptions(entry, options);
  }
  context.market.id = market.id;
  context.market.sourceUpdatedAt = market.sourceUpdatedAt;
  context.market.fetchedAt = market.fetchedAt;
  context.publicMarket = { ...context.publicMarket, snapshotId: market.id, updatedAt: market.sourceUpdatedAt, validatedAt: market.fetchedAt };
  await metricsFor(entry.context.armory ?? entry.context).measureStage("checkpoint", () => flushAuctionGearSearch(entry));
}

export type AuctionGearAssemblySelection = { excludedOptionIds: string[]; excludedVariantKeys?: string[] } | string[] | undefined;
function withFreshEnhancementQuotes<T extends AuctionGearAssemblyResult>(result: T): T {
  const enhanced = result.enhancementOptimization;
  if (!enhanced?.recommendations.length) return result;
  const recommendations = enhanced.recommendations.filter(recommendation => {
    try { assertFreshMarket({sourceUpdatedAt:recommendation.configuration.sourceUpdatedAt ?? ''}); return true; }
    catch { return false; }
  });
  if (recommendations.length === enhanced.recommendations.length) return result;
  return {...result, enhancementOptimization:{...enhanced, recommendations, finalistRecheck: undefined,
    status:enhanced.complete ? recommendations.length ? 'ready' : 'unavailable' : 'pending',
    reasons:[...new Set([...enhanced.reasons,'market_unverified'])]}};
}
export function selectedAuctionGearAssemblyOptions(entry: AuctionGearSearchEntry, value: unknown): AuctionGearOption[] {
  const exclusion = value !== undefined && !Array.isArray(value);
  if (exclusion && (!value || typeof value !== "object" || !("excludedOptionIds" in value) ||
      Object.keys(value).some(key => key !== "excludedOptionIds" && key !== "excludedVariantKeys"))) throw new Error("invalid_auction_selection");
  const object = exclusion ? value as { excludedOptionIds: unknown; excludedVariantKeys?: unknown } : undefined;
  const ids = object ? object.excludedOptionIds : value;
  if (exclusion && !Array.isArray(ids)) throw new Error("invalid_auction_selection");
  const known = entry.knownOptionIds ?? new Set(entry.context.options.map(option => option.id));
  if (ids !== undefined && (!Array.isArray(ids) || (!exclusion && !ids.length) || ids.length > known.size ||
      ids.some(id => typeof id !== "string" || id.length > 180 || !known.has(id)) || new Set(ids).size !== ids.length)) throw new Error("invalid_auction_selection");
  const variants = object?.excludedVariantKeys;
  if (variants !== undefined && (!Array.isArray(variants) || variants.length > 20000 ||
      variants.some(key => typeof key !== "string" || !key || key.length > 240) || new Set(variants).size !== variants.length)) throw new Error("invalid_auction_selection");
  const bannedVariants = new Set(variants as string[] | undefined);
  if (bannedVariants.size) {
    const knownVariants = new Set(entry.knownVariantKeys ?? []);
    for (const option of entry.context.options) knownVariants.add(auctionGearVariantSelectionKey({ itemId: option.candidate.itemId, variantKey: option.variantKey }));
    if ([...bannedVariants].some(key => !knownVariants.has(key))) throw new Error("invalid_auction_selection");
  }
  const selected = new Set(ids as string[] | undefined);
  return entry.context.options.filter(option =>
    (ids === undefined || (exclusion ? !selected.has(option.id) : selected.has(option.id))) &&
    (!bannedVariants.size || !bannedVariants.has(auctionGearVariantSelectionKey({ itemId: option.candidate.itemId, variantKey: option.variantKey }))));
}

export function selectedAuctionGearOptions(entry: AuctionGearSearchEntry, value: unknown) {
  if (!Array.isArray(value)) throw new Error("invalid_auction_selection");
  return selectedAuctionGearAssemblyOptions(entry, value);
}

/** Sample one leader after equipment has advanced. The bounded optimizer tries
 * seeded configurations first and resumes its own cursor on the next turn. */
async function previewAuctionGearLeader(entry: AuctionGearSearchEntry, options: AuctionGearOption[],
  signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const context = entry.context, checkpoint = entry.assemblyCheckpoint!;
  const ids = (checkpoint.bestConfirmed ?? checkpoint.best).optionIds;
  const key = JSON.stringify([...ids].sort());
  if (entry.enhancementPreview?.leader !== key)
    entry.enhancementPreview = { leader: key, stage: { checkpoints: {} }, retryAt: 0 };
  const preview = entry.enhancementPreview;
  if (Date.now() < preview.retryAt) return;
  const byId = new Map(options.map(option => [option.id, option]));
  const selected = ids.map(id => byId.get(id));
  if (!selected.every((option): option is AuctionGearOption => Boolean(option))) return;
  const deadline = Date.now() + 3000;
  progress({ phase: "enhancements", completed: 0, total: 0 });
  let result: Awaited<ReturnType<typeof evaluateAuctionEnhancementStage>>;
  try {
    result = await evaluateAuctionEnhancementStage({
      preview: true, finalists: [{label: "leader", options: selected}], selectedSlots: context.input.selectedSlots,
      equipment: context.armory.equipment, loadout: context.loadout, specId: context.specId,
      level: context.character.level, professions: context.armory.professions, faction: context.character.faction?.type,
      region: context.character.region, engine: checkpoint.baseline.engine, profileFingerprint: context.profileFingerprint,
      encounter: { scenario: context.input.scenario, ...context.encounter }, budgetCopper: context.input.budgetCopper,
      objective: context.input.objective ?? "dps", baseline: checkpoint.baseline, simulate: context.simulate,
      state: preview.stage, signal, shouldYield: () => Date.now() >= deadline,
    });
  } catch (error) {
    signal.throwIfAborted();
    // This optional measurement cannot fail the authoritative equipment traversal.
    console.warn("auction enhancement preview unavailable", error instanceof Error ? error.name : "Error");
    preview.retryAt = Date.now() + 60_000;
    preview.result = undefined;
    return;
  }
  signal.throwIfAborted();
  const refreshed = Date.parse(preview.stage.quotes?.fetchedAt ?? "");
  const source = Date.parse(preview.stage.quotes?.sourceUpdatedAt ?? "");
  preview.validUntil = Number.isFinite(refreshed) && Number.isFinite(source)
    ? Math.min(refreshed + 60_000, source + MARKET_MAX_AGE_MS) : undefined;
  preview.retryAt = result.complete ? Math.max(Date.now() + 1000, preview.validUntil ?? Date.now() + 60_000) : 0;
  const recommendations = result.recommendations.filter(row => row.configuration.status === "priced" &&
    row.configuration.consumables.length > 0 && row.configuration.totalCopper !== null &&
    row.configuration.totalCopper <= context.input.budgetCopper);
  preview.result = recommendations.length ? { ...result, traversal: "preview", complete: false, recommendations } : undefined;
}

export async function assembleAuctionGearSearch(entry: AuctionGearSearchEntry, selection: unknown, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, token?: string,
  publishResult?: (result: AuctionGearRunResult) => void, fullMarket = false) {
  // Publish a useful bounded step on both the first request and continuations.
  // Include discovery in the time budget; an in-flight upstream request may
  // finish after it, but no further native comparison starts after yielding.
  const context = entry.context, started = Date.now(), shouldYield = () => Date.now() - started >= 10_000;
  selectedAuctionGearAssemblyOptions(entry, selection);
  if (!entry.latestSearchResult || !(entry.retainedBaseline ?? entry.searchCheckpoint?.baseline)) {
    if (entry.metadataRebuildRequired) return continueAuctionGearSearch(entry, signal, progress, token, publishResult, fullMarket);
    throw new Error("search_not_ready");
  }
  const diagnostics = metricsFor(context.armory ?? context);
  const finishStep = diagnostics.beginStep("assembly");
  entry.busy = true;
  try {
    signal.throwIfAborted();
    publishResult?.(publicAuctionResult(context, entry.latestSearchResult));
    // The first assembly must measure a whole-set seed from the verified pool
    // before spending its turn discovering more items. Restored contexts still
    // verify the worker engine; a zero-step discovery preserves pending work.
    if (!entry.latestAssemblyResult && context.options.length) {
      await discoverAuctionOptions(entry, token, signal, progress, () => true, 0);
      setAuctionGearPhase(entry, "nextAssemblyPhase", "discovery");
    // Later turns retain discovery/simulation fairness and the full domain.
    } else if (entry.nextAssemblyPhase !== "simulation") {
      setAuctionGearPhase(entry, "nextAssemblyPhase", "simulation");
      await discoverAuctionOptions(entry, token, signal, progress, shouldYield, 4, fullMarket);
    } else {
      setAuctionGearPhase(entry, "nextAssemblyPhase", "discovery");
    }
    const available = selectedAuctionGearAssemblyOptions(entry, selection);
    const options = !fullMarket && context.input.enhancementMode === "equipment" && !entry.latestAssemblyResult
      ? quickAuctionStatChoices(available, option => {
          const key = auctionSelectionEffectKey([option]);
          return entry.retainedSimulationCache?.[key]?.dps ?? entry.searchCheckpoint?.simulationCache[key]?.dps;
        }) : available;
    const statLimited = options.length < available.length;
    const allowedKey = auctionFactsKey(options);
    if (entry.allowedKey !== allowedKey) {
      retainAuctionSimulations(entry);
      retainAuctionIncumbents(entry);
      entry.assemblyCheckpoint = undefined;
      entry.enhancementPreview = undefined;
      entry.exhaustiveEnhancementState = undefined;
      entry.allowedKey = allowedKey;
      scheduleAuctionGearSearchSave(entry);
    }
    const capacity = fullMarket && !shouldYield() ? await context.simulate.concurrency?.(signal) : 1;
    const assemblyBatchSize = capacity === 2 ? context.simulate.batchSize : undefined;
    const currentPreview = () => {
      const cached = entry.enhancementPreview;
      return cached?.validUntil !== undefined && cached.validUntil > Date.now() ? cached.result : undefined;
    };
    const advanceAssembly = async () => {
      const { result, checkpoint } = await diagnostics.measureStage("assembly", () => assembleAuctionGear({
        searchId: entry.id, objective: context.input.objective, budgetCopper: context.input.budgetCopper, options,
        selectedSlots: context.input.selectedSlots, loadout: context.loadout, specId: context.specId,
        market: context.market, signal, simulate: context.simulate, checkpoint: entry.assemblyCheckpoint,
        baseline: entry.retainedBaseline ?? entry.searchCheckpoint?.baseline, simulationCache: retainAuctionSimulations(entry),
        incumbents: entry.retainedIncumbents,
        reuseAppliedStats: fullMarket,
        recheckEquipment: fullMarket && context.input.enhancementMode === "equipment" && (!context.discovery || context.coverage.discoveryComplete)
          ? (selected, sig) => context.simulate(selected, sig, undefined, "finalist") : undefined,
        simulationConcurrency: capacity, simulationBatchSize: assemblyBatchSize,
        maxNewSimulations: assemblyBatchSize ? 2 * assemblyBatchSize : publishResult ? 1 : 8,
        shouldYield, onProgress: progress, onCacheHit: () => metricsFor(context.armory ?? context).cacheHit(),
        onCheckpoint: state => { entry.assemblyCheckpoint = state; scheduleAuctionGearSearchSave(entry); },
      }));
      signal.throwIfAborted();
      entry.assemblyCheckpoint = checkpoint;
      entry.retainedSimulationCache = checkpoint.simulationCache;
      const updatedSearch = await updateAuctionSearchResult(entry, signal, progress, () => true);
      const present = (purchase: AuctionGearAssemblyResult["purchases"][number]) => ({ ...purchase,
        currentItem: context.currentBySlot.get(purchase.slotType) });
      const preview = currentPreview();
      const published = publicAuctionResult(context, { ...result, ...(statLimited ? { exhaustiveComplete: false, searchLimited: true } : {}), ...(preview ? { enhancementOptimization: preview } : {}), updatedSearch, marketChange: context.marketChange,
        ...(context.input.compareScenarios?.length ? { scenarioComparisonsComplete: false } : {}),
        purchases: result.purchases.map(present),
        bestConfirmed: result.bestConfirmed ? { ...result.bestConfirmed, purchases: result.bestConfirmed.purchases.map(present) } : null,
        bestValueConfirmed: result.bestValueConfirmed ? { ...result.bestValueConfirmed, purchases: result.bestValueConfirmed.purchases.map(present) } : null,
        bestDpsConfirmed: result.bestDpsConfirmed ? { ...result.bestDpsConfirmed, purchases: result.bestDpsConfirmed.purchases.map(present) } : null });
      entry.latestAssemblyResult = published;
      scheduleAuctionGearSearchSave(entry);
      // Persist and publish each completed assembly evaluation before starting
      // another native call. A slow next call must not hide the current best set.
      await metricsFor(entry.context.armory ?? entry.context).measureStage("checkpoint", () => flushPendingAuctionGearSearch(entry));
      signal.throwIfAborted();
      publishResult?.(published);
      return { checkpoint, published, poolComplete: result.exhaustiveComplete };
    };
    let { checkpoint, published, poolComplete } = await advanceAssembly();
    if (fullMarket && context.input.enhancementMode === "enhanced" && !published.exhaustiveComplete) {
      await diagnostics.measureStage("enhancements", () => previewAuctionGearLeader(entry, options, signal, progress));
      const preview = currentPreview();
      scheduleAuctionGearSearchSave(entry);
      if (published.enhancementOptimization !== preview) {
        published = { ...published, enhancementOptimization: preview };
        entry.latestAssemblyResult = published;
        await diagnostics.measureStage("checkpoint", () => flushPendingAuctionGearSearch(entry));
        signal.throwIfAborted();
        publishResult?.(published);
      }
    }
    for (let step = 1; publishResult && step < 8 && !shouldYield() && !poolComplete; step++) {
      ({ checkpoint, published, poolComplete } = await advanceAssembly());
    }
    if (!shouldYield()) setAuctionGearPhase(entry, "nextAssemblyPhase", "discovery");
    const encounters = parseAuctionGearCompareScenarios(context.input.compareScenarios);
    if (published.exhaustiveComplete) {
      // Publications are snapshots. Do not mutate the result already held by a job.
      published = { ...published, ...(encounters.length ? {scenarioComparisonsComplete: false} : {}) };
      const finalists = new Map<string, AuctionGearOption[]>();
      const ownedByFinalist = new Map<string, readonly OwnedAuctionGearChange[]>();
      const byId = new Map(options.map(option => [option.id, option]));
      const selectedSets = new Set<string>();
      for (const [label, best] of [["confirmed", checkpoint.bestConfirmed], ["measured", checkpoint.best],
        ["value", checkpoint.bestValueConfirmed], ["dps", checkpoint.bestDpsConfirmed]] as const) {
        if (!best || !best.optionIds.length) continue;
        const key = JSON.stringify([...best.optionIds].sort());
        if (selectedSets.has(key)) continue;
        const selected = best.optionIds.map(id => byId.get(id));
        if (selected.every((option): option is AuctionGearOption => Boolean(option))) {
          selectedSets.add(key); finalists.set(label, selected);
        }
      }
      const equipmentFinalists = new Map(finalists);
      // A bare item may lose DPS because replacement removes installed upgrades.
      // Keep two measured single-item proposals when no winning bare set exists.
      if (context.input.enhancementMode === undefined && !finalists.size) {
        const measured = [...(entry.latestSearchResult?.items ?? [])].filter(item => item.comparison && item.evaluation !== "requires_combination"
          && byId.get(item.optionId)?.candidate.variants.find(v=>v.key===byId.get(item.optionId)?.variantKey)?.resolution?.enhancements?.status === "verified")
          .sort((a,b) => b.comparison!.candidateDps-a.comparison!.candidateDps || a.optionId.localeCompare(b.optionId));
        for(const item of measured.slice(0,2)) {
          const option=byId.get(item.optionId);
          if(option?.candidate.variants.find(v=>v.key===option.variantKey)?.resolution?.enhancements?.status === "verified")
            finalists.set(`candidate-${finalists.size+1}`,[option]);
        }
      }
      if (context.input.enhancementMode === "enhanced") {
        progress({ phase: "enhancements", completed: entry.exhaustiveEnhancementState?.equipmentChecked ?? 0, total: 0 });
        let lastPublishedEnhancement: AuctionGearAssemblyResult["enhancementOptimization"];
        let lastEnhancementJson: string | undefined;
        const publishEnhancement = async (result: NonNullable<typeof lastPublishedEnhancement>) => {
          // Many priced configurations advance the private cursor without
          // changing a single public field. onState already schedules that
          // progress; the turn's final barrier also covers cancellation/errors.
          const json = JSON.stringify(result);
          if (json === lastEnhancementJson) {
            lastPublishedEnhancement = result;
            return;
          }
          const visible = !result.complete && !result.recommendations.length ? currentPreview() ?? result : result;
          published = { ...published, enhancementOptimization: visible };
          entry.latestAssemblyResult = published;
          scheduleAuctionGearSearchSave(entry);
          await diagnostics.measureStage("checkpoint", () => flushPendingAuctionGearSearch(entry));
          signal.throwIfAborted();
          publishResult?.(published);
          lastPublishedEnhancement = result;
          lastEnhancementJson = json;
        };
        // Live capacity is scoped to this exact enhancement turn; a worker
        // downgrade keeps the serial path. Legacy and quick remain unchanged.
        const enhancementConcurrency = shouldYield() ? 1 : await context.simulate.concurrency?.(signal) ?? 1;
        signal.throwIfAborted();
        const enhanced = await diagnostics.measureStage("enhancements", () => advanceAuctionGearExhaustiveEnhancements({
          simulationConcurrency: enhancementConcurrency,
          get simulationBatchSize() { return enhancementConcurrency === 2 ? context.simulate.batchSize : 0; },
          get simulationOwnedBatch() { return context.simulate.ownedBatch; },
          recheck: (selected, configuration, simSignal) => context.simulate(
            customizedAuctionGearOptions(selected, configuration), simSignal, ownedAuctionGearChanges(configuration), "finalist"),
          options, selectedSlots: context.input.selectedSlots, equipment: context.armory.equipment, loadout: context.loadout,
          specId: context.specId, level: context.character.level, professions: context.armory.professions, faction: context.character.faction?.type, region: context.character.region,
          engine: checkpoint.baseline.engine, profileFingerprint: context.profileFingerprint,
          encounter: { scenario: context.input.scenario, ...context.encounter }, budgetCopper: context.input.budgetCopper,
          objective: context.input.objective ?? "dps", baseline: checkpoint.baseline,
          simulate: async (selected, simSignal, ownedChanges) => {
            simSignal.throwIfAborted();
            // Zero bought enhancements reproduce the already measured bare
            // replacement. Keep its native precision/engine checks on reuse.
            if (!ownedChanges?.length && selected.every(option => !option.customization?.enchantId && !option.customization?.gemIds?.some(id => id !== 0))) {
              const bare = selected.map(option => { const copy = { ...option }; delete copy.customization; return copy; });
              const exact = bare.length ? checkpoint.simulationCache[auctionSelectionEffectKey(bare)] : checkpoint.baseline;
              const equivalent = fullMarket && !exact ? auctionAppliedStatsKey(bare, checkpoint.baseline.engine) : undefined;
              const cached = exact ?? (equivalent ? checkpoint.simulationCache[equivalent] : undefined);
              if (cached && cached.engine === checkpoint.baseline.engine && Number.isFinite(cached.dps) && cached.dps >= 0 &&
                  Number.isFinite(cached.dpsError) && cached.dpsError >= 0 && cached.confidence === 95 && Number.isSafeInteger(cached.iterations) && cached.iterations > 0) {
                metricsFor(context.armory ?? context).cacheHit(); return { ...cached };
              }
            }
            return context.simulate(selected, simSignal, ownedChanges, fullMarket ? "certified-candidate" : undefined);
          },
          signal, shouldYield, state: entry.exhaustiveEnhancementState,
          onState: state => { entry.exhaustiveEnhancementState = state; scheduleAuctionGearSearchSave(entry); },
          onUpdate: publishEnhancement,
          onCacheHit: () => metricsFor(context.armory ?? context).cacheHit(),
        }));
        signal.throwIfAborted();
        // The helper returns its last callback snapshot only if no later slice
        // changed state. Other exits still require a durable publication. The
        // enclosing catch marks mutations from failed/aborted stage calls.
        if (enhanced.result !== lastPublishedEnhancement) await publishEnhancement(enhanced.result);
        if (!enhanced.result.complete) return published;
        if (enhanced.result.recommendations.length) {
          finalists.clear();
          for (const recommendation of auctionEnhancementScenarioFinalists(enhanced.result.recommendations, context.input.objective ?? "dps")) {
            const selected = recommendation.optionIds.map(id => byId.get(id));
            if (selected.every((option): option is AuctionGearOption => Boolean(option))) {
              const key = `enhanced-${recommendation.label}-${recommendation.configuration.key}`;
              finalists.set(key, customizedAuctionGearOptions(selected, recommendation.configuration));
              ownedByFinalist.set(key, ownedAuctionGearChanges(recommendation.configuration));
            }
          }
        }
        published = { ...published };
      // Legacy saved searches preserve their former bounded finalist behavior.
      } else if (context.input.enhancementMode !== "equipment" && [...finalists.values()].flat().some(option => option.candidate.variants.find(v => v.key === option.variantKey)?.resolution?.enhancements?.status === "verified")) {
        progress({ phase: "enhancements", completed: 0, total: 0 });
        const enhanced = await diagnostics.measureStage("enhancements", () => evaluateAuctionEnhancementStage({
          finalists: [...finalists].map(([label, selected]) => ({label, options:selected})),
          equipment: context.armory.equipment, loadout: context.loadout, specId: context.specId, level: context.character.level, professions: context.armory.professions, faction: context.character.faction?.type,
          region: context.character.region, engine: checkpoint.baseline.engine, profileFingerprint: context.profileFingerprint,
          encounter: {scenario:context.input.scenario,...context.encounter}, budgetCopper:context.input.budgetCopper,
          objective:context.input.objective ?? "dps", baseline:checkpoint.baseline, simulate:context.simulate,
          signal, shouldYield, state: entry.enhancementState ??= {checkpoints:{}},
          onCacheHit: () => metricsFor(context.armory ?? context).cacheHit(),
        })).finally(() => scheduleAuctionGearSearchSave(entry));
        signal.throwIfAborted();
        published = {...published, enhancementOptimization:enhanced};
        entry.latestAssemblyResult = published;
        await metricsFor(entry.context.armory ?? entry.context).measureStage("checkpoint", () => flushAuctionGearSearch(entry));
        signal.throwIfAborted();
        publishResult?.(published);
        if (!enhanced.complete) return published;
        if(enhanced.recommendations.length) {
          finalists.clear();
          for(const recommendation of auctionEnhancementScenarioFinalists(enhanced.recommendations, context.input.objective ?? "dps")) {
            const selected=recommendation.optionIds.map(id=>byId.get(id));
            if(selected.every((option): option is AuctionGearOption => Boolean(option)))
              finalists.set(`enhanced-${recommendation.label}`,customizedAuctionGearOptions(selected,recommendation.configuration));
          }
        } else {
          // Unpriced socket proposals are not scenario recommendations. Preserve
          // the already measured equipment sets and the three-candidate bound.
          finalists.clear();
          for (const [label, selected] of equipmentFinalists) finalists.set(label, selected);
        }
        // Further scenario work must not mutate the snapshot already published.
        published = {...published};
      }
      if (encounters.length && finalists.size) {
        progress({ phase: "scenarios", completed: 0, total: encounters.length });
        let yielded = false;
        const simulators = new Map<string, ReturnType<typeof createAuctionSimulator>>();
        published.scenarioComparisons = await diagnostics.measureStage("scenarios", () => evaluateAuctionGearScenarios([...finalists.keys()], encounters, signal,
          async (key, encounter, comparisonSignal) => {
            const identity = JSON.stringify(encounter);
            let simulate = simulators.get(identity);
            if (!simulate) {
              simulate = createAuctionSimulator({ armory: context.armory, loadout: context.loadout,
                specId: context.specId, specSlug: context.specSlug, scenario: encounter.scenario, encounter,
                market: context.market, engine: () => context.discovery?.engine ?? checkpoint.baseline.engine });
              simulators.set(identity, simulate);
            }
            const selected = key === null ? [] : finalists.get(key)!;
            const ownedChanges = key === null ? undefined : ownedByFinalist.get(key);
            const prepared = prepareGearLoadout({ selections: selected, equipment: context.armory.equipment, loadout: context.loadout, specId: context.specId });
            const cacheKey = `scenario:${checkpoint.baseline.engine}:${auctionGearMechanicalKey(context.profileFingerprint,
              { spec: context.specSlug, ...encounter, gearChanges: prepared.changes, ...(ownedChanges?.length ? {ownedChanges} : {}) })}`;
            const cache = entry.retainedSimulationCache ??= {};
            if (cache[cacheKey]) { metricsFor(context.armory ?? context).cacheHit(); return cache[cacheKey]; }
            const measurement = await simulate(selected, comparisonSignal, ownedChanges);
            comparisonSignal.throwIfAborted();
            cache[cacheKey] = measurement;
            // A baseline precedes another native request. A finalist goes
            // straight to onProgress, which commits its cache and row together.
            if (key === null) await diagnostics.measureStage("checkpoint", () => flushAuctionGearSearch(entry));
            else scheduleAuctionGearSearchSave(entry);
            return measurement;
          }, { shouldYield,
            onYield: () => { yielded = true; },
            onProgress: async rows => {
              progress({ phase: "scenarios", completed: rows.filter(row => row.candidates.length === finalists.size).length, total: encounters.length });
              // A separate immutable publication cannot acquire later rows by aliasing.
              const partial = withFreshEnhancementQuotes({ ...published, scenarioComparisons: rows, scenarioComparisonsComplete: false });
              entry.latestAssemblyResult = partial;
              await metricsFor(entry.context.armory ?? entry.context).measureStage("checkpoint", () => flushAuctionGearSearch(entry));
              signal.throwIfAborted();
              publishResult?.(partial);
            },
          }));
        published.scenarioComparisonsComplete = !yielded;
        published = withFreshEnhancementQuotes(published);
        signal.throwIfAborted();
        entry.latestAssemblyResult = published;
        scheduleAuctionGearSearchSave(entry);
      } else if (encounters.length) {
        published.scenarioComparisonsComplete = true;
        entry.latestAssemblyResult = published;
        scheduleAuctionGearSearchSave(entry);
      }
    }
    return published;
  } catch (error) {
    // Cached/incompatible traversal can mutate an existing cursor between
    // planner callbacks. Preserve that progress even if the next yield aborts.
    scheduleAuctionGearSearchSave(entry);
    throw error;
  } finally {
    try { await metricsFor(entry.context.armory ?? entry.context).measureStage("checkpoint", () => flushPendingAuctionGearSearch(entry)); } finally {
      entry.busy = false; finishStep(); logAuctionGearDiagnostics(diagnostics.snapshot());
    }
  }
}

/** Kept for trusted CLI checks; HTTP uses explicit search and assembly stages. */
export async function runAuctionGearPlanFromSnapshot(input: AuctionGearRunInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const context = await createAuctionGearContextFromSnapshot(input, character, armory, token, signal, progress);
  const started = Date.now();
  await advanceAuctionGearDiscovery(context.discovery, { locale: input.locale === "en" ? "en_US" : "ru_RU", region: character.region,
    equipment: context.armory?.equipment, token, spec: context.specSlug, characterLevel: character.level, selectedSlots: context.input.selectedSlots,
    context: context.discoveryContext, signal, shouldYield: () => Date.now() - started >= 90_000, onProgress: progress,
    measure: (stage, work) => metricsFor(context.armory ?? context).measureStage(stage, work) });
  context.options = auctionGearDiscoveryOptions(context.discovery);
  context.coverage = auctionGearDiscoveryCoverage(context.discovery);
  context.searchLimited = !context.coverage.discoveryComplete || !context.coverage.dataComplete;
  const plan = await planAuctionGear({ objective: input.objective, budgetCopper: input.budgetCopper, options: context.options,
    loadout: context.loadout, specId: context.specId, market: context.market, signal,
    simulate: context.simulate, onProgress: progress });
  const purchases = plan.purchases.map(purchase => ({ ...purchase, currentItem: context.currentBySlot.get(purchase.slotType) }));
  schedulePlannerItemIcons(purchases.flatMap(purchase => [purchase, ...(purchase.currentItem ? [purchase.currentItem] : [])]), character.region, token, signal);
  signal.throwIfAborted();
  return { ...plan, purchases, searchLimited: plan.searchLimited || context.searchLimited,
    market: context.publicMarket, profileFingerprint: context.profileFingerprint, scenario: input.scenario,
    coverage: context.coverage };
}

/** Explicit data allow-list: credentials and executable closures never reach disk. */
export function snapshotAuctionGearContext(context: AuctionGearContext) {
  return {
    input: context.input, character: context.character, armory: context.armory,
    loadout: context.loadout, specId: context.specId, specSlug: context.specSlug, market: context.market,
    currentBySlot: context.currentBySlot, discovery: context.discovery, discoverySeason: context.discoverySeason,
    encounter: context.encounter, coverage: context.coverage, searchLimited: context.searchLimited,
    publicMarket: context.publicMarket, profileFingerprint: context.profileFingerprint,
    scenario: context.scenario, marketChange: context.marketChange,
  };
}

export function restoreAuctionGearContext(data: ReturnType<typeof snapshotAuctionGearContext>): AuctionGearContext {
  if (!data || !data.input || !Array.isArray(data.loadout) ||
      !(data.currentBySlot instanceof Map) || !data.discovery || !(data.discovery.offers instanceof Map) ||
      !(data.discovery.queuedItems instanceof Set) || !data.discoverySeason || !data.encounter ||
      !data.character?.playableClass || !data.armory || !data.profileFingerprint) throw new Error("invalid_auction_checkpoint");
  const expectedEncounter = parseAuctionGearEncounter(data.input);
  parseAuctionGearEnhancementMode(data.input.enhancementMode);
  parseAuctionGearCompareScenarios(data.input.compareScenarios);
  if (data.encounter.fightLengthSeconds !== expectedEncounter.fightLengthSeconds || data.encounter.targets !== expectedEncounter.targets)
    throw new Error("invalid_auction_checkpoint");
  // A pre-v3 complete cursor can include former socket decoding rejections.
  // Rediscover the saved market rather than trust either accepted or rejected variants.
  const savedDiscovery = data.discovery;
  // Reopen a prior rejection only if this character actually has a control
  // for a retained offer. Unrelated long-running traversals keep their work.
  const retryEquippedReference = !savedDiscovery.equippedReferenceRevision && savedDiscovery.rejectedReferences?.size &&
    equippedAuctionReferences(data.armory.equipment).some(reference =>
      savedDiscovery.rejectedReferences.has(reference.offer.itemId) && savedDiscovery.offers.has(auctionVariantKey(reference.offer)));
  // Older ordinary searches admitted native-only skill requirements without checking ranks.
  const retryProfessionEquipment = !data.armory.professions && [...savedDiscovery.candidates.values()].some(candidates =>
    candidates.some(candidate => candidate.variants.some(variant => variant.resolution?.enhancements?.status === "verified" &&
      variant.resolution.enhancements.requiredProfessionId > 0)));
  // Earlier reports suppressed a real zero weapon minimum. A saved reference
  // could have passed without comparing weapon damage to the public preview.
  const retryWeaponReference = !savedDiscovery.weaponReferenceRevision && [...(savedDiscovery.verifiedReferences ?? [])]
    .some(id => savedDiscovery.references.get(id)?.weapon);
  const discovery = savedDiscovery.socketMetadataRevision === 3 && !retryEquippedReference && !retryProfessionEquipment && !retryWeaponReference ? savedDiscovery
    : createAuctionGearDiscovery({ ...data.market, offers: [...data.discovery.offers.values()].flat() }, data.input.budgetCopper);
  discovery.equippedReferenceRevision = 1;
  discovery.weaponReferenceRevision = 1;
  const coverage = discovery === data.discovery ? data.coverage
    : { ...auctionGearDiscoveryCoverage(discovery), discoveryComplete: false, dataComplete: false };
  const discoveryContext = (slotType: string) => ({
    classId: data.character.playableClass.id, specId: data.specId, characterLevel: data.character.level,
    raceId: data.character.playableRace.id, faction: data.character.faction.type, professions: data.armory.professions, slotType,
    currentItemLevel: 0, anchorItemClassId: -1, anchorItemSubclassId: -1, season: data.discoverySeason,
    acquisition: { type: "auction" as const, evidence: "auction" as const },
  });
  const simulate = createAuctionSimulator({ armory: data.armory, loadout: data.loadout,
    specId: data.specId, specSlug: data.specSlug, scenario: data.input.scenario, encounter: data.encounter,
    market: data.market, engine: () => discovery.engine, freshMetadata: false });
  return { ...data, discovery, coverage, searchLimited: !coverage.discoveryComplete || !coverage.dataComplete,
    options: auctionGearDiscoveryOptions(discovery), discoveryContext, simulate, engineVerificationRequired: true };
}

function createAuctionSimulator({ armory, loadout, specId, specSlug, scenario, encounter, market, engine, freshMetadata = true }: {
  armory: BattleNetSimulationSnapshot; loadout: GearLoadoutItem[]; specId: number; specSlug: string;
  scenario: GearSimulationScenario; encounter: { fightLengthSeconds: number; targets: number };
  market: Pick<AuctionSnapshot, "sourceUpdatedAt">; engine: () => string; freshMetadata?: boolean;
}) {
  // Discovery in a fresh context obtains current native metadata over HTTP.
  // Restored metadata is historical: one real native result must validate it.
  let verified = freshMetadata;
  const fingerprint = auctionGearProfileFingerprint(armory);
  const metrics = metricsFor(armory);
  const transport = createAuctionNativeTransport(metrics);
  const pending = new Set<{ engine: string; key: string; signal: AbortSignal; result: Promise<GearPlanSimulation> }>();
  const simulate = async (selections: AuctionGearOption[], simSignal: AbortSignal, ownedChanges?: readonly OwnedAuctionGearChange[], mode?: "finalist" | "certified-candidate"): Promise<GearPlanSimulation> => {
    assertFreshMarket(market);
    const prepared = prepareGearLoadout({ selections, equipment: armory.equipment, loadout, specId });
    const equipment = ownedChanges?.length ? applyOwnedAuctionGearChanges(prepared.equipment, ownedChanges) : prepared.equipment;
    const request = { spec: specSlug, scenario, ...encounter, ...(prepared.removedSlots?.length ? { removedSlots: prepared.removedSlots } : {}), ...(ownedChanges?.length ? { ownedChanges } : {}),
      ...(mode === "finalist" ? { precision: mode } : {}) };
    simSignal.throwIfAborted();
    const verifiedEngine = engine();
    const cacheKey = auctionGearMechanicalKey(fingerprint, request, { changes: prepared.changes, engine: verifiedEngine });
    const exact = verified ? auctionGearMechanicalCache.get(cacheKey, verifiedEngine) : undefined;
    let equivalentKey: string | undefined;
    if (mode === "certified-candidate" && selections.length) {
      const bare = selections.map(({ customization, ...option }) => option);
      const proof = auctionAppliedStatsKey(bare, verifiedEngine);
      if (proof) {
        // The proof checks item context against this engine. Keep the actual
        // enchant/gems and raw scaling modifiers on every enhanced piece.
        // serializeGearItem omits the validated reagent identifiers (38–51).
        const customized = prepared.changes.filter(change => change.enchantId || change.gemIds?.length)
          .map(change => [change.slot, change.itemId, change.bonusIds, change.enchantId, change.gemIds,
            change.modifiers?.filter(m => m.type < 38 || m.type > 51) ?? []]);
        equivalentKey = auctionGearMechanicalKey(fingerprint, { ...request, gearChanges: [{ appliedStats: proof }, ...customized] });
      }
    }
    if (exact && equivalentKey) auctionGearMechanicalCache.set(equivalentKey, exact);
    const cached = exact ?? (verified && equivalentKey ? auctionGearMechanicalCache.get(equivalentKey, verifiedEngine) : undefined);
    if (cached) { metrics.cacheHit(); return cached; }
    const shareKey = verified && verifiedEngine.startsWith("SimulationCraft") && mode !== "finalist"
      ? equivalentKey ?? cacheKey : undefined;
    if (shareKey) for (const entry of pending) {
      if (entry.key !== shareKey || entry.engine !== verifiedEngine || entry.signal !== simSignal) continue;
      const measured = await entry.result;
      simSignal.throwIfAborted();
      metrics.cacheHit();
      return { ...measured };
    }
    metrics.simulation();
    const measurement = metrics.measure("simulation", async () => {
      const base = { spec: specSlug, scenario, ...encounter, actionListMode: "native", talentLoadout: armory.activeTalentLoadout,
        armory: { profile: armory.profile, specializations: armory.specializations, equipment },
        precision: mode === "finalist" ? "auction-finalist" : "auction-candidate" };
      const ownedBatch = transport.ownedBatch && ownedChanges?.length
        ? { base: { ...base, armory: { ...base.armory, equipment: prepared.equipment } }, changes: ownedChanges }
        : undefined;
      // Profilesets inherit the first row's overrides. Each row in a group must
      // replace the same slots against the same armory (including off-hand removal).
      const batchEquipment = ownedBatch ? prepared.equipment : equipment;
      const group = transport.batchSize && (prepared.changes.length || ownedBatch)
        ? JSON.stringify([base.precision, batchEquipment === armory.equipment ? null : batchEquipment,
          prepared.changes.map(change => change.slot).sort(), ownedBatch?.changes.map(change => [change.slotType, change.itemId]).sort()])
        : undefined;
      const result = await transport.submit({base, changes: prepared.changes, group, ownedBatch, signal: simSignal});
      simSignal.throwIfAborted();
      const simulation = nativeGearSimulationMeasurement(result);
      if (engine() && simulation.engine !== engine() || shareKey && simulation.engine !== verifiedEngine)
        throw new Error("simulation_version_changed");
      auctionGearMechanicalCache.set(cacheKey, simulation);
      if (equivalentKey && simulation.engine === verifiedEngine) auctionGearMechanicalCache.set(equivalentKey, simulation);
      verified = true;
      return simulation;
    });
    // Start the native request immediately. Track at most one full two-lane
    // window, and only share work whose callers cancel together.
    if (!shareKey || pending.size >= 2 * Math.max(1, transport.batchSize)) return measurement;
    const entry = { engine: verifiedEngine, key: shareKey, signal: simSignal, result: measurement };
    pending.add(entry);
    try { return await measurement; }
    finally { pending.delete(entry); }
  };
  return Object.defineProperties(Object.assign(simulate, { concurrency: transport.concurrency, batchSize: 0, ownedBatch: false }), {
    batchSize: { get: () => transport.batchSize },
    ownedBatch: { get: () => transport.ownedBatch },
  });
}

type AuctionNativeBase = { precision: string; armory: object };
type AuctionNativeChanges = ReturnType<typeof prepareGearLoadout>["changes"];
type AuctionNativeJob = {
  base: AuctionNativeBase; changes: AuctionNativeChanges; group?: string; signal: AbortSignal;
  ownedBatch?: { base: AuctionNativeBase; changes: readonly OwnedAuctionGearChange[] };
  resolve: (result: unknown) => void; reject: (error: unknown) => void; checkGroupAbort?: () => void;
};

function createAuctionNativeTransport(metrics: ReturnType<typeof metricsFor>) {
  const worker = () => (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");
  const pending: AuctionNativeJob[] = [];
  const subscribers = new Map<AbortSignal, { jobs: Set<AuctionNativeJob>; abort: () => void }>();
  let ownedBatch = false;
  let capacity: 1 | 2 = 1, batchSize = 0, active = 0, activeCandidates = 0, scheduled = false;

  function schedule() {
    if (scheduled || !pending.length || active >= capacity) return;
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      while (active < capacity && pending.length) {
        const first = pending.shift()!;
        const jobs = [first];
        if (batchSize && first.group && (!first.ownedBatch || ownedBatch)) {
          const compatible = pending.filter(job => job.group === first.group);
          // Leave work for the other native lane when both would draw from
          // this group. An already busy lane contributes its outstanding rows.
          const limit = compatible.length === pending.length
            ? Math.ceil((1 + compatible.length + activeCandidates) / capacity) : batchSize;
          for (const job of compatible.slice(0, Math.min(batchSize, limit) - 1)) {
            jobs.push(job);
            pending.splice(pending.indexOf(job), 1);
          }
        }
        dispatch(jobs);
      }
    });
  }

  function dispatch(jobs: AuctionNativeJob[]) {
    active++;
    activeCandidates += jobs.length;
    void send(jobs).catch(error => {
      for (const job of jobs) job.reject(error);
    }).finally(() => {
      active--;
      activeCandidates -= jobs.length;
      schedule();
    });
  }

  async function send(jobs: AuctionNativeJob[]) {
    const first = jobs[0], batch = jobs.length > 1;
    let requestSignal = first.signal;
    if (batch && jobs.some(job => job.signal !== first.signal)) {
      const controller = new AbortController();
      requestSignal = controller.signal;
      for (const job of jobs) job.checkGroupAbort = () => {
        if (jobs.every(entry => entry.signal.aborted)) controller.abort(job.signal.reason);
      };
    }
    const singleTimeout = first.base.precision === "auction-finalist" ? 190_000 : 50_000;
    const response = await fetch(worker() + "/v1/wow/rotation/simulations" + (batch ? "/batch" : ""), {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, cache: "no-store",
      signal: AbortSignal.any([requestSignal, AbortSignal.timeout(batch ? Math.min(190_000, jobs.length * singleTimeout) : singleTimeout)]),
      body: JSON.stringify(batch ? { base: first.ownedBatch?.base ?? first.base, candidates: jobs.map(job => ({
        gearChanges: job.changes, ...(job.ownedBatch ? {ownedChanges: job.ownedBatch.changes} : {}) })) }
        : { ...first.base, ...(first.changes.length ? { gearChanges: first.changes } : {}) }),
    });
    metrics.workerTiming(response.headers.get("server-timing"));
    if (batch && [404, 405, 501].includes(response.status)) {
      // The advertised worker may have been rolled back between health and POST.
      capacity = 1;
      batchSize = 0;
      ownedBatch = false;
      for (const job of jobs) job.checkGroupAbort = undefined;
      pending.unshift(...jobs.filter(job => !job.signal.aborted));
      await response.body?.cancel();
      return;
    }
    if (batch && first.ownedBatch) {
      // Exact singles carry the complete patched armory. A legacy worker can
      // reject an unfamiliar field or silently ignore it, so require the echo
      // before accepting a result from the extended contract.
      const legacy = response.ok && response.headers.get("x-gildra-simulation-owned-batch") !== "1";
      const code = [400, 422].includes(response.status) ? (await response.json().catch(() => null))?.code : undefined;
      if (legacy || code === "invalid_request" || code === "unsupported_owned_batch") {
        if (legacy || code === "invalid_request") ownedBatch = false;
        for (const job of jobs) { job.group = undefined; job.checkGroupAbort = undefined; }
        pending.unshift(...jobs.filter(job => !job.signal.aborted));
        if (!response.bodyUsed) await response.body?.cancel();
        return;
      }
    }
    if (!response.ok || response.headers.get("x-gildra-engine") !== "simulationcraft") throw new Error("simulation_unavailable");
    const payload = await response.json();
    const results = batch ? payload?.results : [payload];
    if (!Array.isArray(results) || results.length !== jobs.length) throw new Error("invalid_simulation_result");
    jobs.forEach((job, index) => job.resolve(results[index]));
  }

  function subscribe(job: AuctionNativeJob) {
    const signal = job.signal;
    let subscription = subscribers.get(signal);
    if (!subscription) {
      const jobs = new Set<AuctionNativeJob>();
      const abort = () => {
        for (const entry of jobs) {
          const index = pending.indexOf(entry);
          if (index >= 0) pending.splice(index, 1);
          entry.checkGroupAbort?.();
          entry.reject(signal.reason);
        }
      };
      subscription = { jobs, abort };
      subscribers.set(signal, subscription);
      signal.addEventListener("abort", abort, { once: true });
    }
    const { jobs, abort } = subscription;
    jobs.add(job);
    return () => {
      jobs.delete(job);
      if (!jobs.size) {
        signal.removeEventListener("abort", abort);
        subscribers.delete(signal);
      }
    };
  }

  function submit(input: Pick<AuctionNativeJob, "base" | "changes" | "group" | "signal" | "ownedBatch">) {
    input.signal.throwIfAborted();
    let unsubscribe: () => void;
    return new Promise<unknown>((resolve, reject) => {
      const job: AuctionNativeJob = { ...input, resolve, reject };
      unsubscribe = subscribe(job);
      if (!active && !pending.length) dispatch([job]);
      else { pending.push(job); schedule(); }
    }).finally(() => unsubscribe());
  }

  // Capacity belongs to the current worker process. Recheck between turns
  // so a running search can survive a deployment or rollback.
  async function concurrency(signal: AbortSignal): Promise<1 | 2> {
    signal.throwIfAborted();
    try {
      const response = await fetch(worker() + "/healthz", {
        cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(2_000)]),
      });
      const permits = response.ok && response.headers.get("x-gildra-simulation-concurrency") === "2" ? 2 : 1;
      const advertised = response.headers.get("x-gildra-simulation-batch") ?? "";
      await response.body?.cancel();
      signal.throwIfAborted();
      capacity = permits;
      batchSize = permits === 2 && /^\d+$/.test(advertised) && Number(advertised) >= 2 ? Math.min(25, Number(advertised)) : 0;
      ownedBatch = batchSize > 0 && response.headers.get("x-gildra-simulation-owned-batch") === "1";
      schedule();
      return capacity;
    } catch {
      signal.throwIfAborted();
      capacity = 1;
      batchSize = 0;
      ownedBatch = false;
      return capacity;
    }
  }
  return { submit, concurrency, get batchSize() { return batchSize; }, get ownedBatch() { return ownedBatch; } };
}
