import type { AuctionListing } from "./auctionBrowser";

/**
 * Per-item market summary built from one auction snapshot. Prices are copper per unit; only lots with a buyout
 * (realm) or a unit price (commodities) count, so a bid-only lot never sets the price. Battle pets share one cage
 * item, so they are not summarised here.
 */
export type AuctionLadderStep = readonly [price: number, quantity: number];
export type AuctionItemSummary = { itemId: number; minPrice: number; medianPrice: number; quantity: number; lots: number; ladder: AuctionLadderStep[] };

/** One pass over the snapshot: price levels per item, merged and sorted from the cheapest. */
export function summarizeAuctions(rows: readonly AuctionListing[]): Map<number, AuctionItemSummary> {
  const levels = new Map<number, Map<number, number>>(), lots = new Map<number, number>();
  for (const row of rows) {
    if (row.petSpeciesId || row.unitPrice === null || !(row.unitPrice > 0)) continue;
    // Realm lots divide the buyout by the stack; round up to whole copper like the game does.
    const price = Math.ceil(row.unitPrice);
    let item = levels.get(row.itemId);
    if (!item) levels.set(row.itemId, item = new Map());
    item.set(price, (item.get(price) ?? 0) + row.quantity);
    lots.set(row.itemId, (lots.get(row.itemId) ?? 0) + 1);
  }
  const result = new Map<number, AuctionItemSummary>();
  for (const [itemId, prices] of levels) {
    const ladder = [...prices].sort((a, b) => a[0] - b[0]) as AuctionLadderStep[];
    const quantity = ladder.reduce((sum, [, qty]) => sum + qty, 0);
    result.set(itemId, { itemId, minPrice: ladder[0][0], medianPrice: ladderMedian(ladder, quantity), quantity, lots: lots.get(itemId) ?? 0, ladder });
  }
  return result;
}

/** Quantity-weighted median: the unit price at which half of all listed units are cheaper. */
export function ladderMedian(ladder: readonly AuctionLadderStep[], total = ladder.reduce((sum, [, qty]) => sum + qty, 0)) {
  if (!ladder.length) return 0;
  const half = total / 2;
  let seen = 0;
  for (const [price, qty] of ladder) { seen += qty; if (seen >= half) return price; }
  return ladder[ladder.length - 1][0];
}

/** What buying `wanted` units from the cheapest lots costs; `bought` is lower when the market runs out. */
export function ladderCost(ladder: readonly AuctionLadderStep[], wanted: number) {
  let left = Math.max(0, Math.floor(wanted)), total = 0, bought = 0, highest = 0;
  for (const [price, qty] of ladder) {
    if (left <= 0) break;
    const take = Math.min(left, qty);
    total += take * price; bought += take; left -= take; highest = price;
  }
  return { total, bought, average: bought ? total / bought : 0, highest };
}

/** Bounded copy for the client: the cheapest levels in full, the rest folded into one final step at its median. */
export function compactLadder(ladder: readonly AuctionLadderStep[], limit = 60): AuctionLadderStep[] {
  if (ladder.length <= limit) return [...ladder];
  const head = ladder.slice(0, limit - 1), tail = ladder.slice(limit - 1);
  const tailQuantity = tail.reduce((sum, [, qty]) => sum + qty, 0);
  return [...head, [ladderMedian(tail, tailQuantity), tailQuantity]];
}

/**
 * Crafting reagents of The War Within and later come in ranks: the same name, neighbouring item IDs, the higher
 * rank on the higher ID. Older expansions did not keep that order, so ranks are only inferred from there on.
 */
export const RANKED_REAGENT_FROM_ID = 210_000;
export function reagentRanks(items: readonly { itemId: number; name: string | null; classId?: number | null; subclassId?: number | null }[]) {
  const groups = new Map<string, number[]>();
  for (const item of items) {
    if (!item.name || item.itemId < RANKED_REAGENT_FROM_ID || item.classId !== 7) continue;
    const key = `${item.classId}:${item.subclassId}:${item.name.toLocaleLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), item.itemId]);
  }
  const ranks = new Map<number, number>();
  for (const ids of groups.values()) {
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    if (sorted.length < 2 || sorted.length > 3 || sorted[sorted.length - 1] - sorted[0] > 4) continue;
    sorted.forEach((id, index) => ranks.set(id, index + 1));
  }
  return ranks;
}

export type AuctionSortKey = "name" | "min" | "median" | "quantity";
export function sortSummaries<T extends { name: string | null; minPrice: number; medianPrice: number; quantity: number; itemId: number; rank?: number | null }>(rows: readonly T[], key: AuctionSortKey, direction: "asc" | "desc", lang: "ru" | "en") {
  const sign = direction === "asc" ? 1 : -1;
  const value = (row: T) => key === "min" ? row.minPrice : key === "median" ? row.medianPrice : row.quantity;
  return [...rows].sort((a, b) => {
    const primary = key === "name" ? (a.name ?? "").localeCompare(b.name ?? "", lang) : value(a) - value(b);
    return sign * primary || (a.name ?? "").localeCompare(b.name ?? "", lang) || (a.rank ?? 0) - (b.rank ?? 0) || a.itemId - b.itemId;
  });
}
