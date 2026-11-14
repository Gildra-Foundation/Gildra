import { createHash } from "node:crypto";
import type { AuctionOffer } from "./auctionMarket";
import type { GearCandidateVariant, GearEnhancementMetadata } from "./gearCandidates";
import type { GearPlannerWeapon } from "./gearPlannerPresentation";
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
  metadataVersion?: number;
  enhancements?: GearEnhancementMetadata;
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
  weapon?: GearPlannerWeapon;
  effects?: string[];
  effectsVerified?: boolean;
  error?: string;
};
export function resolvedAuctionVariant(offer: AuctionOffer, resolved: ResolvedAuctionVariant, engine: string): GearCandidateVariant {
  if (resolved.error || resolved.key !== auctionVariantKey(offer) || resolved.itemId !== offer.itemId || !Number.isInteger(resolved.itemLevel) || resolved.itemLevel < 1 || !Number.isInteger(resolved.requiredLevel) || resolved.requiredLevel < 0 || resolved.requiredLevel > 90 || !engine.startsWith("SimulationCraft")) throw new Error("item_variant_unverified");
  const enhancements = validatedAuctionEnhancementMetadata(resolved);
  return {
    key: resolved.key,
    itemLevel: resolved.itemLevel,
    contextId: offer.contextId,
    bonusIds: [...offer.bonusIds],
    modifiers: [...offer.modifiers],
    resolution: {
      engine,
      requiredLevel: resolved.requiredLevel,
      stats: resolved.stats,
      ...(resolved.metadataVersion !== undefined ? { metadataVersion: resolved.metadataVersion, enhancements } : {}),
      ...(validAuctionWeapon(resolved.weapon) ? { weapon: { ...resolved.weapon } } : {}),
      ...(resolved.effectsVerified === true && Array.isArray(resolved.effects) && resolved.effects.every(effect =>
        typeof effect === "string" && effect.length > 0 && effect.length <= 4096) && resolved.effects.length <= 32
        ? { effects: [...resolved.effects], effectsVerified: true } : { effectsVerified: false }),
    }
  };
}

/** Missing legacy fields are unknown, never evidence of zero sockets. */
export function validatedAuctionEnhancementMetadata(value: Pick<ResolvedAuctionVariant, "metadataVersion" | "enhancements">): GearEnhancementMetadata {
  if (value.metadataVersion !== 2) return { status: "unknown" };
  const data = value.enhancements;
  if (!data || data.status !== "verified" || !Array.isArray(data.socketColors) || data.socketColors.length !== 3 ||
      data.socketColors.some(color => !Number.isSafeInteger(color) || color < 0 || color > 0xffffffff) ||
      ![data.socketCount, data.socketBonusId, data.requiredProfessionId, data.requiredProfessionRank].every(v => Number.isSafeInteger(v) && v >= 0) ||
      data.socketCount !== data.socketColors.filter(Boolean).length) throw new Error("item_variant_unverified");
  return { ...data, socketColors: [...data.socketColors] };
}

export function validAuctionWeapon(weapon: GearPlannerWeapon | undefined): weapon is GearPlannerWeapon {
  return Boolean(weapon && [weapon.minDamage, weapon.maxDamage, weapon.dps, weapon.speedSeconds].every(Number.isFinite) &&
    weapon.minDamage > 0 && weapon.maxDamage >= weapon.minDamage && weapon.dps > 0 && weapon.speedSeconds > 0);
}
