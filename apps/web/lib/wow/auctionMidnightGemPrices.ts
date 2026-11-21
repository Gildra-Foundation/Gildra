import type { Enhancement, EnhancementSlot } from "./auctionGearEnhancementOptimizer";
import { midnightGemRating90 } from "./auctionMidnightGemRatings";

type Choice = { slot: number; socket: number | null; enhancement: Enhancement | null; retained: boolean };
type Offer = { id: number; signature: number; one: number; two: number; three: number };

const descriptionDigit = new Map([[14262, 1], [14278, 4], [14276, 16], [14277, 64]]);
function price(a: Offer, b: Offer, c: Offer) {
  if (a.id === b.id) return a.id === c.id ? a.three : a.two + c.one;
  if (a.id === c.id) return a.two + b.one;
  if (b.id === c.id) return b.two + a.one;
  return a.one + b.one + c.one;
}

/** A source can never win a public comparison when three different original
 * finalist keys give its exact score and error at strictly smaller prices.
 * Equal-priced receipts still compete by their original physical hashes. */
export function midnightGemPrices(axes: Choice[][], slots: readonly EnhancementSlot[],
  cost: (id: number, quantity: number) => number | null, hasOtherProof: (choice: Choice) => boolean) {
  const positions = ["FINGER_1", "FINGER_2", "NECK"];
  const sockets = positions.map(position => axes.findIndex(choices => {
    const { slot, socket } = choices[0], host = slots[slot];
    return socket === 0 && host.slotType === position && host.owned && host.allowOwnedChanges &&
      Number.isSafeInteger(host.ownedItemId) && host.ownedItemId! > 0 &&
      host.sockets.length === 1 && host.sockets[0].type === "14";
  }));
  if (sockets.includes(-1)) return;
  const neck = axes[sockets[2]][0].slot;
  if (slots[neck].installed?.enchant) return;
  const neckEnchant = axes.findIndex(choices => choices[0].slot === neck && choices[0].socket === null);
  // Every witness replaces the same three explicit socket edits. Other
  // positions may keep their original effect and quantity, even on a cut
  // covering an entire lower stride. Never borrow stock another axis can buy.
  const unavailable = new Set<number>();
  for (const [axis, choices] of axes.entries()) for (const choice of choices) {
    const e = choice.enhancement;
    if (!e) continue;
    if (!sockets.includes(axis) && !choice.retained) unavailable.add(e.consumableItemId);
    if (e.kind === "gem" && e.uniqueEquipped) unavailable.add(e.simulationId);
  }

  function multiUnitCost(id: number, quantity: number) {
    try { return cost(id, quantity) ?? Infinity; }
    catch (error) {
      // An unused extra unit can exceed the safe range even when one is
      // affordable. Such a witness can never fit any supported budget.
      if (error instanceof Error && error.message === "invalid_budget") return Infinity;
      throw error;
    }
  }
  const offers = sockets.map(axis => {
    const choices = new Map<Choice, Offer>();
    for (const choice of axes[axis]) {
      const e = choice.enhancement;
      if (!e || choice.retained || e.kind !== "gem" || e.simulationId !== e.consumableItemId ||
          e.profession || e.category || unavailable.has(e.simulationId) || hasOtherProof(choice)) continue;
      const gem = midnightGemRating90(e.simulationId);
      const digit = gem && descriptionDigit.get(gem.descriptionId);
      if (!gem || !digit || gem.ratings.length !== 4 || gem.ratings.some(v => !Number.isInteger(v) || v < 0 || v > 85)) continue;
      // Base 256 packs each integer independently. Three descriptions are four
      // base-4 counts. Neither the stats nor the count byte can carry on addition.
      const signature = gem.ratings.reduce((v, stat) => v * 256 + stat, 0) * 256 + digit;
      const one = cost(e.simulationId, 1);
      if (one !== null) choices.set(choice, { id: e.simulationId, signature, one,
        two: multiUnitCost(e.simulationId, 2), three: multiUnitCost(e.simulationId, 3) });
    }
    return choices;
  });
  if (offers.some(list => !list.size || list.size > 64 || new Set([...list.values()].map(o => o.id)).size !== list.size)) return;
  // The optimizer already deduplicated identical purchases on each slot.
  // Distinct ordered triples have distinct old finalist keys because the
  // existing public normalizers keep each of these gem IDs in its slot.
  const [left, right, necklaces] = offers;
  // Index only the two rings on the first eligible triple. Each request for a
  // new target sum then needs at most 64 lookups, even on the complete market.
  let pairs: Map<number, [Offer, Offer][]> | undefined;
  const thresholds = new Map<number, number>();
  function thirdPrice(target: number) {
    const cached = thresholds.get(target);
    if (cached !== undefined) return cached;
    if (!pairs) {
      pairs = new Map();
      for (const a of left.values()) for (const b of right.values()) {
        const key = a.signature + b.signature;
        const rows = pairs.get(key);
        if (rows) rows.push([a,b]); else pairs.set(key, [[a,b]]);
      }
    }
    let first = Infinity, second = Infinity, third = Infinity;
    for (const c of necklaces.values()) {
      const rows = pairs.get(target - c.signature);
      if (!rows) continue;
      for (const [a,b] of rows) {
        const p = price(a,b,c);
        if (p >= third || !Number.isSafeInteger(p)) continue;
        if (p <= first) { third = second; second = first; first = p; }
        else if (p <= second) { third = second; second = p; }
        else third = p;
      }
    }
    // The three cheapest witnesses can never be removed by this rule.
    // A previous equal-price receipt proof may retain a different physical
    // hash only for the same original finalist key.
    if (thresholds.size >= 4096) thresholds.clear();
    thresholds.set(target, third);
    return third;
  }
  return {
    axis: Math.min(...sockets, neckEnchant < 0 ? Infinity : neckEnchant),
    skips(selected: Choice[]) {
      if (neckEnchant >= 0 && selected[neckEnchant].enhancement) return false;
      const a = left.get(selected[sockets[0]]), b = right.get(selected[sockets[1]]), c = necklaces.get(selected[sockets[2]]);
      if (!a || !b || !c) return false;
      const total = price(a,b,c);
      return Number.isSafeInteger(total) && total > thirdPrice(a.signature + b.signature + c.signature);
    },
  };
}
