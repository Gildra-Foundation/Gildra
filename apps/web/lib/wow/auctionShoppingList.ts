import type { AuctionGearPurchase } from "./auctionGearTypes";
import type { PricedEnhancementConfiguration } from "./auctionGearEnhancementOptimizer";

export type AuctionShoppingRow = {
  key: string; kind: "item" | "gem" | "enchant"; itemId: number; name: string;
  quantity: number; quotedCopper: number | null; auctionId?: number; variantKey?: string;
};
export type CheckedShoppingRow = AuctionShoppingRow & {
  status: "purchased" | "available" | "repriced" | "missing" | "changed" | "unverified";
  currentCopper: number | null;
};
export function buildAuctionShoppingRows(purchases: AuctionGearPurchase[],
  consumables: PricedEnhancementConfiguration["consumables"] = [], names: Record<string, string> = {}): AuctionShoppingRow[] {
  const lots = new Map<number, AuctionShoppingRow>();
  for (const item of purchases) {
    // A stack used in two slots is bought once, at its whole-lot cost.
    if (!lots.has(item.auctionId)) lots.set(item.auctionId, {
      key: `item:${item.auctionId}:${item.variantKey}:${item.quantity}`, kind: "item",
      itemId: item.itemId, name: item.name, quantity: item.quantity, quotedCopper: item.lotCostCopper,
      auctionId: item.auctionId, variantKey: item.variantKey,
    });
  }
  return [...lots.values(), ...consumables.map(item => ({
    key: `${item.kind}:${item.itemId}:${item.quantity}`, kind: item.kind, itemId: item.itemId,
    name: names[item.itemId] ?? "", quantity: item.quantity, quotedCopper: item.quotedCopper,
  }))];
}
