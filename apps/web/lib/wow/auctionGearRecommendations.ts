import type { AuctionGearSearchItem } from "./auctionGearTypes";

/** Preserve every purchasable lot whose individual improvement is confirmed. */
export function getAuctionGearRecommendations(items: readonly AuctionGearSearchItem[]): AuctionGearSearchItem[] {
  return items.filter(item => item.evaluation === "upgrade" &&
    item.comparison !== null && item.comparison.deltaDps > 0 &&
    item.comparison.uncertainty.significant === true);
}
