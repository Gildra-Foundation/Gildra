import { assertFreshMarket, type AuctionSnapshot } from "./auctionMarket";
import { compareGearSimulationResults } from "./gearSimulation";
import { candidateLoadoutItem } from "./gearSimulation";
import { isTwoHandWeapon, supportsTitanGrip, validateGearLoadout, type GearLoadoutItem } from "./gearCompatibility";
import type { GearCandidate } from "./gearCandidates";
export type AuctionGearOption = {
  id: string;
  auctionId: number;
  quantity: number;
  costCopper: number;
  candidate: GearCandidate;
  variantKey: string;
};
export type GearPlanSimulation = {
  dps: number;
  dpsError: number;
  confidence: number;
  iterations: number;
  engine: string;
};
export type AuctionGearPlan = {
  budgetCopper: number;
  spentCopper: number;
  remainingCopper: number;
  purchases: Array<{
    auctionId: number;
    itemId: number;
    name: string;
    slotType: string;
    variantKey: string;
    itemLevel: number;
    requiredLevel?: number;
    bonusIds?: number[];
    contextId?: number;
    modifiers?: Array<{
      type: number;
      value: number;
    }>;
    stats?: Record<string, number>;
    lotCostCopper: number;
    quantity: number;
  }>;
  removedSlots: string[];
  comparison: ReturnType<typeof compareGearSimulationResults>;
  engine: string;
  simulations: number;
  searchLimited: boolean;
  optionsConsidered: number;
};
export type AuctionPlanProgress = {
  phase: "market" | "catalog" | "variants" | "simulating";
  completed: number;
  total: number;
};
export function auctionPlanCost(options: AuctionGearOption[]) {
  const lots = new Map<number, {
    cost: number;
    quantity: number;
    used: number;
  }>();
  const slots = new Set<string>();
  for (const option of options) {
    if (slots.has(option.candidate.slotType) || !Number.isSafeInteger(option.costCopper) || option.costCopper <= 0 || !Number.isSafeInteger(option.quantity) || option.quantity <= 0) throw new Error("invalid_auction_selection");
    slots.add(option.candidate.slotType);
    const current = lots.get(option.auctionId);
    if (current && (current.cost !== option.costCopper || current.quantity !== option.quantity)) throw new Error("invalid_auction_selection");
    const entry = current ?? {
      cost: option.costCopper,
      quantity: option.quantity,
      used: 0
    };
    entry.used++;
    if (entry.used > entry.quantity) throw new Error("auction_quantity_exceeded");
    lots.set(option.auctionId, entry);
  }
  const total = [...lots.values()].reduce((sum, entry) => sum + entry.cost, 0);
  if (!Number.isSafeInteger(total)) throw new Error("invalid_budget");
  return total;
}
export function auctionPlanLoadout(base: GearLoadoutItem[], options: AuctionGearOption[], specId: number) {
  const slots = new Set(options.map(o => o.candidate.slotType));
  const main = options.find(o => o.candidate.slotType === "MAIN_HAND")?.candidate;
  const removeOffhand = main && isTwoHandWeapon(main.inventoryType) && !supportsTitanGrip(specId, main.itemSubclassId);
  if (removeOffhand && slots.has("OFF_HAND")) throw new Error("two_hand_offhand_conflict");
  const final = [...base.filter(item => !slots.has(item.slotType) && !(removeOffhand && item.slotType === "OFF_HAND")), ...options.map(o => candidateLoadoutItem(o.candidate))];
  validateGearLoadout(final, specId);
  return final;
}
const selectionKey = (items: AuctionGearOption[]) => items.map(o => o.id).sort().join("|");

/** Bounded, measured search. Negative single swaps remain available for set synergies. */
export async function planAuctionGear(input: {
  budgetCopper: number;
  options: AuctionGearOption[];
  loadout: GearLoadoutItem[];
  specId: number;
  market: Pick<AuctionSnapshot, "sourceUpdatedAt">;
  signal: AbortSignal;
  simulate: (selections: AuctionGearOption[], signal: AbortSignal) => Promise<GearPlanSimulation>;
  onProgress?: (progress: AuctionPlanProgress) => void;
  maxSimulations?: number;
}): Promise<AuctionGearPlan> {
  if (!Number.isSafeInteger(input.budgetCopper) || input.budgetCopper < 0) throw new Error("invalid_budget");
  assertFreshMarket(input.market);
  const max = Math.max(2, Math.min(64, input.maxSimulations ?? 48));
  // A round-robin across slots prevents a large ring/trinket pool crowding out other slots.
  const groups = new Map<string, AuctionGearOption[]>();
  for (const option of input.options.filter(o => o.candidate.eligible && o.candidate.variants.some(v => v.key === o.variantKey) && o.costCopper <= input.budgetCopper)) {
    const group = groups.get(option.candidate.slotType) ?? [];
    group.push(option);
    groups.set(option.candidate.slotType, group);
  }
  for (const group of groups.values()) group.sort((a, b) => {
    const level = (o: AuctionGearOption) => o.candidate.variants.find(v => v.key === o.variantKey)?.itemLevel ?? 0;
    return level(b) - level(a) || a.costCopper - b.costCopper || a.id.localeCompare(b.id);
  });
  // Reserve a cheap alternative per slot so expensive high-level lots cannot
  // consume the entire short list before budget combinations are considered.
  for (const [slot, group] of groups) {
    const cheapest = [...group].sort((a, b) => a.costCopper - b.costCopper || a.id.localeCompare(b.id))[0];
    if (cheapest && group[0] !== cheapest) groups.set(slot, [group[0], cheapest, ...group.filter(o => o !== group[0] && o !== cheapest)]);
  }
  const options: AuctionGearOption[] = [];
  for (let depth = 0; depth < 3; depth++) for (const group of groups.values()) if (group[depth] && options.length < 28) options.push(group[depth]);
  const seen = new Set<string>(),
    states: Array<{
      options: AuctionGearOption[];
      result: GearPlanSimulation;
    }> = [];
  let simulations = 0;
  const evaluate = async (selection: AuctionGearOption[]) => {
    input.signal.throwIfAborted();
    const key = selectionKey(selection);
    if (seen.has(key) || simulations >= max) return;
    try {
      if (auctionPlanCost(selection) > input.budgetCopper) return;
      auctionPlanLoadout(input.loadout, selection, input.specId);
    } catch {
      return;
    }
    seen.add(key);
    const result = await input.simulate(selection, input.signal);
    if (!Number.isFinite(result.dps) || result.dps <= 0 || !Number.isFinite(result.dpsError) || result.dpsError < 0 || !result.engine.startsWith("SimulationCraft") || !Number.isInteger(result.iterations) || result.iterations <= 0) throw new Error("invalid_simulation_result");
    if (states.length && result.engine !== states[0].result.engine) throw new Error("simulation_version_changed");
    states.push({
      options: selection,
      result
    });
    simulations++;
    input.onProgress?.({
      phase: "simulating",
      completed: simulations,
      total: max
    });
  };
  await evaluate([]);
  const baseline = states[0];
  if (!baseline) throw new Error("equipment_constraints_unverified");
  for (const option of options) await evaluate([option]);
  // Seed synergistic pairs, including swaps which are illegal individually.
  const pairs: AuctionGearOption[][] = [];
  const pairPriority = (pair: AuctionGearOption[]) => {
    const [a, b] = pair.map(o => o.candidate);
    return a.constraints.setId && a.constraints.setId === b.constraints.setId ? 3 : pair.every(o => ["MAIN_HAND", "OFF_HAND"].includes(o.candidate.slotType)) ? 2 : pair.some(o => o.candidate.constraints.limitCategoryId) ? 1 : 0;
  };
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    const pair = [options[i], options[j]];
    if (options[i].candidate.slotType === options[j].candidate.slotType || !pairPriority(pair)) continue;
    try {
      if (auctionPlanCost(pair) <= input.budgetCopper) {
        auctionPlanLoadout(input.loadout, pair, input.specId);
        pairs.push(pair);
      }
    } catch {/* Invalid simultaneous swaps cannot seed the search. */}
  }
  pairs.sort((a, b) => pairPriority(b) - pairPriority(a) || auctionPlanCost(a) - auctionPlanCost(b) || selectionKey(a).localeCompare(selectionKey(b)));
  for (const pair of pairs) {
    if (simulations >= max) break;
    await evaluate(pair);
  }
  let beam = states.slice(1).sort((a, b) => b.result.dps - a.result.dps).slice(0, 8);
  for (let depth = 2; depth <= 8 && simulations < max && beam.length; depth++) {
    const proposals: AuctionGearOption[][] = [];
    for (const state of beam) for (const option of options) if (!state.options.some(o => o.candidate.slotType === option.candidate.slotType)) {
      const selection = [...state.options, option];
      if (!seen.has(selectionKey(selection))) {
        try {
          if (auctionPlanCost(selection) <= input.budgetCopper) {
            auctionPlanLoadout(input.loadout, selection, input.specId);
            proposals.push(selection);
          }
        } catch {/* Incompatible combinations are excluded before ranking. */}
      }
    }
    // Prefer completing a known item set before arbitrary combinations of ties.
    const setPairs = (selection: AuctionGearOption[]) => {
      const counts = new Map<number, number>();
      for (const o of selection) if (o.candidate.constraints.setId) counts.set(o.candidate.constraints.setId, (counts.get(o.candidate.constraints.setId) ?? 0) + 1);
      return [...counts.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0);
    };
    proposals.sort((a, b) => setPairs(b) - setPairs(a) || auctionPlanCost(a) - auctionPlanCost(b) || selectionKey(a).localeCompare(selectionKey(b)));
    const start = states.length;
    for (const selection of proposals) {
      if (simulations >= max) break;
      await evaluate(selection);
    }
    beam = states.slice(start).sort((a, b) => b.result.dps - a.result.dps).slice(0, 8);
  }
  const viable = states.filter(state => state.result.dps > baseline.result.dps && compareGearSimulationResults(baseline.result, state.result).uncertainty.significant);
  const best = viable.sort((a, b) => b.result.dps - a.result.dps || auctionPlanCost(a.options) - auctionPlanCost(b.options))[0] ?? baseline;
  assertFreshMarket(input.market);
  const spentCopper = auctionPlanCost(best.options);
  const final = auctionPlanLoadout(input.loadout, best.options, input.specId);
  return {
    budgetCopper: input.budgetCopper,
    spentCopper,
    remainingCopper: input.budgetCopper - spentCopper,
    purchases: best.options.map(o => ({
      auctionId: o.auctionId,
      itemId: o.candidate.itemId,
      name: o.candidate.name,
      slotType: o.candidate.slotType,
      variantKey: o.variantKey,
      itemLevel: o.candidate.variants.find(v => v.key === o.variantKey)!.itemLevel,
      requiredLevel: o.candidate.constraints.requiredLevel,
      bonusIds: o.candidate.variants.find(v => v.key === o.variantKey)?.bonusIds,
      contextId: o.candidate.variants.find(v => v.key === o.variantKey)?.contextId,
      modifiers: o.candidate.variants.find(v => v.key === o.variantKey)?.modifiers,
      stats: o.candidate.variants.find(v => v.key === o.variantKey)?.resolution?.stats,
      lotCostCopper: o.costCopper,
      quantity: o.quantity
    })),
    removedSlots: input.loadout.filter(i => !final.some(f => f.slotType === i.slotType)).map(i => i.slotType),
    comparison: compareGearSimulationResults(baseline.result, best.result),
    engine: best.result.engine,
    simulations,
    searchLimited: options.length < input.options.length || simulations >= max,
    optionsConsidered: options.length
  };
}
