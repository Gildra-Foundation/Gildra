import "server-only";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { getBattleNetCharacterBySlug, type BattleNetCharacter } from "./battleNetCharacters";
import { getBattleNetSimulationSnapshot, type BattleNetSimulationSnapshot } from "./battleNetCharacterDetails";
import { auctionGearProfileFingerprint } from "./auctionGearFingerprint";
import { getCharacterAuctionMarket } from "./auctionMarketProvider";
import { assertFreshMarket } from "./auctionMarket";
import { auctionVariantKey, validAuctionWeapon } from "./auctionItemVariant";
import { addPlannerItemIcons } from "./gearPlannerMedia";
import { getAuctionEquippedPresentation } from "./auctionGearEquipment";
import { auctionGearSlots, parseAuctionGearSlots, type AuctionGearSlot } from "./auctionGearSelection";
import { currentGearSeason, lookupGearEntities } from "./gearCandidateRepository";
import { catalogLoadoutItem, gearSlotCategoryPaths } from "./gearCandidates";
import { prepareGearLoadout, type GearSimulationScenario } from "./gearSimulation";
import { planAuctionGear, searchAuctionGearOptions, assembleAuctionGear, captureAuctionGearIncumbents, type AuctionEquippedItem, type AuctionGearOption, type AuctionPlanProgress, type GearPlanSimulation } from "./auctionGearPlanner";
import type { AuctionGearSearchResult, AuctionGearAssemblyResult } from "./auctionGearTypes";
import { createAuctionGearSearch, deleteAuctionGearSearch, touchAuctionGearSearch, type AuctionGearSearchEntry } from "./auctionGearSearchStore";
import type { GearLoadoutItem } from "./gearCompatibility";
import type { AuctionSnapshot } from "./auctionMarket";
import { createAuctionGearDiscovery, advanceAuctionGearDiscovery, refreshAuctionGearDiscovery, auctionGearDiscoveryCoverage, auctionGearDiscoveryOptions } from "./auctionGearDiscovery";
export type AuctionGearRunInput = {
  characterSlug: string;
  budgetCopper: number;
  scenario: GearSimulationScenario;
  locale: "ru" | "en";
  selectedSlots?: AuctionGearSlot[];
};
export type AuctionGearRunMetadata = { market: AuctionGearContext["publicMarket"]; profileFingerprint: string; scenario: GearSimulationScenario; coverage: AuctionGearContext["coverage"] };
export type AuctionGearRunResult = (AuctionGearSearchResult | AuctionGearAssemblyResult) & AuctionGearRunMetadata;
export async function runAuctionGearPlan(input: AuctionGearRunInput, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const check = () => signal.throwIfAborted();
  check();
  progress({
    phase: "market",
    completed: 0,
    total: 1
  });
  const character = await getBattleNetCharacterBySlug(token, input.locale, input.characterSlug, signal);
  if (!character) throw new Error("character_not_found");
  const armory = await getBattleNetSimulationSnapshot(token, character, signal);
  return runAuctionGearPlanFromSnapshot(input, character, armory, token, signal, progress);
}

/** Internal runner for a trusted snapshot. HTTP entry points must resolve ownership first. */
export async function createAuctionGearContextFromSnapshot(input: AuctionGearRunInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const check = () => signal.throwIfAborted();
  check();
  const theme = talentSpecThemes.find(t => t.classId === character.playableClass.id && t.specId === armory.activeSpecializationId);
  if (!theme) throw new Error("specialization_unresolved");
  if (!["melee", "ranged"].includes(theme.role)) throw new Error("damage_specialization_required");
  const market = await getCharacterAuctionMarket(character, token, { signal });
  const selectedSlots = parseAuctionGearSlots(input.selectedSlots ?? [...auctionGearSlots]);
  const localizedEquipped = await getAuctionEquippedPresentation({ character, equipment: armory.equipment, locale: input.locale, token, signal });
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
  const baselineEntities = await lookupGearEntities(equipped.map(i => i.item!.id!), locale);
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
    raceId: character.playableRace.id, faction: character.faction.type, slotType,
    currentItemLevel: 0, anchorItemClassId: -1, anchorItemSubclassId: -1, season,
    acquisition: { type: "auction" as const, evidence: "auction" as const },
  });
  const preset = await getRotationPreset(theme.slug, input.locale);
  check();
  if (!preset.defaultRules.length) throw new Error("rotation_unavailable");
  const encounter = input.scenario === "aoe" ? { fightLengthSeconds: 60, targets: 5 }
    : input.scenario === "execute" ? { fightLengthSeconds: 90, targets: 1 } : { fightLengthSeconds: 120, targets: 1 };
  const retainedMarket = { ...market, offers: [] };
  const simulate = createAuctionSimulator({ armory, loadout, specId: theme.specId, specSlug: theme.slug,
    scenario: input.scenario, encounter, rules: preset.defaultRules, market: retainedMarket, engine: () => discovery.engine });
  await addPlannerItemIcons([...currentBySlot.values()], character.region, token, signal);
  check();
  const coverage = auctionGearDiscoveryCoverage(discovery);
  return {
    input: { ...input, selectedSlots }, character, armory, options: [] as AuctionGearOption[], loadout,
    specId: theme.specId, specSlug: theme.slug, market: retainedMarket, currentBySlot, simulate,
    discovery, discoveryContext, coverage, searchLimited: true,
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
    profileFingerprint: context.profileFingerprint, scenario: context.input.scenario, coverage: context.coverage };
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
  entry.allowedKey = undefined;
}

const auctionFactsKey = (options: AuctionGearOption[]) => JSON.stringify(options.map(option =>
  [option.id, option.auctionId, option.costCopper, option.quantity, option.variantKey]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

function synchronizeAuctionOptions(entry: AuctionGearSearchEntry, options: AuctionGearOption[]) {
  const context = entry.context;
  entry.knownOptionIds ??= new Set(context.options.map(option => option.id));
  for (const option of options) entry.knownOptionIds.add(option.id);
  if (auctionFactsKey(context.options) !== auctionFactsKey(options)) invalidateAuctionCursors(entry);
  context.options = options;
  if (context.discovery) {
    context.coverage = auctionGearDiscoveryCoverage(context.discovery);
    context.searchLimited = !context.coverage.discoveryComplete || !context.coverage.dataComplete;
    context.publicMarket.discoveredSnapshotId = context.discovery.discoveredSnapshotId;
  }
}

async function discoverAuctionOptions(entry: AuctionGearSearchEntry, token: string | undefined, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, shouldYield: () => boolean, maxSteps = 12) {
  const context = entry.context;
  if (!context.discovery) return; // Backward-compatible trusted in-memory fixtures.
  if (!context.coverage.discoveryComplete) {
    if (!token) throw new Error("auction_discovery_authorization_required");
    await advanceAuctionGearDiscovery(context.discovery, { locale: context.input.locale === "en" ? "en_US" : "ru_RU",
      region: context.character.region, token, spec: context.specSlug, characterLevel: context.character.level,
      selectedSlots: context.input.selectedSlots, context: context.discoveryContext, signal, shouldYield, maxSteps, onProgress: progress });
  }
  if (context.discovery.engine && entry.retainedBaseline && context.discovery.engine !== entry.retainedBaseline.engine) throw new Error("simulation_version_changed");
  const options = auctionGearDiscoveryOptions(context.discovery);
  const media = [...new Map(options.filter(option => !option.candidate.iconUrl).map(option => [option.candidate.itemId,
    { itemId: option.candidate.itemId, name: option.candidate.name, iconUrl: option.candidate.iconUrl }])).values()];
  if (media.length && token && !shouldYield()) {
    await addPlannerItemIcons(media, context.character.region, token, signal);
    const icons = new Map(media.map(item => [item.itemId, item.iconUrl]));
    for (const option of options) option.candidate.iconUrl ||= icons.get(option.candidate.itemId);
  }
  synchronizeAuctionOptions(entry, options);
}

async function updateAuctionSearchResult(entry: AuctionGearSearchEntry, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, shouldYield: () => boolean) {
  const context = entry.context;
  const cache = retainAuctionSimulations(entry);
  if (entry.searchCheckpoint) Object.assign(entry.searchCheckpoint.simulationCache, cache);
  const { result, checkpoint } = await searchAuctionGearOptions({
    searchId: entry.id, budgetCopper: context.input.budgetCopper, options: context.options,
    selectedSlots: context.input.selectedSlots, loadout: context.loadout, specId: context.specId,
    market: context.market, signal, simulate: context.simulate, checkpoint: entry.searchCheckpoint,
    baseline: entry.retainedBaseline, simulationCache: cache, shouldYield, onProgress: progress,
    onCheckpoint: state => { entry.searchCheckpoint = state; touchAuctionGearSearch(entry); },
  });
  entry.searchCheckpoint = checkpoint;
  entry.retainedBaseline = checkpoint.baseline;
  entry.retainedSimulationCache = checkpoint.simulationCache;
  const discoveryComplete = context.discovery ? context.coverage.discoveryComplete : true;
  const dataComplete = context.discovery ? context.coverage.dataComplete : !context.searchLimited;
  entry.latestSearchResult = publicAuctionResult(context, { ...result, discoveryComplete, dataComplete,
    searchComplete: result.pendingItems === 0 && discoveryComplete, searchLimited: result.searchLimited || context.searchLimited,
    items: result.items.map(item => ({ ...item, currentItem: context.currentBySlot.get(item.slotType) })) });
  touchAuctionGearSearch(entry);
  return entry.latestSearchResult;
}
export async function startAuctionGearSearch(input: AuctionGearRunInput, owner: string, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  progress({ phase: "market", completed: 0, total: 1 });
  const character = await getBattleNetCharacterBySlug(token, input.locale, input.characterSlug, signal);
  if (!character) throw new Error("character_not_found");
  const armory = await getBattleNetSimulationSnapshot(token, character, signal);
  return startAuctionGearSearchFromSnapshot(input, character, armory, owner, token, signal, progress);
}

/** Trusted developer QA entry point. The HTTP route never accepts a snapshot. */
export async function startAuctionGearSearchFromSnapshot(input: AuctionGearRunInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot, owner: string, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const context = await createAuctionGearContextFromSnapshot(input, character, armory, token, signal, progress);
  signal.throwIfAborted();
  const entry = createAuctionGearSearch(owner, context);
  try {
    return await continueAuctionGearSearch(entry, signal, progress, token);
  } catch (error) {
    if (!entry.latestSearchResult) deleteAuctionGearSearch(owner, entry.id);
    throw error;
  }
}

export async function continueAuctionGearSearch(entry: AuctionGearSearchEntry, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, token?: string) {
  const started = Date.now(), shouldYield = () => Date.now() - started >= 90_000;
  entry.busy = true;
  try {
    await discoverAuctionOptions(entry, token, signal, progress, shouldYield);
    return publicAuctionResult(entry.context, await updateAuctionSearchResult(entry, signal, progress, shouldYield));
  } finally { entry.busy = false; }
}
/** Refresh actual character and lot facts without trusting client prices/stats. */
export async function verifyAuctionGearSearch(entry: AuctionGearSearchEntry, token: string, signal: AbortSignal, verifyOwnership = true) {
  const context = entry.context;
  signal.throwIfAborted();
  if (verifyOwnership) {
    const owned = await getBattleNetCharacterBySlug(token, context.input.locale, context.input.characterSlug, signal);
    if (!owned || owned.id !== context.character.id || owned.realm.slug !== context.character.realm.slug || owned.region !== context.character.region) throw new Error("character_not_found");
  }
  const current = await getBattleNetSimulationSnapshot(token, context.character, signal);
  signal.throwIfAborted();
  if (auctionGearProfileFingerprint(current) !== context.profileFingerprint) throw new Error("character_snapshot_changed");
  const market = await getCharacterAuctionMarket(context.character, token, { refresh: true, signal });
  signal.throwIfAborted();
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
    refreshAuctionGearDiscovery(context.discovery, market);
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
  touchAuctionGearSearch(entry);
}

export type AuctionGearAssemblySelection = { excludedOptionIds: string[] } | string[] | undefined;
export function selectedAuctionGearAssemblyOptions(entry: AuctionGearSearchEntry, value: unknown): AuctionGearOption[] {
  const exclusion = value !== undefined && !Array.isArray(value);
  if (exclusion && (!value || typeof value !== "object" || Object.keys(value).length !== 1 || !("excludedOptionIds" in value))) throw new Error("invalid_auction_selection");
  const ids = exclusion ? (value as { excludedOptionIds: unknown }).excludedOptionIds : value;
  if (exclusion && !Array.isArray(ids)) throw new Error("invalid_auction_selection");
  const known = entry.knownOptionIds ?? new Set(entry.context.options.map(option => option.id));
  if (ids !== undefined && (!Array.isArray(ids) || (!exclusion && !ids.length) || ids.length > known.size ||
      ids.some(id => typeof id !== "string" || id.length > 180 || !known.has(id)) || new Set(ids).size !== ids.length)) throw new Error("invalid_auction_selection");
  const selected = new Set(ids as string[] | undefined);
  return entry.context.options.filter(option => ids === undefined || (exclusion ? !selected.has(option.id) : selected.has(option.id)));
}

export function selectedAuctionGearOptions(entry: AuctionGearSearchEntry, value: unknown) {
  if (!Array.isArray(value)) throw new Error("invalid_auction_selection");
  return selectedAuctionGearAssemblyOptions(entry, value);
}

export async function assembleAuctionGearSearch(entry: AuctionGearSearchEntry, selection: unknown, signal: AbortSignal,
  progress: (p: AuctionPlanProgress) => void, token?: string) {
  const context = entry.context, started = Date.now(), shouldYield = () => Date.now() - started >= 90_000;
  if (!entry.latestSearchResult || !(entry.retainedBaseline ?? entry.searchCheckpoint?.baseline)) throw new Error("search_not_ready");
  selectedAuctionGearAssemblyOptions(entry, selection);
  entry.busy = true;
  try {
    // Discovery also advances during assembly; its finite batch never declares
    // the current sub-pool a market-wide maximum while unvisited variants remain.
    await discoverAuctionOptions(entry, token, signal, progress, shouldYield, 4);
    const options = selectedAuctionGearAssemblyOptions(entry, selection);
    const allowedKey = auctionFactsKey(options);
    if (entry.allowedKey !== allowedKey) {
      retainAuctionSimulations(entry);
      retainAuctionIncumbents(entry);
      entry.assemblyCheckpoint = undefined;
      entry.allowedKey = allowedKey;
    }
    const { result, checkpoint } = await assembleAuctionGear({
      searchId: entry.id, budgetCopper: context.input.budgetCopper, options,
      selectedSlots: context.input.selectedSlots, loadout: context.loadout, specId: context.specId,
      market: context.market, signal, simulate: context.simulate, checkpoint: entry.assemblyCheckpoint,
      baseline: entry.retainedBaseline ?? entry.searchCheckpoint?.baseline, simulationCache: retainAuctionSimulations(entry),
      incumbents: entry.retainedIncumbents,
      shouldYield, onProgress: progress,
      onCheckpoint: state => { entry.assemblyCheckpoint = state; touchAuctionGearSearch(entry); },
    });
    entry.assemblyCheckpoint = checkpoint;
    entry.retainedSimulationCache = checkpoint.simulationCache;
    const updatedSearch = await updateAuctionSearchResult(entry, signal, progress, () => true);
    touchAuctionGearSearch(entry);
    const present = (purchase: AuctionGearAssemblyResult["purchases"][number]) => ({ ...purchase,
      currentItem: context.currentBySlot.get(purchase.slotType) });
    const published = publicAuctionResult(context, { ...result, updatedSearch, marketChange: context.marketChange,
      purchases: result.purchases.map(present),
      bestConfirmed: result.bestConfirmed ? { ...result.bestConfirmed, purchases: result.bestConfirmed.purchases.map(present) } : null });
    entry.latestAssemblyResult = published;
    return published;
  } finally { entry.busy = false; }
}

/** Kept for trusted CLI checks; HTTP uses explicit search and assembly stages. */
export async function runAuctionGearPlanFromSnapshot(input: AuctionGearRunInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const context = await createAuctionGearContextFromSnapshot(input, character, armory, token, signal, progress);
  const started = Date.now();
  await advanceAuctionGearDiscovery(context.discovery, { locale: input.locale === "en" ? "en_US" : "ru_RU", region: character.region,
    token, spec: context.specSlug, characterLevel: character.level, selectedSlots: context.input.selectedSlots,
    context: context.discoveryContext, signal, shouldYield: () => Date.now() - started >= 90_000, onProgress: progress });
  context.options = auctionGearDiscoveryOptions(context.discovery);
  context.coverage = auctionGearDiscoveryCoverage(context.discovery);
  context.searchLimited = !context.coverage.discoveryComplete || !context.coverage.dataComplete;
  const plan = await planAuctionGear({ budgetCopper: input.budgetCopper, options: context.options,
    loadout: context.loadout, specId: context.specId, market: context.market, signal,
    simulate: context.simulate, onProgress: progress });
  const purchases = plan.purchases.map(purchase => ({ ...purchase, currentItem: context.currentBySlot.get(purchase.slotType) }));
  await addPlannerItemIcons(purchases.flatMap(purchase => [purchase, ...(purchase.currentItem ? [purchase.currentItem] : [])]), character.region, token, signal);
  signal.throwIfAborted();
  return { ...plan, purchases, searchLimited: plan.searchLimited || context.searchLimited,
    market: context.publicMarket, profileFingerprint: context.profileFingerprint, scenario: input.scenario,
    coverage: context.coverage };
}

function createAuctionSimulator({ armory, loadout, specId, specSlug, scenario, encounter, rules, market, engine }: {
  armory: BattleNetSimulationSnapshot; loadout: GearLoadoutItem[]; specId: number; specSlug: string;
  scenario: GearSimulationScenario; encounter: { fightLengthSeconds: number; targets: number };
  rules: string[]; market: Pick<AuctionSnapshot, "sourceUpdatedAt">; engine: () => string;
}) {
  return async (selections: AuctionGearOption[], simSignal: AbortSignal): Promise<GearPlanSimulation> => {
      assertFreshMarket(market);
      const prepared = prepareGearLoadout({
        selections,
        equipment: armory.equipment,
        loadout,
        specId: specId
      });
      const response = await fetch(`${(process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "")}/v1/wow/rotation/simulations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        cache: "no-store",
        signal: AbortSignal.any([simSignal, AbortSignal.timeout(50_000)]),
        body: JSON.stringify({
          spec: specSlug,
          scenario: scenario,
          ...encounter,
          rules: rules,
          talentLoadout: armory.activeTalentLoadout,
          armory: {
            profile: armory.profile,
            specializations: armory.specializations,
            equipment: prepared.equipment
          },
          ...(prepared.changes.length ? {
            gearChanges: prepared.changes
          } : {})
        })
      });
      if (!response.ok || response.headers.get("x-gildra-engine") !== "simulationcraft") throw new Error("simulation_unavailable");
      const result = (await response.json()) as GearPlanSimulation;
      if (!Number.isFinite(result.dpsError) || !Number.isFinite(result.confidence) || result.confidence !== 95) throw new Error("invalid_simulation_result");
      if (engine() && result.engine !== engine()) throw new Error("simulation_version_changed");
      return { dps: result.dps, dpsError: result.dpsError, confidence: result.confidence,
        iterations: result.iterations, engine: result.engine };
    };
}
