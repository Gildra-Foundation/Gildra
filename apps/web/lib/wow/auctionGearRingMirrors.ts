import { candidateLoadoutItem } from "./gearSimulation";
import { ignoresItemContext, supportedAuctionModifiers, validAuctionItemContext } from "./gearItemModifiers";
import type { AuctionEffectGroup } from "./auctionGearEffects";
import type { AuctionGearOption } from "./auctionGearTypes";

const firstRingSlot = "FINGER_1", secondRingSlot = "FINGER_2";

function bareRingIdentity(option: AuctionGearOption, engine: string) {
  const candidate = option.candidate;
  const variant = candidate.variants.find(row => row.key === option.variantKey);
  const resolution = variant?.resolution;
  const enhancements = resolution?.enhancements;
  if (!Number.isSafeInteger(option.auctionId) || option.auctionId <= 0 ||
      !Number.isSafeInteger(option.quantity) || option.quantity < 1 ||
      !Number.isSafeInteger(option.costCopper) || option.costCopper <= 0 ||
      option.id !== `${option.auctionId}:${candidate.slotType}:${option.variantKey}`) return;
  if (option.customization || candidate.inventoryType !== 11 || candidate.itemClassId !== 4 ||
      candidate.itemSubclassId !== 0 || !candidate.constraints || candidate.constraints.setId || candidate.constraints.setName) return;
  if (!variant || !Number.isInteger(variant.itemLevel) || variant.itemLevel <= 0 ||
      !validAuctionItemContext(variant.contextId) || !supportedAuctionModifiers(variant.modifiers ?? []) ||
      !Array.isArray(variant.bonusIds) || variant.bonusIds.length > 20 || !variant.bonusIds.every((id, i, bonuses) =>
        Number.isInteger(id) && id > 0 && id <= 1_000_000 && (!i || id > bonuses[i - 1]))) return;
  if (!resolution || resolution.engine !== engine || resolution.nativeNoItemEffects !== true ||
      resolution.metadataVersion !== 3 || resolution.weapon || resolution.effects?.length ||
      !Array.isArray(resolution.appliedStatsV1) || resolution.appliedStatsV1.length !== 46 ||
      !resolution.appliedStatsV1.every(Number.isSafeInteger)) return;
  // Local replacements receive gems only through customization, excluded above.
  // An empty prismatic socket with no socket bonus adds neither stats nor effects.
  if (enhancements?.status !== "verified" || enhancements.socketBonusId !== 0 ||
      enhancements.requiredProfessionId !== 0 || !Array.isArray(enhancements.socketColors) ||
      enhancements.socketColors.length !== 3 || !enhancements.socketColors.every(color => color === 0 || color === 14) ||
      enhancements.socketCount !== enhancements.socketColors.filter(color => color === 14).length) return;
  const constraints = Object.entries(candidateLoadoutItem(candidate)).filter(([key]) => key !== "slotType").sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([option.variantKey, variant.itemLevel, variant.contextId, variant.bonusIds, variant.modifiers, constraints,
    resolution.appliedStatsV1, enhancements.socketColors, option.quantity, option.costCopper]);
}

/** Two bare local rings give the pinned Fury actor the same integer stat sum and
 * average level in either orientation. Neither registers an effect, gem or set
 * bonus. Keep the physical receipt preferred by observeAuctionEquipment.
 * A proof only spans other slots when neither can consume the selected lots. */
export function auctionRingMirrorOrder(groups: AuctionEffectGroup[][], slots: string[], engine: string, specId: number) {
  const left = slots.indexOf(firstRingSlot), right = slots.indexOf(secondRingSlot);
  if (specId !== 72 || !ignoresItemContext(engine) || left < 0 || right <= left) return;
  const shared = new Set<number>();
  for (const [i, axis] of groups.entries()) if (i !== left && i !== right)
    for (const group of axis) for (const option of group.options) shared.add(option.auctionId);
  const inventoriesByCheapestLot = (index: number) => {
    const out = new Map<number, {ordinal: number; identity: string}>();
    const seen = new Set<number>(), duplicate = new Set<number>();
    for (const group of groups[index]) for (const o of group.options) {
      if (seen.has(o.auctionId)) duplicate.add(o.auctionId);
      seen.add(o.auctionId);
    }
    for (const [i, group] of groups[index].entries()) {
      if (group.options.some(o => shared.has(o.auctionId) || duplicate.has(o.auctionId))) continue;
      // These groups form independent one-slot procurement components. Use
      // the allocator's price and ID order, including equal-price copies.
      const best = group.options.reduce((a, b) => b.costCopper < a.costCopper ||
        b.costCopper === a.costCopper && b.id < a.id ? b : a);
      const inventory = group.options.map(o => [o.auctionId, bareRingIdentity(o, engine)] as const);
      if (inventory.some(([, identity]) => identity === undefined)) continue;
      inventory.sort(([a], [b]) => a - b);
      out.set(best.auctionId, {ordinal: i + 1, identity: JSON.stringify(inventory)});
    }
    return out;
  };
  const leftOffers = inventoriesByCheapestLot(left), rightOffers = inventoriesByCheapestLot(right);
  const leftLots: string[] = [], rightLots: string[] = [];
  for (const [lot, a] of leftOffers) {
    const b = rightOffers.get(lot);
    if (a.identity === b?.identity) {
      // The colon is part of the receipt ID. It matters for lot IDs of different lengths.
      leftLots[a.ordinal] = rightLots[b.ordinal] = String(lot) + ":";
    }
  }
  if (!leftLots.length) return;
  const known = new Set(leftLots.filter(Boolean));
  return {
    axis: right,
    skips(cursor: number[]) {
      const a = leftLots[cursor[left]], b = rightLots[cursor[right]];
      return a !== undefined && b !== undefined && a > b;
    },
    skipsReceipt(options: AuctionGearOption[]) {
      const a = options.find(o => o.candidate.slotType === firstRingSlot);
      const b = options.find(o => o.candidate.slotType === secondRingSlot);
      if (!a || !b) return false;
      const firstLot = String(a.auctionId) + ":", secondLot = String(b.auctionId) + ":";
      return known.has(firstLot) && known.has(secondLot) && firstLot > secondLot;
    },
  };
}
