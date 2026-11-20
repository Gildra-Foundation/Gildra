import { professionEligibility } from "./characterProfessions";
import "server-only";
import { auctionSummarySlotMatch } from "./gearCompatibility";
import type { CatalogRecord } from "@/lib/api/client";
import { auctionVariantKey, resolvedAuctionVariant } from "./auctionItemVariant";
import { AUCTION_ITEM_REFERENCE_TTL_MS, getAuctionItemReferences, equippedAuctionReferences, nativeMatchesItemReference, type AuctionItemReference } from "./auctionItemReference";
import { resolveAuctionVariants } from "./auctionVariantResolver";
import { supportedAuctionModifiers } from "./gearItemModifiers";
import { gearEntityDetails, lookupGearRecords } from "./gearCandidateRepository";
import { normalizeGearCandidate, type CatalogGearEntity, type GearCandidate, type GearCandidateContext } from "./gearCandidates";
import type { AuctionOffer, AuctionSnapshot } from "./auctionMarket";
import type { AuctionGearOption, AuctionPlanProgress } from "./auctionGearTypes";

/** Limits bound one continuation's work, never the retained candidate domain. */
// Align complete 100-ID/four-request waves. Like 500 IDs, 800 needs at most
// two waves per step, while avoiding a mostly idle second wave on every step.
const catalogBatch = 800, initialVariantBatch = 4;
/** A repaired catalog can join a retained search without retrying on every poll. */
const catalogRetryMs = 60_000;
type CatalogPriorityHint = { itemLevel: number; requiredLevel?: number };
export type AuctionGearDiscovery = {
  /** Older persisted coverage may already have excluded gear with prismatic sockets. */
  socketMetadataRevision?: 3;
  equippedReferenceRevision?: 1;
  variantBatchLimit?: 16 | 64;
  marketId: string;
  discoveredSnapshotId?: string;
  budgetCopper: number;
  offers: Map<string, AuctionOffer[]>;
  itemVariants: Map<number, string[]>;
  itemIds: number[];
  itemCursor: number;
  queuedItems: Set<number>;
  records: CatalogRecord[];
  /** Optional for checkpoints written before summary-first discovery. Hints never exclude lots. */
  catalogHints?: Map<number, CatalogPriorityHint>;
  catalogPriorityLevel?: number;
  entities: Map<number, CatalogGearEntity | null>;
  variantKeys: string[];
  variantCursor: number;
  queuedVariants: Set<string>;
  candidates: Map<string, GearCandidate[]>;
  rejectedVariants: Set<string>;
  references: Map<number, AuctionItemReference | null>;
  equippedVerifiedVariants?: Set<string>;
  verifiedReferences: Set<number>;
  rejectedReferences: Set<number>;
  referenceRetryAt: Map<number, number>;
  referenceRejectedVariants: Map<number, Set<string>>;
  catalogMissing: Set<number>;
  catalogUnmatched: Set<number>;
  pendingClassification?: Set<number>;
  eligibilityUnverifiedItems: Set<number>;
  catalogRetryAt: Map<number, number>;
  scannedItems: Set<number>;
  detailedItems: Set<number>;
  affordableLots: number;
  unsupportedModifierLots: number;
  /** Optional for checkpoints predating noncombat classification of unsupported lots. */
  unsupportedLotsByItem?: Map<number, number>;
  catalogItemClasses?: Map<number, number>;
  /** A summary visited with supported offers can intentionally omit other slots. */
  supportedSummaryItems?: Set<number>;
  engine: string;
};

// Derived presentation is process-local: checkpoints retain only authoritative
// discovery facts. Refreshes replace offers, while candidate/hint writes below
// explicitly invalidate this cache. Return a detached array to callers.
const optionCache = new WeakMap<AuctionGearDiscovery, {
  offers: AuctionGearDiscovery["offers"]; candidates: AuctionGearDiscovery["candidates"];
  candidateCount: number; hints: AuctionGearDiscovery["catalogHints"]; hintCount: number;
  level: number | undefined; options: AuctionGearOption[];
}>();

export function createAuctionGearDiscovery(market: AuctionSnapshot, budgetCopper: number): AuctionGearDiscovery {
  const state: AuctionGearDiscovery = { socketMetadataRevision: 3, equippedReferenceRevision: 1, marketId: market.id, budgetCopper, offers: new Map(), itemVariants: new Map(), itemIds: [], itemCursor: 0,
    queuedItems: new Set(), records: [], catalogHints: new Map(), entities: new Map(), variantKeys: [], variantCursor: 0, queuedVariants: new Set(),
    candidates: new Map(), rejectedVariants: new Set(), references: new Map(),
    verifiedReferences: new Set(), rejectedReferences: new Set(), referenceRetryAt: new Map(), referenceRejectedVariants: new Map(),
    catalogMissing: new Set(), catalogUnmatched: new Set(),
    eligibilityUnverifiedItems: new Set(), catalogRetryAt: new Map(), scannedItems: new Set(),
    detailedItems: new Set(), affordableLots: 0, unsupportedModifierLots: 0,
    unsupportedLotsByItem: new Map(), catalogItemClasses: new Map(), supportedSummaryItems: new Set(), engine: "" };
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
export function refreshAuctionGearDiscovery(state: AuctionGearDiscovery, market: AuctionSnapshot,
  { retryCatalog = true }: { retryCatalog?: boolean } = {}) {
  const affordable = market.offers.filter(offer => offer.buyoutCopper <= state.budgetCopper);
  const supported = affordable.filter(offer => supportedAuctionModifiers(offer.modifiers));
  const legacyClasses = !state.catalogItemClasses;
  state.catalogItemClasses ??= new Map();
  state.supportedSummaryItems ??= new Set();
  state.unsupportedLotsByItem = new Map();
  for (const offer of affordable) if (!supportedAuctionModifiers(offer.modifiers)) {
    state.unsupportedLotsByItem.set(offer.itemId, (state.unsupportedLotsByItem.get(offer.itemId) ?? 0) + 1);
    // Older checkpoints may have already visited the same ID through a
    // supported lot without retaining its authoritative noncombat class.
    if (legacyClasses && state.queuedItems.has(offer.itemId)) state.catalogRetryAt.set(offer.itemId, 0);
  }
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
  updateUnsupportedCoverage(state);
  // Unsupported variants never enter native work, but their cheap summaries
  // can establish that profession equipment/recipes are outside combat gear.
  const ids = [...new Set(affordable.map(offer => offer.itemId))].sort((a, b) => a - b);
  const now = Date.now();
  // A long active traversal must finish before missing IDs can cycle again.
  const retry = new Set(retryCatalog && auctionGearDiscoveryComplete(state)
    ? ids.filter(id => (state.catalogRetryAt.get(id) ?? Infinity) <= now) : []);
  for (const id of ids) {
    const itemClass = state.catalogItemClasses.get(id);
    // An unsupported-only combat item had its cheap summary classified but
    // never needed details. Its first supported offer needs that first pass,
    // even during another traversal or when timed catalog retries are disabled.
    // Legacy checkpoints get one bounded pass, including ones saved after the
    // old refresh had populated supported maps without opening details.
    // A recorded null entity is a previous attempt and keeps its retry policy.
    if ((itemClass === 2 || itemClass === 4) && state.itemVariants.has(id) && !state.supportedSummaryItems.has(id) &&
        state.queuedItems.has(id) && !state.entities.has(id)) retry.add(id);
  }
  if (retry.size) {
    // Recycle processed positions instead of appending duplicate IDs forever.
    // Pending catalog/detail work already owns its queue position.
    const waitingDetails = new Set(state.records.map(record => record.externalId));
    const again = state.itemIds.slice(0, state.itemCursor).filter(id => retry.has(id) && !waitingDetails.has(id));
    const requeued = new Set(again);
    const processed = state.itemIds.slice(0, state.itemCursor).filter(id => !requeued.has(id));
    state.itemIds = [...processed, ...state.itemIds.slice(state.itemCursor), ...again];
    state.itemCursor = processed.length;
    for (const id of again) state.catalogRetryAt.delete(id);
  }
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
  return state.itemCursor === state.itemIds.length && !state.records.length && state.variantCursor === state.variantKeys.length && !state.pendingClassification?.size;
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
function catalogItemClass(record: Pick<CatalogGearEntity, "tooltip" | "payload">): number | undefined {
  const registry = record.tooltip?.blocks?.find(block => block.type === "item_registry");
  const subclass = record.tooltip?.blocks?.find(block => block.type === "subclass");
  const payload = (record as CatalogGearEntity).payload;
  const value = registry?.class_id ?? subclass?.class_id ?? payload?.ItemClass ?? payload?.itemClass;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
const knownNonGear = (record: Pick<CatalogGearEntity, "tooltip" | "payload">) => {
  const itemClass = catalogItemClass(record);
  return itemClass !== undefined && itemClass !== 2 && itemClass !== 4;
};
function updateUnsupportedCoverage(state: AuctionGearDiscovery) {
  if (!state.unsupportedLotsByItem) return;
  state.unsupportedModifierLots = [...state.unsupportedLotsByItem].reduce((count, [id, lots]) => {
    const itemClass = state.catalogItemClasses?.get(id);
    return count + (itemClass === undefined || itemClass === 2 || itemClass === 4 ? lots : 0);
  }, 0);
}
function rememberCatalogClass(state: AuctionGearDiscovery, record: CatalogGearEntity) {
  const itemClass = catalogItemClass(record);
  if (itemClass === undefined) return;
  (state.catalogItemClasses ??= new Map()).set(record.externalId, itemClass);
  if (knownNonGear(record)) {
    state.catalogMissing.delete(record.externalId);
    state.catalogUnmatched.delete(record.externalId);
    state.eligibilityUnverifiedItems.delete(record.externalId);
    state.catalogRetryAt.delete(record.externalId);
  }
}

function summaryMayMatch(record: CatalogRecord, slots: readonly string[]) {
  const inventory = record.highlights?.find(highlight => highlight.key === "inventory_type")?.value;
  const highlighted = inventory ? summarySlots[inventory] : undefined;
  if (highlighted?.some(slot => slots.includes(slot))) return true;
  // Both representations come from the published inventory type. Older API
  // responses may provide only a highlight, or only a Battle.net enum.
  const raw = record.inventoryType == null ? undefined : auctionSummarySlotMatch(record.inventoryType, slots);
  return raw ?? !highlighted;
}

function catalogPriorityHint(record: CatalogRecord): CatalogPriorityHint {
  // The catalog renders both EN/RU required-level highlights with a trailing number.
  // These base values only schedule work; native metadata decides scaled eligibility.
  const required = record.highlights?.find(highlight => highlight.key === "required_level")?.value.match(/\b(\d+)\s*$/)?.[1];
  const requiredLevel = required ? Number(required) : undefined;
  return { itemLevel: Number.isFinite(record.itemLevel) && record.itemLevel! > 0 ? record.itemLevel! : 0,
    requiredLevel: requiredLevel && Number.isSafeInteger(requiredLevel) ? requiredLevel : undefined };
}

function compareCatalogHints(left: CatalogPriorityHint | undefined, right: CatalogPriorityHint | undefined, characterLevel: number) {
  // Raw base item levels span historical stat squishes and are not comparable
  // across level brackets. Prefer the closest known wearable requirement first.
  const levelFit = (hint: CatalogPriorityHint | undefined) => hint?.requiredLevel && hint.requiredLevel <= characterLevel
    ? characterLevel - hint.requiredLevel : Infinity;
  const leftFit = levelFit(left), rightFit = levelFit(right);
  const overLevel = (hint: CatalogPriorityHint | undefined) => Number((hint?.requiredLevel ?? 0) > characterLevel);
  return (leftFit === rightFit ? 0 : leftFit - rightFit) || overLevel(left) - overLevel(right) ||
    (right?.itemLevel ?? 0) - (left?.itemLevel ?? 0);
}

function prioritizePendingDiscovery(state: AuctionGearDiscovery, characterLevel: number) {
  const hints = state.catalogHints ??= new Map();
  // Older checkpoints can recover retained summary hints. Already detailed items
  // without a summary remain unknown rather than guessing from presentation.
  for (const record of state.records) if (!hints.has(record.externalId)) hints.set(record.externalId, catalogPriorityHint(record));
  state.records.sort((left, right) => compareCatalogHints(hints.get(left.externalId), hints.get(right.externalId), characterLevel));
  const pending = state.variantKeys.slice(state.variantCursor);
  pending.sort((left, right) => compareCatalogHints(hints.get(state.offers.get(left)?.[0]?.itemId ?? 0),
    hints.get(state.offers.get(right)?.[0]?.itemId ?? 0), characterLevel));
  // Stable metadata ties retain arrival order; item IDs never estimate usefulness.
  state.variantKeys = state.variantKeys.slice(0, state.variantCursor).concat(pending);
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
    state.catalogRetryAt.set(itemId, Date.now() + catalogRetryMs);
  }
}

function acceptCatalogSummaries(state: AuctionGearDiscovery, ids: number[], records: CatalogRecord[], selectedSlots: readonly string[]) {
  optionCache.delete(state);
  const supportedSummaryItems = state.supportedSummaryItems ??= new Set();
  for (const id of ids) {
    state.scannedItems.add(id);
    if (state.itemVariants.has(id)) supportedSummaryItems.add(id);
  }
  const found = new Set(records.map(record => record.externalId));
  for (const id of ids) {
    if (!found.has(id)) {
      const knownClass = state.catalogItemClasses?.get(id);
      if (knownClass !== undefined && knownClass !== 2 && knownClass !== 4) continue;
      state.catalogUnmatched.add(id);
      (state.pendingClassification ??= new Set()).add(id);
      state.catalogRetryAt.set(id, Date.now() + catalogRetryMs);
    } else {
      state.pendingClassification?.delete(id);
      state.catalogUnmatched.delete(id);
      state.catalogRetryAt.delete(id);
    }
  }
  const hints = state.catalogHints ??= new Map();
  for (const record of records) {
    hints.set(record.externalId, catalogPriorityHint(record));
    rememberCatalogClass(state, record);
  }
  updateUnsupportedCoverage(state);
  state.records.push(...records.filter(record => !knownNonGear(record) &&
    (state.itemVariants.has(record.externalId) && summaryMayMatch(record, selectedSlots) ||
      state.unsupportedLotsByItem?.has(record.externalId) && !state.catalogItemClasses?.has(record.externalId))));
  state.itemCursor += ids.length;
}

type DiscoveryInput = {
  locale: "en_US" | "ru_RU"; region: string; token: string; spec: string; characterLevel: number;
  equipment?: Record<string, unknown>;
  selectedSlots: readonly string[]; context: (slot: string) => GearCandidateContext;
  signal: AbortSignal; shouldYield?: () => boolean; maxSteps?: number; onProgress?: (progress: AuctionPlanProgress) => void;
  onCheckpoint?: () => void;
  /** Optional private timing; transport behavior and data stay unchanged. */
  measure?: <T>(stage: "catalog" | "details" | "references" | "variants", work: () => Promise<T>) => Promise<T>;
  /** Publish a useful verified batch before resolving the rest of the market. */
  stopAfterNewCandidates?: boolean;
};

/** Persist cursors only after a whole batch succeeds, so cancellation is retryable. */
export async function advanceAuctionGearDiscovery(state: AuctionGearDiscovery, input: DiscoveryInput) {
  input.signal.throwIfAborted();
  const measure = <T>(stage: "catalog" | "details" | "references" | "variants", work: () => Promise<T>) =>
    input.measure ? input.measure(stage, work) : work();
  state.catalogPriorityLevel = input.characterLevel;
  let prioritized = false;
  const initialCandidates = state.candidates.size;
  let warmCandidatesFirst = false;
  if (input.stopAfterNewCandidates && !state.itemCursor && !state.records.length && !state.variantKeys.length) {
    // A repeat search can already know most raw summaries while a handful of
    // absent IDs have expired. Do not hold its first verified result behind
    // those repairs. Cache hits are scheduling facts, never native/stat proof.
    const cached = await measure("catalog", () => lookupGearRecords(state.itemIds, input.locale, undefined, undefined, input.signal, true, { cachedOnly: true }));
    input.signal.throwIfAborted();
    const byId = new Map(cached.filter(record => state.queuedItems.has(record.externalId)).map(record => [record.externalId, record]));
    if (byId.size) {
      const known = state.itemIds.filter(id => byId.has(id));
      state.itemIds = [...known, ...state.itemIds.filter(id => !byId.has(id))];
      acceptCatalogSummaries(state, known, known.map(id => byId.get(id)!), input.selectedSlots);
      warmCandidatesFirst = Boolean(state.records.length);
      input.onProgress?.({ phase: "catalog", completed: state.itemCursor, total: state.itemIds.length });
      input.onCheckpoint?.();
    }
  }
  for (let step = 0; step < (input.maxSteps ?? 12) && !input.shouldYield?.(); step++) {
    const batchLimit = state.variantBatchLimit ?? 16;
    const detailBatch = !input.stopAfterNewCandidates && batchLimit === 64 ? 64 : 8;
    input.signal.throwIfAborted();
    if (warmCandidatesFirst && !state.records.length && state.variantCursor === state.variantKeys.length) {
      warmCandidatesFirst = false;
      prioritized = false;
    }
    if ((warmCandidatesFirst || state.itemCursor === state.itemIds.length) && !prioritized) {
      prioritizePendingDiscovery(state, input.characterLevel);
      prioritized = true;
    }
    if (state.itemCursor < state.itemIds.length && !warmCandidatesFirst) {
      const ids = state.itemIds.slice(state.itemCursor, state.itemCursor + catalogBatch);
      // See the complete bounded summary domain before spending detail/native work.
      // Base required level is not an auction variant's actual scaled requirement.
      const records = await measure("catalog", () => lookupGearRecords(ids, input.locale, undefined, undefined, input.signal, true));
      input.signal.throwIfAborted();
      acceptCatalogSummaries(state, ids, records, input.selectedSlots);
      input.onProgress?.({ phase: "catalog", completed: state.itemCursor, total: state.itemIds.length });
    } else if (state.variantCursor < state.variantKeys.length && (!state.records.length || compareCatalogHints(
      state.catalogHints?.get(state.offers.get(state.variantKeys[state.variantCursor])?.[0]?.itemId ?? 0),
      state.catalogHints?.get(state.records[0].externalId), input.characterLevel) <= 0)) {
      // Each candidate may also need an exact reference control.
      const size = input.stopAfterNewCandidates ? initialVariantBatch : batchLimit / 2;
      const keys = state.variantKeys.slice(state.variantCursor, state.variantCursor + size);
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
        const references = await measure("references", () => getAuctionItemReferences(missing, input.region, input.token, input.signal, input.locale));
        for (const id of missing) state.references.set(id, references.get(id) ?? null);
      }
      const references = ids.flatMap(id => {
        const reference = state.references.get(id);
        if (!reference || state.verifiedReferences.has(id) || state.rejectedReferences.has(id)) return [];
        return [{ offer: reference.offer, slot: probes.find(probe => probe.offer.itemId === id)!.slot }];
      });
      const simcSlot = (slot: string) => ({ FINGER_1: "finger1", FINGER_2: "finger2", TRINKET_1: "trinket1", TRINKET_2: "trinket2" }[slot] ?? slot.toLowerCase());
      // A failed base reference can only be rescued by the exact equipped instance.
      // Keep the original probes for coverage, rejection bookkeeping and timed retries.
      const equipped = input.equipment && ids.some(id => !state.verifiedReferences.has(id))
        ? new Map(equippedAuctionReferences(input.equipment).map(reference => [auctionVariantKey(reference.offer), reference])) : undefined;
      const nativeProbes = probes.filter(({ offer }) => state.verifiedReferences.has(offer.itemId) ||
        (!state.rejectedReferences.has(offer.itemId) && state.references.get(offer.itemId)) || equipped?.has(auctionVariantKey(offer)));
      const resolution = nativeProbes.length ? await measure("variants", () => resolveAuctionVariants({ offers: [...references, ...nativeProbes].map(probe => ({ offer: probe.offer, slot: simcSlot(probe.slot) })),
        batchLimit, spec: input.spec, characterLevel: input.characterLevel, signal: input.signal })) : null;
      input.signal.throwIfAborted();
      if (resolution) state.variantBatchLimit = resolution.batchLimit;
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
      const instanceReferences = ids.some(id => state.rejectedReferences.has(id)) ? equipped : undefined;
      for (const probe of probes) {
        const key = auctionVariantKey(probe.offer), metadata = resolution?.variants.get(key);
        const instance = instanceReferences?.get(key);
        const instanceVerified = instance && nativeMatchesItemReference(instance, metadata, true);
        if (!metadata || metadata.error || (!state.verifiedReferences.has(probe.offer.itemId) && !instanceVerified) || metadata.itemLevel > 1000 ||
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
        const requirement = variant.resolution?.enhancements;
        if (requirement?.status === "verified" && requirement.requiredProfessionId) {
          const eligible = professionEligibility(input.context(probe.slot).professions, requirement.requiredProfessionId, requirement.requiredProfessionRank);
          if (eligible !== "eligible") {
            if (eligible === "unknown") state.eligibilityUnverifiedItems.add(probe.offer.itemId);
            continue;
          }
        }
        if (instanceVerified) {
          (state.equippedVerifiedVariants ??= new Set()).add(key);
          state.rejectedVariants.delete(key);
        }
        const reference = instanceVerified ? instance : state.references.get(probe.offer.itemId);
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
        if (candidates.length) { state.candidates.set(key, candidates); optionCache.delete(state); }
      }
      // A sold effect skipped before resolution may return in a later
      // snapshot. It must then be queued again rather than lost forever.
      for (const key of keys) if (!state.offers.has(key)) state.queuedVariants.delete(key);
      state.variantCursor += keys.length;
      input.onProgress?.({ phase: "variants", completed: state.variantCursor, total: state.variantKeys.length });
    } else if (state.records.length) {
      const records = state.records.slice(0, detailBatch);
      const entities = await measure("details", () => gearEntityDetails(records, input.locale, false, input.signal, true));
      input.signal.throwIfAborted();
      for (const record of records) {
        state.detailedItems.add(record.externalId);
        const entity = entities.find(entity => entity.externalId === record.externalId);
        if (!entity) {
          state.catalogMissing.add(record.externalId); state.entities.set(record.externalId, null);
          state.catalogRetryAt.set(record.externalId, Date.now() + catalogRetryMs);
          continue;
        }
        state.catalogMissing.delete(record.externalId);
        state.eligibilityUnverifiedItems.delete(record.externalId);
        state.catalogRetryAt.delete(record.externalId);
        rememberCatalogClass(state, entity);
        // Public summaries may omit the registry; classify from authoritative
        // details before treating missing equip fields as unknown gear data.
        if (knownNonGear(entity)) { state.entities.set(record.externalId, null); continue; }
        const offer = state.offers.get(state.itemVariants.get(entity.externalId)?.[0] ?? "")?.[0];
        const normalized = input.selectedSlots.map(slot => normalizeGearCandidate(offer ? variantEntity(entity, offer) : entity, input.context(slot)));
        rememberUnverifiedEligibility(state, entity.externalId, normalized);
        if (!offer) { state.entities.set(entity.externalId, entity); continue; }
        const eligible = normalized.some(candidate => candidate.eligible);
        state.entities.set(entity.externalId, eligible ? entity : null);
        if (eligible) queueVariants(state, entity.externalId);
      }
      updateUnsupportedCoverage(state);
      state.records.splice(0, records.length);
      prioritized = false;
    } else if (state.pendingClassification?.size) {
      // Repair holes in published summaries after processing available gear.
      // A 404 or transient failure leaves the original coverage gap and retry.
      const ids: number[] = [];
      for (const id of state.pendingClassification) {
        ids.push(id);
        if (ids.length === detailBatch) break;
      }
      const nonEquipment = new Map<number, number>();
      try {
        await measure("references", () => getAuctionItemReferences(ids, input.region, input.token, input.signal, input.locale, nonEquipment));
      } catch {
        input.signal.throwIfAborted();
      }
      input.signal.throwIfAborted();
      for (const [id, itemClass] of nonEquipment) {
        (state.catalogItemClasses ??= new Map()).set(id, itemClass);
        state.catalogUnmatched.delete(id);
        state.catalogRetryAt.delete(id);
      }
      for (const id of ids) state.pendingClassification.delete(id);
      updateUnsupportedCoverage(state);
    } else break;
    input.onCheckpoint?.();
    if (input.stopAfterNewCandidates && state.candidates.size > initialCandidates) break;
  }
  input.signal.throwIfAborted();
  if (auctionGearDiscoveryComplete(state)) state.discoveredSnapshotId = state.marketId;
}

export function auctionGearDiscoveryOptions(state: AuctionGearDiscovery): AuctionGearOption[] {
  const cached = optionCache.get(state);
  if (cached && cached.offers === state.offers && cached.candidates === state.candidates &&
      cached.candidateCount === state.candidates.size && cached.hints === state.catalogHints &&
      cached.hintCount === (state.catalogHints?.size ?? 0) && cached.level === state.catalogPriorityLevel) return cached.options.slice();
  const options: AuctionGearOption[] = [];
  const entries = [...state.candidates];
  // Refresh can resolve a newly arrived high-priority item after older items.
  // Publish the same global hint order; Map insertion order is only a stable tie.
  if (state.catalogPriorityLevel !== undefined) entries.sort(([, left], [, right]) => compareCatalogHints(
    state.catalogHints?.get(left[0]?.itemId), state.catalogHints?.get(right[0]?.itemId), state.catalogPriorityLevel!));
  for (const [key, candidates] of entries) for (const offer of state.offers.get(key) ?? []) for (const candidate of candidates) options.push({
    id: `${offer.auctionId}:${candidate.slotType}:${key}`, auctionId: offer.auctionId, quantity: offer.quantity,
    costCopper: offer.buyoutCopper, candidate, variantKey: key,
  });
  optionCache.set(state, { offers: state.offers, candidates: state.candidates, candidateCount: state.candidates.size,
    hints: state.catalogHints, hintCount: state.catalogHints?.size ?? 0, level: state.catalogPriorityLevel, options });
  return options.slice();
}

export function auctionGearDiscoveryCoverage(state: AuctionGearDiscovery) {
  const keys = new Set(state.offers.keys());
  const currentIds = new Set([...state.offers.values()].map(offers => offers[0].itemId));
  const rejected = [...state.rejectedVariants].filter(key => keys.has(key)).length;
  const referenceRejected = [...state.rejectedReferences].filter(id => currentIds.has(id) &&
    (state.itemVariants.get(id) ?? []).some(key => !state.equippedVerifiedVariants?.has(key))).length;
  const catalogMissing = [...state.catalogMissing].filter(id => currentIds.has(id)).length;
  const catalogUnmatched = [...state.catalogUnmatched].filter(id => currentIds.has(id)).length;
  const eligibilityUnverifiedItems = [...state.eligibilityUnverifiedItems].filter(id => currentIds.has(id)).length;
  const discoveryComplete = auctionGearDiscoveryComplete(state);
  // A lot counts once even when its variant equips multiple slots. Counting
  // directly avoids constructing and priority-sorting every slot option.
  const matchedLots = new Set<number>();
  for (const [key, candidates] of state.candidates) if (candidates.length) {
    for (const offer of state.offers.get(key) ?? []) matchedLots.add(offer.auctionId);
  }
  return {
    affordableLots: state.affordableLots,
    matchedLots: matchedLots.size,
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
