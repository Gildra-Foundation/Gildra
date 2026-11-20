import { createHash } from "node:crypto";
import { auctionMeasurementContract, candidateLoadoutItem } from "./gearSimulation";
import type { GearLoadoutItem } from "./gearCompatibility";
import { auctionNativeItemOptions, ignoresItemContext, supportedAuctionModifiers, validAuctionItemContext } from "./gearItemModifiers";
import type { AuctionGearOption } from "./auctionGearTypes";

/** Native input identity: auction price/lot identity does not change item effects. */
export function auctionSelectionEffectKey(options: AuctionGearOption[], engine?: string) {
  return createHash("sha256").update(JSON.stringify(options.map(option => {
    const variant = option.candidate.variants.find(v => v.key === option.variantKey);
    if (!variant) throw new Error("simulation_variant_not_found");
    const item = engine ? auctionNativeItemOptions(variant, engine) : variant;
    return [option.candidate.slotType, option.candidate.itemId, variant.bonusIds,
      item.contextId ?? 0, [...(item.modifiers ?? [])].sort((a, b) => a.type - b.type || a.value - b.value),
      ...(option.customization ? [{ enchantId: option.customization.enchantId ?? 0, gemIds: option.customization.gemIds ?? [] }] : [])];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}

const plainArmorSlots = new Set(["HEAD", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET"]);

/** A certified substitution must preserve the item identity observable to APLs
 * and the ordered bonus IDs observable to other equipped items' effects. */
export function auctionAppliedStatsKey(options: AuctionGearOption[], engine: string): string | undefined {
  const pieces: Array<[string, unknown]> = [];
  let certified = false;
  const pinned = ignoresItemContext(engine);
  for (const option of options) {
    if (option.customization) return;
    const c = option.candidate, t = c.constraints;
    const v = c.variants.find(row => row.key === option.variantKey), r = v?.resolution;
    if (!v || !validAuctionItemContext(v.contextId)) return;
    const e = r?.enhancements, stats = r?.appliedStatsV1;
    if (plainArmorSlots.has(c.slotType) && c.itemClassId === 4 && Number.isSafeInteger(v.itemLevel) && v.itemLevel > 0 &&
        r?.engine === engine && r.nativeNoItemEffects === true && !r.effects?.length && !r.weapon &&
        !t.setId && !t.setName && !t.crafted && !t.uniqueEquipped && !t.limitCategoryId &&
        e?.status === "verified" && e.socketCount === 0 && e.socketBonusId === 0 && e.requiredProfessionId === 0 &&
        stats?.length === 46 && stats.every(Number.isSafeInteger) && supportedAuctionModifiers(v.modifiers ?? [])) {
      // The worker never emits reagent IDs (38–51). Drop level and content
      // tuning can be ignored only with positive evidence from the native resolver.
      const scaling = r.nativeScalingInputsV1;
      const certifiedScaling = pinned && scaling?.length === 4 &&
        scaling.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647);
      // A legacy stat suffix can carry a different list ID for the exact same
      // ordered DBC operations. Every other bonus keeps its original identity.
      const suffix = r.nativeSuffixProgramV1;
      const bonuses = certifiedScaling && v.bonusIds.length === 1 && Number.isSafeInteger(v.bonusIds[0]) &&
        v.bonusIds[0] >= 1 && v.bonusIds[0] <= 500 && typeof suffix === "string" && /^[a-f0-9]{64}$/.test(suffix)
        ? suffix : v.bonusIds;
      const modifiers = (v.modifiers ?? []).filter(m => (m.type < 38 || m.type > 51) &&
        !(certifiedScaling && (m.type === 9 || m.type === 28))).sort((a, b) => a.type - b.type);
      pieces.push([c.slotType, [c.itemId, c.inventoryType, c.itemSubclassId, v.itemLevel, bonuses,
        pinned ? 0 : v.contextId ?? 0, modifiers, certifiedScaling ? scaling : null, stats]]);
      certified = true;
    } else {
      pieces.push([c.slotType, [auctionSelectionEffectKey([option]), v.bonusIds]]);
    }
  }
  if (!certified) return;
  pieces.sort(([a], [b]) => a.localeCompare(b));
  return "applied-v2:" + createHash("sha256").update(JSON.stringify([auctionMeasurementContract, engine, pieces])).digest("hex");
}

/** For every marked offer any legal completion can buy the cheaper equivalent
 * in the same slot. A shared lot or item identity could invalidate that receipt. */
export function auctionDominatedArmorOptions(options: AuctionGearOption[], loadout: GearLoadoutItem[],
  specId: number, engine: string): Set<string> {
  const itemSlots = new Map<number, string>(), lotSlots = new Map<number, string>();
  const recordSlot = (map: Map<number, string>, id: number, slot: string) => {
    const seen = map.get(id);
    map.set(id, seen === undefined || seen === slot ? slot : "multiple");
  };
  for (const item of loadout) recordSlot(itemSlots, item.itemId, item.slotType);
  for (const { candidate, auctionId } of options) {
    recordSlot(itemSlots, candidate.itemId, candidate.slotType);
    recordSlot(lotSlots, auctionId, candidate.slotType);
  }
  // The final tie-break compares sorted option IDs joined by "|". For
  // prefix-free IDs, inserting the same suffix purchases preserves that order.
  const ids = options.map(option => option.id).sort();
  const stableTies = ids.every((id, index) => !id.includes("|") && (!index || !id.startsWith(ids[index - 1])));
  const keyed: Array<[AuctionGearOption, string]> = [], cheapest = new Map<string, AuctionGearOption>();
  for (const option of options) {
    const { candidate, auctionId } = option;
    if (!candidate.eligible || candidate.compatibility.specId !== specId ||
        lotSlots.get(auctionId) !== candidate.slotType || itemSlots.get(candidate.itemId) !== candidate.slotType) continue;
    const key = auctionAppliedStatsKey([option], engine);
    if (!key) continue;
    keyed.push([option, key]);
    const best = cheapest.get(key);
    if (!best || option.costCopper < best.costCopper || option.costCopper === best.costCopper && option.id < best.id)
      cheapest.set(key, option);
  }
  const dominated = new Set<string>();
  for (const [option, key] of keyed) {
    const best = cheapest.get(key)!;
    if (option.costCopper > best.costCopper || stableTies && option.id !== best.id) dominated.add(option.id);
  }
  return dominated;
}

export type AuctionEffectGroup = { options: AuctionGearOption[] };

/** Stable across lot refreshes, but changes when native identity or equip constraints change. */
export function auctionEffectGroupKey(option: AuctionGearOption, engine?: string) {
  const constraints = Object.entries(candidateLoadoutItem(option.candidate))
    .filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify([auctionSelectionEffectKey([option], option.customization ? undefined : engine), constraints])).digest("hex");
}

/** Equal simulation effects are grouped only when their equip constraints also agree. */
export function auctionEffectGroups(options: AuctionGearOption[], slots: readonly string[],
  groupKey = auctionEffectGroupKey): AuctionEffectGroup[][] {
  return slots.map(slot => {
    const groups = new Map<string, AuctionEffectGroup>();
    for (const option of options.filter(option => option.candidate.slotType === slot)) {
      const key = groupKey(option);
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
  type Lot = { mask: number; costCopper: number; quantity: number;
    itemId: number; variantKey: string; options: Map<number, AuctionGearOption> };
  const lots = new Map<number, Lot>();
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
  const firstIndex = (mask: number) => 31 - Math.clz32(mask & -mask);
  for (const lot of lots.values()) {
    const first = firstIndex(lot.mask);
    for (let remaining = lot.mask & (lot.mask - 1); remaining; remaining &= remaining - 1)
      parents[root(firstIndex(remaining))] = root(first);
  }
  const components = new Map<number, { mask: number; lots: Lot[] }>();
  for (let index = 0; index < groups.length; index++) {
    const key = root(index), component = components.get(key) ?? { mask: 0, lots: [] };
    component.mask |= 1 << index;
    components.set(key, component);
  }
  // A lot cannot cross components after union. Preserve its original order so
  // subset DP, tie decisions and validation remain identical for shared lots.
  for (const lot of lots.values()) components.get(root(firstIndex(lot.mask)))!.lots.push(lot);
  const result: Purchase = { options: [], costCopper: 0 };
  let work = 0;
  for (const { mask: component, lots: componentLots } of components.values()) {
    signal.throwIfAborted();
    if (!(component & (component - 1))) {
      // One independent slot needs only its cheapest feasible lot. Still visit
      // every lot: unsafe costs and cooperative cancellation must not disappear
      // merely because a cheaper option has already been found.
      const index = firstIndex(component);
      let best: Purchase | undefined;
      for (const lot of componentLots) {
        if (++work % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); signal.throwIfAborted(); }
        if (1 > lot.quantity) continue;
        const costCopper = 0 + lot.costCopper;
        if (!Number.isSafeInteger(costCopper)) throw new Error("invalid_budget");
        if (costCopper > budgetCopper - result.costCopper) continue;
        const option = lot.options.get(index)!;
        if (!best || costCopper < best.costCopper || costCopper === best.costCopper && option.id < best.options[0].id)
          best = { options: [option], costCopper };
      }
      if (!best) return null;
      result.options.push(...best.options);
      result.costCopper += best.costCopper;
      continue;
    }
    let states = new Map<number, Purchase>([[0, { options: [], costCopper: 0 }]]);
    for (const lot of componentLots) {
      const next = new Map(states);
      for (const [covered, purchase] of states) {
        const available = lot.mask & component & ~covered;
        for (let subset = available; subset; subset = (subset - 1) & available) {
          if (++work % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); signal.throwIfAborted(); }
          if (bitCount(subset) > lot.quantity) continue;
          const costCopper = purchase.costCopper + lot.costCopper;
          if (!Number.isSafeInteger(costCopper)) {
            // Two valid lot prices can overflow only on an unaffordable branch
            // under the planner's safe-integer budget. Other receipts remain legal.
            if (Number.isSafeInteger(lot.costCopper) && Number.isSafeInteger(budgetCopper) && costCopper > budgetCopper) continue;
            throw new Error("invalid_budget");
          }
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
