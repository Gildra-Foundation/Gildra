import { createHash } from "node:crypto";
import { assertFreshMarket, type AuctionSnapshot } from "./auctionMarket";
import { candidateLoadoutItem, compareGearSimulationResults } from "./gearSimulation";
import { isTwoHandWeapon, supportsTitanGrip, validateGearLoadout, type GearLoadoutItem } from "./gearCompatibility";
import { auctionEffectGroupKey, auctionEffectGroups, auctionSelectionEffectKey, cheapestAuctionEffectSelection, type AuctionEffectGroup } from "./auctionGearEffects";
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
  for (const best of [checkpoint.best, checkpoint.bestConfirmed]) {
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
  incumbents?: AuctionGearIncumbent[];
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
  return Object.fromEntries(Object.entries(cache).map(([key, result]) => [key, validSimulation(result, engine)]));
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

function requireCheckpoint(key: string, checkpoint: { version: number; inputKey: string }, version = 1) {
  if (checkpoint.version !== version || checkpoint.inputKey !== key) throw new Error("auction_search_changed");
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
    checkpoint.baseline = validSimulation(checkpoint.baseline);
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

/** Complete effect enumeration with exact procurement, yielding at a persisted assignment. */
export async function assembleAuctionGear(input: PlannerInput & {
  checkpoint?: AuctionGearAssemblyCheckpoint;
  onCheckpoint?: (checkpoint: AuctionGearAssemblyCheckpoint) => void;
}): Promise<{ result: AuctionGearAssemblyResult; checkpoint: AuctionGearAssemblyCheckpoint }> {
  const { options, slots, inputKey, max, maxAssignments } = prepare(input);
  const groups = auctionEffectGroups(options, slots);
  const flatGroups = groups.flat();
  const radices = groups.map(group => group.length + 1);
  const combinationCount = radices.reduce((product, radix) => product * BigInt(radix), 1n).toString();
  let checkpoint: AuctionGearAssemblyCheckpoint, calls = 0;
  if (input.checkpoint) {
    requireCheckpoint(inputKey, input.checkpoint, 3);
    checkpoint = structuredClone(input.checkpoint);
    checkpoint.baseline = validSimulation(checkpoint.baseline);
    checkpoint.simulationCache = cloneCache(checkpoint.simulationCache, checkpoint.baseline.engine);
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
    if (checkpoint.bestConfirmed) checkpoint.bestConfirmed.simulation = validSimulation(checkpoint.bestConfirmed.simulation, checkpoint.baseline.engine);
  } else {
    const cache = cloneCache(input.simulationCache);
    const baseline = await baselineFor(input, cache);
    calls = baseline.calls;
    checkpoint = { version: 3, inputKey, cursor: slots.map(() => 0), exhausted: false,
      baseline: baseline.baseline, best: { optionIds: [], simulation: baseline.baseline }, bestConfirmed: null, simulationCache: cache,
      simulations: calls, combinationsChecked: 0, validCombinations: 0, nextPair: 0, seedSelections: null, nextSeed: 0,
      pairScores: flatGroups.map(group => cache[auctionSelectionEffectKey([group.options[0]])]?.dps ?? baseline.baseline.dps) };
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
  const optionsFor = (best: typeof checkpoint.best) => best.optionIds.map(id => {
    const option = byId.get(id);
    if (!option) throw new Error("invalid_search_checkpoint");
    return option;
  });
  const bestOptions = () => optionsFor(checkpoint.best);
  for (const best of [checkpoint.best, checkpoint.bestConfirmed]) if (best) {
    auctionPlanLoadout(input.loadout, optionsFor(best), input.specId, slots);
    if (auctionPlanCost(optionsFor(best)) > input.budgetCopper) throw new Error("invalid_search_checkpoint");
  }
  const confirmed = (simulation: GearPlanSimulation) => {
    const comparison = compareGearSimulationResults(checkpoint.baseline, simulation);
    return comparison.deltaDps > 0 && comparison.uncertainty.significant;
  };
  if (checkpoint.bestConfirmed && !confirmed(checkpoint.bestConfirmed.simulation)) throw new Error("invalid_search_checkpoint");
  const consider = (selection: AuctionGearOption[], simulation: GearPlanSimulation) => {
    const cost = auctionPlanCost(selection), key = selectionKey(selection);
    const preferred = (best: typeof checkpoint.best | null) => !best || simulation.dps > best.simulation.dps ||
      simulation.dps === best.simulation.dps && (cost < auctionPlanCost(optionsFor(best)) ||
        cost === auctionPlanCost(optionsFor(best)) && key < best.optionIds.slice().sort().join("|"));
    const best = { optionIds: selection.map(option => option.id), simulation };
    if (preferred(checkpoint.best)) checkpoint.best = best;
    if (confirmed(simulation) && preferred(checkpoint.bestConfirmed)) checkpoint.bestConfirmed = best;
  };
  if (!input.checkpoint) {
    // Recover confirmed singles even when the caller has already requested a yield.
    for (const option of options) {
      const simulation = checkpoint.simulationCache[auctionSelectionEffectKey([option])];
      if (!simulation) continue;
      try { auctionPlanLoadout(input.loadout, [option], input.specId, slots); } catch { continue; }
      consider([option], simulation);
    }
    const byEffect = new Map(flatGroups.map(group => [auctionEffectGroupKey(group.options[0]), group]));
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
  const yieldBeforeEnumeration = input.shouldYield?.() === true;
  const groupIndex = new Map(flatGroups.map((group, index) => [group, index]));
  const rankedBySlot = groups.map(slotGroups => slotGroups.map(group => groupIndex.get(group)!)
    .sort((a, b) => checkpoint.pairScores[b] - checkpoint.pairScores[a] || a - b));
  const groupCosts = flatGroups.map(group => group.options.reduce((cost, option) => Math.min(cost, option.costCopper), Infinity));
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
  const evaluate = async (selection: AuctionGearOption[]) => {
    try { auctionPlanLoadout(input.loadout, selection, input.specId, slots); }
    catch { return { processed: true, simulated: false }; }
    const key = auctionSelectionEffectKey(selection);
    let simulation = checkpoint.simulationCache[key], simulated = false;
    if (!simulation) {
      if (calls >= max) return { processed: false, simulated: false };
      simulation = validSimulation(await input.simulate(selection, input.signal), checkpoint.baseline.engine);
      checkpoint.simulationCache[key] = simulation;
      checkpoint.simulations++;
      calls++;
      simulated = true;
      input.onProgress?.({ phase: "simulating", completed: calls, total: max });
    }
    checkpoint.validCombinations++;
    // DPS is a black box: no sum of individual gains is used to rank results.
    consider(selection, simulation);
    return { processed: true, simulated };
  };
  let assignments = 0;
  const seeds = checkpoint.seedSelections ?? [];
  while (!yieldBeforeEnumeration && checkpoint.nextSeed < seeds.length && assignments < maxAssignments && !input.shouldYield?.()) {
    input.signal.throwIfAborted();
    const purchase = await cheapestAuctionEffectSelection(seeds[checkpoint.nextSeed].map(index => flatGroups[index]), input.budgetCopper, input.signal);
    const checked = purchase ? await evaluate(purchase.options) : { processed: true, simulated: false };
    if (!checked.processed) break;
    checkpoint.nextSeed++;
    checkpoint.combinationsChecked++;
    assignments++;
    if (checked.simulated) save();
  }
  const seededSelections = new Set(seeds.map(seed => seed.join(":")));
  // Test compatible repair pairs and promising pairs before the long Cartesian traversal.
  while (!yieldBeforeEnumeration && checkpoint.nextSeed === seeds.length && checkpoint.nextPair < pairs.length && assignments < maxAssignments && !input.shouldYield?.()) {
    input.signal.throwIfAborted();
    const pair = pairs[checkpoint.nextPair];
    const purchase = await cheapestAuctionEffectSelection([flatGroups[pair.first], flatGroups[pair.second]], input.budgetCopper, input.signal);
    const checked = purchase ? await evaluate(purchase.options) : { processed: true, simulated: false };
    if (!checked.processed) break;
    checkpoint.nextPair++;
    checkpoint.combinationsChecked++;
    assignments++;
    if (checked.simulated) save();
    if (assignments % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  while (!yieldBeforeEnumeration && checkpoint.nextSeed === seeds.length && checkpoint.nextPair === pairs.length && !checkpoint.exhausted && assignments < maxAssignments && !input.shouldYield?.()) {
    input.signal.throwIfAborted();
    const chosenGroups = checkpoint.cursor.flatMap((choice, index) => choice ? [groups[index][choice - 1]] : []);
    const chosenIndices = chosenGroups.map(group => groupIndex.get(group)!).sort((a, b) => a - b);
    if (seededSelections.has(chosenIndices.join(":"))) {
      advance(); assignments++;
      if (assignments % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve));
      continue;
    }
    if (chosenGroups.length === 2) {
      if (seededPairs.has(`${chosenIndices[0]}:${chosenIndices[1]}`)) {
        advance(); assignments++;
        if (assignments % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve));
        continue;
      }
    }
    const effectSelection: AuctionEffectGroup[] = [];
    let selection: AuctionGearOption[] = [];
    let invalidPrefix = -1;
    // Only monotone financial/lot constraints can prune an incomplete state.
    // Unique categories and hand compatibility are checked on the final loadout.
    for (let index = 0; index < groups.length; index++) {
      const choice = checkpoint.cursor[index];
      if (choice) effectSelection.push(groups[index][choice - 1]);
      const purchase = await cheapestAuctionEffectSelection(effectSelection, input.budgetCopper, input.signal);
      if (!purchase) invalidPrefix = index;
      else selection = purchase.options;
      if (invalidPrefix >= 0) break;
    }
    const checked = invalidPrefix < 0 ? await evaluate(selection) : { processed: true, simulated: false };
    if (!checked.processed) break;
    checkpoint.combinationsChecked++;
    assignments++;
    advance(invalidPrefix >= 0 ? invalidPrefix : undefined);
    if (checked.simulated) save();
    if (assignments % 256 === 0) await new Promise<void>(resolve => setImmediate(resolve));
  }
  save();
  const selection = bestOptions(), spentCopper = auctionPlanCost(selection);
  const final = auctionPlanLoadout(input.loadout, selection, input.specId, slots);
  const confirmedOptions = checkpoint.bestConfirmed ? optionsFor(checkpoint.bestConfirmed) : null;
  const confirmedFinal = confirmedOptions ? auctionPlanLoadout(input.loadout, confirmedOptions, input.specId, slots) : null;
  const confirmedCost = confirmedOptions ? auctionPlanCost(confirmedOptions) : 0;
  input.signal.throwIfAborted();
  assertFreshMarket(input.market);
  return { checkpoint, result: { kind: "assembly", searchId: input.searchId, selectedSlots: slots,
    budgetCopper: input.budgetCopper, spentCopper, remainingCopper: input.budgetCopper - spentCopper,
    purchases: selection.map(auctionGearPurchase), removedSlots: input.loadout.filter(i => !final.some(f => f.slotType === i.slotType)).map(i => i.slotType),
    comparison: compareGearSimulationResults(checkpoint.baseline, checkpoint.best.simulation), engine: checkpoint.baseline.engine,
    bestConfirmed: checkpoint.bestConfirmed && confirmedOptions && confirmedFinal ? {
      purchases: confirmedOptions.map(auctionGearPurchase), spentCopper: confirmedCost, remainingCopper: input.budgetCopper - confirmedCost,
      removedSlots: input.loadout.filter(item => !confirmedFinal.some(final => final.slotType === item.slotType)).map(item => item.slotType),
      comparison: compareGearSimulationResults(checkpoint.baseline, checkpoint.bestConfirmed.simulation),
    } : null,
    simulations: checkpoint.simulations, optionsConsidered: options.length, searchLimited: !checkpoint.exhausted,
    exhaustiveComplete: checkpoint.exhausted, combinationsChecked: checkpoint.combinationsChecked,
    validCombinations: checkpoint.validCombinations, combinationCount, combinationKind: "effects" } };
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
  return result.bestConfirmed ? { ...result, ...result.bestConfirmed } : {
    ...result, spentCopper: 0, remainingCopper: input.budgetCopper, purchases: [], removedSlots: [],
    comparison: compareGearSimulationResults(checkpoint.baseline, checkpoint.baseline),
  };
}
