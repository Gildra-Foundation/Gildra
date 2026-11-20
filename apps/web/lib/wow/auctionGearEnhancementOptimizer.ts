import { createHash } from "node:crypto";
import { combinedRingRatings90 } from "./auctionRingRatings";
import { compareGearSimulationResults } from "./gearSimulation";
import { assertFreshMarket } from "./auctionMarket";
import { createExactCommodityPriceCache, type ExactCommodityPrices } from "./auctionGearCost";
import type { GearPlanSimulation } from "./auctionGearTypes";

export type Enhancement = { key: string; kind: "gem" | "enchant"; consumableItemId: number; simulationId: number;
  uniqueEquipped?: boolean; profession?: { id: number; rank: number }; category?: { id: string; limit: number } };
export type EnhancementCharacter = { professions?: Record<string, number> };
export type EnhancementSlot = { slotType: string; variantKey: string; metadataKey: string; owned: boolean;
  sockets: readonly { key: string; type: string }[];
  installed?: { enchant?: Enhancement; gems: readonly (Enhancement | null)[] };
  /** Owned equipment is preserved unless this explicit opt-in is set. */
  allowOwnedChanges?: boolean; ownedItemId?: number };
export type EnhancementResolution = { verified: false; reason: string } | { verified: true;
  enchantApplicable: boolean; enchantChoices: readonly Enhancement[]; gemChoices: Record<string, readonly Enhancement[]>; coverageGaps?: readonly string[] };
export type EnhancementCatalog = { version: string; complete: boolean;
  resolve: (slot: EnhancementSlot, character: EnhancementCharacter) => EnhancementResolution };
/** Only changed positions are written to the owned armory instance. */
export type OwnedAuctionGearChange = { slotType: string; itemId: number; enchantId?: number; gems: { index: number; itemId: number }[] };
export type PricedEnhancementConfiguration = { key: string; slots: { slotType: string; variantKey: string; enchantId: number; gemIds: number[] }[];
  ownedChanges?: OwnedAuctionGearChange[];
  consumables: { itemId: number; kind: "gem" | "enchant"; quantity: number; quotedCopper: number | null; levels: { unitCopper: number; quantity: number }[]; missingQuantity: number }[];
  itemsCopper: number; totalCopper: number | null; fullyEnhanced: boolean;
  status: "priced" | "price_unknown" | "market_unverified" | "over_budget";
  sourceUpdatedAt: string | null };
type MeasuredConfiguration = { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
export type ValuePrecisionContenders<T> = { lower?: T; upper?: T };

/** Order priced configurations with positive gains against the same baseline. */
export function compareAuctionEnhancementValue(a: MeasuredConfiguration, b: MeasuredConfiguration, baselineDps: number) {
  const aCost = a.configuration.totalCopper!, bCost = b.configuration.totalCopper!;
  return aCost / (a.simulation.dps - baselineDps) - bCost / (b.simulation.dps - baselineDps) ||
    b.simulation.dps - a.simulation.dps || aCost - bCost || a.configuration.key.localeCompare(b.configuration.key);
}

/** Cost / gain depends on the shared baseline. Nominate the best receipt at
 * either end of its screening interval for an independent finalist measurement.
 * These nominations never exclude a configuration from enumeration. */
export function trackValuePrecision<T>(best: ValuePrecisionContenders<T>, candidate: T,
  measured: (value: T) => MeasuredConfiguration, baseline: GearPlanSimulation) {
  const row = measured(candidate);
  for (const side of ["lower", "upper"] as const) {
    const reference = baseline.dps + (side === "lower" ? -1.96 : 1.96) * baseline.dpsError;
    if (row.simulation.dps <= reference || row.configuration.totalCopper === null) continue;
    const prior = best[side];
    if (!prior || compareAuctionEnhancementValue(row, measured(prior), reference) < 0) best[side] = candidate;
  }
}

export type EnhancementCheckpoint = { version: 1; inputKey: string; nextConfiguration: number;
  /** Authoritative decimal cursor for exhaustive traversal; JSON preserves every digit. */
  exactNextConfiguration?: string;
  /** Earlier checkpoints compacted only unavailable commodities. */
  screenCoverageProbed?: true;
  ringPricePruning?: { branches: string; configurations: string };
  pricedAxes?: true | "within_budget" | "equivalent_scrolls" | "equivalent_gems" | "conditional_ring_gems" | "combined_ring_cost";
  cache: Record<string, GearPlanSimulation>; totalSimulations?: number; traversalSteps?: number; seedSelections?: number[][]; nextSeed?: number; reasons?: string[];
  confirmed?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  valuePrecision?: ValuePrecisionContenders<MeasuredConfiguration>;
  bestValueConfirmed?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  bestDpsConfirmed?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  bestMeasuredDps?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  secondMeasuredDps?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  thirdMeasuredDps?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  finalists?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation }[] };
export type EnhancementOptimizerInput = { slots: readonly EnhancementSlot[]; catalog: EnhancementCatalog; character: EnhancementCharacter;
  prices: { prices: ExactCommodityPrices; sourceUpdatedAt: string | null }; itemsCopper: number; budgetCopper: number;
  simulationIdentity: string; signal: AbortSignal;
  simulationCache?: Record<string, GearPlanSimulation>;
  /** Enumerate every supported priced configuration, including partial and bare. */
  exhaustive?: boolean;
  ratingRingSlots?: ReadonlySet<string>;
  purchasedEnchantEffect?: (slotType: string, id: number) => number | undefined;
  purchasedGemEffect?: (slotType: string, id: number, enchantId: number) => number | undefined;
  ownedGemEffect?: (slotType: string, id: number, enchantId: number) => number | undefined;
  onMeasured?: (configuration: PricedEnhancementConfiguration, simulation: GearPlanSimulation) => void;
  valuePrecision?: boolean;
  objective?: "dps" | "value"; baselineDps?: number; baseline?: GearPlanSimulation;
  simulate: (configuration: PricedEnhancementConfiguration, signal: AbortSignal) => Promise<GearPlanSimulation>;
  shouldYield?: () => boolean; onCacheHit?: () => void; checkpoint?: EnhancementCheckpoint;
  /** Runtime worker capacity; never part of the durable traversal identity. */
  simulationConcurrency?: 1 | 2;
  remainingScreenComparisons?: () => number;
  onPricedScreenWitness?: (configuration: PricedEnhancementConfiguration) => void;
  /** Maximum candidates per native request confirmed by this worker. */
  simulationBatchSize?: number;
  /** Worker can import owned item edits independently for each profileset. */
  simulationOwnedBatch?: boolean;
  /** Preserve validated completed siblings on interruption; cursor stays put. */
  onCheckpoint?: (checkpoint: EnhancementCheckpoint) => void;
  limits?: { configurations?: number; simulations?: number; finalists?: number }; now?: number };
export type EnhancementOptimizerResult = { checkpoint: EnhancementCheckpoint; complete: boolean; searchLimited: boolean; catalogComplete: boolean;
  visited: number; simulations: number; reasons: string[];
  configurations: PricedEnhancementConfiguration[];
  finalists: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation }[] };

const canonical = (value: unknown): unknown => {
  // Repeated catalog records occur in both resolutions and axes. Reuse their
  // canonical form only during this synchronous hash, never across a retry or
  // quote/profile mutation. The resulting JSON and checkpoint keys stay exact.
  const objects = new WeakMap<object, unknown>(), orders = new Map<string, string[]>();
  const visit = (current: unknown): unknown => {
    if (!current || typeof current !== "object") return current;
    const previous = objects.get(current);
    if (previous !== undefined) return previous;
    if (Array.isArray(current)) {
      const result = current.map(visit); objects.set(current, result); return result;
    }
    const keys = Object.keys(current), shape = JSON.stringify(keys);
    let ordered = orders.get(shape);
    if (!ordered) { ordered = keys.sort((a,b)=>a.localeCompare(b)); orders.set(shape, ordered); }
    const result: Record<string, unknown> = Object.create(null);
    objects.set(current, result);
    for (const key of ordered) result[key] = visit((current as Record<string, unknown>)[key]);
    return result;
  };
  return visit(value);
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;

type Choice = { slot: number; socket: number | null; enhancement: Enhancement | null; retained: boolean };
type RingPairGuards = Map<Choice, { enchantAxis: number; enchants: Set<Choice> }>;

/** Removing both source purchases saves at least their first-unit prices. Adding
 * both replacements costs at most their last potentially required units. A
 * strict gap therefore holds for every completion, including shared stock. */
function markCostlierRingPairs(axes: Choice[][], slots: readonly EnhancementSlot[], ringSlots: ReadonlySet<string>,
  prices: ExactCommodityPrices, maximumMarginal: (id: number) => number, guards: RingPairGuards, unique: Set<string>) {
  const allowed = (choice: Choice, owned: boolean) => {
    const e = choice.enhancement;
    // An unchanged owned socket or enchant may carry native instance data.
    // Comparing two explicit purchases removes the same installed effects.
    return !choice.retained && (!owned || e !== null) && (!e || (!e.category && !e.profession && !e.uniqueEquipped &&
      !unique.has(e.kind + ":" + e.simulationId) && (e.kind !== "gem" || e.consumableItemId === e.simulationId)));
  };
  const priceRange = (choice: Choice) => {
    const id = choice.enhancement?.consumableItemId;
    return { choice, first: id ? prices[id].ladder[0][0] : 0, last: id ? maximumMarginal(id) : 0 };
  };
  for (const [enchantAxis, axis] of axes.entries()) {
    const { slot, socket } = axis[0], target = slots[slot];
    if (socket !== null || !ringSlots.has(target.slotType) || target.owned && !(target.allowOwnedChanges && target.ownedItemId) ||
        target.sockets.length !== 1 || target.sockets[0].type !== "14") continue;
    const socketAxis = axes[enchantAxis + 1];
    if (!socketAxis || socketAxis[0].slot !== slot || socketAxis[0].socket !== 0) continue;
    const gems = socketAxis.filter(c => allowed(c, target.owned) && combinedRingRatings90(0, c.enhancement?.simulationId ?? 0)).map(priceRange);
    const enchants = axis.filter(c => allowed(c, target.owned) && combinedRingRatings90(c.enhancement?.simulationId ?? 0, 0)).map(priceRange);
    const groups = new Map<string, { upper: number; pairs: { gem: Choice; enchant: Choice; lower: number }[] }>();
    for (const gem of gems) for (const enchant of enchants) {
      const key = combinedRingRatings90(enchant.choice.enhancement?.simulationId ?? 0, gem.choice.enhancement?.simulationId ?? 0)!.join(",");
      const group = groups.get(key) ?? { upper: Infinity, pairs: [] };
      const upper = gem.last + enchant.last, lower = gem.first + enchant.first;
      if (Number.isSafeInteger(upper)) group.upper = Math.min(group.upper, upper);
      if (Number.isSafeInteger(lower)) group.pairs.push({ gem: gem.choice, enchant: enchant.choice, lower });
      groups.set(key, group);
    }
    for (const group of groups.values()) for (const { gem, enchant, lower } of group.pairs) {
      if (group.upper >= lower) continue;
      const skipped = guards.get(gem) ?? { enchantAxis, enchants: new Set<Choice>() };
      skipped.enchants.add(enchant);
      guards.set(gem, skipped);
    }
  }
}

/** Keep a cheaper purchase only when even its last potentially required
 * unit costs strictly less than the first unit it replaces. Identical installed
 * enchants and certified gem pairs preserve combat in every other socket. */
function pruneCostlierEnhancements(axes: Choice[][], prices: ExactCommodityPrices, slots: readonly EnhancementSlot[],
  purchasedGemEffect: EnhancementOptimizerInput["purchasedGemEffect"],
  ownedGemEffect: EnhancementOptimizerInput["ownedGemEffect"],
  conditional: Map<Choice, { axis: number; enchants: Set<number> }> | undefined,
  ringSlots?: ReadonlySet<string>, pairGuards?: RingPairGuards,
  purchasedEnchantEffect?: EnhancementOptimizerInput["purchasedEnchantEffect"]) {
  const originalAxes = axes.slice();
  const lastPrice = new Map<number, number>();
  const maximumMarginal = (id: number) => {
    const cached = lastPrice.get(id);
    if (cached !== undefined) return cached;
    let demand = originalAxes.filter(axis => axis.some(c => !c.retained && c.enhancement?.consumableItemId === id)).length;
    let price = Infinity;
    for (const [unit, quantity] of prices[id].ladder) {
      demand -= quantity;
      if (demand <= 0) { price = unit; break; }
    }
    lastPrice.set(id, price);
    return price;
  };
  // Compute demand against the original axes, including restricted purchases
  // that may consume one of the same scrolls on a different slot.
  const dominated = new Set<Choice>();
  // A retained or restricted copy in another position can make this ID unique
  // for the entire loadout, even when the current offer has no such flag.
  const uniqueGems = new Set<number>(), uniqueEnchants = new Set<number>();
  if (purchasedGemEffect || ownedGemEffect || purchasedEnchantEffect) {
    for (const axis of axes) for (const { enhancement } of axis) {
      if (enhancement?.uniqueEquipped)
        (enhancement.kind === "gem" ? uniqueGems : uniqueEnchants).add(enhancement.simulationId);
    }
  }
  const enchantAxes = new Map<number, number>();
  for (const [index, axis] of axes.entries()) if (axis[0].socket === null) enchantAxes.set(axis[0].slot, index);
  let removedGems = false;
  for (const axis of axes) {
    const { socket, slot } = axis[0], target = slots[slot];
    const gemEffect = target.owned ? ownedGemEffect : purchasedGemEffect;
    if (socket !== null && (!gemEffect || target.sockets.length !== 1 || target.sockets[socket].type !== "14")) continue;
    const byEffect = new Map<number, Choice[]>();
    for (const choice of axis) {
      const e = choice.enhancement;
      if (choice.retained || !e || e.category || e.uniqueEquipped || e.profession) continue;
      let effect = e.simulationId;
      if (socket === null && purchasedEnchantEffect) {
        const certified = purchasedEnchantEffect(target.slotType, e.simulationId);
        if (certified !== undefined) {
          if (uniqueEnchants.has(e.simulationId)) continue;
          effect = certified;
        }
      }
      if (socket !== null) {
        if (e.consumableItemId !== e.simulationId || uniqueGems.has(e.simulationId)) continue;
        const certified = gemEffect?.(target.slotType, e.simulationId, 0);
        if (certified === undefined) continue;
        effect = certified;
      }
      const group = byEffect.get(effect);
      if (group) group.push(choice);
      else byEffect.set(effect, [choice]);
    }
    for (const group of byEffect.values()) {
      if (group.length < 2) continue;
      const bound = group.reduce((min, c) => Math.min(min, maximumMarginal(c.enhancement!.consumableItemId)), Infinity);
      for (const c of group) if (bound < prices[c.enhancement!.consumableItemId].ladder[0][0]) {
        if (socket !== null && gemEffect) {
          const enchantAxis = enchantAxes.get(slot);
          if (enchantAxis !== undefined) {
            const substitutes = group.filter(other => maximumMarginal(other.enhancement!.consumableItemId) <
              prices[c.enhancement!.consumableItemId].ladder[0][0]);
            const choices = axes[enchantAxis].map(choice => choice.enhancement?.simulationId ?? 0);
            const safe = choices.filter(enchant => {
              const effect = gemEffect(target.slotType, c.enhancement!.simulationId, enchant);
              return effect !== undefined && substitutes.some(other => gemEffect(target.slotType, other.enhancement!.simulationId, enchant) === effect);
            });
            if (safe.length !== choices.length) {
              if (safe.length) conditional?.set(c, { axis: enchantAxis, enchants: new Set(safe) });
              continue;
            }
          }
          removedGems = true;
        }
        dominated.add(c);
      }
    }
  }
  if (dominated.size) {
    for (const [index, axis] of axes.entries()) axes[index] = axis.filter(c => !dominated.has(c));
  }
  if (ringSlots?.size && pairGuards) {
    const unique = new Set<string>();
    for (const axis of originalAxes) for (const { enhancement } of axis) {
      if (enhancement?.uniqueEquipped) unique.add(enhancement.kind + ":" + enhancement.simulationId);
    }
    markCostlierRingPairs(axes, slots, ringSlots, prices, maximumMarginal, pairGuards, unique);
    if (pairGuards.size) return "combined_ring_cost";
  }
  return conditional?.size ? "conditional_ring_gems" : removedGems ? "equivalent_gems" : dominated.size ? "equivalent_scrolls" : undefined;
}
function measurement(value: GearPlanSimulation) {
  if (!Number.isFinite(value.dps) || value.dps <= 0 || !Number.isFinite(value.dpsError) || value.dpsError < 0 ||
      value.confidence !== 95 || !positive(value.iterations) || !value.engine.startsWith("SimulationCraft")) throw new Error("invalid_simulation_result");
  return { dps:value.dps, dpsError:value.dpsError, confidence:value.confidence, iterations:value.iterations, engine:value.engine };
}
function validateEnhancement(e: Enhancement, kind: Enhancement["kind"], retained = false) {
  if (e.kind !== kind || !e.key || (!positive(e.consumableItemId) && !(retained && e.consumableItemId === 0)) || !positive(e.simulationId) ||
      (e.uniqueEquipped !== undefined && typeof e.uniqueEquipped !== "boolean") ||
      (e.profession && (!positive(e.profession.id) || !Number.isSafeInteger(e.profession.rank) || e.profession.rank < 0)) ||
      (e.category && (!e.category.id || !positive(e.category.limit)))) throw new Error("invalid_enhancement_catalog");
}

/** Exact configuration evaluation, no additive stat/DPS approximation. Run once per equipment finalist.
 * Checkpoint is invalidated by market/rules/character changes; simulation cache identity includes exact installed configuration.
 */
export async function optimizeAuctionGearEnhancements(input: EnhancementOptimizerInput): Promise<EnhancementOptimizerResult> {
  const { catalog, character, signal } = input;
  const exact = input.exhaustive === true;
  // A resumed ordinal must use exactly the same choices per socket and enchant.
  const pricedAxes = exact && (input.checkpoint ? input.checkpoint.pricedAxes : "within_budget");
  const remainingCopper = input.budgetCopper - input.itemsCopper;
  let hasUnaffordableChoice = false;
  const parallel = exact && input.simulationConcurrency === 2;
  const batchSize = input.simulationBatchSize ?? 0;
  const windowSize = parallel ? 2 * Math.max(1, batchSize) : 1;
  signal.throwIfAborted();
  const baseline = input.baseline ? measurement(input.baseline) : undefined;
  const baselineDps = baseline?.dps ?? input.baselineDps;
  const bounds = { configurations: input.limits?.configurations ?? 128, simulations: input.limits?.simulations ?? 1, finalists: input.limits?.finalists ?? 3 };
  if (!positive(bounds.configurations) || bounds.configurations > 1024 || !positive(bounds.simulations) || bounds.simulations > Math.max(12, windowSize) ||
      !Number.isInteger(batchSize) || batchSize < 0 || batchSize > 25 ||
      !positive(bounds.finalists) || bounds.finalists > 3 || !Number.isSafeInteger(input.itemsCopper) || input.itemsCopper < 0 ||
      !Number.isSafeInteger(input.budgetCopper) || input.budgetCopper < 0 || !input.simulationIdentity || !catalog.version ||
      (input.objective !== undefined && !["dps", "value"].includes(input.objective)) ||
      (input.exhaustive !== undefined && typeof input.exhaustive !== "boolean") ||
      (input.simulationConcurrency !== undefined && input.simulationConcurrency !== 1 && input.simulationConcurrency !== 2) ||
      (input.objective === "value" && (!Number.isFinite(baselineDps) || baselineDps! <= 0)) ||
      input.slots.length > 20) throw new Error("invalid_enhancement_input");
  const slots = [...input.slots].sort((a,b) => a.slotType.localeCompare(b.slotType));
  const commodityPrices = createExactCommodityPriceCache(input.prices.prices);
  if (new Set(slots.map(s => s.slotType)).size !== slots.length) throw new Error("duplicate_equipment_slot");
  const axes: Choice[][] = [], resolutions: EnhancementResolution[] = [], reasons = new Set<string>();
  for (const [slotIndex, slot] of slots.entries()) {
    if (!slot.variantKey || !slot.metadataKey || slot.sockets.length > 8 || new Set(slot.sockets.map(s=>s.key)).size !== slot.sockets.length ||
        (slot.installed && slot.installed.gems.length !== slot.sockets.length) || (!slot.owned && slot.installed)) throw new Error("invalid_enhancement_slot");
    const resolved = catalog.resolve(slot, character); resolutions.push(resolved);
    if (!resolved.verified) { reasons.add(resolved.reason); continue; }
    for (const gap of resolved.coverageGaps ?? []) reasons.add(gap);
    if (!resolved.enchantApplicable && slot.installed?.enchant) throw new Error("invalid_installed_enchant");
    const addAxis = (socket: number | null, options: readonly Enhancement[], installed: Enhancement | null) => {
      const kind = socket === null ? "enchant" : "gem";
      const consumablesByEffect = new Map<number, Set<number>>();
      if (installed) validateEnhancement(installed, kind, true);
      const choices: Choice[] = [{slot:slotIndex,socket,enhancement:installed,retained:Boolean(installed)}];
      if (!slot.owned || slot.allowOwnedChanges) for (const e of [...options].sort((a,b)=>a.key.localeCompare(b.key))) {
        validateEnhancement(e, kind);
        if (e.profession && (character.professions?.[String(e.profession.id)] ?? -1) < e.profession.rank) continue;
        if (installed?.simulationId === e.simulationId) continue;
        const consumables = consumablesByEffect.get(e.simulationId);
        if (consumables?.has(e.consumableItemId)) continue;
        if (consumables) consumables.add(e.consumableItemId);
        else consumablesByEffect.set(e.simulationId, new Set([e.consumableItemId]));
        choices.push({slot:slotIndex,socket,enhancement:e,retained:false});
      }
      const priceRank = (choice: Choice) => {
        if (!choice.enhancement) return Infinity;
        if (choice.retained) return 0;
        const cost = commodityPrices.cost(choice.enhancement.consumableItemId,1);
        if (cost === null) reasons.add("price_unknown_or_insufficient_quantity");
        return cost ?? Infinity;
      };
      const ranked = new Map(choices.map(choice=>[choice,priceRank(choice)]));
      choices.sort((a,b)=>Number(a.enhancement === null)-Number(b.enhancement === null) || ranked.get(a)!-ranked.get(b)!);
      if (pricedAxes) {
        axes.push(choices.filter(choice => {
          if (!choice.enhancement || choice.retained) return true;
          const unitCost = ranked.get(choice)!;
          if (!Number.isFinite(unitCost)) return false;
          // Additional purchases can only increase the total. The full quantity ladder
          // still applies to affordable choices when constructing an actual receipt.
          if (pricedAxes !== true && unitCost > remainingCopper) {
            hasUnaffordableChoice = true;
            return false;
          }
          return true;
        }));
      } else axes.push(choices);
    };
    if (resolved.enchantApplicable) addAxis(null, resolved.enchantChoices, slot.installed?.enchant ?? null);
    for (const [index, socket] of slot.sockets.entries()) {
      if (!Object.hasOwn(resolved.gemChoices, socket.key)) { reasons.add("socket_compatibility_unverified"); continue; }
      addAxis(index, resolved.gemChoices[socket.key], slot.installed?.gems[index] ?? null);
    }
  }
  const pairProofAllowed = !input.checkpoint || pricedAxes === "combined_ring_cost";
  const pairGuards: RingPairGuards | undefined = exact && pairProofAllowed && input.ratingRingSlots?.size ? new Map() : undefined;
  const conditionalAllowed = pairProofAllowed || pricedAxes === "conditional_ring_gems";
  const gemProofAllowed = conditionalAllowed || pricedAxes === "equivalent_gems";
  const conditional = exact && (input.purchasedGemEffect || input.ownedGemEffect) && conditionalAllowed
    ? new Map<Choice, {axis: number; enchants: Set<number>}>() : undefined;
  const compact = exact && (gemProofAllowed || pricedAxes === "equivalent_scrolls")
    ? pruneCostlierEnhancements(axes, input.prices.prices, slots, gemProofAllowed ? input.purchasedGemEffect : undefined,
        gemProofAllowed ? input.ownedGemEffect : undefined, conditional, input.ratingRingSlots, pairGuards, input.purchasedEnchantEffect) : undefined;
  if (slots.some(s=>s.owned && !s.allowOwnedChanges)) reasons.add("owned_equipment_preserved");
  const proofVersion = { combined_ring_cost: "priced-exhaustive-v7", conditional_ring_gems: "priced-exhaustive-v6", equivalent_gems: "priced-exhaustive-v5", equivalent_scrolls: "priced-exhaustive-v4" };
  const inputKey = hash({ traversal: compact ? proofVersion[compact] : pricedAxes === "within_budget" ? "priced-exhaustive-v3" : pricedAxes ? "priced-exhaustive-v2" : exact ? "priced-exhaustive-v1" : "priced-pruned-diverse-v4", slots, resolutions, catalog:catalog.version, character,
    ...(pairGuards?.size ? { costlierRingPairs: [...pairGuards].map(([gem, guard]) =>
      [gem.slot, gem.enhancement?.key ?? null, guard.enchantAxis, [...guard.enchants].map(c => c.enhancement?.key ?? null)]) } : {}),
    ...(conditional?.size ? { conditionalRingGems: [...conditional].map(([choice, guard]) =>
      [choice.slot, choice.socket, choice.enhancement!.simulationId, guard.axis, [...guard.enchants]]) } : {}),
    prices:exact ? input.prices.prices : input.prices,
    ...(input.valuePrecision ? {valuePrecision:1} : {}), budget:input.budgetCopper, items:input.itemsCopper, objective:input.objective ?? "dps", baselineDps, baseline, identity:input.simulationIdentity, axes });
  if (input.checkpoint && (input.checkpoint.version !== 1 || input.checkpoint.inputKey !== inputKey)) throw new Error("enhancement_checkpoint_changed");
  const checkpoint: EnhancementCheckpoint = input.checkpoint ? structuredClone(input.checkpoint) : {version:1,inputKey,nextConfiguration:0,cache:{},...(exact?{exactNextConfiguration:"0",pricedAxes:compact ?? "within_budget" as const}:{})};
  if (!Number.isSafeInteger(checkpoint.nextConfiguration) || checkpoint.nextConfiguration < 0) throw new Error("invalid_enhancement_checkpoint");
  if (exact && (typeof checkpoint.exactNextConfiguration !== "string" || checkpoint.exactNextConfiguration.length > 512 ||
    !/^(0|[1-9][0-9]*)$/.test(checkpoint.exactNextConfiguration))) throw new Error("invalid_enhancement_checkpoint");
  checkpoint.totalSimulations ??= 0;
  checkpoint.traversalSteps ??= 0;
  checkpoint.nextSeed ??= 0;
  if (![checkpoint.totalSimulations,checkpoint.traversalSteps,checkpoint.nextSeed].every(value=>Number.isSafeInteger(value)&&value!>=0)) throw new Error("invalid_enhancement_checkpoint");
  checkpoint.cache = {...input.simulationCache,...checkpoint.cache};
  const confirmedEntries=[checkpoint.valuePrecision?.lower,checkpoint.valuePrecision?.upper,checkpoint.confirmed,checkpoint.bestValueConfirmed,checkpoint.bestDpsConfirmed];
  for (const retained of [...confirmedEntries, ...(exact?[checkpoint.bestMeasuredDps,checkpoint.secondMeasuredDps,checkpoint.thirdMeasuredDps,...checkpoint.finalists??[]]:[])]) {
    if (!retained) continue;
    const simulation = measurement(retained.simulation), config = retained.configuration;
    if (!config || config.status !== "priced" || (!exact && !config.fullyEnhanced) || config.itemsCopper !== input.itemsCopper ||
      !Number.isSafeInteger(config.totalCopper) || Number(config.totalCopper) < input.itemsCopper || Number(config.totalCopper) > input.budgetCopper ||
      !checkpoint.cache[config.key] || JSON.stringify(measurement(checkpoint.cache[config.key])) !== JSON.stringify(simulation) ||
      baseline && (simulation.engine !== baseline.engine || confirmedEntries.includes(retained) &&
        (!compareGearSimulationResults(baseline, simulation).uncertainty.significant || simulation.dps <= baseline.dps))) {
      throw new Error("invalid_enhancement_checkpoint");
    }
  }
  const finalists = [...(checkpoint.finalists ?? [])];
  let confirmed = checkpoint.confirmed;
  let bestValueConfirmed = checkpoint.bestValueConfirmed, bestDpsConfirmed = checkpoint.bestDpsConfirmed;
  let bestMeasuredDps = checkpoint.bestMeasuredDps, secondMeasuredDps = checkpoint.secondMeasuredDps, thirdMeasuredDps = checkpoint.thirdMeasuredDps;
  const score = (f: typeof finalists[number], objective: "dps" | "value") => {
    if (objective !== "value") return f.simulation.dps;
    const gain = f.simulation.dps - baselineDps!;
    return f.configuration.totalCopper === 0 ? gain > 0 ? Infinity : gain < 0 ? -Infinity : 0 : gain / f.configuration.totalCopper!;
  };
  const rankFor = (objective: "dps" | "value") => (a: typeof finalists[number], b: typeof finalists[number]) => score(b,objective)-score(a,objective) || b.simulation.dps-a.simulation.dps ||
    a.configuration.totalCopper!-b.configuration.totalCopper! || a.configuration.key.localeCompare(b.configuration.key);
  const rank = rankFor(input.objective ?? "dps"), rankValue = rankFor("value"), rankDps = rankFor("dps");
  for (const reason of checkpoint.reasons ?? []) if(!exact || reason!=="market_unverified")reasons.add(reason);
  const configurations: PricedEnhancementConfiguration[] = [];
  let simulations = 0, visited = 0;
  let marketVerified = true;
  try { assertFreshMarket({ sourceUpdatedAt:input.prices.sourceUpdatedAt ?? "" }, input.now); } catch { marketVerified = false; reasons.add("market_unverified"); }
  const clearRetained = () => { delete checkpoint.valuePrecision; finalists.length = 0; confirmed = bestValueConfirmed = bestDpsConfirmed = bestMeasuredDps = secondMeasuredDps = thirdMeasuredDps = undefined;
    checkpoint.finalists=[];checkpoint.confirmed=checkpoint.bestValueConfirmed=checkpoint.bestDpsConfirmed=checkpoint.bestMeasuredDps=checkpoint.secondMeasuredDps=checkpoint.thirdMeasuredDps=undefined;
    // Fresh quotes may reuse native measurements, but must rebuild all price-certified leaders.
    if(exact) { checkpoint.exactNextConfiguration="0"; delete checkpoint.ringPricePruning; }
  };
  if (!marketVerified) clearRetained();
  else if (exact) for (const retained of [...finalists,checkpoint.valuePrecision?.lower,checkpoint.valuePrecision?.upper,confirmed,bestValueConfirmed,bestDpsConfirmed,bestMeasuredDps,secondMeasuredDps,thirdMeasuredDps]) {
    if(retained) retained.configuration.sourceUpdatedAt=input.prices.sourceUpdatedAt;
  }
  if (exact && !marketVerified) return {checkpoint,complete:true,searchLimited:true,catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists:[]};
  if (resolutions.some(r=>!r.verified) || reasons.has("socket_compatibility_unverified")) return {checkpoint,complete:true,searchLimited:true,catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists:[]};
  if (hasUnaffordableChoice) reasons.add("over_budget");
  const completeRules = resolutions.every(r => r.verified && !r.coverageGaps?.length);
  if (!exact && !completeRules) return {checkpoint,complete:true,searchLimited:true,catalogComplete:false,visited,simulations,reasons:[...reasons],configurations,finalists:[]};
  const strides: bigint[] = [];
  const total = axes.reduce((n,a)=>{strides.push(n);return n*BigInt(a.length);},1n);
  const position = () => BigInt(exact ? checkpoint.exactNextConfiguration! : checkpoint.nextConfiguration);
  const moveTo = (next: bigint) => { if(exact) checkpoint.exactNextConfiguration=next.toString(); else checkpoint.nextConfiguration=Number(next); };
  const countStep = () => { checkpoint.traversalSteps=Math.min(Number.MAX_SAFE_INTEGER,checkpoint.traversalSteps!+1);visited++; };
  if (exact && position() > total) throw new Error("invalid_enhancement_checkpoint");
  const hasSeed = () => !exact && checkpoint.nextSeed! < (checkpoint.seedSelections?.length ?? 0);
  // Main traversal and lookahead use exactly the same compatibility, ladder
  // pricing and positional configuration construction. Lookahead has no cursor
  // or ranking effects and cannot certify a configuration out of order.
  const prepare = (indices: number[], configurationReasons: Set<string>):
    { valid: false; pruneAxis: number; ringPriceProof?: true } | { valid: true; config: PricedEnhancementConfiguration } => {
    const selected = axes.map((axis,index)=>axis[indices[index]]);
    const categories = new Map<string,{count:number;limit:number}>();
    const identities = new Map<string,{count:number;unique:boolean}>();
    let valid = true, pruneAxis = 0;
    let partialCost = input.itemsCopper;
    const purchases = new Map<number, { quantity: number; cost: number }>();
    // Higher radix digits form a fixed suffix. If that suffix alone is impossible,
    // skip ALL assignments of lower digits instead of spending the bounded budget on them.
    for (let axis = selected.length - 1; axis >= 0; axis--) {
      // The gem and its enchant are both fixed above this stride. Every
      // assignment below the enchant has the same strictly cheaper substitute.
      const pair = pairGuards?.get(selected[axis]);
      if (pair?.enchants.has(selected[pair.enchantAxis])) return { valid: false, pruneAxis: pair.enchantAxis, ringPriceProof: true };
      const skip = conditional?.get(selected[axis]);
      if (skip && skip.enchants.has(selected[skip.axis].enhancement?.simulationId ?? 0)) return { valid: false, pruneAxis: skip.axis };
      const {enhancement:e, retained} = selected[axis];
      if (e) {
        const key = `${e.kind}:${e.simulationId}`;
        const identity = identities.get(key) ?? {count:0,unique:false};
        identity.count++; identity.unique ||= e.uniqueEquipped === true; identities.set(key,identity);
        if (identity.unique && identity.count > 1) valid = false;
      }
      if (e?.profession && (character.professions?.[String(e.profession.id)] ?? -1) < e.profession.rank) { valid = false; configurationReasons.add("profession_unverified_or_insufficient"); }
      if (e?.category) {
        const previous = categories.get(e.category.id) ?? {count:0,limit:e.category.limit};
        previous.count++; previous.limit = Math.min(previous.limit,e.category.limit); categories.set(e.category.id,previous);
        if (previous.count > previous.limit) valid = false;
      }
      if (e && !retained) {
        const previous = purchases.get(e.consumableItemId);
        const quantity = (previous?.quantity ?? 0) + 1;
        const cost = commodityPrices.cost(e.consumableItemId, quantity);
        if (cost === null) {
          configurationReasons.add("price_unknown_or_insufficient_quantity");
          valid = false;
        } else {
          // Replace only this consumable's total at its new quantity tier.
          partialCost = (partialCost - (previous?.cost ?? 0)) + cost;
          if (!Number.isSafeInteger(partialCost)) throw new Error("invalid_budget");
          purchases.set(e.consumableItemId, { quantity, cost });
        }
      }
      if (partialCost > input.budgetCopper) { valid = false; configurationReasons.add("over_budget"); }
      if (!valid) { pruneAxis = axis; break; }
    }
    if (!valid) return { valid: false, pruneAxis };
    const configurationSlots = slots.map(slot=>({slotType:slot.slotType,variantKey:slot.variantKey,enchantId:0,gemIds:slot.sockets.map(()=>0)}));
    const kinds = new Map<number, Enhancement["kind"]>();
    const ownedChanges = new Map<string, OwnedAuctionGearChange>();
    for (const choice of selected) {
      const e = choice.enhancement;
      if (choice.socket === null) configurationSlots[choice.slot].enchantId = e?.simulationId ?? 0;
      else configurationSlots[choice.slot].gemIds[choice.socket] = e?.simulationId ?? 0;
      if (e && !choice.retained) {
        const slot = slots[choice.slot];
        if (slot.owned && slot.ownedItemId) {
          const change = ownedChanges.get(slot.slotType) ?? {slotType:slot.slotType,itemId:slot.ownedItemId,gems:[]};
          if (choice.socket === null) change.enchantId = e.simulationId;
          else change.gems.push({index:choice.socket,itemId:e.simulationId});
          ownedChanges.set(slot.slotType,change);
        }
        if (kinds.has(e.consumableItemId) && kinds.get(e.consumableItemId) !== e.kind) throw new Error("invalid_enhancement_catalog");
        kinds.set(e.consumableItemId,e.kind);
      }
    }
    const fullyEnhanced = completeRules && selected.every(c=>c.enhancement !== null || (slots[c.slot].owned && !slots[c.slot].allowOwnedChanges));
    const consumables = [...purchases].sort(([a],[b])=>a-b).map(([itemId,{quantity}])=>{
      const quote = commodityPrices.quote(itemId,quantity);
      return {itemId,kind:kinds.get(itemId)!,quantity,quotedCopper:quote.totalCopper,levels:quote.levels,missingQuantity:quote.missingQuantity};
    });
    const known = consumables.every(c=>c.quotedCopper !== null);
    const totalCopper = known ? input.itemsCopper + consumables.reduce((sum,c)=>sum+c.quotedCopper!,0) : null;
    if (totalCopper !== null && !Number.isSafeInteger(totalCopper)) throw new Error("invalid_budget");
    const status = !marketVerified ? "market_unverified" : !known ? "price_unknown" : totalCopper! > input.budgetCopper ? "over_budget" : "priced";
    const config: PricedEnhancementConfiguration = {key:hash({identity:input.simulationIdentity,catalog:catalog.version,slots:configurationSlots,metadata:slots.map(s=>s.metadataKey)}),
      slots:configurationSlots,...(ownedChanges.size ? {ownedChanges:[...ownedChanges.values()]} : {}),consumables,itemsCopper:input.itemsCopper,totalCopper,fullyEnhanced,status,sourceUpdatedAt:input.prices.sourceUpdatedAt};
    return { valid: true, config };
  };
  const indicesAt = (at: bigint) => axes.map(axis => {
    const index = Number(at % BigInt(axis.length)); at /= BigInt(axis.length); return index;
  });
  // A bounded scan can prove that the complete precise pass is mandatory
  // before submitting any of this layout's screening fights. An unpriced
  // configuration or duplicate finalist input provides no new witness.
  const remaining = input.remainingScreenComparisons?.();
  if (exact && input.onPricedScreenWitness && remaining && !checkpoint.screenCoverageProbed && position() === 0n && total > 1n && total >= BigInt(remaining)) {
    checkpoint.screenCoverageProbed = true;
    let at = 0n;
    for (let scanned = 0; scanned < 2 * remaining && at < total; scanned++) {
      if (scanned && scanned % 32 === 0) await new Promise<void>(resolve => setImmediate(resolve));
      signal.throwIfAborted();
      if (input.shouldYield?.()) break;
      const candidate = prepare(indicesAt(at), new Set());
      if (!candidate.valid) {
        const stride = strides[candidate.pruneAxis];
        at = (at / stride + 1n) * stride;
      } else {
        if (candidate.config.status === "priced") input.onPricedScreenWitness(candidate.config);
        at++;
      }
    }
  }
  const saveCheckpoint = () => {
    checkpoint.confirmed=confirmed;checkpoint.bestValueConfirmed=bestValueConfirmed;checkpoint.bestDpsConfirmed=bestDpsConfirmed;
    if (exact) { checkpoint.bestMeasuredDps = bestMeasuredDps; checkpoint.secondMeasuredDps = secondMeasuredDps; checkpoint.thirdMeasuredDps = thirdMeasuredDps; }
    checkpoint.finalists=finalists;checkpoint.reasons=[...reasons];
    if(exact) {
      const pinned=new Set([...finalists,checkpoint.valuePrecision?.lower,checkpoint.valuePrecision?.upper,confirmed,bestValueConfirmed,bestDpsConfirmed,bestMeasuredDps,secondMeasuredDps,thirdMeasuredDps]
        .flatMap(row=>row?[row.configuration.key]:[]));
      const recent=Object.keys(checkpoint.cache).filter(key=>!pinned.has(key)).slice(-Math.max(0,256-pinned.size));
      checkpoint.cache=Object.fromEntries([...recent,...pinned].map(key=>[key,checkpoint.cache[key]]));
    }
  };
  let prefetchedThrough: bigint | undefined;
  let simulationLimit = bounds.simulations;
  const measuredHere = new Set<string>();
  while ((hasSeed() || position() < total) && visited < bounds.configurations && (simulations < simulationLimit || prefetchedThrough !== undefined && position() <= prefetchedThrough) &&
    (exact || checkpoint.totalSimulations < 12 && checkpoint.traversalSteps < 4096)) {
    if(exact && visited && visited%32===0) await new Promise<void>(resolve=>setImmediate(resolve));
    if (signal.aborted && exact && simulations) {
      saveCheckpoint(); input.onCheckpoint?.(structuredClone(checkpoint));
    }
    signal.throwIfAborted();
    if (input.shouldYield?.()) break;
    const fromSeed = hasSeed();
    const indices = fromSeed ? checkpoint.seedSelections![checkpoint.nextSeed!] : indicesAt(position());
    const advance = () => {
      if (fromSeed) checkpoint.nextSeed!++; else moveTo(position()+1n);
      countStep();
    };
    if (!exact && !Number.isSafeInteger(checkpoint.nextConfiguration + 1)) { reasons.add("configuration_limit"); checkpoint.traversalSteps = 4096; break; }
    const prepared = prepare(indices,reasons);
    if (!prepared.valid) {
      if (fromSeed) { advance(); continue; }
      const stride = strides[prepared.pruneAxis];
      const next = (position() / stride + 1n) * stride;
      if (!exact && next > BigInt(Number.MAX_SAFE_INTEGER)) { reasons.add("configuration_limit"); checkpoint.traversalSteps = 4096; break; }
      if (prepared.ringPriceProof) {
        const counts = checkpoint.ringPricePruning ??= { branches: "0", configurations: "0" };
        counts.branches = (BigInt(counts.branches) + 1n).toString();
        counts.configurations = (BigInt(counts.configurations) + next - position()).toString();
      }
      moveTo(next);countStep();continue;
    }
    const { config } = prepared;
    const { fullyEnhanced, status } = config;
    configurations.push(config);
    if (!fullyEnhanced) reasons.add("bare_configuration");
    if (status === "price_unknown") reasons.add("price_unknown_or_insufficient_quantity");
    // Exact metadata authorizes positional zeros. Legacy mode retains its full-fill contract.
    if (status === "priced" && (fullyEnhanced || exact)) {
      let simulation = checkpoint.cache[config.key];
      if (!simulation) {
        const capacity = Math.min(windowSize, simulationLimit - simulations, input.remainingScreenComparisons?.() ?? Infinity);
        if (capacity <= 0) break;
        if (capacity === 1) {
          simulation = measurement(await input.simulate(structuredClone(config),signal));
          signal.throwIfAborted(); checkpoint.cache[config.key] = simulation; simulations++;
          checkpoint.totalSimulations=Math.min(Number.MAX_SAFE_INTEGER,checkpoint.totalSimulations+1);
        } else {
          const controller = new AbortController(), batchSignal = AbortSignal.any([signal, controller.signal]);
          const completed = new Map<string, GearPlanSimulation>();
          const pending: Promise<void>[] = [];
          const candidates = new Map([[config.key, config]]);
          const start = (candidate: PricedEnhancementConfiguration) => {
            const run = async () => {
              batchSignal.throwIfAborted();
              const measured = await input.simulate(structuredClone(candidate), batchSignal);
              batchSignal.throwIfAborted();
              const result = measurement(measured);
              if ((baseline && result.engine !== baseline.engine) || finalists.some(row => row.simulation.engine !== result.engine))
                throw new Error("simulation_version_changed");
              completed.set(candidate.key, result);
            };
            pending.push(run().catch(error => controller.abort(error)));
          };
          // Start the first native calculation before preparing the remaining
          // configurations. Submit the rest together so profilesets can coalesce.
          start(config);
          const ownedIdentity = input.simulationOwnedBatch ? undefined : JSON.stringify(config.ownedChanges);
          let next = position() + 1n;
          try {
            for (let scanned = 1; candidates.size < capacity && next < total && visited + scanned < bounds.configurations; scanned++) {
              if (scanned % 32 === 0) await new Promise<void>(resolve => setImmediate(resolve));
              if (batchSignal.aborted || input.shouldYield?.()) break;
              const candidate = prepare(indicesAt(next), new Set());
              if (!candidate.valid) {
                const stride = strides[candidate.pruneAxis];
                next = (next / stride + 1n) * stride;
                continue;
              }
              if (candidate.config.status === "priced" && !checkpoint.cache[candidate.config.key] && !candidates.has(candidate.config.key)) {
                // Older workers can only vary purchased items within one profileset.
                const differentArmory = capacity > 2 && !input.simulationOwnedBatch && JSON.stringify(candidate.config.ownedChanges) !== ownedIdentity;
                if (!differentArmory || candidates.size === 1) {
                  candidates.set(candidate.config.key, candidate.config);
                  prefetchedThrough = next;
                }
                if (differentArmory) {
                  simulationLimit = simulations + candidates.size;
                  break;
                }
              }
              next++;
            }
            if (!batchSignal.aborted && !input.shouldYield?.()) {
              for (const candidate of candidates.values()) if (candidate !== config) start(candidate);
            } else {
              // Prepared but unsubmitted candidates remain at the durable cursor.
              prefetchedThrough = undefined;
            }
          } catch (error) { controller.abort(error); }
          await Promise.all(pending);
          const engines = new Set([...completed.values()].map(value => value.engine));
          if (engines.size > 1) {
            saveCheckpoint(); input.onCheckpoint?.(structuredClone(checkpoint));
            signal.throwIfAborted(); throw new Error("simulation_version_changed");
          }
          // Insert in traversal order even when the second native lane finishes
          // first. Uncertified facts survive aborts without skipping the cursor.
          for (const key of candidates.keys()) {
            const value = completed.get(key);
            if (!value) continue;
            checkpoint.cache[key] = value;
            measuredHere.add(key); simulations++;
            checkpoint.totalSimulations = Math.min(Number.MAX_SAFE_INTEGER, checkpoint.totalSimulations + 1);
          }
          if (batchSignal.aborted) {
            saveCheckpoint(); input.onCheckpoint?.(structuredClone(checkpoint));
            batchSignal.throwIfAborted();
          }
          simulation = checkpoint.cache[config.key]; measuredHere.delete(config.key);
        }
      } else { simulation = measurement(simulation); if(!measuredHere.delete(config.key))input.onCacheHit?.(); }
      try { assertFreshMarket({sourceUpdatedAt:input.prices.sourceUpdatedAt ?? ""}, input.now); }
      catch { config.status = "market_unverified"; marketVerified=false;clearRetained();reasons.add("market_unverified"); if(!exact)advance();break; }
      if (!exact && !checkpoint.seedSelections) {
        // Diversify before the fast radix digit can spend the native budget on one enchant axis.
        // Seeds share ALL normal feasibility checks and the mechanical cache. They are heuristic,
        // not evidence of a globally optimal combination or independent statistical confirmation.
        const alternatives = axes.map((axis,index)=>axis.map((choice,i)=>({choice,i})).filter(({choice,i})=>
          i !== indices[index] && choice.enhancement !== null).map(({i})=>i));
        const variableAxes = alternatives.flatMap((values,index)=>values.length ? [index] : []);
        const spread = Array.from({length:Math.min(11,variableAxes.length)},(_,i)=>
          variableAxes[Math.floor(i * (variableAxes.length - 1) / Math.max(1,Math.min(11,variableAxes.length)-1))]);
        const seeds: number[][] = [], seen = new Set([indices.join(",")]);
        const add = (values:number[]) => {const key=values.join(",");if (!seen.has(key)) {seen.add(key);seeds.push(values);}};
        const at = (axis:number, stratum:number) => alternatives[axis][stratum === 0 ? 0 : stratum === 1 ? Math.floor((alternatives[axis].length-1)/2) : alternatives[axis].length-1];
        for (let stratum=0; stratum<3; stratum++) {
          // Includes later slots even when there are more axes than available native evaluations.
          add(indices.map((value,axis)=>alternatives[axis].length ? at(axis,stratum) : value));
          for (const axis of spread) { const values=[...indices];values[axis]=at(axis,stratum);add(values); }
        }
        checkpoint.seedSelections = seeds; checkpoint.nextSeed = 0;
      }
      if (finalists.some(f=>f.simulation.engine !== simulation.engine)) throw new Error("simulation_version_changed");
      const existing = finalists.findIndex(f=>f.configuration.key===config.key);
      if (existing < 0) finalists.push({configuration:config,simulation});
      else if (config.totalCopper! < finalists[existing].configuration.totalCopper!) finalists[existing] = {configuration:config,simulation};
      if (exact) {
        const candidate = {configuration: config, simulation};
        if (!thirdMeasuredDps || rankDps(candidate, thirdMeasuredDps) <= 0) {
          const top = [bestMeasuredDps, secondMeasuredDps, thirdMeasuredDps]
            .filter((row): row is typeof candidate => Boolean(row));
          // Multiple scrolls can apply the same native enchant. Compare their
          // receipts before replacing that finalist with a different purchase.
          const previous = top.findIndex(row => row.configuration.key === config.key);
          if (previous < 0) top.push(candidate);
          else if (rankDps(candidate, top[previous]) < 0) top[previous] = candidate;
          [bestMeasuredDps, secondMeasuredDps, thirdMeasuredDps] = top.sort(rankDps);
        }
      }
      if (baseline) {
        if (baseline.engine !== simulation.engine) throw new Error("simulation_version_changed");
        const comparison = compareGearSimulationResults(baseline, simulation);
        const candidate = {configuration:config,simulation};
        if (comparison.deltaDps > 0 && comparison.uncertainty.significant) {
          if (input.valuePrecision) trackValuePrecision(checkpoint.valuePrecision ??= {}, candidate, row => row, baseline);
          if (!bestValueConfirmed || rankValue(candidate,bestValueConfirmed) < 0) bestValueConfirmed = candidate;
          if (!bestDpsConfirmed || rankDps(candidate,bestDpsConfirmed) < 0) bestDpsConfirmed = candidate;
          confirmed = input.objective === "value" ? bestValueConfirmed : bestDpsConfirmed;
        }
      }
      if (exact) input.onMeasured?.(config, simulation);
      finalists.sort(rank);
      finalists.length = Math.min(finalists.length,bounds.finalists);
      if (confirmed && !finalists.some(f=>f.configuration.key === confirmed!.configuration.key)) {
        if (finalists.length === bounds.finalists) finalists.pop();
        finalists.push(confirmed); finalists.sort(rank);
      }
    }
    advance();
  }
  const exhaustive = !hasSeed() && position() >= total;
  const capped = !exact && !exhaustive && (checkpoint.totalSimulations >= 12 || checkpoint.traversalSteps >= 4096);
  if (capped) reasons.add("configuration_limit");
  saveCheckpoint();
  return {checkpoint,complete:exhaustive || capped || exact&&!marketVerified,
    searchLimited:!exhaustive || !catalog.complete || exact&&(reasons.has("price_unknown_or_insufficient_quantity")||reasons.has("profession_unverified_or_insufficient")),
    catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists};
}
