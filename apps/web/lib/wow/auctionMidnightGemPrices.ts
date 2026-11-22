import { weaponScrollPower90 } from "./auctionGearMechanicalCache";
import type { Enhancement, EnhancementSlot } from "./auctionGearEnhancementOptimizer";
import { midnightGemRating90 } from "./auctionMidnightGemRatings";
import { combinedRingRatings90, isDirectRingEnchant } from "./auctionRingRatings";

type Choice = { slot: number; socket: number | null; enhancement: Enhancement | null; retained: boolean };
type Offer = { id: number; signature: number; modern: boolean; one: number; two: number; three: number };

const otherGemOrders = [[0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]] as const;
const descriptionDigit = new Map([[14262, 1], [14278, 4], [14276, 16], [14277, 64]]);
function price(a: Offer, b: Offer, c: Offer) {
  if (a.id === b.id) return a.id === c.id ? a.three : a.two + c.one;
  if (a.id === c.id) return a.two + b.one;
  if (b.id === c.id) return b.two + a.one;
  return a.one + b.one + c.one;
}

// Holding the two purchased weapons fixed, find the cheapest reachable pair of
// scrolls for each integer spell-power total. Exclude commodities that other
// axes can consume, and global enchant restrictions on any applicable host.
function cheaperWeaponScrolls(axes: Choice[][], slots: readonly EnhancementSlot[], cost: (id: number, n: number) => number) {
  const hands = ["MAIN_HAND", "OFF_HAND"].map(slot => axes.findIndex(choices => {
    const first = choices[0], host = slots[first.slot];
    return first.socket === null && host.slotType === slot && !host.owned && !host.sockets.length && !host.installed;
  }));
  if (hands.includes(-1)) return;
  const shared = new Set<number>(), unique = new Set<number>();
  for (const [axis, choices] of axes.entries()) for (const { enhancement: e, retained } of choices) {
    if (!e) continue;
    if (!hands.includes(axis) && !retained) shared.add(e.consumableItemId);
    if (e.kind === "enchant" && e.uniqueEquipped) unique.add(e.simulationId);
  }
  const offers = hands.map(axis => axes[axis].flatMap(choice => {
    const e = choice.enhancement, power = weaponScrollPower90(e?.simulationId ?? 0);
    if (power === undefined || choice.retained || e && (e.kind !== "enchant" || e.profession || e.category ||
        unique.has(e.simulationId) || shared.has(e.consumableItemId))) return [];
    return [{ choice, power, id: e?.consumableItemId ?? 0, one: e ? cost(e.consumableItemId, 1) : 0 }];
  }));
  const minimum = new Map<number, number>();
  let hasSavings = false;
  const pairs = new Map<Choice, Map<Choice, { power: number; price: number }>>();
  for (const left of offers[0]) {
    const byRight = new Map<Choice, { power: number; price: number }>();
    for (const right of offers[1]) {
      const price = left.id && left.id === right.id ? cost(left.id, 2) : left.one + right.one;
      if (!Number.isSafeInteger(price)) continue;
      const power = left.power + right.power;
      byRight.set(right.choice, { power, price });
      const previous = minimum.get(power);
      if (previous !== undefined && price !== previous) hasSavings = true;
      minimum.set(power, Math.min(price, previous ?? Infinity));
    }
    pairs.set(left.choice, byRight);
  }
  if (!hasSavings) return;
  return { axis: Math.min(...hands), savings(selected: Choice[]) {
    const pair = pairs.get(selected[hands[0]])?.get(selected[hands[1]]);
    return pair ? pair.price - minimum.get(pair.power)! : 0;
  }};
}

/** A source can never win a public comparison when three different original
 * finalist keys give its exact score and error at strictly smaller prices.
 * Equal-priced receipts still compete by their original physical hashes. */
export function midnightGemPrices(axes: Choice[][], slots: readonly EnhancementSlot[],
  cost: (id: number, quantity: number) => number | null, hasOtherProof: (choice: Choice) => boolean, mixed = false, includeWeaponSavings = false) {
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
  const ringSlots = sockets.slice(0, 2).map(axis => axes[axis][0].slot);
  const ringEnchants = axes.flatMap((choices, i) => choices[0].socket === null && ringSlots.includes(choices[0].slot) ? [i] : []);
  const axis = Math.min(...sockets, neckEnchant < 0 ? Infinity : neckEnchant);
  const mixedAxis = Math.min(axis, ...ringEnchants);
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
          e.profession || e.category || unavailable.has(e.simulationId)) continue;
      const gem = midnightGemRating90(e.simulationId);
      if (gem && hasOtherProof(choice)) continue;
      const ratings = gem?.ratings ?? (mixed ? combinedRingRatings90(0, e.simulationId) : undefined);
      const digit = gem ? descriptionDigit.get(gem.descriptionId) : 0;
      if (!ratings || digit === undefined || ratings.length !== 4 || ratings.some(v => !Number.isInteger(v) || v < 0 || v > 85)) continue;
      // Base 256 packs each integer independently. Three descriptions are four
      // base-4 counts. Neither the stats nor the count byte can carry on addition.
      const signature = ratings.reduce((v, stat) => v * 256 + stat, 0) * 256 + digit;
      const one = cost(e.simulationId, 1);
      if (one !== null) choices.set(choice, { id: e.simulationId, signature, modern: !!gem, one,
        two: gem ? multiUnitCost(e.simulationId, 2) : Infinity, three: gem ? multiUnitCost(e.simulationId, 3) : Infinity });
    }
    return choices;
  });
  if (offers.some(list => !list.size || list.size > (mixed ? 104 : 64) || new Set([...list.values()].map(o => o.id)).size !== list.size)) return;
  const [left, right, necklaces] = offers;
  // With two Midnight gems the old finalist key retains both physical IDs
  // and their positions. For a fixed target that fixes the remaining gem's
  // rating. Use only one reachable witness per legacy rating and slot: two
  // legacy SKUs with the same rating can have the same old finalist key.
  const witnesses = offers.map(choices => {
    const modern: Offer[] = [], cheapestLegacy = new Map<number, Offer>();
    for (const [choice, offer] of choices) {
      if (offer.modern) modern.push(offer);
      else if (!hasOtherProof(choice) && offer.one < (cheapestLegacy.get(offer.signature)?.one ?? Infinity))
        cheapestLegacy.set(offer.signature, offer);
    }
    return modern.concat([...cheapestLegacy.values()]);
  });
  // Index the two rings on the first eligible triple. For a new target sum,
  // look up just the matching ring pairs for each possible necklace gem.
  let pairs: Map<number, [Offer, Offer][]> | undefined;
  const thresholds = new Map<number, number>();
  function thirdPrice(target: number) {
    const cached = thresholds.get(target);
    if (cached !== undefined) return cached;
    if (!pairs) {
      pairs = new Map();
      for (const a of witnesses[0]) for (const b of witnesses[1]) {
        const key = a.signature + b.signature;
        const rows = pairs.get(key);
        if (rows) rows.push([a,b]); else pairs.set(key, [[a,b]]);
      }
    }
    let first = Infinity, second = Infinity, third = Infinity;
    for (const c of witnesses[2]) {
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
  const socketOffers = sockets.map((axis, i) => {
    const byId = new Map<number, number>();
    for (const [index, choice] of axes[axis].entries()) {
      const offer = offers[i].get(choice);
      if (offer?.modern) byId.set(offer.id, index);
    }
    return byId;
  });
  const weapons = includeWeaponSavings ? cheaperWeaponScrolls(axes, slots, multiUnitCost) : undefined;
  return {
    axis, weaponAxis: weapons?.axis,
    // These orders buy the same gems in exactly the same quantities. Check the live choices
    // for each destination, since a retained or restricted gem is not a witness.
    tiedGemOrders(indices: number[], needed: 2 | 3 = 3) {
      if (neckEnchant >= 0 && axes[neckEnchant][indices[neckEnchant]].enhancement) return;
      const ids = sockets.map((axis, i) => {
        const offer = offers[i].get(axes[axis][indices[axis]]);
        return offer?.modern ? offer.id : 0;
      });
      const distinct = new Set(ids).size;
      if (ids.includes(0) || distinct < needed) return;
      const orders: number[][] = [];
      const seen = distinct === 2 ? new Set([ids.join(",")]) : undefined;
      for (const [first, second, third] of otherGemOrders) {
        if (seen) {
          const key = [ids[first], ids[second], ids[third]].join(",");
          if (seen.has(key)) continue;
          seen.add(key);
        }
        const a = socketOffers[0].get(ids[first]), b = socketOffers[1].get(ids[second]);
        const c = socketOffers[2].get(ids[third]);
        if (a === undefined || b === undefined || c === undefined) continue;
        const other = indices.slice();
        other[sockets[0]] = a;
        other[sockets[1]] = b;
        other[sockets[2]] = c;
        orders.push(other);
      }
      return orders.length >= needed ? orders : undefined;
    },
    cutAxis(selected: Choice[]) {
      if (neckEnchant >= 0 && selected[neckEnchant].enhancement) return;
      const a = left.get(selected[sockets[0]]), b = right.get(selected[sockets[1]]), c = necklaces.get(selected[sockets[2]]);
      if (!a || !b || !c) return;
      const modernCount = Number(a.modern) + Number(b.modern) + Number(c.modern);
      if (modernCount < 2) return;
      // Mixed purchases need both ring enchants to remain direct or absent.
      // Include these digits in the fixed suffix when advancing the cursor.
      if (modernCount === 2 && ringEnchants.some(axis => {
        const enchant = selected[axis].enhancement;
        return enchant && !isDirectRingEnchant(enchant.simulationId);
      })) return;
      const total = price(a,b,c);
      if (!Number.isSafeInteger(total)) return;
      const third = thirdPrice(a.signature + b.signature + c.signature);
      const gemAxis = modernCount === 2 ? mixedAxis : axis;
      if (total > third) return gemAxis;
      // The three witnesses keep three distinct original gem ranking keys
      // even when all use the same cheaper equivalent pair of weapon scrolls.
      if (weapons && third - total < weapons.savings(selected)) return Math.min(gemAxis, weapons.axis);
    },
  };
}
