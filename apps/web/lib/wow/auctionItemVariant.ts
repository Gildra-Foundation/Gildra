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
  nativeCraftedSymmetryV1?: number[];
  nativeSuffixProgramV1?: string;
  nativeContentTuningV1?: number[];
  nativeScalingInputsV1?: number[];
  appliedStatsV1?: number[];
  nativeNoItemEffects?: boolean;
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
      ...(Array.isArray(resolved.nativeCraftedSymmetryV1) && resolved.nativeCraftedSymmetryV1.length === offer.bonusIds.length &&
        resolved.nativeCraftedSymmetryV1.every((bonus, index) => bonus === offer.bonusIds[index]) ? { nativeCraftedSymmetryV1: true } : {}),
      ...(typeof resolved.nativeSuffixProgramV1 === "string" && /^[a-f0-9]{64}$/.test(resolved.nativeSuffixProgramV1)
        ? { nativeSuffixProgramV1: resolved.nativeSuffixProgramV1 } : {}),
      ...(Array.isArray(resolved.nativeContentTuningV1) && resolved.nativeContentTuningV1.length === 2 &&
        resolved.nativeContentTuningV1.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647) &&
        offer.modifiers.some(m => m.type === 28 && m.value === resolved.nativeContentTuningV1![0])
        ? { nativeContentTuningV1: [...resolved.nativeContentTuningV1] } : {}),
      ...(Array.isArray(resolved.nativeScalingInputsV1) && resolved.nativeScalingInputsV1.length === 4 &&
        resolved.nativeScalingInputsV1.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647)
        ? { nativeScalingInputsV1: [...resolved.nativeScalingInputsV1] } : {}),
      ...(Array.isArray(resolved.appliedStatsV1) && resolved.appliedStatsV1.length === 46 && resolved.appliedStatsV1.every(Number.isFinite)
        ? { appliedStatsV1: [...resolved.appliedStatsV1] } : {}),
      ...(resolved.nativeNoItemEffects === true ? { nativeNoItemEffects: true } : {}),
      ...(resolved.metadataVersion !== undefined ? { metadataVersion: resolved.metadataVersion, enhancements } : {}),
      ...(validAuctionWeapon(resolved.weapon) ? { weapon: { ...resolved.weapon } } : {}),
      ...(resolved.effectsVerified === true && Array.isArray(resolved.effects) && resolved.effects.every(effect =>
        typeof effect === "string" && effect.length > 0 && effect.length <= 4096) && resolved.effects.length <= 32
        ? { effects: [...resolved.effects], effectsVerified: true } : { effectsVerified: false }),
    }
  };
}

// API v3 contains GemType masks normalized from native SocketType indices.
// The old v2 wire mislabelled indices as masks: only its all-zero case is safe.
const normalizedSocketMasks = new Set([0,1,2,4,8,16,32,14,
  0x40,0x80,0x100,0x200,0x400,0x800,0x1000,0x2000,0x4000,0x8000,0x10000,
  0x20000,0x40000,0x80000,0x700000,0x800000,0x1000000,0x2000000,
  0x4000000,0x8000000,0x10000000,0x20000000,0x40000000]);
/** Missing/ambiguous legacy fields are unknown, never evidence of zero sockets. */
export function validatedAuctionEnhancementMetadata(value: Pick<ResolvedAuctionVariant, "metadataVersion" | "enhancements">): GearEnhancementMetadata {
  if (value.metadataVersion !== 2 && value.metadataVersion !== 3) return { status: "unknown" };
  const data = value.enhancements;
  if (value.metadataVersion === 2 && data?.status === "verified" &&
      Array.isArray(data.socketColors) && data.socketColors.some(color => color !== 0)) return { status: "unknown" };
  if (!data || data.status !== "verified" || !Array.isArray(data.socketColors) || data.socketColors.length !== 3 ||
      data.socketColors.some(color => !Number.isSafeInteger(color) || !normalizedSocketMasks.has(color)) ||
      ![data.socketCount, data.socketBonusId, data.requiredProfessionId, data.requiredProfessionRank].every(v => Number.isSafeInteger(v) && v >= 0) ||
      data.socketCount !== data.socketColors.filter(Boolean).length) throw new Error("item_variant_unverified");
  return { ...data, socketColors: [...data.socketColors] };
}

export function validAuctionWeapon(weapon: GearPlannerWeapon | undefined): weapon is GearPlannerWeapon {
  return Boolean(weapon && [weapon.minDamage, weapon.maxDamage, weapon.dps, weapon.speedSeconds].every(Number.isFinite) &&
    weapon.minDamage >= 0 && weapon.maxDamage > 0 && weapon.maxDamage >= weapon.minDamage && weapon.dps > 0 && weapon.speedSeconds > 0);
}
