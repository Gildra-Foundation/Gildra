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
