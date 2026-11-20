import { ignoresItemContext } from "./gearItemModifiers";
import { quickAuctionStatChoices } from "./auctionGearStatChoices";
import { createHash } from "node:crypto";
import { assertFreshMarket, type AuctionSnapshot } from "./auctionMarket";
import { candidateLoadoutItem, compareGearSimulationResults } from "./gearSimulation";
import { isTwoHandWeapon, supportsTitanGrip, validateGearLoadout, type GearLoadoutItem } from "./gearCompatibility";
import { auctionAppliedStatsKey, auctionDominatedArmorOptions, auctionEffectGroupKey, auctionEffectGroups, auctionSelectionEffectKey, cheapestAuctionEffectSelection, type AuctionEffectGroup } from "./auctionGearEffects";
export { auctionSelectionEffectKey } from "./auctionGearEffects";
import type {
  AuctionGearAssemblyCheckpoint, AuctionGearAssemblyResult, AuctionGearOption, AuctionGearPlan,
  AuctionGearPurchase, AuctionGearSearchCheckpoint, AuctionGearSearchItem, AuctionGearSearchResult,
  AuctionGearSimulationCache, AuctionGearIncumbent, AuctionPlanProgress, GearPlanSimulation,
} from "./auctionGearTypes";
export type * from "./auctionGearTypes";

export function auctionPlanCost(options: AuctionGearOption[]) {
  const lots = new Map<number, { cost: number; quantity: number; used: number; itemId: number; variantKey: string }>();
  const slots = new Set<string>();
  for (const option of options) {
    if (slots.has(option.candidate.slotType) || !Number.isSafeInteger(option.auctionId) || option.auctionId <= 0 ||
        !Number.isSafeInteger(option.costCopper) || option.costCopper <= 0 || !Number.isSafeInteger(option.quantity) || option.quantity <= 0) throw new Error("invalid_auction_selection");
    slots.add(option.candidate.slotType);
    const current = lots.get(option.auctionId);
    if (current && (current.cost !== option.costCopper || current.quantity !== option.quantity ||
      current.itemId !== option.candidate.itemId || current.variantKey !== option.variantKey)) throw new Error("invalid_auction_selection");
    const entry = current ?? { cost: option.costCopper, quantity: option.quantity, used: 0,
      itemId: option.candidate.itemId, variantKey: option.variantKey };
    if (++entry.used > entry.quantity) throw new Error("auction_quantity_exceeded");
    lots.set(option.auctionId, entry);
  }
  const total = [...lots.values()].reduce((sum, entry) => sum + entry.cost, 0);
  if (!Number.isSafeInteger(total)) throw new Error("invalid_budget");
  return total;
}

export function auctionPlanLoadout(base: GearLoadoutItem[], options: AuctionGearOption[], specId: number, selectedSlots?: readonly string[]) {
  const slots = new Set(options.map(o => o.candidate.slotType));
  if (selectedSlots && [...slots].some(slot => !selectedSlots.includes(slot))) throw new Error("equipment_slot_locked");
  const main = options.find(o => o.candidate.slotType === "MAIN_HAND")?.candidate;
  const removeOffhand = main && isTwoHandWeapon(main.inventoryType) && !supportsTitanGrip(specId, main.itemSubclassId);
  if (removeOffhand && slots.has("OFF_HAND")) throw new Error("two_hand_offhand_conflict");
  if (removeOffhand && base.some(item => item.slotType === "OFF_HAND") && selectedSlots && !selectedSlots.includes("OFF_HAND")) throw new Error("equipment_slot_locked");
  const final = [...base.filter(item => !slots.has(item.slotType) && !(removeOffhand && item.slotType === "OFF_HAND")), ...options.map(o => candidateLoadoutItem(o.candidate))];
  validateGearLoadout(final, specId);
  return final;
}

/** Find a conflict among the purchases themselves. Later replacements can repair
 * a conflict with owned gear, but cannot remove a purchase in this prefix. */
export function auctionConflictingPurchaseSlot(ordered: AuctionGearOption[], specId: number) {
  const fixed: GearLoadoutItem[] = [];
  for (const option of ordered) {
    fixed.push(candidateLoadoutItem(option.candidate));
    try { validateGearLoadout(fixed, specId); }
    catch (error) {
      if (error instanceof Error && ["unique_equipped_conflict", "offhand_weapon_not_supported", "two_hand_offhand_conflict"].includes(error.message))
        return option.candidate.slotType;
      throw error;
    }
  }
  return undefined;
}

export function auctionGearPurchase(option: AuctionGearOption): AuctionGearPurchase {
  const variant = option.candidate.variants.find(v => v.key === option.variantKey);
  if (!variant) throw new Error("simulation_variant_not_found");
  return {
    auctionId: option.auctionId, itemId: option.candidate.itemId, name: option.candidate.name,
    iconUrl: option.candidate.iconUrl, quality: option.candidate.quality, itemClassId: option.candidate.itemClassId, slotType: option.candidate.slotType,
    variantKey: option.variantKey, itemLevel: variant.itemLevel,
    requiredLevel: option.candidate.constraints.requiredLevel, bonusIds: variant.bonusIds,
    contextId: variant.contextId, modifiers: variant.modifiers, stats: variant.resolution?.stats,
    weapon: variant.resolution?.weapon,
    effects: variant.resolution?.effectsVerified ? variant.resolution.effects : undefined,
    effectsVerified: variant.resolution?.effectsVerified,
    lotCostCopper: option.costCopper, quantity: option.quantity,
    costBreakdown: { itemsCopper: option.costCopper, totalCopper: null, coverage: "enhancement_compatibility_unverified" },
  };
}

const selectionKey = (items: AuctionGearOption[]) => items.map(o => o.id).sort().join("|");
function validSimulation(result: GearPlanSimulation, engine?: string) {
  if (!Number.isFinite(result.dps) || result.dps <= 0 || !Number.isFinite(result.dpsError) || result.dpsError < 0 ||
      result.confidence !== 95 || typeof result.engine !== "string" || !result.engine.startsWith("SimulationCraft") ||
      !Number.isInteger(result.iterations) || result.iterations <= 0) throw new Error("invalid_simulation_result");
  if (engine && result.engine !== engine) throw new Error("simulation_version_changed");
  // Worker responses may also contain logs, reports, timelines and spell data.
  // Only these five validated measurements belong in retained planner state.
  return { dps: result.dps, dpsError: result.dpsError, confidence: result.confidence,
    iterations: result.iterations, engine: result.engine };
}

/** Capture before replacing the old offer pool; procurement is redone against current offers on reuse. */
export function captureAuctionGearIncumbents(checkpoint: AuctionGearAssemblyCheckpoint | undefined,
  options: AuctionGearOption[]): AuctionGearIncumbent[] {
  if (!checkpoint) return [];
  const byId = new Map(options.map(option => [option.id, option])), unique = new Map<string, AuctionGearIncumbent>();
  for (const best of [checkpoint.best, checkpoint.bestConfirmed, checkpoint.bestValueConfirmed, checkpoint.bestDpsConfirmed]) {
    if (!best?.optionIds.length) continue;
    const selection = best.optionIds.map(id => byId.get(id));
    if (selection.some(option => !option)) continue;
    const effects = selection.map(option => auctionEffectGroupKey(option!)).sort();
    unique.set(effects.join("|"), { effects, simulation: validSimulation(best.simulation, checkpoint.baseline.engine) });
  }
  return [...unique.values()];
}

type PlannerInput = {
  searchId: string;
  objective?: "value" | "dps";
  budgetCopper: number;
  options: AuctionGearOption[];
  selectedSlots: string[];
  loadout: GearLoadoutItem[];
  specId: number;
  market: Pick<AuctionSnapshot, "sourceUpdatedAt">;
  signal: AbortSignal;
  simulate: (selections: AuctionGearOption[], signal: AbortSignal) => Promise<GearPlanSimulation>;
  onProgress?: (progress: AuctionPlanProgress) => void;
  onCacheHit?: () => void;
  maxNewSimulations?: number;
  /** Independent candidate measurements only; each native run keeps its own RNG. */
  simulationConcurrency?: 1 | 2;
  simulationBatchSize?: number;
  maxAssignments?: number;
  shouldYield?: () => boolean;
  baseline?: GearPlanSimulation;
  simulationCache?: AuctionGearSimulationCache;
  incumbents?: AuctionGearIncumbent[];
};

function prepare(input: PlannerInput) {
  input.signal.throwIfAborted();
  if (input.objective !== undefined && input.objective !== "value" && input.objective !== "dps") throw new Error("invalid_auction_objective");
  if (!Number.isSafeInteger(input.budgetCopper) || input.budgetCopper < 0) throw new Error("invalid_budget");
  if (!Array.isArray(input.selectedSlots) || new Set(input.selectedSlots).size !== input.selectedSlots.length) throw new Error("invalid_equipment_slots");
  assertFreshMarket(input.market);
  const slots = [...input.selectedSlots].sort();
  const options = input.options.filter(o => slots.includes(o.candidate.slotType) && o.candidate.eligible &&
    o.candidate.variants.some(v => v.key === o.variantKey) && o.costCopper <= input.budgetCopper);
  // Input identity and exhaustive assembly stay canonical. Expensive DPS work
  // follows discovery priority, which has no relationship to physical lot IDs.
  const priorityOptions = [...options];
  options.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(options.map(o => o.id)).size !== options.length) throw new Error("invalid_auction_selection");
  for (const option of options) auctionPlanCost([option]);
  const inputKey = createHash("sha256").update(JSON.stringify({ searchId: input.searchId, budget: input.budgetCopper,
    ...(input.objective === "value" ? { objective: "value" } : {}),
    slots, loadout: input.loadout, specId: input.specId,
    options: options.map(o => [o.id, o.auctionId, o.quantity, o.costCopper, auctionSelectionEffectKey([o]), candidateLoadoutItem(o.candidate)]),
  })).digest("hex");
  const max = input.maxNewSimulations ?? 48, maxAssignments = input.maxAssignments ?? 100_000;
  if (!Number.isSafeInteger(max) || max < 1 || !Number.isSafeInteger(maxAssignments) || maxAssignments < 1) throw new Error("invalid_search_limit");
  return { options, priorityOptions, slots, inputKey, max, maxAssignments };
}

function cloneCache(cache: AuctionGearSimulationCache = {}, engine?: string) {
  return Object.fromEntries(Object.entries(cache).map(([key, result]) => [key, validSimulation(result, engine)]));
}

async function baselineFor(input: PlannerInput, cache: AuctionGearSimulationCache) {
  auctionPlanLoadout(input.loadout, [], input.specId, input.selectedSlots);
  const key = auctionSelectionEffectKey([]);
  const cached = input.baseline ?? cache[key];
  if (cached) input.onCacheHit?.();
  const baseline = validSimulation(cached ?? await input.simulate([], input.signal));
  cache[key] = baseline;
  for (const result of Object.values(cache)) validSimulation(result, baseline.engine);
  return { baseline, calls: cached ? 0 : 1 };
}

function requireCheckpoint(key: string, checkpoint: { version: number; inputKey: string }, version = 1) {
  if (checkpoint.version !== version || checkpoint.inputKey !== key) throw new Error("auction_search_changed");
}

type PreciseSingles = { baseline: GearPlanSimulation; byOption: Map<string, GearPlanSimulation> };

/** Every distinct purchasable option remains visible; repeated native effects share a simulation. */
export async function searchAuctionGearOptions(input: PlannerInput & {
  preciseSingles?: PreciseSingles;
  statPriority?: boolean;
  groupCraftedEquipment?: boolean;
  bareEquipmentProofs?: boolean;
  checkpoint?: AuctionGearSearchCheckpoint;
  onCheckpoint?: (checkpoint: AuctionGearSearchCheckpoint) => void;
}): Promise<{ result: AuctionGearSearchResult; checkpoint: AuctionGearSearchCheckpoint }> {
  const { options, priorityOptions, slots, inputKey, max, maxAssignments } = prepare(input);
  let checkpoint: AuctionGearSearchCheckpoint, calls = 0;
  if (input.checkpoint) {
    requireCheckpoint(inputKey, input.checkpoint, input.checkpoint.version === 1 ? 1 : 2);
    const { simulationCache, ...state } = input.checkpoint;
    checkpoint = { ...structuredClone(state), simulationCache: cloneCache(simulationCache, state.baseline.engine) };
    checkpoint.baseline = validSimulation(checkpoint.baseline);
    if (!Number.isInteger(checkpoint.nextOption) || checkpoint.nextOption < 0 || checkpoint.nextOption > options.length) throw new Error("invalid_search_checkpoint");
  } else {
    const cache = cloneCache(input.simulationCache);
    const baseline = await baselineFor(input, cache);
    calls = baseline.calls;
    const first = input.statPriority ? quickAuctionStatChoices(priorityOptions, option => cache[auctionSelectionEffectKey([option])]?.dps) : priorityOptions;
    const preferred = new Set(first.map(option => option.id));
    const optionOrder = first === priorityOptions ? priorityOptions : [...first, ...priorityOptions.filter(option => !preferred.has(option.id))];
    checkpoint = { version: 2, inputKey, nextOption: 0, optionOrder: optionOrder.map(option => option.id), baseline: baseline.baseline, simulationCache: cache, simulations: calls };
  }
  const byId = new Map(options.map(option => [option.id, option]));
  // Version 2 guards older deployed readers from misreading a priority cursor.
  // Legacy v1 has canonical order; local predeployment v1+order remains readable.
  const order = checkpoint.optionOrder;
  if ((checkpoint.version === 2 && order === undefined) || order !== undefined && (!Array.isArray(order) || order.length !== options.length ||
      new Set(order).size !== order.length || order.some(id => typeof id !== "string" || !byId.has(id)))) throw new Error("invalid_search_checkpoint");
  if (order !== undefined) checkpoint.version = 2;
  const evaluationOptions = order ? order.map(id => byId.get(id)!) : options;
  // Keep a raw lookup for every purchasable offer. Only the scheduling key
  // is shared so an alias discovered after a yield can reuse a measured lot.
  const schedulingKeys = new Map<string, string>();
  const equivalentLots = new Map<string, string[]>();
  if (input.groupCraftedEquipment && ignoresItemContext(checkpoint.baseline.engine)) {
    for (const option of options) {
      if (option.customization) continue;
      const raw = auctionSelectionEffectKey([option]);
      // Use the same certified native inputs during discovery and assembly.
      // Each slot and raw offer keeps its own compatibility check and price.
      const group = auctionSelectionEffectKey([option], checkpoint.baseline.engine, true, "drop-curve");
      schedulingKeys.set(raw, group);
      const members = equivalentLots.get(group);
      if (members) members.push(raw);
      else equivalentLots.set(group, [raw]);
      const cached = checkpoint.simulationCache[raw];
      if (cached) checkpoint.simulationCache[group] ??= cached;
    }
    for (const [raw, group] of schedulingKeys) {
      if (checkpoint.simulationCache[group]) checkpoint.simulationCache[raw] ??= checkpoint.simulationCache[group];
    }
  }
  const storeSimulation = (key: string, result: GearPlanSimulation) => {
    checkpoint.simulationCache[key] = result;
    for (const raw of equivalentLots.get(key) ?? []) checkpoint.simulationCache[raw] = result;
  };
  const save = () => input.onCheckpoint?.(checkpoint);
  save();
  let assignments = 0;
  while (checkpoint.nextOption < options.length && assignments < maxAssignments && !input.shouldYield?.()) {
    input.signal.throwIfAborted();
    const option = evaluationOptions[checkpoint.nextOption], raw = auctionSelectionEffectKey([option]);
    const key = schedulingKeys.get(raw) ?? raw;
    let compatible = true;
    try { auctionPlanLoadout(input.loadout, [option], input.specId, slots); } catch { compatible = false; }
    let simulated = false;
    if (compatible && checkpoint.simulationCache[key]) input.onCacheHit?.();
    if (compatible && !checkpoint.simulationCache[key]) {
      if (calls >= max) break;
      const window = input.simulationConcurrency === 2 ? 2 * (input.simulationBatchSize || 1) : 1;
      if (window === 1 || calls + 1 === max) {
        storeSimulation(key, validSimulation(await input.simulate([option], input.signal), checkpoint.baseline.engine));
        checkpoint.simulations++;
        calls++;
      } else {
        const controller = new AbortController();
        const signal = AbortSignal.any([input.signal, controller.signal]);
        const batch = new Map<string, Promise<PromiseSettledResult<GearPlanSimulation>>>();
        const submit = (candidate: AuctionGearOption, effect: string) => {
          const measure = async () => {
            signal.throwIfAborted();
            const result = await input.simulate([candidate], signal);
            signal.throwIfAborted();
            return validSimulation(result, checkpoint.baseline.engine);
          };
          batch.set(effect, measure().then(value => ({ status: "fulfilled", value }),
            reason => { controller.abort(reason); return { status: "rejected", reason }; }));
        };
        try {
          // A batch-capable worker can start the first item while we validate
          // further purchases. Legacy paired calls share the same admission turn.
          const yieldingBeforePair = input.shouldYield?.();
          submit(option, key);
          const end = Math.min(options.length, checkpoint.nextOption + maxAssignments - assignments, checkpoint.nextOption + 256);
          for (let index = checkpoint.nextOption + 1; index < end && batch.size < Math.min(window, max - calls); index++) {
            if (signal.aborted || (window === 2 ? yieldingBeforePair : input.shouldYield?.())) break;
            const next = evaluationOptions[index], rawNext = auctionSelectionEffectKey([next]);
            const nextKey = schedulingKeys.get(rawNext) ?? rawNext;
            if (batch.has(nextKey) || checkpoint.simulationCache[nextKey]) continue;
            try { auctionPlanLoadout(input.loadout, [next], input.specId, slots); } catch { continue; }
            submit(next, nextKey);
          }
          const measured = await Promise.all(batch.values());
          let index = 0;
          for (const effect of batch.keys()) {
            const result = measured[index++];
            if (result.status !== "fulfilled") continue;
            storeSimulation(effect, result.value);
            checkpoint.simulations++;
            calls++;
          }
          if (signal.aborted) {
            save();
            signal.throwIfAborted();
          }
        } finally {
          controller.abort();
          await Promise.all(batch.values());
        }
      }
      simulated = true;
      input.onProgress?.({ phase: "simulating", completed: calls, total: max });
    }
    checkpoint.nextOption++;
    assignments++;
    if (simulated) save();
    if (assignments % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  save();
  const processed = new Set(evaluationOptions.slice(0, checkpoint.nextOption).map(option => option.id));
  // Switch the whole visible table to its independently measured baseline together.
  // Until all existing comparisons are covered, keep the earlier preview visible.
  const offeredPrecise = input.preciseSingles;
  const precise = offeredPrecise && options.every(option =>
    !checkpoint.simulationCache[auctionSelectionEffectKey([option])] || offeredPrecise.byOption.has(option.id))
    ? offeredPrecise : undefined;
  const displayBaseline = precise?.baseline ?? checkpoint.baseline;
  const items = options.map<AuctionGearSearchItem>(option => {
    let compatible = true;
    try { auctionPlanLoadout(input.loadout, [option], input.specId, slots); } catch { compatible = false; }
    const simulation = !compatible ? undefined : precise ? precise.byOption.get(option.id) : checkpoint.simulationCache[auctionSelectionEffectKey([option])];
    const comparison = simulation ? compareGearSimulationResults(displayBaseline, simulation) : null;
    return { ...auctionGearPurchase(option), optionId: option.id, comparison,
      evaluation: !compatible ? "requires_combination" : !comparison && (precise || !processed.has(option.id)) ? "pending" :
        comparison && comparison.deltaDps > 0 && comparison.uncertainty.significant ? "upgrade" :
          comparison && comparison.deltaDps <= 0 && comparison.uncertainty.significant ? "not_upgrade" : "inconclusive" };
  }).sort((a, b) => a.lotCostCopper - b.lotCostCopper || (b.comparison?.deltaDps ?? -Infinity) - (a.comparison?.deltaDps ?? -Infinity) || a.optionId.localeCompare(b.optionId));
  input.signal.throwIfAborted();
  assertFreshMarket(input.market);
  return { checkpoint, result: { kind: "search", objective: input.objective ?? "dps", searchId: input.searchId, selectedSlots: slots,
    budgetCopper: input.budgetCopper, baseline: displayBaseline, items, searchComplete: precise ? items.every(item => item.evaluation !== "pending") : checkpoint.nextOption === options.length,
    pendingItems: items.filter(item => item.evaluation === "pending").length, simulations: checkpoint.simulations,
    engine: checkpoint.baseline.engine, searchLimited: false, optionsConsidered: options.length } };
}

/** Complete effect enumeration with exact procurement, yielding at a persisted assignment. */
export async function assembleAuctionGear(input: PlannerInput & {
  reuseAppliedStats?: boolean;
  groupCraftedEquipment?: boolean;
  bareEquipmentProofs?: boolean;
  recheckEquipment?: PlannerInput["simulate"];
  preciseSingleCards?: boolean;
  checkpoint?: AuctionGearAssemblyCheckpoint;
  onCheckpoint?: (checkpoint: AuctionGearAssemblyCheckpoint) => void;
}): Promise<{ result: AuctionGearAssemblyResult; checkpoint: AuctionGearAssemblyCheckpoint; preciseSingles?: PreciseSingles }> {
  const { options, slots, inputKey, max, maxAssignments } = prepare(input);
  // Existing cursors index their original groups. Only new pinned-engine searches
  // can assign one ordinal to lots that the worker parses identically.
  const engine = (input.checkpoint?.baseline ?? input.baseline)?.engine;
  const grouping = input.checkpoint ? input.checkpoint.nativeLotGroups :
    input.reuseAppliedStats ? (input.groupCraftedEquipment ? 5 : 1) : undefined;
  if (grouping !== undefined && grouping !== 1 && grouping !== 2 && grouping !== 3 && grouping !== 4 && grouping !== 5) throw new Error("invalid_search_checkpoint");
  const groupEngine = grouping && engine && ignoresItemContext(engine) ? engine : undefined;
  const groups = auctionEffectGroups(options, slots, option =>
    auctionEffectGroupKey(option, groupEngine, (grouping ?? 0) >= 2, grouping === 5 ? "drop-curve" : grouping === 4 ? "tuning-cap" : grouping === 3));
  const flatGroups = groups.flat();
  const cheapestSingles = flatGroups.map(group => group.options.reduce((best, option) =>
    option.costCopper < best.costCopper || option.costCopper === best.costCopper && option.id < best.id ? option : best));
  const radices = groups.map(group => group.length + 1);
  const combinationCount = radices.reduce((product, radix) => product * BigInt(radix), 1n).toString();
  let checkpoint: AuctionGearAssemblyCheckpoint, calls = 0;
  let replayLegacyCandidates = false;
  if (input.checkpoint) {
    requireCheckpoint(inputKey, input.checkpoint, (grouping ?? 0) >= 3 ? 4 : 3);
    // The precise pass clones its own state when resumed; keep it separate
    // from the screening cache when copying the outer checkpoint.
    const { simulationCache, equipmentVerification, ...state } = input.checkpoint;
    checkpoint = { ...structuredClone(state), ...(equipmentVerification ? {equipmentVerification} : {}),
      simulationCache: cloneCache(simulationCache, state.baseline.engine) };
    checkpoint.baseline = validSimulation(checkpoint.baseline);
    if (checkpoint.cursor.length !== slots.length || checkpoint.cursor.some((index, slot) => !Number.isInteger(index) || index < 0 || index >= radices[slot])) throw new Error("invalid_search_checkpoint");
    if (checkpoint.pairScores.length !== flatGroups.length || checkpoint.pairScores.some(score => !Number.isFinite(score) || score <= 0) ||
        !Number.isSafeInteger(checkpoint.nextPair) || checkpoint.nextPair < 0) throw new Error("invalid_search_checkpoint");
    if (!Number.isSafeInteger(checkpoint.nextSeed) || checkpoint.nextSeed < 0 ||
        checkpoint.seedSelections !== null && (!Array.isArray(checkpoint.seedSelections) || checkpoint.seedSelections.length > 3 ||
          checkpoint.seedSelections.some(seed => !Array.isArray(seed) || seed.length < 3 || seed.length > slots.length ||
            new Set(seed.map(index => flatGroups[index]?.options[0].candidate.slotType)).size !== seed.length ||
            seed.some(index => !Number.isSafeInteger(index) || index < 0 || index >= flatGroups.length))) ||
        checkpoint.nextSeed > (checkpoint.seedSelections?.length ?? 0) || checkpoint.exhausted && checkpoint.seedSelections === null ||
        checkpoint.bestConfirmed === undefined) throw new Error("invalid_search_checkpoint");
    checkpoint.best.simulation = validSimulation(checkpoint.best.simulation, checkpoint.baseline.engine);
    for (const best of [checkpoint.bestConfirmed, checkpoint.bestValueConfirmed, checkpoint.bestDpsConfirmed]) {
      if (best) best.simulation = validSimulation(best.simulation, checkpoint.baseline.engine);
    }
    replayLegacyCandidates = checkpoint.bestValueConfirmed === undefined || checkpoint.bestDpsConfirmed === undefined;
    if (replayLegacyCandidates) {
      // An old objective-specific incumbent cannot prove the other objective's
      // historical leader. Replay the exact domain using retained native facts.
      checkpoint.bestValueConfirmed = null; checkpoint.bestDpsConfirmed = null;
      checkpoint.cursor.fill(0); checkpoint.exhausted = false;
      checkpoint.nextPair = 0; checkpoint.nextSeed = 0;
      checkpoint.combinationsChecked = 0; checkpoint.validCombinations = 0; delete checkpoint.proofPrunedAssignments; delete checkpoint.pruningCounts;
    }
  } else {
    const cache = cloneCache(input.simulationCache);
    const baseline = await baselineFor(input, cache);
    calls = baseline.calls;
    checkpoint = { version: groupEngine && (grouping ?? 0) >= 3 ? 4 : 3, inputKey, ...(groupEngine ? { nativeLotGroups: grouping } : {}), cursor: slots.map(() => 0), exhausted: false,
      baseline: baseline.baseline, best: { optionIds: [], simulation: baseline.baseline }, bestConfirmed: null,
      bestValueConfirmed: null, bestDpsConfirmed: null, simulationCache: cache,
      simulations: calls, combinationsChecked: 0, validCombinations: 0, nextPair: 0, seedSelections: null, nextSeed: 0,
      pairScores: flatGroups.map(group => cache[auctionSelectionEffectKey([group.options[0]])]?.dps ?? baseline.baseline.dps) };
  }
  const reuseAppliedStats = input.reuseAppliedStats && options.some(option =>
    option.candidate.variants.some(variant => variant.resolution?.appliedStatsV1));
  if (!input.checkpoint && input.preciseSingleCards && input.recheckEquipment) checkpoint.preciseSingleCards = true;
  const preciseSingleCards = !!input.recheckEquipment && checkpoint.preciseSingleCards === true;
  const singleReplacements = preciseSingleCards ? new Map<string, string>() : undefined;
  const dominated = reuseAppliedStats
    ? auctionDominatedArmorOptions(options, input.loadout, input.specId, checkpoint.baseline.engine, input.bareEquipmentProofs, singleReplacements) : new Set<string>();
  const dominatedGroups = new Set(flatGroups.filter(group => group.options.every(option => dominated.has(option.id))));
  const save = () => input.onCheckpoint?.(checkpoint);
  // The durable cursor describes only assignments whose measurements have been
  // applied. Enumeration can prepare the next assignments while SimC runs.
  const traversal = { cursor: [...checkpoint.cursor], exhausted: checkpoint.exhausted,
    nextSeed: checkpoint.nextSeed, nextPair: checkpoint.nextPair, combinationsChecked: checkpoint.combinationsChecked };
  let preciseSingles: PreciseSingles | undefined;
  const directVerification = !!input.recheckEquipment && !checkpoint.exhausted;
  if (checkpoint.nextEquipmentSingle !== undefined && (!Number.isSafeInteger(checkpoint.nextEquipmentSingle) ||
      checkpoint.nextEquipmentSingle < 0 || checkpoint.nextEquipmentSingle > flatGroups.length)) throw new Error("invalid_search_checkpoint");
  let nextEquipmentSingle = checkpoint.nextEquipmentSingle ?? 0;
  const totalAssignments = BigInt(combinationCount);
  const readCount = (value: string) => {
    if (typeof value !== "string" || value.length > combinationCount.length || !/^(0|[1-9]\d*)$/.test(value) ||
        BigInt(value) > totalAssignments) throw new Error("invalid_search_checkpoint");
    return BigInt(value);
  };
  let proofPruned = readCount(checkpoint.proofPrunedAssignments ?? "0");
  const savedCounts = checkpoint.pruningCounts;
  if (savedCounts !== undefined && (!savedCounts || typeof savedCounts !== "object"))
    throw new Error("invalid_search_checkpoint");
  const trackBranches = savedCounts !== undefined ||
    (!traversal.exhausted && traversal.cursor.every(choice => choice === 0) && proofPruned === 0n);
  let substitutionBranches = savedCounts ? readCount(savedCounts.substitutionBranches) : 0n;
  let procurementBranches = savedCounts ? readCount(savedCounts.procurementBranches) : 0n;
  let procurementAssignments = savedCounts ? readCount(savedCounts.procurementAssignments) : 0n;
  let equipConflictBranches = savedCounts ? readCount(savedCounts.equipConflictBranches) : 0n;
  let equipConflictAssignments = savedCounts ? readCount(savedCounts.equipConflictAssignments) : 0n;
  if (substitutionBranches > proofPruned || procurementBranches > procurementAssignments ||
      equipConflictBranches > equipConflictAssignments || proofPruned + procurementAssignments + equipConflictAssignments > totalAssignments)
    throw new Error("invalid_search_checkpoint");
  const suffixSize = Array<bigint>(radices.length).fill(1n);
  for (let axis = radices.length - 2; axis >= 0; axis--)
    suffixSize[axis] = suffixSize[axis + 1] * BigInt(radices[axis + 1]);
  const remainingInBranch = (axis: number) => {
    let remaining = suffixSize[axis];
    for (let i = axis + 1; i < radices.length; i++)
      if (traversal.cursor[i]) remaining -= BigInt(traversal.cursor[i]) * suffixSize[i];
    return remaining;
  };
  const advance = (from = traversal.cursor.length - 1) => {
    for (let index = from; index >= 0; index--) {
      if (++traversal.cursor[index] < radices[index]) {
        traversal.cursor.fill(0, index + 1);
        return;
      }
      traversal.cursor[index] = 0;
    }
    traversal.exhausted = true;
  };
  const byId = new Map(options.map(option => [option.id, option]));
  const optionsFor = (best: typeof checkpoint.best) => best.optionIds.map(id => {
    const option = byId.get(id);
    if (!option) throw new Error("invalid_search_checkpoint");
    return option;
  });
  type Leaders = Pick<AuctionGearAssemblyCheckpoint, "baseline" | "best" | "bestConfirmed" | "bestDpsConfirmed" | "bestValueConfirmed">;
  for (const best of [checkpoint.best, checkpoint.bestConfirmed, checkpoint.bestValueConfirmed, checkpoint.bestDpsConfirmed]) if (best) {
    auctionPlanLoadout(input.loadout, optionsFor(best), input.specId, slots);
    if (auctionPlanCost(optionsFor(best)) > input.budgetCopper) throw new Error("invalid_search_checkpoint");
  }
  const confirmed = (simulation: GearPlanSimulation, baseline = checkpoint.baseline) => {
    const comparison = compareGearSimulationResults(baseline, simulation);
    return comparison.deltaDps > 0 && comparison.uncertainty.significant;
  };
  for (const best of [checkpoint.bestConfirmed, checkpoint.bestValueConfirmed, checkpoint.bestDpsConfirmed]) {
    if (best && !confirmed(best.simulation)) throw new Error("invalid_search_checkpoint");
  }
  const consider = (selection: AuctionGearOption[], simulation: GearPlanSimulation, leaders: Leaders = checkpoint) => {
    const cost = auctionPlanCost(selection), key = selectionKey(selection);
    const preferred = (best: typeof leaders.best | null) => !best || simulation.dps > best.simulation.dps ||
      simulation.dps === best.simulation.dps && (cost < auctionPlanCost(optionsFor(best)) ||
        cost === auctionPlanCost(optionsFor(best)) && key < best.optionIds.slice().sort().join("|"));
    const best = { optionIds: selection.map(option => option.id), simulation };
    if (preferred(leaders.best)) leaders.best = best;
    if (confirmed(simulation, leaders.baseline)) {
      const previous = leaders.bestValueConfirmed ?? null;
      // Both scores use the same measured whole-set gain and exact lot cost.
      const value = cost / (simulation.dps - leaders.baseline.dps);
      const priorValue = previous ? auctionPlanCost(optionsFor(previous)) / (previous.simulation.dps - leaders.baseline.dps) : Infinity;
      if (value < priorValue || value === priorValue && preferred(previous)) leaders.bestValueConfirmed = best;
      if (preferred(leaders.bestDpsConfirmed ?? null)) leaders.bestDpsConfirmed = best;
      leaders.bestConfirmed = input.objective === "value" ? leaders.bestValueConfirmed! : leaders.bestDpsConfirmed!;
    }
  };
  if (replayLegacyCandidates) {
    for (const best of [checkpoint.best, checkpoint.bestConfirmed]) if (best) consider(optionsFor(best), best.simulation);
  }
  if (!input.checkpoint || replayLegacyCandidates) {
    // Recover confirmed singles even when the caller has already requested a yield.
    for (const option of cheapestSingles) {
      const simulation = checkpoint.simulationCache[auctionSelectionEffectKey([option])];
      if (!simulation) continue;
      try { auctionPlanLoadout(input.loadout, [option], input.specId, slots); } catch { continue; }
      consider([option], simulation);
    }
    const byEffect = new Map(flatGroups.flatMap(group => group.options.map(option => [auctionEffectGroupKey(option), group] as const)));
    for (const incumbent of input.incumbents ?? []) {
      input.signal.throwIfAborted();
      const simulation = validSimulation(incumbent.simulation, checkpoint.baseline.engine);
      const selection = incumbent.effects.map(effect => byEffect.get(effect));
      if (selection.some(group => !group) || new Set(selection.map(group => group!.options[0].candidate.slotType)).size !== selection.length) continue;
      const purchase = await cheapestAuctionEffectSelection(selection as AuctionEffectGroup[], input.budgetCopper, input.signal);
      if (!purchase) continue;
      try { auctionPlanLoadout(input.loadout, purchase.options, input.specId, slots); } catch { continue; }
      checkpoint.simulationCache[auctionSelectionEffectKey(purchase.options)] = simulation;
      consider(purchase.options, simulation);
    }
  }
  save();
  const screenFinished = directVerification && checkpoint.seedSelections !== null &&
    checkpoint.nextSeed === checkpoint.seedSelections.length && checkpoint.nextEquipmentSingle === flatGroups.length;
  const yieldBeforeEnumeration = screenFinished || input.shouldYield?.() === true;
  const groupIndex = new Map(flatGroups.map((group, index) => [group, index]));
  const rankedBySlot = groups.map(slotGroups => slotGroups.map(group => groupIndex.get(group)!)
    .sort((a, b) => checkpoint.pairScores[b] - checkpoint.pairScores[a] || a - b));
  const groupCosts = cheapestSingles.map(option => option.costCopper);
  const compatibleSelection = (selection: AuctionGearOption[]) => {
    try { auctionPlanLoadout(input.loadout, selection, input.specId, slots); return true; } catch { return false; }
  };
  if (!yieldBeforeEnumeration && checkpoint.seedSelections === null) {
    const seeds: number[][] = [];
    const addSeed = async (indices: number[]) => {
      if (indices.length < 3) return;
      const sorted = indices.slice().sort((a, b) => a - b);
      if (seeds.some(seed => seed.join(":") === sorted.join(":"))) return;
      const purchase = await cheapestAuctionEffectSelection(sorted.map(index => flatGroups[index]), input.budgetCopper, input.signal);
      if (purchase && compatibleSelection(purchase.options)) seeds.push(sorted);
    };
    // A bounded warmup supplies useful complete incumbents. These estimates
    // only order candidates; every result still requires its own simulation.
    let full = rankedBySlot.flatMap(indices => indices.length ? [indices[0]] : []);
    while (full.length >= 3 && !input.shouldYield?.()) {
      input.signal.throwIfAborted();
      await addSeed(full);
      if (seeds.length) break;
      full = full.slice().sort((a, b) => checkpoint.pairScores[b] - checkpoint.pairScores[a] || a - b).slice(0, -1);
    }
    if (!input.shouldYield?.()) await addSeed(rankedBySlot.flatMap(indices => indices.length &&
      checkpoint.pairScores[indices[0]] > checkpoint.baseline.dps ? [indices[0]] : []));
    const candidates = rankedBySlot.flatMap(indices => indices.slice(0, 2));
    candidates.sort((a, b) => (checkpoint.pairScores[b] - checkpoint.baseline.dps) / groupCosts[b] -
      (checkpoint.pairScores[a] - checkpoint.baseline.dps) / groupCosts[a] || a - b);
    let affordable: number[] = [];
    for (const index of candidates) {
      if (input.shouldYield?.()) break;
      input.signal.throwIfAborted();
      if (checkpoint.pairScores[index] <= checkpoint.baseline.dps || affordable.some(previous =>
        flatGroups[previous].options[0].candidate.slotType === flatGroups[index].options[0].candidate.slotType)) continue;
      const trial = [...affordable, index];
      const purchase = await cheapestAuctionEffectSelection(trial.map(value => flatGroups[value]), input.budgetCopper, input.signal);
      if (purchase && compatibleSelection(purchase.options)) affordable = trial;
    }
    if (!input.shouldYield?.()) await addSeed(affordable);
    checkpoint.seedSelections = seeds;
    save();
  }
  const singleCompatible = new Map<number, boolean>();
  const compatibleSingle = (index: number) => {
    if (!singleCompatible.has(index)) {
      try { auctionPlanLoadout(input.loadout, [flatGroups[index].options[0]], input.specId, slots); singleCompatible.set(index, true); }
      catch { singleCompatible.set(index, false); }
    }
    return singleCompatible.get(index)!;
  };
  const pairs: Array<{ first: number; second: number; repair: boolean; score: number }> = [];
  let pairWork = 0;
  const priority = new Set<number>();
  if (!yieldBeforeEnumeration) for (const ranked of rankedBySlot) {
    for (const index of ranked.slice(0, 2)) priority.add(index);
    for (const index of ranked) {
      if (++pairWork % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); input.signal.throwIfAborted(); }
      if (!compatibleSingle(index)) { priority.add(index); break; }
    }
  }
  const priorityIndices = [...priority].sort((a, b) => a - b);
  for (const [position, first] of priorityIndices.entries()) for (const second of priorityIndices.slice(position + 1)) {
    if (++pairWork % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); input.signal.throwIfAborted(); }
    const a = flatGroups[first].options[0], b = flatGroups[second].options[0];
    if (a.candidate.slotType === b.candidate.slotType) continue;
    try { auctionPlanLoadout(input.loadout, [a, b], input.specId, slots); } catch { continue; }
    pairs.push({ first, second, repair: !compatibleSingle(first) || !compatibleSingle(second),
      score: checkpoint.pairScores[first] / 2 + checkpoint.pairScores[second] / 2 });
  }
  // This bounded prefix changes evaluation order only. Every other pair and
  // effect remains in the exact full traversal; these limits never narrow it.
  pairs.sort((a, b) => Number(b.repair) - Number(a.repair) || b.score - a.score || a.first - b.first || a.second - b.second);
  pairs.length = Math.min(pairs.length, 256);
  if (!yieldBeforeEnumeration && (checkpoint.nextPair > pairs.length || checkpoint.exhausted && checkpoint.nextPair !== pairs.length)) throw new Error("invalid_search_checkpoint");
  const seededPairs = new Set(pairs.map(pair => `${pair.first}:${pair.second}`));
  const window = input.simulationConcurrency === 2 && input.simulationBatchSize ? 2 * input.simulationBatchSize : 1;
  const controller = new AbortController();
  const signal = AbortSignal.any([input.signal, controller.signal]);
  const pending = new Map<string, Promise<PromiseSettledResult<GearPlanSimulation>>>();
  const selections: { selection: AuctionGearOption[]; key: string }[] = [];
  const evaluate = (selection: AuctionGearOption[]) => {
    const exact = auctionSelectionEffectKey(selection);
    const equivalent = reuseAppliedStats && auctionAppliedStatsKey(selection, checkpoint.baseline.engine, input.bareEquipmentProofs);
    const cachedExact = checkpoint.simulationCache[exact];
    const key = equivalent && !cachedExact ? equivalent : exact;
    // Keep previously measured receipts and use their result to seed the new cache.
    if (cachedExact && cachedExact.iterations === checkpoint.baseline.iterations && equivalent &&
        !checkpoint.simulationCache[equivalent] && !pending.has(equivalent))
      checkpoint.simulationCache[equivalent] = cachedExact;
    if (checkpoint.simulationCache[key] || pending.has(key)) input.onCacheHit?.();
    else {
      if (calls + pending.size >= max) return false;
      // Attach both handlers immediately while enumeration continues. Failed
      // batches are replayed from the last committed cursor.
      const measurement = input.simulate(selection, signal).then(result => validSimulation(result, checkpoint.baseline.engine));
      pending.set(key, measurement.then(value => ({ status: "fulfilled", value }),
        reason => { controller.abort(reason); return { status: "rejected", reason }; }));
    }
    selections.push({ selection, key });
    return true;
  };
  const commitWindow = async () => {
    const measured = await Promise.all(pending.values());
    let index = 0;
    for (const key of pending.keys()) {
      const result = measured[index++];
      if (result.status === "fulfilled") {
        checkpoint.simulationCache[key] = result.value;
        checkpoint.simulations++;
        calls++;
      }
    }
    pending.clear();
    const failed = measured.find(result => result.status === "rejected");
    if (failed) {
      save();
      input.signal.throwIfAborted();
      throw failed.reason;
    }
    for (const { selection, key } of selections) {
      // Discovery and warm-start scoring look up individual items by their original identity.
      if (selection.length === 1 && key.startsWith("applied-v2:"))
        checkpoint.simulationCache[auctionSelectionEffectKey(selection)] = checkpoint.simulationCache[key];
      checkpoint.validCombinations++;
      consider(selection, checkpoint.simulationCache[key]);
    }
    selections.length = 0;
    Object.assign(checkpoint, traversal, { cursor: [...traversal.cursor] });
    if (directVerification) checkpoint.nextEquipmentSingle = nextEquipmentSingle;
    if (proofPruned > 0n) checkpoint.proofPrunedAssignments = proofPruned.toString();
    if (trackBranches) checkpoint.pruningCounts = {
      substitutionBranches: substitutionBranches.toString(), procurementBranches: procurementBranches.toString(),
      procurementAssignments: procurementAssignments.toString(), equipConflictBranches: equipConflictBranches.toString(),
      equipConflictAssignments: equipConflictAssignments.toString(),
    };
    if (measured.length) {
      input.onProgress?.({ phase: "simulating", completed: calls, total: max });
      save();
    }
    // A cancellation can arrive after every measurement in this window has
    // completed. Persist the valid window, then stop before starting more work.
    input.signal.throwIfAborted();
  };
  const yieldTraversal = async () => {
    // Completed cache hits and proven skips are durable progress too.
    if (!pending.size) {
      await commitWindow();
      save();
    }
    await new Promise<void>(resolve => setImmediate(resolve));
  };
  try {
    let assignments = 0;
    const seeds = checkpoint.seedSelections ?? [];
    while (!yieldBeforeEnumeration && traversal.nextSeed < seeds.length && assignments < maxAssignments && !input.shouldYield?.()) {
      input.signal.throwIfAborted();
      const seed = seeds[traversal.nextSeed].map(index => flatGroups[index]);
      const purchase = seed.some(group => dominatedGroups.has(group)) ? null : await cheapestAuctionEffectSelection(seed, input.budgetCopper, input.signal);
      if (purchase && compatibleSelection(purchase.options) && !evaluate(purchase.options)) break;
      traversal.nextSeed++;
      traversal.combinationsChecked++;
      assignments++;
      if (pending.size >= window || selections.length >= 256) await commitWindow();
    }
    const seededSelections = new Set(seeds.map(seed => seed.join(":")));
    // A screen score never bounds an independent 750-iteration result. Keep a
    // whole-set preview, then measure the single purchases shown on item cards.
    // The precise cursor covers all other combinations, including repair pairs.
    const previewPairs = directVerification ? (seeds.length ? 0 : Math.min(1, pairs.length)) : pairs.length;
    while (!yieldBeforeEnumeration && traversal.nextSeed === seeds.length && traversal.nextPair < previewPairs && assignments < maxAssignments && !input.shouldYield?.()) {
      input.signal.throwIfAborted();
      const pair = pairs[traversal.nextPair];
      const first = flatGroups[pair.first], second = flatGroups[pair.second];
      const purchase = dominatedGroups.has(first) || dominatedGroups.has(second) ? null :
        await cheapestAuctionEffectSelection([first, second], input.budgetCopper, input.signal);
      if (purchase && compatibleSelection(purchase.options) && !evaluate(purchase.options)) break;
      traversal.nextPair++;
      traversal.combinationsChecked++;
      assignments++;
      if (pending.size >= window || selections.length >= 256) await commitWindow();
      if (assignments % 256 === 0) await yieldTraversal();
    }
    // The precise pass buys and measures each eligible single below. A second
    // 100-iteration fight here has no effect on either verified objective.
    if (preciseSingleCards && traversal.nextSeed === seeds.length && traversal.nextPair >= previewPairs) {
      nextEquipmentSingle = flatGroups.length;
    }
    while (directVerification && !yieldBeforeEnumeration && traversal.nextSeed === seeds.length &&
        traversal.nextPair >= previewPairs && nextEquipmentSingle < flatGroups.length && assignments < maxAssignments && !input.shouldYield?.()) {
      input.signal.throwIfAborted();
      const offer = cheapestSingles[nextEquipmentSingle];
      if (!dominatedGroups.has(flatGroups[nextEquipmentSingle]) && compatibleSelection([offer]) && !evaluate([offer])) break;
      nextEquipmentSingle++;
      assignments++;
      if (pending.size >= window || selections.length >= 256) await commitWindow();
      if (assignments % 256 === 0) await yieldTraversal();
    }
    // Adjacent cursor positions share their leading choices. Reuse only the
    // exact receipt for an unchanged prefix in this immutable offer pool.
    const previousChoices: number[] = [];
    // A globally exclusive lot cannot contribute to the price of another slot.
    const seenLots = new Set<number>(), repeatedLots = new Set<number>();
    for (const option of options) {
      if (seenLots.has(option.auctionId)) repeatedLots.add(option.auctionId);
      seenLots.add(option.auctionId);
    }
    const independentOffers = new Map<AuctionEffectGroup, AuctionGearOption>();
    for (const [index, group] of flatGroups.entries()) {
      if (group.options.every(option => !repeatedLots.has(option.auctionId)))
        independentOffers.set(group, cheapestSingles[index]);
    }
    const prefixReceipts: AuctionGearOption[][] = [[]];
    const prefixCosts = [0];
    while (!directVerification && !yieldBeforeEnumeration && traversal.nextSeed === seeds.length && traversal.nextPair === pairs.length && !traversal.exhausted && assignments < maxAssignments && !input.shouldYield?.()) {
      input.signal.throwIfAborted();
      const dominatedAxis = dominatedGroups.size ? traversal.cursor.findIndex((choice, axis) =>
        choice > 0 && dominatedGroups.has(groups[axis][choice - 1])) : -1;
      if (dominatedAxis >= 0) {
        // A resume may already be partway through this suffix. Count only its
        // remaining cursor positions, regardless of warmup order or budget.
        proofPruned += remainingInBranch(dominatedAxis);
        substitutionBranches++;
        advance(dominatedAxis);
        assignments++;
        if (assignments % 256 === 0) await yieldTraversal();
        continue;
      }
      const chosenGroups = traversal.cursor.flatMap((choice, index) => choice ? [groups[index][choice - 1]] : []);
      const chosenIndices = chosenGroups.map(group => groupIndex.get(group)!).sort((a, b) => a - b);
      if (seededSelections.has(chosenIndices.join(":"))) {
        advance(); assignments++;
        if (assignments % 256 === 0) await yieldTraversal();
        continue;
      }
      if (chosenGroups.length === 2) {
        if (seededPairs.has(`${chosenIndices[0]}:${chosenIndices[1]}`)) {
          advance(); assignments++;
          if (assignments % 256 === 0) await yieldTraversal();
          continue;
        }
      }
      const effectSelection: AuctionEffectGroup[] = [];
      let selection: AuctionGearOption[] = [];
      let costCopper = 0, invalidPrefix = -1;
      // Reuse the receipt of the longest unchanged, affordable prefix.
      for (let index = 0; index < groups.length; index++) {
        const choice = traversal.cursor[index];
        if (choice) effectSelection.push(groups[index][choice - 1]);
        if (previousChoices[index] === choice) {
          selection = prefixReceipts[index + 1];
          costCopper = prefixCosts[index + 1];
          continue;
        }
        previousChoices.length = index;
        if (choice) {
          const offer = independentOffers.get(groups[index][choice - 1]);
          if (offer && effectSelection.length <= 16) {
            if (offer.costCopper > input.budgetCopper - costCopper) invalidPrefix = index;
            else {
              costCopper += offer.costCopper;
              selection = [...selection, offer];
            }
          } else {
            const purchase = await cheapestAuctionEffectSelection(effectSelection, input.budgetCopper, input.signal);
            if (!purchase) invalidPrefix = index;
            else {
              selection = purchase.options;
              costCopper = purchase.costCopper;
            }
          }
        }
        if (invalidPrefix < 0) {
          previousChoices.push(choice);
          prefixReceipts[index + 1] = selection;
          prefixCosts[index + 1] = costCopper;
        }
        if (invalidPrefix >= 0) break;
      }
      if (trackBranches && invalidPrefix >= 0) {
        procurementBranches++;
        procurementAssignments += remainingInBranch(invalidPrefix);
      }
      if (invalidPrefix < 0) {
        if (compatibleSelection(selection)) {
          if (!evaluate(selection)) break;
        } else {
          const conflict = auctionConflictingPurchaseSlot(chosenGroups.map(group => group.options[0]), input.specId);
          if (conflict) {
            invalidPrefix = slots.indexOf(conflict);
            if (trackBranches && invalidPrefix >= 0) {
              equipConflictBranches++;
              equipConflictAssignments += remainingInBranch(invalidPrefix);
            }
          }
        }
      }
      traversal.combinationsChecked++;
      assignments++;
      advance(invalidPrefix >= 0 ? invalidPrefix : undefined);
      if (pending.size >= window || selections.length >= 256) await commitWindow();
      if (assignments % 256 === 0) await yieldTraversal();
    }
    await commitWindow();
  } finally {
    controller.abort();
    await Promise.all(pending.values());
  }
  save();
  let leaders: Leaders = checkpoint;
  let coverage = checkpoint;
  let coverageCount = combinationCount;
  let complete = checkpoint.exhausted || directVerification && checkpoint.seedSelections !== null &&
    checkpoint.nextSeed === checkpoint.seedSelections.length && checkpoint.nextEquipmentSingle === flatGroups.length;
  if (complete && input.recheckEquipment) {
    const sets = new Map<string, AuctionGearOption[]>([["[]", []]]);
    for (const best of [checkpoint.best, checkpoint.bestDpsConfirmed, checkpoint.bestValueConfirmed, checkpoint.bestConfirmed]) {
      if (best?.optionIds.length) sets.set(JSON.stringify([...best.optionIds].sort()), optionsFor(best));
    }
    if (preciseSingleCards) {
      for (const [index, offer] of cheapestSingles.entries()) {
        if (!compatibleSingle(index)) continue;
        const group = flatGroups[index];
        if (dominatedGroups.has(group) && !group.options.some(o => checkpoint.simulationCache[auctionSelectionEffectKey([o])])) continue;
        sets.set(JSON.stringify([offer.id]), [offer]);
      }
    }
    const measurements = checkpoint.equipmentFinalistMeasurements ??= {};
    const verified = new Map<string, GearPlanSimulation>();
    const finalists = [...sets];
    const concurrency = input.simulationConcurrency === 2
      ? 2 * (preciseSingleCards ? Math.max(1, input.simulationBatchSize ?? 0) : 1) : 1;
    const independent = input.recheckEquipment;
    const precise = (result: GearPlanSimulation) => {
      const value = validSimulation(result, checkpoint.baseline.engine);
      if (value.iterations !== 750) throw new Error("invalid_finalist_precision");
      return value;
    };
    const recheck = async (selected: AuctionGearOption[], signal: AbortSignal) => precise(await independent(selected, signal));
    for (let offset = 0; offset < finalists.length; offset += concurrency) {
      const window = finalists.slice(offset, offset + concurrency);
      const results = await Promise.allSettled(window.map(async ([key, selected]) => {
        input.signal.throwIfAborted();
        const cached = measurements[key];
        if (!cached) {
          if (calls >= max || input.shouldYield?.()) return;
          calls++;
        }
        const result = cached ? precise(cached) : await recheck(selected, input.signal);
        verified.set(key, result);
        if (!cached) {
          measurements[key] = result;
          checkpoint.simulations++;
          save();
          input.onProgress?.({ phase: "simulating", completed: verified.size, total: sets.size });
        }
      }));
      const failed = results.find(result => result.status === "rejected");
      if (failed) throw failed.reason;
      if (window.some(([key]) => !verified.has(key))) { complete = false; break; }
    }
    const preciseBaseline = verified.get("[]");
    if (preciseSingleCards && preciseBaseline) {
      const byOption = new Map<string, GearPlanSimulation>();
      for (const [index, offer] of cheapestSingles.entries()) {
        const score = verified.get(JSON.stringify([offer.id]));
        if (score) for (const option of flatGroups[index].options) byOption.set(option.id, score);
      }
      // Proof edges strictly decrease (price, id). Keep each physical lot's own
      // price and receipt, even when its combat measurement comes from another lot.
      if (singleReplacements) for (const [id, replacement] of singleReplacements) {
        let source: string | undefined = replacement;
        while (source && !byOption.has(source)) source = singleReplacements.get(source);
        if (source && !byOption.has(id)) byOption.set(id, byOption.get(source)!);
      }
      preciseSingles = { baseline: preciseBaseline, byOption };
    }
    if (complete) {
      const baseline = verified.get("[]")!;
      // The screening leaders are an early precise result. They cannot bound
      // other receipts at an independent seed and precision. Reuse the same
      // procurement, certified branch cuts and tie-breaks for the precise pass.
      const warm: AuctionGearSimulationCache = {};
      for (const [key, selected] of sets) warm[auctionSelectionEffectKey(selected)] = verified.get(key)!;
      const saved = checkpoint.equipmentVerification;
      if (saved) {
        precise(saved.baseline);
        for (const result of Object.values(saved.simulationCache)) precise(result);
        for (const best of [saved.best, saved.bestConfirmed, saved.bestDpsConfirmed, saved.bestValueConfirmed])
          if (best) precise(best.simulation);
      }
      if (!saved && (calls >= max || input.shouldYield?.())) {
        complete = false;
      } else {
        const verification = await assembleAuctionGear({ ...input, searchId: input.searchId + ":equipment-750",
          baseline, simulate: recheck, simulationCache: warm, checkpoint: saved, incumbents: undefined,
          maxNewSimulations: Math.max(1, max - calls), shouldYield: calls >= max ? () => true : input.shouldYield,
          recheckEquipment: undefined,
          onCheckpoint: state => { checkpoint.equipmentVerification = state; save(); } });
        checkpoint.equipmentVerification = verification.checkpoint;
        complete = verification.result.exhaustiveComplete;
        coverage = verification.checkpoint;
        coverageCount = verification.result.combinationCount;
      }
      const covered = checkpoint.equipmentVerification;
      leaders = { baseline, best: covered?.best ?? { optionIds: [], simulation: baseline },
        bestConfirmed: covered?.bestConfirmed ?? null, bestDpsConfirmed: covered?.bestDpsConfirmed ?? null,
        bestValueConfirmed: covered?.bestValueConfirmed ?? null };
      for (const [key, selected] of sets) if (selected.length) consider(selected, verified.get(key)!, leaders);
    }
  }
  const selection = optionsFor(leaders.best), spentCopper = auctionPlanCost(selection);
  const final = auctionPlanLoadout(input.loadout, selection, input.specId, slots);
  const presentConfirmed = (best: typeof leaders.best | null | undefined) => {
    if (!best) return null;
    const confirmedOptions = optionsFor(best);
    const confirmedFinal = auctionPlanLoadout(input.loadout, confirmedOptions, input.specId, slots);
    const confirmedCost = auctionPlanCost(confirmedOptions);
    return { purchases: confirmedOptions.map(auctionGearPurchase), spentCopper: confirmedCost, remainingCopper: input.budgetCopper - confirmedCost,
      removedSlots: input.loadout.filter(item => !confirmedFinal.some(final => final.slotType === item.slotType)).map(item => item.slotType),
      comparison: compareGearSimulationResults(leaders.baseline, best.simulation) };
  };
  input.signal.throwIfAborted();
  assertFreshMarket(input.market);
  return { checkpoint, ...(preciseSingles ? { preciseSingles } : {}), result: { kind: "assembly", objective: input.objective ?? "dps", searchId: input.searchId, selectedSlots: slots,
    costBreakdown: { itemsCopper: spentCopper, totalCopper: null, coverage: "enhancement_compatibility_unverified" },
    budgetCopper: input.budgetCopper, spentCopper, remainingCopper: input.budgetCopper - spentCopper,
    purchases: selection.map(auctionGearPurchase), removedSlots: input.loadout.filter(i => !final.some(f => f.slotType === i.slotType)).map(i => i.slotType),
    comparison: compareGearSimulationResults(leaders.baseline, leaders.best.simulation), engine: leaders.baseline.engine,
    bestConfirmed: presentConfirmed(leaders.bestConfirmed),
    bestValueConfirmed: presentConfirmed(leaders.bestValueConfirmed), bestDpsConfirmed: presentConfirmed(leaders.bestDpsConfirmed),
    simulations: checkpoint.simulations + (checkpoint.equipmentVerification?.simulations ?? 0), optionsConsidered: options.length, searchLimited: !complete,
    exhaustiveComplete: complete, combinationsChecked: coverage.combinationsChecked,
    ...(coverage.proofPrunedAssignments ? { proofPrunedAssignments: coverage.proofPrunedAssignments } : {}),
    ...(coverage.pruningCounts ? { pruningCounts: coverage.pruningCounts } : {}),
    validCombinations: coverage.validCombinations, combinationCount: coverageCount, combinationKind: "effects" } };
}

/** Backward-compatible entry point; its result is now an exhaustive resumable search. */
export async function planAuctionGear(input: Omit<PlannerInput, "searchId" | "selectedSlots" | "maxNewSimulations"> & {
  maxSimulations?: number; selectedSlots?: string[];
}): Promise<AuctionGearPlan> {
  const { result, checkpoint } = await assembleAuctionGear({ ...input, searchId: "legacy-plan",
    selectedSlots: input.selectedSlots ?? [...new Set(input.options.map(o => o.candidate.slotType))],
    maxNewSimulations: input.maxSimulations });
  // The original entry point promised only confirmed purchase recommendations.
  // The assembly API exposes the measured maximum and its uncertainty separately.
  return result.bestConfirmed ? { ...result, ...result.bestConfirmed,
    costBreakdown: { itemsCopper: result.bestConfirmed.spentCopper, totalCopper: null, coverage: "enhancement_compatibility_unverified" } } : {
    ...result, costBreakdown: { itemsCopper: 0, totalCopper: null, coverage: "enhancement_compatibility_unverified" }, spentCopper: 0, remainingCopper: input.budgetCopper, purchases: [], removedSlots: [],
    comparison: compareGearSimulationResults(checkpoint.baseline, checkpoint.baseline),
  };
}
