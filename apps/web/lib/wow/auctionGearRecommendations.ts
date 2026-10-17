import type { AuctionGearSearchItem } from "./auctionGearTypes";

/** Preserve every purchasable lot whose individual improvement is confirmed. */
export function getAuctionGearRecommendations(items: readonly AuctionGearSearchItem[]): AuctionGearSearchItem[] {
  return items.filter(item => item.evaluation === "upgrade" &&
    item.comparison !== null && item.comparison.deltaDps > 0 &&
    item.comparison.uncertainty.significant === true);
}

export type AuctionGearRecommendationGroup = {
  slotType: string;
  best: AuctionGearSearchItem;
  alternatives: AuctionGearSearchItem[];
};

/** Whole-lot price per additional DPS, never price per total character DPS. */
export function auctionGearPricePerDps(item: AuctionGearSearchItem): number {
  return item.lotCostCopper / item.comparison!.deltaDps;
}

const gain = (item: AuctionGearSearchItem) => item.comparison!.deltaDps;
const byValue = (a: AuctionGearSearchItem, b: AuctionGearSearchItem) =>
  auctionGearPricePerDps(a) - auctionGearPricePerDps(b) || gain(b) - gain(a) ||
  a.lotCostCopper - b.lotCostCopper || a.optionId.localeCompare(b.optionId);

/** Presentation only: the complete native/financial domain remains available to assembly. */
export function getAuctionGearRecommendationGroups(items: readonly AuctionGearSearchItem[]): AuctionGearRecommendationGroup[] {
  const slots = new Map<string, Map<string, AuctionGearSearchItem>>();
  for (const item of getAuctionGearRecommendations(items)) {
    if (!Number.isFinite(gain(item)) || !Number.isSafeInteger(item.lotCostCopper) || item.lotCostCopper <= 0) continue;
    const choices = slots.get(item.slotType) ?? new Map<string, AuctionGearSearchItem>();
    const key = JSON.stringify([item.itemId, item.variantKey]);
    const previous = choices.get(key);
    if (!previous || item.lotCostCopper < previous.lotCostCopper || item.lotCostCopper === previous.lotCostCopper &&
        item.optionId.localeCompare(previous.optionId) < 0) choices.set(key, item);
    slots.set(item.slotType, choices);
  }
  return [...slots].map(([slotType, choices]) => {
    // Exclude choices that cost at least as much for no greater confirmed gain.
    // Sorting first makes the price/DPS frontier linear after the sort.
    const ordered = [...choices.values()].sort((a, b) => a.lotCostCopper - b.lotCostCopper || gain(b) - gain(a) || a.optionId.localeCompare(b.optionId));
    let highestGain = -Infinity;
    const frontier = ordered.filter(item => {
      if (gain(item) <= highestGain) return false;
      highestGain = gain(item);
      return true;
    });
    const ranked = [...frontier].sort(byValue), best = ranked[0];
    const others = frontier.filter(item => item !== best);
    // Two useful tradeoffs: lower purchase price and greater DPS; fill any
    // remaining position by efficiency, without duplicate lots/effects.
    const proposals = [others[0], others.at(-1), ...ranked.filter(item => item !== best)];
    const alternatives = [...new Set(proposals.filter((item): item is AuctionGearSearchItem => Boolean(item)))].slice(0, 2);
    return { slotType, best, alternatives };
  });
}
