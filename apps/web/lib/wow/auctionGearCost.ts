import { auctionPlanCost } from "./auctionGearPlanner";
import type { AuctionGearOption } from "./auctionGearTypes";

export type EnhancementRequest = { itemId: number; quantity: number; kind: "gem" | "enchant" };
export type ExactCommodityPrices = Record<string, { ladder: readonly (readonly [number, number])[] }>;
/** Exact unit-price ladders only. Display ladders with aggregated median tails are not quotes. */
export function exactCommodityCost(ladder: readonly (readonly [number, number])[], quantity: number): number | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("invalid_commodity_quantity");
  let remaining = quantity, cost = 0, previous = 0;
  for (const [price, available] of ladder) {
    if (!Number.isSafeInteger(price) || price <= 0 || price <= previous || !Number.isSafeInteger(available) || available <= 0) throw new Error("invalid_commodity_ladder");
    previous = price;
    const used = Math.min(remaining, available);
    cost += used * price; remaining -= used;
    if (!Number.isSafeInteger(cost)) throw new Error("invalid_budget");
  }
  return remaining ? null : cost;
}
/** Existing installed enhancements stay with owned equipment; replacement consumables must be bought.
 * No ownership credit is inferred from equipped items. Compatibility is currently unavailable in
 * GearVariantMetadata, so requested improvements are NEVER budget-certified or sent to simulation. */
export function auctionGearCostBreakdown(options: AuctionGearOption[], requested: readonly EnhancementRequest[], prices: ExactCommodityPrices, budgetCopper: number) {
  if (!Number.isSafeInteger(budgetCopper) || budgetCopper < 0) throw new Error("invalid_budget");
  const itemsCopper = auctionPlanCost(options);
  const quantities = new Map<number, number>();
  for (const request of requested) {
    if (!Number.isSafeInteger(request.itemId) || request.itemId <= 0 || !Number.isSafeInteger(request.quantity) || request.quantity <= 0 || !["gem", "enchant"].includes(request.kind)) throw new Error("invalid_enhancement_request");
    const quantity = (quantities.get(request.itemId) ?? 0) + request.quantity;
    if (!Number.isSafeInteger(quantity)) throw new Error("invalid_commodity_quantity");
    quantities.set(request.itemId, quantity);
  }
  const enhancements = [...quantities].map(([itemId, quantity]) => ({ itemId, quantity,
    quotedCopper: prices[itemId] ? exactCommodityCost(prices[itemId].ladder, quantity) : null,
    compatibility: "unverified" as const }));
  return { itemsCopper, enhancements, totalCopper: requested.length ? null : itemsCopper,
    budgetCertified: !requested.length && itemsCopper <= budgetCopper,
    coverage: requested.length ? "enhancement_compatibility_unverified" as const : "items_only" as const,
    ownedImprovementPolicy: "preserve_installed_no_inventory_credit" as const };
}

/** A procurement quote consumes original price levels; no median aggregation or inventory credit. */
export function exactCommodityQuote(ladder: readonly (readonly [number, number])[], quantity: number) {
  const totalCopper = exactCommodityCost(ladder, quantity);
  let remaining = quantity;
  const levels: { unitCopper: number; quantity: number }[] = [];
  for (const [unitCopper, available] of ladder) {
    const used = Math.min(remaining, available);
    if (used) levels.push({unitCopper,quantity:used});
    remaining -= used;
  }
  return { totalCopper, levels, missingQuantity: remaining };
}
