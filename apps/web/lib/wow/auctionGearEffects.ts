import { createHash } from "node:crypto";
import { candidateLoadoutItem } from "./gearSimulation";
import type { AuctionGearOption } from "./auctionGearTypes";

/** Native input identity: auction price/lot identity does not change item effects. */
export function auctionSelectionEffectKey(options: AuctionGearOption[]) {
  return createHash("sha256").update(JSON.stringify(options.map(option => {
    const variant = option.candidate.variants.find(v => v.key === option.variantKey);
    if (!variant) throw new Error("simulation_variant_not_found");
    return [option.candidate.slotType, option.candidate.itemId, [...variant.bonusIds].sort((a, b) => a - b),
      variant.contextId ?? 0, [...(variant.modifiers ?? [])].sort((a, b) => a.type - b.type || a.value - b.value)];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}

export type AuctionEffectGroup = { options: AuctionGearOption[] };

/** Equal simulation effects are grouped only when their equip constraints also agree. */
export function auctionEffectGroups(options: AuctionGearOption[], slots: string[]): AuctionEffectGroup[][] {
  return slots.map(slot => {
    const groups = new Map<string, AuctionEffectGroup>();
    for (const option of options.filter(option => option.candidate.slotType === slot)) {
      const constraints = Object.entries(candidateLoadoutItem(option.candidate))
        .filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b));
      const key = JSON.stringify([auctionSelectionEffectKey([option]), constraints]);
      const group = groups.get(key) ?? { options: [] };
      group.options.push(option);
      groups.set(key, group);
    }
    return [...groups.values()];
  });
}

type Purchase = { options: AuctionGearOption[]; costCopper: number };
const selectionKey = (options: AuctionGearOption[]) => options.map(option => option.id).sort().join("|");
const preferred = (a: Purchase, b?: Purchase) => !b || a.costCopper < b.costCopper ||
  a.costCopper === b.costCopper && selectionKey(a.options) < selectionKey(b.options);
const bitCount = (value: number) => { let count = 0; for (; value; value &= value - 1) count++; return count; };

/**
 * Allocate actual lots to one effect per slot. An auction can cover several slots
 * up to its quantity and is paid once. Connected components avoid multiplying
 * independent slots; within a component, exact subset DP retains non-greedy lots.
 */
export async function cheapestAuctionEffectSelection(groups: AuctionEffectGroup[], budgetCopper: number,
  signal: AbortSignal): Promise<Purchase | null> {
  signal.throwIfAborted();
  if (groups.length > 16) throw new Error("invalid_equipment_slots");
  const lots = new Map<number, { mask: number; costCopper: number; quantity: number;
    itemId: number; variantKey: string; options: Map<number, AuctionGearOption> }>();
  for (let index = 0; index < groups.length; index++) for (const option of groups[index].options) {
    const lot = lots.get(option.auctionId) ?? { mask: 0, costCopper: option.costCopper, quantity: option.quantity,
      itemId: option.candidate.itemId, variantKey: option.variantKey, options: new Map() };
    if (lot.costCopper !== option.costCopper || lot.quantity !== option.quantity ||
        lot.itemId !== option.candidate.itemId || lot.variantKey !== option.variantKey) throw new Error("invalid_auction_selection");
    lot.mask |= 1 << index;
    const previous = lot.options.get(index);
    if (!previous || option.id < previous.id) lot.options.set(index, option);
    lots.set(option.auctionId, lot);
  }
  const parents = groups.map((_, index) => index);
  const root = (index: number): number => parents[index] === index ? index : (parents[index] = root(parents[index]));
  for (const lot of lots.values()) {
    const indices = groups.map((_, index) => index).filter(index => lot.mask & (1 << index));
    for (const index of indices.slice(1)) parents[root(index)] = root(indices[0]);
  }
  const components = new Map<number, number>();
  for (let index = 0; index < groups.length; index++) components.set(root(index), (components.get(root(index)) ?? 0) | (1 << index));
  const result: Purchase = { options: [], costCopper: 0 };
  let work = 0;
  for (const component of components.values()) {
    signal.throwIfAborted();
    let states = new Map<number, Purchase>([[0, { options: [], costCopper: 0 }]]);
    for (const lot of lots.values()) {
      if (!(lot.mask & component)) continue;
      const next = new Map(states);
      for (const [covered, purchase] of states) {
        const available = lot.mask & component & ~covered;
        for (let subset = available; subset; subset = (subset - 1) & available) {
          if (++work % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); signal.throwIfAborted(); }
          if (bitCount(subset) > lot.quantity) continue;
          const costCopper = purchase.costCopper + lot.costCopper;
          if (!Number.isSafeInteger(costCopper)) throw new Error("invalid_budget");
          if (costCopper > budgetCopper - result.costCopper) continue;
          const options = [...purchase.options, ...[...lot.options].filter(([index]) => subset & (1 << index)).map(([, option]) => option)];
          const candidate = { options, costCopper }, key = covered | subset;
          if (preferred(candidate, next.get(key))) next.set(key, candidate);
        }
      }
      states = next;
    }
    const best = states.get(component);
    if (!best) return null;
    result.options.push(...best.options);
    result.costCopper += best.costCopper;
  }
  result.options.sort((a, b) => a.candidate.slotType.localeCompare(b.candidate.slotType));
  signal.throwIfAborted();
  return result;
}
