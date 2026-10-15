import "server-only";
import { createHash } from "node:crypto";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { getBattleNetCharacterBySlug, type BattleNetCharacter } from "./battleNetCharacters";
import { getBattleNetSimulationSnapshot, type BattleNetSimulationSnapshot } from "./battleNetCharacterDetails";
import { getCharacterAuctionMarket } from "./auctionMarketProvider";
import { assertFreshMarket } from "./auctionMarket";
import { auctionVariantKey, resolvedAuctionVariant } from "./auctionItemVariant";
import { supportedAuctionModifiers } from "./gearItemModifiers";
import { resolveAuctionVariants } from "./auctionVariantResolver";
import { getAuctionItemReferences, nativeMatchesItemReference } from "./auctionItemReference";
import { addPlannerItemIcons } from "./gearPlannerMedia";
import { getAuctionEquippedPresentation } from "./auctionGearEquipment";
import { auctionGearSlots, parseAuctionGearSlots, type AuctionGearSlot } from "./auctionGearSelection";
import { currentGearSeason, gearEntityDetails, lookupGearEntities, lookupGearRecords } from "./gearCandidateRepository";
import { catalogLoadoutItem, gearSlotCategoryPaths, normalizeGearCandidate } from "./gearCandidates";
import { prepareGearLoadout, type GearSimulationScenario } from "./gearSimulation";
import { planAuctionGear, searchAuctionGearOptions, assembleAuctionGear, type AuctionEquippedItem, type AuctionGearOption, type AuctionPlanProgress, type GearPlanSimulation } from "./auctionGearPlanner";
import type { AuctionGearSearchResult, AuctionGearAssemblyResult } from "./auctionGearTypes";
import { createAuctionGearSearch, deleteAuctionGearSearch, touchAuctionGearSearch, type AuctionGearSearchEntry } from "./auctionGearSearchStore";
import type { GearLoadoutItem } from "./gearCompatibility";
import type { AuctionSnapshot } from "./auctionMarket";
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
  const market = await getCharacterAuctionMarket(character, token);
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
    currentBySlot.set(item.slot!.type!, {
      itemId: item.item!.id!, name: localizedEquipped.get(item.slot!.type!)?.name || item.name || entity.name, slotType: item.slot!.type!,
      iconUrl: entity.iconUrl, quality: qualityIds[item.quality?.type ?? ""] ?? entity.quality,
      ...(Number.isInteger(item.level?.value) ? { itemLevel: Number(item.level!.value) } : {}),
      ...(Number.isInteger(item.requirements?.level?.value) ? { requiredLevel: Number(item.requirements!.level!.value) } : {}),
      ...(Object.keys(stats).length ? { stats } : {}),
      effects: localizedEquipped.get(item.slot!.type!)?.effects ?? [],
    });
    return catalogLoadoutItem(entity, item.slot!.type!);
  });
  const affordable = market.offers.filter(o => o.buyoutCopper <= input.budgetCopper);
  const supported = affordable.filter(o => supportedAuctionModifiers(o.modifiers));
  const ids = [...new Set([...supported].sort((a, b) => a.buyoutCopper - b.buyoutCopper || a.auctionId - b.auctionId).map(o => o.itemId))];
  const scannedIds = ids.slice(0, 6000);
  progress({
    phase: "catalog",
    completed: 0,
    total: scannedIds.length
  });
  const records = (await Promise.all([2, 4].map(c => lookupGearRecords(scannedIds, locale, c, character.level)))).flat();
  check();
  // Alternate cheap and high-level catalog items. The engine resolves their
  // actual levels below; catalog base ilvl is only a bounded search seed.
  const byId = new Map(records.map(r => [r.externalId, r]));
  const cheap = ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const high = [...records].sort((a, b) => (b.itemLevel ?? 0) - (a.itemLevel ?? 0) || a.externalId - b.externalId);
  const selectedMap = new Map<string, typeof records[number]>();
  for (let i = 0; i < Math.max(cheap.length, high.length) && selectedMap.size < 240; i++) for (const record of [cheap[i], high[i]]) if (record && selectedMap.size < 240) selectedMap.set(record.id, record);
  const entities = await gearEntityDetails([...selectedMap.values()], locale, false);
  check();
  const offersByItem = new Map<number, typeof supported>();
  for (const offer of supported) {
    const list = offersByItem.get(offer.itemId) ?? [];
    list.push(offer);
    offersByItem.set(offer.itemId, list);
  }
  const season = currentGearSeason();
  const context = (slotType: string) => ({
    classId: character.playableClass.id,
    specId: theme.specId,
    characterLevel: character.level,
    raceId: character.playableRace.id,
    faction: character.faction.type,
    slotType,
    currentItemLevel: 0,
    anchorItemClassId: -1,
    anchorItemSubclassId: -1,
    season,
    acquisition: {
      type: "auction" as const,
      evidence: "auction" as const
    }
  });
  const withVariant = (entity: typeof entities[number], offer: typeof supported[number], requiredLevel: number, itemLevel: number) => ({
    ...entity,
    tooltip: {
      blocks: [...(entity.tooltip?.blocks ?? []).filter(b => b.type !== "item_variants" && b.type !== "item_requirements"), {
        ...entity.tooltip?.blocks?.find(b => b.type === "item_requirements"),
        type: "item_requirements",
        required_level: requiredLevel
      }, {
        type: "item_variants",
        entries: [{
          key: auctionVariantKey(offer),
          item_level: itemLevel,
          context_id: offer.contextId,
          bonus_list_ids: offer.bonusIds,
          modifiers: offer.modifiers
        }]
      }]
    }
  });
  const probes = new Map<string, {
    offer: typeof supported[number];
    entity: typeof entities[number];
    slot: string;
  }>();
  const pools = entities.map(entity => [...new Map((offersByItem.get(entity.externalId) ?? []).sort((a, b) => a.buyoutCopper - b.buyoutCopper).map(o => [auctionVariantKey(o), o])).values()]);
  let variantSearchLimited = false;
  for (let depth = 0; depth < 3; depth++) for (let index = 0; index < entities.length; index++) {
    const entity = entities[index],
      offer = pools[index][depth];
    if (!offer) continue;
    const synthetic = withVariant(entity, offer, 0, 1);
    const slot = selectedSlots.find(slot => normalizeGearCandidate(synthetic, context(slot)).eligible);
    if (!slot) continue;
    if (probes.size >= 256) {
      variantSearchLimited = true;
      continue;
    }
    const simcSlot: Record<string, string> = {
      FINGER_1: "finger1",
      FINGER_2: "finger2",
      TRINKET_1: "trinket1",
      TRINKET_2: "trinket2"
    };
    probes.set(auctionVariantKey(offer), {
      offer,
      entity,
      slot: simcSlot[slot] ?? slot.toLowerCase()
    });
  }
  if (pools.some(pool => pool.length > 3)) variantSearchLimited = true;
  progress({
    phase: "variants",
    completed: 0,
    total: probes.size
  });
  const references = await getAuctionItemReferences([...new Set([...probes.values()].map(p => p.offer.itemId))], character.region, token, signal);
  const referenceProbes = [...references.values()].map(reference => ({
    offer: reference.offer,
    slot: [...probes.values()].find(p => p.offer.itemId === reference.offer.itemId)!.slot
  }));
  const resolution = await resolveAuctionVariants({
    offers: [...referenceProbes, ...probes.values()],
    spec: theme.slug,
    characterLevel: character.level,
    signal,
    onProgress: (completed, total) => progress({
      phase: "variants",
      completed,
      total
    })
  });
  check();
  const options: AuctionGearOption[] = [],
    matched = new Set<number>();
  let unresolvedVariants = 0;
  const referenceVerified = new Set([...references].filter(([, ref]) => nativeMatchesItemReference(ref, resolution.variants.get(auctionVariantKey(ref.offer)))).map(([id]) => id));
  for (const [key, probe] of probes) {
    const metadata = resolution.variants.get(key);
    if (!metadata || metadata.error || !referenceVerified.has(probe.offer.itemId) || metadata.itemLevel > 1000 || metadata.requiredLevel === 0 && (references.get(probe.offer.itemId)?.requiredLevel ?? 0) > 0) {
      unresolvedVariants++;
      continue;
    }
    if (metadata.requiredLevel > character.level) continue;
    const variant = resolvedAuctionVariant(probe.offer, metadata, resolution.engine);
    const entity = withVariant(probe.entity, probe.offer, metadata.requiredLevel, metadata.itemLevel);
    // The published registry and native database must agree about equip type.
    const registry = normalizeGearCandidate(entity, context(Object.keys(gearSlotCategoryPaths).find(s => s.toLowerCase() === probe.slot) ?? "FINGER_1"));
    if (registry.itemClassId !== metadata.itemClassId || registry.itemSubclassId !== metadata.itemSubclassId || registry.inventoryType !== metadata.inventoryType) {
      unresolvedVariants++;
      continue;
    }
    for (const slotType of selectedSlots) {
      const candidate = normalizeGearCandidate(entity, context(slotType));
      if (!candidate.eligible) continue;
      candidate.itemLevel = metadata.itemLevel;
      candidate.quality = metadata.quality;
      candidate.variants = [variant];
      candidate.constraints.uniqueEquipped ||= metadata.uniqueEquipped;
      candidate.constraints.setId = metadata.setId || candidate.constraints.setId;
      for (const offer of offersByItem.get(entity.externalId) ?? []) {
        if (auctionVariantKey(offer) !== key) continue;
        options.push({
          id: `${offer.auctionId}:${slotType}:${key}`,
          auctionId: offer.auctionId,
          quantity: offer.quantity,
          costCopper: offer.buyoutCopper,
          candidate,
          variantKey: key
        });
        matched.add(offer.auctionId);
      }
    }
  }
  progress({
    phase: "catalog",
    completed: scannedIds.length,
    total: scannedIds.length
  });
  const preset = await getRotationPreset(theme.slug, input.locale);
  check();
  if (!preset.defaultRules.length) throw new Error("rotation_unavailable");
  const encounter = input.scenario === "aoe" ? {
    fightLengthSeconds: 60,
    targets: 5
  } : input.scenario === "execute" ? {
    fightLengthSeconds: 90,
    targets: 1
  } : {
    fightLengthSeconds: 120,
    targets: 1
  };
  const retainedMarket = { ...market, offers: [] };
  const simulate = createAuctionSimulator({ armory, loadout, specId: theme.specId, specSlug: theme.slug,
    scenario: input.scenario, encounter, rules: preset.defaultRules, market: retainedMarket, engine: resolution.engine });
  const optionMedia = options.map(option => ({ itemId: option.candidate.itemId, name: option.candidate.name, iconUrl: option.candidate.iconUrl }));
  await addPlannerItemIcons([...optionMedia, ...currentBySlot.values()], character.region, token, signal);
  options.forEach((option, index) => { option.candidate.iconUrl = optionMedia[index].iconUrl; });
  check();
  return {
    input: { ...input, selectedSlots }, character, armory, options, loadout,
    specId: theme.specId, market: retainedMarket, currentBySlot, simulate,
    searchLimited: scannedIds.length < ids.length || selectedMap.size < records.length || variantSearchLimited,
    publicMarket: {
      snapshotId: market.id,
      region: character.region,
      realm: character.realm.name,
      connectedRealmId: market.connectedRealmId,
      updatedAt: market.sourceUpdatedAt
    },
    profileFingerprint: createHash("sha256").update(JSON.stringify(armory)).digest("hex"),
    scenario: input.scenario,
    coverage: {
      affordableLots: affordable.length,
      matchedLots: matched.size,
      itemsScanned: scannedIds.length,
      itemsDetailed: entities.length,
      supportedModifierLots: supported.length,
      unsupportedModifierLots: affordable.length - supported.length,
      variantsResolved: probes.size - unresolvedVariants,
      variantsRejected: unresolvedVariants,
      referenceItemsVerified: referenceVerified.size,
      referenceItemsRejected: new Set([...probes.values()].map(p => p.offer.itemId)).size - referenceVerified.size
    }
  };
}

export type AuctionGearContext = Awaited<ReturnType<typeof createAuctionGearContextFromSnapshot>>;

function publicAuctionResult(context: AuctionGearContext, result: AuctionGearSearchResult): AuctionGearSearchResult & AuctionGearRunMetadata;
function publicAuctionResult(context: AuctionGearContext, result: AuctionGearAssemblyResult): AuctionGearAssemblyResult & AuctionGearRunMetadata;
function publicAuctionResult(context: AuctionGearContext, result: AuctionGearSearchResult | AuctionGearAssemblyResult): AuctionGearRunResult {
  const metadata: AuctionGearRunMetadata = { market: context.publicMarket,
    profileFingerprint: context.profileFingerprint, scenario: context.input.scenario, coverage: context.coverage };
  return result.kind === "search"
    ? { ...result, ...metadata, searchLimited: result.searchLimited || context.searchLimited }
    : { ...result, ...metadata, searchLimited: result.searchLimited || context.searchLimited };
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
    return await continueAuctionGearSearch(entry, signal, progress);
  } catch (error) {
    if (!entry.latestSearchResult) deleteAuctionGearSearch(owner, entry.id);
    throw error;
  }
}

export async function continueAuctionGearSearch(entry: AuctionGearSearchEntry, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const context = entry.context, started = Date.now();
  entry.busy = true;
  try {
    const { result, checkpoint } = await searchAuctionGearOptions({
      searchId: entry.id, budgetCopper: context.input.budgetCopper, options: context.options,
      selectedSlots: context.input.selectedSlots, loadout: context.loadout, specId: context.specId,
      market: context.market, signal, simulate: context.simulate, checkpoint: entry.searchCheckpoint,
      shouldYield: () => Date.now() - started >= 90_000, onProgress: progress,
      onCheckpoint: state => { entry.searchCheckpoint = state; touchAuctionGearSearch(entry); },
    });
    entry.searchCheckpoint = checkpoint;
    const items = result.items.map(item => ({ ...item, currentItem: context.currentBySlot.get(item.slotType) }));
    entry.latestSearchResult = { ...result, items };
    touchAuctionGearSearch(entry);
    return publicAuctionResult(context, entry.latestSearchResult);
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
  if (createHash("sha256").update(JSON.stringify(current)).digest("hex") !== context.profileFingerprint) throw new Error("character_snapshot_changed");
  const market = await getCharacterAuctionMarket(context.character, token, { refresh: true });
  signal.throwIfAborted();
  if (market.region !== context.market.region || market.connectedRealmId !== context.market.connectedRealmId) throw new Error("auction_market_changed");
  const offers = new Map(market.offers.map(offer => [offer.auctionId, offer]));
  for (const option of context.options) {
    const offer = offers.get(option.auctionId);
    if (!offer || offer.buyoutCopper !== option.costCopper || offer.quantity !== option.quantity || auctionVariantKey(offer) !== option.variantKey) throw new Error("auction_market_changed");
  }
  context.market.id = market.id;
  context.market.sourceUpdatedAt = market.sourceUpdatedAt;
  context.market.fetchedAt = market.fetchedAt;
  context.publicMarket = { ...context.publicMarket, snapshotId: market.id, updatedAt: market.sourceUpdatedAt };
  touchAuctionGearSearch(entry);
}

export function selectedAuctionGearOptions(entry: AuctionGearSearchEntry, value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > entry.context.options.length ||
      value.some(id => typeof id !== "string" || id.length > 180) || new Set(value).size !== value.length) throw new Error("invalid_auction_selection");
  const known = new Map(entry.context.options.map(option => [option.id, option]));
  return value.map(id => {
    const option = known.get(id);
    if (!option) throw new Error("invalid_auction_selection");
    return option;
  });
}

export async function assembleAuctionGearSearch(entry: AuctionGearSearchEntry, allowedOptionIds: unknown, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const context = entry.context, started = Date.now();
  if (!entry.searchCheckpoint || !entry.latestSearchResult) throw new Error("search_not_ready");
  const options = selectedAuctionGearOptions(entry, allowedOptionIds);
  const allowedKey = options.map(option => option.id).sort().join("|");
  if (entry.allowedKey !== allowedKey) {
    if (entry.assemblyCheckpoint) Object.assign(entry.searchCheckpoint.simulationCache, entry.assemblyCheckpoint.simulationCache);
    entry.assemblyCheckpoint = undefined;
    entry.allowedKey = allowedKey;
  }
  entry.busy = true;
  try {
    const { result, checkpoint } = await assembleAuctionGear({
      searchId: entry.id, budgetCopper: context.input.budgetCopper, options,
      selectedSlots: context.input.selectedSlots, loadout: context.loadout, specId: context.specId,
      market: context.market, signal, simulate: context.simulate, checkpoint: entry.assemblyCheckpoint,
      baseline: entry.searchCheckpoint.baseline, simulationCache: entry.searchCheckpoint.simulationCache,
      shouldYield: () => Date.now() - started >= 90_000, onProgress: progress,
      onCheckpoint: state => { entry.assemblyCheckpoint = state; touchAuctionGearSearch(entry); },
    });
    entry.assemblyCheckpoint = checkpoint;
    touchAuctionGearSearch(entry);
    return publicAuctionResult(context, { ...result, purchases: result.purchases.map(purchase => ({
      ...purchase, currentItem: context.currentBySlot.get(purchase.slotType),
    })) });
  } finally { entry.busy = false; }
}

/** Kept for trusted CLI checks; HTTP uses explicit search and assembly stages. */
export async function runAuctionGearPlanFromSnapshot(input: AuctionGearRunInput, character: BattleNetCharacter, armory: BattleNetSimulationSnapshot, token: string, signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) {
  const context = await createAuctionGearContextFromSnapshot(input, character, armory, token, signal, progress);
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
  rules: string[]; market: Pick<AuctionSnapshot, "sourceUpdatedAt">; engine: string;
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
      if (engine && result.engine !== engine) throw new Error("simulation_version_changed");
      return result;
    };
}
