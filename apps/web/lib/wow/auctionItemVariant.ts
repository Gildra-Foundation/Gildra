import { createHash } from "node:crypto";
import type { AuctionOffer } from "./auctionMarket";
import type { GearCandidateVariant } from "./gearCandidates";
export type AuctionModifier = {
  type: number;
  value: number;
};
export { supportedAuctionModifiers } from "./gearItemModifiers";
import { supportedAuctionModifiers } from "./gearItemModifiers";
export function auctionVariantKey(offer: Pick<AuctionOffer, "itemId" | "contextId" | "bonusIds" | "modifiers">) {
  return "auction:" + createHash("sha256").update(JSON.stringify([offer.itemId, offer.contextId, [...offer.bonusIds].sort((a, b) => a - b), [...offer.modifiers].sort((a, b) => a.type - b.type)])).digest("hex").slice(0, 32);
}
export function auctionVariantChange(offer: AuctionOffer, slot: string) {
  if (!supportedAuctionModifiers(offer.modifiers)) throw new Error("unsupported_item_modifiers");
  return {
    slot,
    itemId: offer.itemId,
    bonusIds: [...offer.bonusIds],
    contextId: offer.contextId,
    modifiers: [...offer.modifiers].sort((a, b) => a.type - b.type)
  };
}
export type ResolvedAuctionVariant = {
  key: string;
  itemId: number;
  itemLevel: number;
  requiredLevel: number;
  inventoryType: number;
  itemClassId: number;
  itemSubclassId: number;
  quality: number;
  uniqueEquipped: boolean;
  setId: number;
  stats: Record<string, number>;
  error?: string;
};
export function resolvedAuctionVariant(offer: AuctionOffer, resolved: ResolvedAuctionVariant, engine: string): GearCandidateVariant {
  if (resolved.error || resolved.key !== auctionVariantKey(offer) || resolved.itemId !== offer.itemId || !Number.isInteger(resolved.itemLevel) || resolved.itemLevel < 1 || !Number.isInteger(resolved.requiredLevel) || resolved.requiredLevel < 0 || resolved.requiredLevel > 90 || !engine.startsWith("SimulationCraft")) throw new Error("item_variant_unverified");
  return {
    key: resolved.key,
    itemLevel: resolved.itemLevel,
    contextId: offer.contextId,
    bonusIds: [...offer.bonusIds],
    modifiers: [...offer.modifiers],
    resolution: {
      engine,
      requiredLevel: resolved.requiredLevel,
      stats: resolved.stats
    }
  };
}
