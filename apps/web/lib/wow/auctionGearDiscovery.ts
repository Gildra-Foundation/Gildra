import "server-only";
import type { CatalogRecord } from "@/lib/api/client";
import { auctionVariantKey, resolvedAuctionVariant } from "./auctionItemVariant";
import { AUCTION_ITEM_REFERENCE_TTL_MS, getAuctionItemReferences, nativeMatchesItemReference, type AuctionItemReference } from "./auctionItemReference";
import { resolveAuctionVariants } from "./auctionVariantResolver";
import { supportedAuctionModifiers } from "./gearItemModifiers";
import { gearEntityDetails, lookupGearRecords } from "./gearCandidateRepository";
import { normalizeGearCandidate, type CatalogGearEntity, type GearCandidate, type GearCandidateContext } from "./gearCandidates";
import type { AuctionOffer, AuctionSnapshot } from "./auctionMarket";
import type { AuctionGearOption, AuctionPlanProgress } from "./auctionGearTypes";

/** Limits bound one continuation's work, never the retained candidate domain. */
const catalogBatch = 100, detailBatch = 8, variantBatch = 4;
export type AuctionGearDiscovery = {
  marketId: string;
  discoveredSnapshotId?: string;
  budgetCopper: number;
  offers: Map<string, AuctionOffer[]>;
  itemVariants: Map<number, string[]>;
  itemIds: number[];
  itemCursor: number;
  queuedItems: Set<number>;
  records: CatalogRecord[];
  entities: Map<number, CatalogGearEntity | null>;
  variantKeys: string[];
  variantCursor: number;
  queuedVariants: Set<string>;
  candidates: Map<string, GearCandidate[]>;
  rejectedVariants: Set<string>;
  references: Map<number, AuctionItemReference | null>;
  verifiedReferences: Set<number>;
  rejectedReferences: Set<number>;
  referenceRetryAt: Map<number, number>;
  referenceRejectedVariants: Map<number, Set<string>>;
  catalogMissing: Set<number>;
  catalogUnmatched: Set<number>;
  eligibilityUnverifiedItems: Set<number>;
  scannedItems: Set<number>;
  detailedItems: Set<number>;
  affordableLots: number;
  unsupportedModifierLots: number;
  engine: string;
};

export function createAuctionGearDiscovery(market: AuctionSnapshot, budgetCopper: number): AuctionGearDiscovery {
  const state: AuctionGearDiscovery = { marketId: market.id, budgetCopper, offers: new Map(), itemVariants: new Map(), itemIds: [], itemCursor: 0,
    queuedItems: new Set(), records: [], entities: new Map(), variantKeys: [], variantCursor: 0, queuedVariants: new Set(),
    candidates: new Map(), rejectedVariants: new Set(), references: new Map(),
    verifiedReferences: new Set(), rejectedReferences: new Set(), referenceRetryAt: new Map(), referenceRejectedVariants: new Map(),
    catalogMissing: new Set(), catalogUnmatched: new Set(),
    eligibilityUnverifiedItems: new Set(), scannedItems: new Set(),
    detailedItems: new Set(), affordableLots: 0, unsupportedModifierLots: 0, engine: "" };
  refreshAuctionGearDiscovery(state, market);
  return state;
}

function queueVariants(state: AuctionGearDiscovery, itemId: number) {
  for (const key of state.itemVariants.get(itemId) ?? []) if (!state.queuedVariants.has(key)) {
    state.variantKeys.push(key);
    state.queuedVariants.add(key);
  }
}

/** A new snapshot changes prices/availability immediately; only new effects need native work. */
export function refreshAuctionGearDiscovery(state: AuctionGearDiscovery, market: AuctionSnapshot) {
  const affordable = market.offers.filter(offer => offer.buyoutCopper <= state.budgetCopper);
  const supported = affordable.filter(offer => supportedAuctionModifiers(offer.modifiers));
  const offers = new Map<string, AuctionOffer[]>();
  for (const offer of supported) {
    const key = auctionVariantKey(offer), list = offers.get(key) ?? [];
    list.push(offer);
    offers.set(key, list);
  }
  state.offers = offers;
  state.itemVariants = new Map();
  for (const [key, list] of offers) {
    const variants = state.itemVariants.get(list[0].itemId) ?? [];
    variants.push(key);
    state.itemVariants.set(list[0].itemId, variants);
  }
  state.marketId = market.id;
  state.affordableLots = affordable.length;
  state.unsupportedModifierLots = affordable.length - supported.length;
  const ids = [...new Set(supported.map(offer => offer.itemId))].sort((a, b) => a - b);
  const now = Date.now();
  for (const itemId of ids) {
    if (state.rejectedReferences.has(itemId) && (state.referenceRetryAt.get(itemId) ?? Infinity) <= now) {
      state.references.delete(itemId);
      state.rejectedReferences.delete(itemId);
      state.referenceRetryAt.delete(itemId);
      for (const key of state.referenceRejectedVariants.get(itemId) ?? []) {
        state.rejectedVariants.delete(key);
        state.queuedVariants.delete(key);
      }
      state.referenceRejectedVariants.delete(itemId);
    }
    if (!state.queuedItems.has(itemId)) {
      state.itemIds.push(itemId);
      state.queuedItems.add(itemId);
    } else if (state.entities.get(itemId)) queueVariants(state, itemId);
  }
  if (auctionGearDiscoveryComplete(state)) state.discoveredSnapshotId = state.marketId;
}

export function auctionGearDiscoveryComplete(state: AuctionGearDiscovery) {
  return state.itemCursor === state.itemIds.length && !state.records.length && state.variantCursor === state.variantKeys.length;
}

const summarySlots: Record<string, readonly string[]> = {
  Head: ["HEAD"], Голова: ["HEAD"], Neck: ["NECK"], Шея: ["NECK"], Shoulder: ["SHOULDER"], Плечи: ["SHOULDER"],
  Chest: ["CHEST"], Грудь: ["CHEST"], Waist: ["WAIST"], Пояс: ["WAIST"], Legs: ["LEGS"], Ноги: ["LEGS"],
  Feet: ["FEET"], Ступни: ["FEET"], Wrist: ["WRIST"], Запястья: ["WRIST"], Hands: ["HANDS"], "Кисти рук": ["HANDS"],
  Finger: ["FINGER_1", "FINGER_2"], Палец: ["FINGER_1", "FINGER_2"], Trinket: ["TRINKET_1", "TRINKET_2"], Аксессуар: ["TRINKET_1", "TRINKET_2"],
  Back: ["BACK"], Спина: ["BACK"], "One-Hand": ["MAIN_HAND", "OFF_HAND"], Одноручное: ["MAIN_HAND", "OFF_HAND"],
  "Two-Hand": ["MAIN_HAND", "OFF_HAND"], Двуручное: ["MAIN_HAND", "OFF_HAND"], "Main Hand": ["MAIN_HAND"], "Правая рука": ["MAIN_HAND"],
  "Off Hand": ["OFF_HAND"], "Held In Off-hand": ["OFF_HAND"], "Левая рука": ["OFF_HAND"], Shield: ["OFF_HAND"], Щит: ["OFF_HAND"],
  Ranged: ["MAIN_HAND"], "Дальний бой": ["MAIN_HAND"],
};
function summaryMayMatch(record: CatalogRecord, slots: readonly string[]) {
  const inventory = record.highlights?.find(highlight => highlight.key === "inventory_type")?.value;
  // Missing/unknown presentation is never evidence that a candidate is unusable.
  return !inventory || !summarySlots[inventory] || summarySlots[inventory].some(slot => slots.includes(slot));
}

function variantEntity(entity: CatalogGearEntity, offer: AuctionOffer, requiredLevel = 0, itemLevel = 1): CatalogGearEntity {
  return { ...entity, tooltip: { blocks: [...(entity.tooltip?.blocks ?? []).filter(block => block.type !== "item_variants" && block.type !== "item_requirements"),
    { ...entity.tooltip?.blocks?.find(block => block.type === "item_requirements"), type: "item_requirements", required_level: requiredLevel },
    { type: "item_variants", entries: [{ key: auctionVariantKey(offer), item_level: itemLevel, context_id: offer.contextId,
      bonus_list_ids: offer.bonusIds, modifiers: offer.modifiers }] }] } };
}

function rememberUnverifiedEligibility(state: AuctionGearDiscovery, itemId: number, candidates: GearCandidate[]) {
  if (candidates.some(candidate => candidate.rejectionReasons.includes("equip_requirements_unverified") ||
      candidate.itemClassId < 0 || candidate.itemSubclassId < 0 || candidate.inventoryType < 0)) {
    state.eligibilityUnverifiedItems.add(itemId);
  }
}

type DiscoveryInput = {
  locale: "en_US" | "ru_RU"; region: string; token: string; spec: string; characterLevel: number;
  selectedSlots: readonly string[]; context: (slot: string) => GearCandidateContext;
  signal: AbortSignal; shouldYield?: () => boolean; maxSteps?: number; onProgress?: (progress: AuctionPlanProgress) => void;
};

/** Persist cursors only after a whole batch succeeds, so cancellation is retryable. */
export async function advanceAuctionGearDiscovery(state: AuctionGearDiscovery, input: DiscoveryInput) {
  for (let step = 0; step < (input.maxSteps ?? 12) && !input.shouldYield?.(); step++) {
    input.signal.throwIfAborted();
    if (state.variantCursor < state.variantKeys.length) {
      const keys = state.variantKeys.slice(state.variantCursor, state.variantCursor + variantBatch);
      const probes = keys.flatMap(key => {
        const offer = state.offers.get(key)?.[0], entity = offer && state.entities.get(offer.itemId);
        if (!offer || !entity) return [];
        const synthetic = variantEntity(entity, offer);
        const normalized = input.selectedSlots.map(slot => normalizeGearCandidate(synthetic, input.context(slot)));
        rememberUnverifiedEligibility(state, entity.externalId, normalized);
        const slot = normalized.find(candidate => candidate.eligible)?.slotType;
        return slot ? [{ offer, entity, slot }] : [];
      });
      const ids = [...new Set(probes.map(probe => probe.offer.itemId))];
      const missing = ids.filter(id => !state.references.has(id));
      if (missing.length) {
        const references = await getAuctionItemReferences(missing, input.region, input.token, input.signal, input.locale);
        for (const id of missing) state.references.set(id, references.get(id) ?? null);
      }
      const references = ids.flatMap(id => {
        const reference = state.references.get(id);
        if (!reference || state.verifiedReferences.has(id) || state.rejectedReferences.has(id)) return [];
        return [{ offer: reference.offer, slot: probes.find(probe => probe.offer.itemId === id)!.slot }];
      });
      const simcSlot = (slot: string) => ({ FINGER_1: "finger1", FINGER_2: "finger2", TRINKET_1: "trinket1", TRINKET_2: "trinket2" }[slot] ?? slot.toLowerCase());
      const resolution = probes.length ? await resolveAuctionVariants({ offers: [...references, ...probes].map(probe => ({ offer: probe.offer, slot: simcSlot(probe.slot) })),
        spec: input.spec, characterLevel: input.characterLevel, signal: input.signal }) : null;
      if (resolution?.engine) {
        if (state.engine && state.engine !== resolution.engine) throw new Error("simulation_version_changed");
        state.engine = resolution.engine;
      }
      for (const id of ids) if (!state.verifiedReferences.has(id) && !state.rejectedReferences.has(id)) {
        const reference = state.references.get(id);
        if (reference && nativeMatchesItemReference(reference, resolution?.variants.get(auctionVariantKey(reference.offer)))) {
          state.verifiedReferences.add(id);
          state.referenceRetryAt.delete(id);
        } else {
          state.rejectedReferences.add(id);
          state.referenceRetryAt.set(id, Date.now() + AUCTION_ITEM_REFERENCE_TTL_MS);
        }
      }
      for (const probe of probes) {
        const key = auctionVariantKey(probe.offer), metadata = resolution?.variants.get(key);
        if (!metadata || metadata.error || !state.verifiedReferences.has(probe.offer.itemId) || metadata.itemLevel > 1000 ||
            metadata.requiredLevel === 0 && (state.references.get(probe.offer.itemId)?.requiredLevel ?? 0) > 0) {
          state.rejectedVariants.add(key);
          if (!state.verifiedReferences.has(probe.offer.itemId)) {
            const rejected = state.referenceRejectedVariants.get(probe.offer.itemId) ?? new Set<string>();
            rejected.add(key);
            state.referenceRejectedVariants.set(probe.offer.itemId, rejected);
          }
          continue;
        }
        if (metadata.requiredLevel > input.characterLevel) continue;
        const variant = resolvedAuctionVariant(probe.offer, metadata, state.engine);
        const reference = state.references.get(probe.offer.itemId);
        if (variant.resolution) {
          variant.resolution.effects = [];
          variant.resolution.effectsVerified = false;
          if (reference && auctionVariantKey(reference.offer) === key) {
            if (reference.effectsVerified) {
              variant.resolution.effects = [...reference.effects];
              variant.resolution.effectsVerified = true;
            }
            // A reference describes only its exact bonus/context/modifier tuple.
            // It must never supply a scaled variant's weapon values or effects.
            variant.resolution.weapon ??= reference.weapon;
          }
        }
        const entity = variantEntity(probe.entity, probe.offer, metadata.requiredLevel, metadata.itemLevel);
        const candidates: GearCandidate[] = [];
        for (const slot of input.selectedSlots) {
          const candidate = normalizeGearCandidate(entity, input.context(slot));
          if (candidate.itemClassId !== metadata.itemClassId || candidate.itemSubclassId !== metadata.itemSubclassId || candidate.inventoryType !== metadata.inventoryType) {
            state.rejectedVariants.add(key);
            continue;
          }
          if (!candidate.eligible) continue;
          candidate.itemLevel = metadata.itemLevel;
          candidate.quality = metadata.quality;
          candidate.variants = [variant];
          candidate.constraints.uniqueEquipped ||= metadata.uniqueEquipped;
          candidate.constraints.setId = metadata.setId || candidate.constraints.setId;
          candidates.push(candidate);
        }
        if (candidates.length) state.candidates.set(key, candidates);
      }
      // A sold effect skipped before resolution may return in a later
      // snapshot. It must then be queued again rather than lost forever.
      for (const key of keys) if (!state.offers.has(key)) state.queuedVariants.delete(key);
      state.variantCursor += keys.length;
      input.onProgress?.({ phase: "variants", completed: state.variantCursor, total: state.variantKeys.length });
    } else if (state.records.length) {
      const records = state.records.slice(0, detailBatch);
      const entities = await gearEntityDetails(records, input.locale, false);
      for (const record of records) {
        state.detailedItems.add(record.externalId);
        const entity = entities.find(entity => entity.externalId === record.externalId);
        if (!entity) { state.catalogMissing.add(record.externalId); state.entities.set(record.externalId, null); continue; }
        const offer = state.offers.get(state.itemVariants.get(entity.externalId)?.[0] ?? "")?.[0];
        const normalized = input.selectedSlots.map(slot => normalizeGearCandidate(offer ? variantEntity(entity, offer) : entity, input.context(slot)));
        rememberUnverifiedEligibility(state, entity.externalId, normalized);
        if (!offer) { state.entities.set(entity.externalId, entity); continue; }
        const eligible = normalized.some(candidate => candidate.eligible);
        state.entities.set(entity.externalId, eligible ? entity : null);
        if (eligible) queueVariants(state, entity.externalId);
      }
      state.records.splice(0, records.length);
    } else if (state.itemCursor < state.itemIds.length) {
      const ids = state.itemIds.slice(state.itemCursor, state.itemCursor + catalogBatch);
      // Base required level is not an auction variant's actual scaled requirement.
      const records = (await Promise.all([2, 4].map(itemClass => lookupGearRecords(ids, input.locale, itemClass)))).flat();
      for (const id of ids) state.scannedItems.add(id);
      const found = new Set(records.map(record => record.externalId));
      for (const id of ids) if (!found.has(id)) state.catalogUnmatched.add(id);
      state.records.push(...records.filter(record => summaryMayMatch(record, input.selectedSlots)));
      state.itemCursor += ids.length;
      input.onProgress?.({ phase: "catalog", completed: state.itemCursor, total: state.itemIds.length });
    } else break;
  }
  input.signal.throwIfAborted();
  if (auctionGearDiscoveryComplete(state)) state.discoveredSnapshotId = state.marketId;
}

export function auctionGearDiscoveryOptions(state: AuctionGearDiscovery): AuctionGearOption[] {
  const options: AuctionGearOption[] = [];
  for (const [key, candidates] of state.candidates) for (const offer of state.offers.get(key) ?? []) for (const candidate of candidates) options.push({
    id: `${offer.auctionId}:${candidate.slotType}:${key}`, auctionId: offer.auctionId, quantity: offer.quantity,
    costCopper: offer.buyoutCopper, candidate, variantKey: key,
  });
  return options;
}

export function auctionGearDiscoveryCoverage(state: AuctionGearDiscovery) {
  const keys = new Set(state.offers.keys());
  const currentIds = new Set([...state.offers.values()].map(offers => offers[0].itemId));
  const rejected = [...state.rejectedVariants].filter(key => keys.has(key)).length;
  const referenceRejected = [...state.rejectedReferences].filter(id => currentIds.has(id)).length;
  const catalogMissing = [...state.catalogMissing].filter(id => currentIds.has(id)).length;
  const catalogUnmatched = [...state.catalogUnmatched].filter(id => currentIds.has(id)).length;
  const eligibilityUnverifiedItems = [...state.eligibilityUnverifiedItems].filter(id => currentIds.has(id)).length;
  const discoveryComplete = auctionGearDiscoveryComplete(state);
  return {
    affordableLots: state.affordableLots,
    matchedLots: new Set(auctionGearDiscoveryOptions(state).map(option => option.auctionId)).size,
    itemsTotal: state.itemIds.length, itemsScanned: state.scannedItems.size, itemsDetailed: state.detailedItems.size,
    supportedModifierLots: [...state.offers.values()].reduce((sum, offers) => sum + offers.length, 0),
    unsupportedModifierLots: state.unsupportedModifierLots,
    variantsPending: state.variantKeys.length - state.variantCursor,
    variantsResolved: [...state.candidates.keys()].filter(key => keys.has(key)).length, variantsRejected: rejected,
    referenceItemsVerified: [...state.verifiedReferences].filter(id => currentIds.has(id)).length, referenceItemsRejected: referenceRejected,
    catalogItemsMissing: catalogMissing, catalogUnmatchedItemIds: catalogUnmatched, eligibilityUnverifiedItems, discoveryComplete,
    dataComplete: !state.unsupportedModifierLots && !rejected && !referenceRejected && !catalogMissing && !catalogUnmatched && !eligibilityUnverifiedItems,
  };
}
