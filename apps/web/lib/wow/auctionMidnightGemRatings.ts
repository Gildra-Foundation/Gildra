import type { OwnedAuctionGearChange } from "./auctionGearEnhancementOptimizer";
import type { SimcGearChange } from "./gearSimulation";

// Pinned SimC 18428cd. verify-gem-pairs.py checks the item, gem, enchant
// and scaling tables, including the absence of old Dragonflight gem names.
// Each row contains SKU, gem description, crit, haste, mastery and versatility.
// These direct enchants require item level 80 and cap player scaling at 80.
// The engine rounds each stat on each gem before adding the player's gear.
const midnightGemRows = [
  [240855, 14262, 0, 12, 0, 0],
  [240856, 14262, 0, 13, 0, 0],
  [240857, 14262, 4, 11, 0, 0],
  [240858, 14262, 5, 12, 0, 0],
  [240859, 14262, 0, 11, 4, 0],
  [240860, 14262, 0, 12, 5, 0],
  [240861, 14262, 0, 11, 0, 4],
  [240862, 14262, 0, 12, 0, 5],
  [240863, 14278, 0, 0, 12, 0],
  [240864, 14278, 0, 0, 13, 0],
  [240865, 14278, 4, 0, 11, 0],
  [240866, 14278, 5, 0, 12, 0],
  [240867, 14278, 0, 4, 11, 0],
  [240868, 14278, 0, 5, 12, 0],
  [240869, 14278, 0, 0, 11, 4],
  [240870, 14278, 0, 0, 12, 5],
  [240871, 14276, 12, 0, 0, 0],
  [240872, 14276, 13, 0, 0, 0],
  [240873, 14276, 11, 4, 0, 0],
  [240874, 14276, 12, 5, 0, 0],
  [240875, 14276, 11, 0, 4, 0],
  [240876, 14276, 12, 0, 5, 0],
  [240877, 14276, 11, 0, 0, 4],
  [240878, 14276, 12, 0, 0, 5],
  [240879, 14277, 0, 0, 0, 12],
  [240880, 14277, 0, 0, 0, 13],
  [240881, 14277, 4, 0, 0, 11],
  [240882, 14277, 5, 0, 0, 12],
  [240883, 14277, 0, 4, 0, 11],
  [240884, 14277, 0, 5, 0, 12],
  [240885, 14277, 0, 0, 4, 11],
  [240886, 14277, 0, 0, 5, 12],
  [240887, 14262, 0, 15, 0, 0],
  [240888, 14262, 0, 17, 0, 0],
  [240889, 14262, 6, 14, 0, 0],
  [240890, 14262, 7, 16, 0, 0],
  [240891, 14262, 0, 14, 6, 0],
  [240892, 14262, 0, 16, 7, 0],
  [240893, 14262, 0, 14, 0, 6],
  [240894, 14262, 0, 16, 0, 7],
  [240895, 14278, 0, 0, 15, 0],
  [240896, 14278, 0, 0, 17, 0],
  [240897, 14278, 6, 0, 14, 0],
  [240898, 14278, 7, 0, 16, 0],
  [240899, 14278, 0, 6, 14, 0],
  [240900, 14278, 0, 7, 16, 0],
  [240901, 14278, 0, 0, 14, 6],
  [240902, 14278, 0, 0, 16, 7],
  [240903, 14276, 15, 0, 0, 0],
  [240904, 14276, 17, 0, 0, 0],
  [240905, 14276, 14, 6, 0, 0],
  [240906, 14276, 16, 7, 0, 0],
  [240907, 14276, 14, 0, 6, 0],
  [240908, 14276, 16, 0, 7, 0],
  [240909, 14276, 14, 0, 0, 6],
  [240910, 14276, 16, 0, 0, 7],
  [240911, 14277, 0, 0, 0, 15],
  [240912, 14277, 0, 0, 0, 17],
  [240913, 14277, 6, 0, 0, 14],
  [240914, 14277, 7, 0, 0, 16],
  [240915, 14277, 0, 6, 0, 14],
  [240916, 14277, 0, 7, 0, 16],
  [240917, 14277, 0, 0, 6, 14],
  [240918, 14277, 0, 0, 7, 16],
] as const;

const byItem = new Map<number, { readonly descriptionId: number; readonly ratings: readonly number[] }>(
  midnightGemRows.map(([id, descriptionId, ...ratings]) => [id, { descriptionId, ratings }]),
);

export function midnightGemRating90(id: number) {
  return byItem.get(id);
}

const slots = ["FINGER_1", "FINGER_2", "NECK"] as const;
const simcSlots = ["finger1", "finger2", "neck"];

/** All three explicitly replaced gems contribute direct stats. Native procs
 * observe their description counts. Socket matching still sees a prismatic
 * gem in each original slot. Every other item, enchant and edit is retained. */
export function ownedMidnightGemScore(owned: readonly OwnedAuctionGearChange[], hosts: ReadonlyMap<string, number>,
  purchased: readonly SimcGearChange[], removed?: readonly string[]) {
  if (owned.length < slots.length || hosts.size < slots.length || purchased.some(c => simcSlots.includes(c.slot)) ||
      removed?.some(slot => slots.some(s => s === slot) || simcSlots.includes(slot)) ||
      new Set(owned.map(edit => edit.slotType)).size !== owned.length) return;

  const ratings = [0, 0, 0, 0];
  const descriptions: number[] = [];
  const edits = owned.slice();
  for (const slot of slots) {
    const index = owned.findIndex(edit => edit.slotType === slot);
    const edit = owned[index];
    if (!edit || !hosts.has(slot) || hosts.get(slot) !== edit.itemId || (slot === "NECK" && edit.enchantId !== undefined) ||
        edit.gems.length !== 1 || edit.gems[0].index !== 0) return;
    const gem = midnightGemRating90(edit.gems[0].itemId);
    if (!gem) return;
    descriptions.push(gem.descriptionId);
    for (const [axis, amount] of gem.ratings.entries()) ratings[axis] += amount;
    edits[index] = { ...edit, gems: [{ ...edit.gems[0], itemId: 0 }] };
  }
  // With three explicitly filled sockets, sorting keeps exact counts as well
  // as presence, including duplicates counted by Signet of Azerothian Blessings.
  return { edits, signature: { ratings, descriptions: descriptions.sort((a, b) => a - b) } };
}
