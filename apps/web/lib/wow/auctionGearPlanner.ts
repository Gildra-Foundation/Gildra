import { createHash } from "node:crypto";
import { assertFreshMarket, type AuctionSnapshot } from "./auctionMarket";
import { candidateLoadoutItem, compareGearSimulationResults } from "./gearSimulation";
import { isTwoHandWeapon, supportsTitanGrip, validateGearLoadout, type GearLoadoutItem } from "./gearCompatibility";
import type {
  AuctionGearAssemblyCheckpoint, AuctionGearAssemblyResult, AuctionGearOption, AuctionGearPlan,
  AuctionGearPurchase, AuctionGearSearchCheckpoint, AuctionGearSearchItem, AuctionGearSearchResult,
  AuctionGearSimulationCache, AuctionPlanProgress, GearPlanSimulation,
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

export function auctionGearPurchase(option: AuctionGearOption): AuctionGearPurchase {
  const variant = option.candidate.variants.find(v => v.key === option.variantKey);
  if (!variant) throw new Error("simulation_variant_not_found");
  return {
    auctionId: option.auctionId, itemId: option.candidate.itemId, name: option.candidate.name,
    iconUrl: option.candidate.iconUrl, quality: option.candidate.quality, slotType: option.candidate.slotType,
    variantKey: option.variantKey, itemLevel: variant.itemLevel,
    requiredLevel: option.candidate.constraints.requiredLevel, bonusIds: variant.bonusIds,
    contextId: variant.contextId, modifiers: variant.modifiers, stats: variant.resolution?.stats,
    lotCostCopper: option.costCopper, quantity: option.quantity,
  };
}

/** Native input identity: auction price/lot identity does not change item effects. */
export function auctionSelectionEffectKey(options: AuctionGearOption[]) {
  return createHash("sha256").update(JSON.stringify(options.map(option => {
    const variant = option.candidate.variants.find(v => v.key === option.variantKey);
    if (!variant) throw new Error("simulation_variant_not_found");
    return [option.candidate.slotType, option.candidate.itemId, [...variant.bonusIds].sort((a, b) => a - b),
      variant.contextId ?? 0, [...(variant.modifiers ?? [])].sort((a, b) => a.type - b.type || a.value - b.value)];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}

const selectionKey = (items: AuctionGearOption[]) => items.map(o => o.id).sort().join("|");
function validSimulation(result: GearPlanSimulation, engine?: string) {
  if (!Number.isFinite(result.dps) || result.dps <= 0 || !Number.isFinite(result.dpsError) || result.dpsError < 0 ||
      result.confidence !== 95 || typeof result.engine !== "string" || !result.engine.startsWith("SimulationCraft") ||
      !Number.isInteger(result.iterations) || result.iterations <= 0) throw new Error("invalid_simulation_result");
  if (engine && result.engine !== engine) throw new Error("simulation_version_changed");
  return result;
}

type PlannerInput = {
  searchId: string;
  budgetCopper: number;
  options: AuctionGearOption[];
  selectedSlots: string[];
  loadout: GearLoadoutItem[];
  specId: number;
  market: Pick<AuctionSnapshot, "sourceUpdatedAt">;
  signal: AbortSignal;
  simulate: (selections: AuctionGearOption[], signal: AbortSignal) => Promise<GearPlanSimulation>;
  onProgress?: (progress: AuctionPlanProgress) => void;
  maxNewSimulations?: number;
  maxAssignments?: number;
  shouldYield?: () => boolean;
  baseline?: GearPlanSimulation;
  simulationCache?: AuctionGearSimulationCache;
};

function prepare(input: PlannerInput) {
  input.signal.throwIfAborted();
  if (!Number.isSafeInteger(input.budgetCopper) || input.budgetCopper < 0) throw new Error("invalid_budget");
  if (!Array.isArray(input.selectedSlots) || new Set(input.selectedSlots).size !== input.selectedSlots.length) throw new Error("invalid_equipment_slots");
  assertFreshMarket(input.market);
  const slots = [...input.selectedSlots].sort();
  const options = input.options.filter(o => slots.includes(o.candidate.slotType) && o.candidate.eligible &&
    o.candidate.variants.some(v => v.key === o.variantKey) && o.costCopper <= input.budgetCopper).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(options.map(o => o.id)).size !== options.length) throw new Error("invalid_auction_selection");
  for (const option of options) auctionPlanCost([option]);
  const inputKey = createHash("sha256").update(JSON.stringify({ searchId: input.searchId, budget: input.budgetCopper,
    slots, loadout: input.loadout, specId: input.specId,
    options: options.map(o => [o.id, o.auctionId, o.quantity, o.costCopper, auctionSelectionEffectKey([o]), candidateLoadoutItem(o.candidate)]),
  })).digest("hex");
  const max = input.maxNewSimulations ?? 48, maxAssignments = input.maxAssignments ?? 100_000;
  if (!Number.isSafeInteger(max) || max < 1 || !Number.isSafeInteger(maxAssignments) || maxAssignments < 1) throw new Error("invalid_search_limit");
  return { options, slots, inputKey, max, maxAssignments };
}

function cloneCache(cache: AuctionGearSimulationCache = {}, engine?: string) {
  for (const result of Object.values(cache)) validSimulation(result, engine);
  return structuredClone(cache);
}

async function baselineFor(input: PlannerInput, cache: AuctionGearSimulationCache) {
  auctionPlanLoadout(input.loadout, [], input.specId, input.selectedSlots);
  const key = auctionSelectionEffectKey([]);
  const cached = input.baseline ?? cache[key];
  const baseline = validSimulation(cached ?? await input.simulate([], input.signal));
  cache[key] = baseline;
  for (const result of Object.values(cache)) validSimulation(result, baseline.engine);
  return { baseline, calls: cached ? 0 : 1 };
}

function requireCheckpoint(key: string, checkpoint: { version: number; inputKey: string }) {
  if (checkpoint.version !== 1 || checkpoint.inputKey !== key) throw new Error("auction_search_changed");
}

/** Every distinct purchasable option remains visible; repeated native effects share a simulation. */
export async function searchAuctionGearOptions(input: PlannerInput & {
  checkpoint?: AuctionGearSearchCheckpoint;
  onCheckpoint?: (checkpoint: AuctionGearSearchCheckpoint) => void;
}): Promise<{ result: AuctionGearSearchResult; checkpoint: AuctionGearSearchCheckpoint }> {
  const { options, slots, inputKey, max, maxAssignments } = prepare(input);
  let checkpoint: AuctionGearSearchCheckpoint, calls = 0;
  if (input.checkpoint) {
    requireCheckpoint(inputKey, input.checkpoint);
    checkpoint = structuredClone(input.checkpoint);
    validSimulation(checkpoint.baseline);
    checkpoint.simulationCache = cloneCache(checkpoint.simulationCache, checkpoint.baseline.engine);
    if (!Number.isInteger(checkpoint.nextOption) || checkpoint.nextOption < 0 || checkpoint.nextOption > options.length) throw new Error("invalid_search_checkpoint");
  } else {
    const cache = cloneCache(input.simulationCache);
    const baseline = await baselineFor(input, cache);
    calls = baseline.calls;
    checkpoint = { version: 1, inputKey, nextOption: 0, baseline: baseline.baseline, simulationCache: cache, simulations: calls };
  }
  const save = () => input.onCheckpoint?.(checkpoint);
  save();
  let assignments = 0;
  while (checkpoint.nextOption < options.length && assignments < maxAssignments && !input.shouldYield?.()) {
    input.signal.throwIfAborted();
    const option = options[checkpoint.nextOption], key = auctionSelectionEffectKey([option]);
    let compatible = true;
    try { auctionPlanLoadout(input.loadout, [option], input.specId, slots); } catch { compatible = false; }
    let simulated = false;
    if (compatible && !checkpoint.simulationCache[key]) {
      if (calls >= max) break;
      checkpoint.simulationCache[key] = validSimulation(await input.simulate([option], input.signal), checkpoint.baseline.engine);
      checkpoint.simulations++;
      calls++;
      simulated = true;
      input.onProgress?.({ phase: "simulating", completed: calls, total: max });
    }
    checkpoint.nextOption++;
    assignments++;
    if (simulated) save();
    if (assignments % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  save();
  const items = options.map<AuctionGearSearchItem>((option, index) => {
    let compatible = true;
    try { auctionPlanLoadout(input.loadout, [option], input.specId, slots); } catch { compatible = false; }
    const simulation = compatible ? checkpoint.simulationCache[auctionSelectionEffectKey([option])] : undefined;
    const comparison = simulation ? compareGearSimulationResults(checkpoint.baseline, simulation) : null;
    return { ...auctionGearPurchase(option), optionId: option.id, comparison,
      evaluation: !compatible ? "requires_combination" : !comparison && index >= checkpoint.nextOption ? "pending" :
        comparison && comparison.deltaDps > 0 && comparison.uncertainty.significant ? "upgrade" :
          comparison && comparison.deltaDps <= 0 && comparison.uncertainty.significant ? "not_upgrade" : "inconclusive" };
  }).sort((a, b) => a.lotCostCopper - b.lotCostCopper || (b.comparison?.deltaDps ?? -Infinity) - (a.comparison?.deltaDps ?? -Infinity) || a.optionId.localeCompare(b.optionId));
  input.signal.throwIfAborted();
  assertFreshMarket(input.market);
  return { checkpoint, result: { kind: "search", searchId: input.searchId, selectedSlots: slots,
    budgetCopper: input.budgetCopper, baseline: checkpoint.baseline, items, searchComplete: checkpoint.nextOption === options.length,
    pendingItems: items.filter(item => item.evaluation === "pending").length, simulations: checkpoint.simulations,
    engine: checkpoint.baseline.engine, searchLimited: false, optionsConsidered: options.length } };
}

/** Complete mixed-radix enumeration, yielding only at a persisted next assignment. */
export async function assembleAuctionGear(input: PlannerInput & {
  checkpoint?: AuctionGearAssemblyCheckpoint;
  onCheckpoint?: (checkpoint: AuctionGearAssemblyCheckpoint) => void;
}): Promise<{ result: AuctionGearAssemblyResult; checkpoint: AuctionGearAssemblyCheckpoint }> {
  const { options, slots, inputKey, max, maxAssignments } = prepare(input);
  const groups = slots.map(slot => options.filter(o => o.candidate.slotType === slot));
  const radices = groups.map(group => group.length + 1);
  const combinationCount = radices.reduce((product, radix) => product * BigInt(radix), 1n).toString();
  let checkpoint: AuctionGearAssemblyCheckpoint, calls = 0;
  if (input.checkpoint) {
    requireCheckpoint(inputKey, input.checkpoint);
    checkpoint = structuredClone(input.checkpoint);
    validSimulation(checkpoint.baseline);
    checkpoint.simulationCache = cloneCache(checkpoint.simulationCache, checkpoint.baseline.engine);
    if (checkpoint.cursor.length !== slots.length || checkpoint.cursor.some((index, slot) => !Number.isInteger(index) || index < 0 || index >= radices[slot])) throw new Error("invalid_search_checkpoint");
    validSimulation(checkpoint.best.simulation, checkpoint.baseline.engine);
  } else {
    const cache = cloneCache(input.simulationCache);
    const baseline = await baselineFor(input, cache);
    calls = baseline.calls;
    checkpoint = { version: 1, inputKey, cursor: slots.map(() => 0), exhausted: false,
      baseline: baseline.baseline, best: { optionIds: [], simulation: baseline.baseline }, simulationCache: cache,
      simulations: calls, combinationsChecked: 0, validCombinations: 0 };
    // Search already measured legal singles. They provide an early useful bound
    // while enumeration still visits every assignment required for completion.
    let seedCost = 0, seedId = "";
    for (const option of options) {
      const simulation = cache[auctionSelectionEffectKey([option])];
      if (!simulation) continue;
      try { auctionPlanLoadout(input.loadout, [option], input.specId, slots); } catch { continue; }
      if (simulation.dps > checkpoint.best.simulation.dps || simulation.dps === checkpoint.best.simulation.dps &&
          (option.costCopper < seedCost || option.costCopper === seedCost && option.id < seedId)) {
        checkpoint.best = { optionIds: [option.id], simulation };
        seedCost = option.costCopper;
        seedId = option.id;
      }
    }
  }
  const save = () => input.onCheckpoint?.(checkpoint);
  const advance = (from = checkpoint.cursor.length - 1) => {
    for (let index = from; index >= 0; index--) {
      if (++checkpoint.cursor[index] < radices[index]) {
        checkpoint.cursor.fill(0, index + 1);
        return;
      }
      checkpoint.cursor[index] = 0;
    }
    checkpoint.exhausted = true;
  };
  const byId = new Map(options.map(option => [option.id, option]));
  const bestOptions = () => checkpoint.best.optionIds.map(id => {
    const option = byId.get(id);
    if (!option) throw new Error("invalid_search_checkpoint");
    return option;
  });
  auctionPlanLoadout(input.loadout, bestOptions(), input.specId, slots);
  if (auctionPlanCost(bestOptions()) > input.budgetCopper) throw new Error("invalid_search_checkpoint");
  save();
  let assignments = 0;
  while (!checkpoint.exhausted && assignments < maxAssignments && !input.shouldYield?.()) {
    input.signal.throwIfAborted();
    const selection: AuctionGearOption[] = [];
    let invalidPrefix = -1;
    // Only monotone financial/lot constraints can prune an incomplete state.
    // Unique categories and hand compatibility are checked on the final loadout.
    for (let index = 0; index < groups.length; index++) {
      const choice = checkpoint.cursor[index];
      if (choice) selection.push(groups[index][choice - 1]);
      try { if (auctionPlanCost(selection) > input.budgetCopper) invalidPrefix = index; }
      catch { invalidPrefix = index; }
      if (invalidPrefix >= 0) break;
    }
    let compatible = invalidPrefix < 0;
    let simulated = false;
    if (compatible) {
      try { auctionPlanLoadout(input.loadout, selection, input.specId, slots); } catch { compatible = false; }
    }
    if (compatible) {
      const key = auctionSelectionEffectKey(selection);
      let simulation = checkpoint.simulationCache[key];
      if (!simulation) {
        if (calls >= max) break;
        simulation = validSimulation(await input.simulate(selection, input.signal), checkpoint.baseline.engine);
        checkpoint.simulationCache[key] = simulation;
        checkpoint.simulations++;
        calls++;
        simulated = true;
        input.onProgress?.({ phase: "simulating", completed: calls, total: max });
      }
      checkpoint.validCombinations++;
      const best = checkpoint.best;
      const cost = auctionPlanCost(selection), bestCost = auctionPlanCost(bestOptions());
      // DPS is a black box: no sum of individual gains is used to rank combinations.
      if (simulation.dps > best.simulation.dps || simulation.dps === best.simulation.dps &&
          (cost < bestCost || cost === bestCost && selectionKey(selection) < best.optionIds.slice().sort().join("|"))) {
        checkpoint.best = { optionIds: selection.map(o => o.id), simulation };
      }
    }
    checkpoint.combinationsChecked++;
    assignments++;
    advance(invalidPrefix >= 0 ? invalidPrefix : undefined);
    if (simulated) save();
    if (assignments % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  save();
  const selection = bestOptions(), spentCopper = auctionPlanCost(selection);
  const final = auctionPlanLoadout(input.loadout, selection, input.specId, slots);
  input.signal.throwIfAborted();
  assertFreshMarket(input.market);
  return { checkpoint, result: { kind: "assembly", searchId: input.searchId, selectedSlots: slots,
    budgetCopper: input.budgetCopper, spentCopper, remainingCopper: input.budgetCopper - spentCopper,
    purchases: selection.map(auctionGearPurchase), removedSlots: input.loadout.filter(i => !final.some(f => f.slotType === i.slotType)).map(i => i.slotType),
    comparison: compareGearSimulationResults(checkpoint.baseline, checkpoint.best.simulation), engine: checkpoint.baseline.engine,
    simulations: checkpoint.simulations, optionsConsidered: options.length, searchLimited: !checkpoint.exhausted,
    exhaustiveComplete: checkpoint.exhausted, combinationsChecked: checkpoint.combinationsChecked,
    validCombinations: checkpoint.validCombinations, combinationCount } };
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
  return result.comparison.deltaDps > 0 && result.comparison.uncertainty.significant ? result : {
    ...result, spentCopper: 0, remainingCopper: input.budgetCopper, purchases: [], removedSlots: [],
    comparison: compareGearSimulationResults(checkpoint.baseline, checkpoint.baseline),
  };
}
