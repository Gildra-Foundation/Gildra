import type { OwnedAuctionGearChange } from "./auctionGearEnhancementOptimizer";

// Pinned 18428cd DBC, authenticated level-90 player. Rows are critical strike,
// haste, mastery and versatility. Each column adds 1..5 integer gem rating.
const gemRanks90 = [
  [[], [115803, 115809], [127760, 130215, 153710], [130219, 154126], [151580, 168639]],
  [[], [115804, 115806, 115811, 115813], [127761, 130216, 153711], [130220, 154127], [151583, 168641]],
  [[], [115805, 115812, 154129], [127762, 130218, 153713], [130222], [151584, 168640]],
  [[22459, 22460], [115807, 115814], [127764, 130217, 153712], [130221, 154128], [151585, 168642]],
] as const;

// Same row order. Amounts are rounded independently before gem and enchant
// stats are added by SimC. These enchant IDs are pure ratings at every level.
const enchantRanks90 = [
  [7994, 7995, 7996, 7997],
  [8020, 8021, 8024, 8025],
  [7964, 7965, 7968, 7969],
  [8022, 8023, 8026, 8027],
] as const;
const enchantAmounts90 = [22, 24, 27, 29] as const;

// Direct enchants eligible on older rings. At player level 90 the pinned
// native scaling table rounds every entry in a group to the same integer
// rating. The first ID represents the effect, never the scroll to purchase.
const legacyRingEnchantGroups90 = [
  [5284, 5324, 5423], [5297, 5325, 5424], [5299, 5326, 5425], [5303, 5328, 5426],
  [5427, 5938, 5942, 6545, 6546], [5428, 5939, 5943, 6551, 6552],
  [5429, 5940, 5944, 6557, 6558], [5430, 5941, 5945, 6563, 6564],
  [6547, 6548], [6553, 6554], [6559, 6560], [6565, 6566],
  [6108, 6549, 6550], [6109, 6555, 6556], [6110, 6561, 6562], [6111, 6567, 6568],
] as const;
const legacyRingEnchantRepresentatives = new Map<number, number>();
for (const group of legacyRingEnchantGroups90) {
  for (const id of group) legacyRingEnchantRepresentatives.set(id, group[0]);
}
export const ringEnchantRepresentative90 = (id: number) => legacyRingEnchantRepresentatives.get(id);

type Rating = { axis: number; amount: number };
const gems = new Map<number, Rating & { representative: number }>();
const enchants = new Map<number, Rating>();
for (const [axis, ranks] of gemRanks90.entries()) {
  for (const [rank, ids] of ranks.entries()) {
    const [representative] = ids;
    if (representative === undefined) continue;
    for (const id of ids) gems.set(id, { axis, amount: rank + 1, representative });
  }
}
for (const [axis, ranks] of enchantRanks90.entries()) {
  for (const [rank, id] of ranks.entries()) enchants.set(id, { axis, amount: enchantAmounts90[rank] });
}

// One coordinate per rating. At most 58 points can appear in a two-scroll
// sum, so no addition can carry into a neighboring base-128 coordinate.
const scrollRatings90 = new Map<number, number>([[0, 0]]);
for (const [group, ids] of legacyRingEnchantGroups90.entries()) {
  const value = (1 + Math.floor(group / 4)) * 128 ** (group % 4);
  for (const id of ids) scrollRatings90.set(id, value);
}
const warWithinRingAmounts90 = [9, 11, 13, 15, 18, 21] as const;
for (let axis = 0; axis < 4; axis++) {
  for (const [rank, amount] of warWithinRingAmounts90.entries())
    scrollRatings90.set(7329 + axis * 6 + rank, amount * 128 ** axis);
}
for (const [id, rating] of enchants) scrollRatings90.set(id, rating.amount * 128 ** rating.axis);

export const ringScrollRating90 = (id: number) => scrollRatings90.get(id);

export function purchasedRingScrollRating90(id: number, itemLevel: number, emptyPlainSockets: boolean) {
  if (legacyRingEnchantRepresentatives.has(id) && itemLevel >= 10 && itemLevel <= 120) return scrollRatings90.get(id);
  if (id >= 7329 && id <= 7352 && itemLevel >= 70 && itemLevel <= 170 && emptyPlainSockets) return scrollRatings90.get(id);
}

const isEyesOfTheEagle = (id: number | undefined) => id === 7966 || id === 7967;
export const isDirectRingEnchant = (id: number) => enchants.has(id);
export const ringGemRepresentative90 = (id: number) => gems.get(id)?.representative;

export function combinedRingRatings90(enchantId: number, gemId: number) {
  const enchant = enchants.get(enchantId), gem = gems.get(gemId);
  if ((enchantId && !enchant) || (gemId && !gem)) return;
  const ratings = [0, 0, 0, 0];
  if (enchant) ratings[enchant.axis] += enchant.amount;
  if (gem) ratings[gem.axis] += gem.amount;
  return ratings;
}

/** These gems add identical rating on the same prismatic host. The fixed
 * Eyes of the Eagle rank applies only its own crit damage/heal multiplier. */
export function fixedEagleGemEdits(edits: readonly OwnedAuctionGearChange[], hosts: ReadonlyMap<string, number>,
  installedEnchants: ReadonlyMap<string, number>, changes: readonly {slot: string}[], removed?: readonly string[]) {
  if (new Set(edits.map(edit => edit.slotType)).size !== edits.length) return edits;
  return edits.map(edit => {
    const slot = edit.slotType;
    if (slot !== "FINGER_1" && slot !== "FINGER_2" || hosts.get(slot) !== edit.itemId ||
        removed?.includes(slot) || changes.some(change => change.slot === (slot === "FINGER_1" ? "finger1" : "finger2")) ||
        !isEyesOfTheEagle(edit.enchantId ?? installedEnchants.get(slot)) ||
        edit.gems.length !== 1 || edit.gems[0].index !== 0) return edit;
    const representative = ringGemRepresentative90(edit.gems[0].itemId);
    return representative && representative !== edit.gems[0].itemId
      ? { ...edit, gems: [{ ...edit.gems[0], itemId: representative }] } : edit;
  });
}
