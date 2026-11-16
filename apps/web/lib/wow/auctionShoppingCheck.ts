import type { AuctionShoppingRow, CheckedShoppingRow } from "./auctionShoppingList";
import type { AuctionOffer } from "./auctionMarket";
import { exactCommodityQuote } from "./auctionGearCost";

/** Only server-owned result rows reach this function. Client checkmarks are notes,
 * never proof of in-game ownership and never inputs to gear simulations. */
export function checkAuctionShoppingRows(rows: AuctionShoppingRow[], purchasedKeys: readonly string[],
  offers: Array<AuctionOffer & { variantKey: string }>, prices: Record<string, { ladder: [number, number][] }>): CheckedShoppingRow[] {
  const purchased = new Set(purchasedKeys), byId = new Map(offers.map(offer => [offer.auctionId, offer]));
  return rows.map(row => {
    if (purchased.has(row.key)) return { ...row, status: "purchased", currentCopper: 0 };
    let currentCopper: number | null;
    if (row.kind === "item") {
      const offer = byId.get(row.auctionId!);
      if (!offer) return { ...row, status: "missing", currentCopper: null };
      if (offer.itemId !== row.itemId || offer.variantKey !== row.variantKey || offer.quantity !== row.quantity)
        return { ...row, status: "changed", currentCopper: null };
      currentCopper = offer.buyoutCopper;
    } else {
      const price = prices[row.itemId];
      currentCopper = price ? exactCommodityQuote(price.ladder, row.quantity).totalCopper : null;
      if (currentCopper === null) return { ...row, status: "missing", currentCopper: null };
    }
    return { ...row, currentCopper, status: currentCopper === row.quotedCopper ? "available" : "repriced" };
  });
}

export function remainingShoppingCost(rows: Array<{ currentCopper: number | null }>): number | null {
  if (rows.some(row => row.currentCopper === null)) return null;
  const total = rows.reduce((sum, row) => sum + row.currentCopper!, 0);
  return Number.isSafeInteger(total) ? total : null;
}
