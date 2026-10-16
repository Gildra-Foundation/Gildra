import { supportedAuctionModifiers } from "./gearItemModifiers";
import { createHash } from "node:crypto";
import { isTwoHandWeapon, supportsTitanGrip, validateGearLoadout, type GearLoadoutItem } from "./gearCompatibility";
import type { GearCandidate, GearCandidateVariant } from "./gearCandidates";

export type GearSimulationScenario = "single-target" | "aoe" | "execute";

export type GearCustomization = {
  enchantId?: number;
  gemIds?: number[];
};

export type SimcGearChange = {
  slot: string;
  itemId: number;
  bonusIds: number[];
  contextId?: number;
  modifiers?: Array<{type:number;value:number}>;
  enchantId?: number;
  gemIds?: number[];
};

type RawEquippedItem = {
  item?: { id?: number };
  slot?: { type?: string };
  bonus_list?: number[];
  inventory_type?: { type?: string };
};

const simcSlotByBattleNet: Record<string, string> = {
  HEAD: "head", NECK: "neck", SHOULDER: "shoulder", BACK: "back", SHIRT: "shirt",
  CHEST: "chest", WAIST: "waist", WRIST: "wrist", HANDS: "hands", LEGS: "legs",
  FEET: "feet", FINGER_1: "finger1", FINGER_2: "finger2", TRINKET_1: "trinket1",
  TRINKET_2: "trinket2", MAIN_HAND: "main_hand", OFF_HAND: "off_hand", TABARD: "tabard",
};

const enchantableSlots = new Set(["BACK", "CHEST", "WRIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "MAIN_HAND", "OFF_HAND"]);
const socketableSlots = new Set(["HEAD", "NECK", "WRIST", "WAIST", "FINGER_1", "FINGER_2"]);

function integerId(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 10_000_000;
}

function equippedItems(equipment: Record<string, unknown>) {
  return Array.isArray(equipment.equipped_items) ? equipment.equipped_items as RawEquippedItem[] : [];
}

export function selectGearVariant(candidate: GearCandidate, key: string): GearCandidateVariant {
  const variant = candidate.variants.find((entry) => entry.key === key);
  if (!variant) throw new Error("simulation_variant_not_found");
  if (!supportedAuctionModifiers(variant.modifiers??[])) throw new Error("unsupported_item_modifiers");
  return variant;
}

export function prepareGearChange(input: {
  slotType: string;
  candidate: GearCandidate;
  variantKey: string;
  customization?: GearCustomization;
  equipment: Record<string, unknown>;
  loadout?: GearLoadoutItem[];
}): SimcGearChange {
  const slotType = input.slotType.toUpperCase();
  const simcSlot = simcSlotByBattleNet[slotType];
  if (!simcSlot || !input.candidate.eligible || input.candidate.slotType !== slotType) throw new Error("candidate_slot_mismatch");
  const variant = selectGearVariant(input.candidate, input.variantKey);
  const equipped = equippedItems(input.equipment);
  // The same item/bonuses can still change context, modifiers or customization.
  // Submit the exact replacement to native simulation instead of aborting a search.
  if (input.candidate.constraints.uniqueEquipped && equipped.some((item) => item.slot?.type !== slotType && item.item?.id === input.candidate.itemId)) {
    throw new Error("unique_equipped_conflict");
  }
  if (slotType === "MAIN_HAND" && isTwoHandWeapon(input.candidate.inventoryType) && !supportsTitanGrip(input.candidate.compatibility.specId, input.candidate.itemSubclassId) && equipped.some((item) => item.slot?.type === "OFF_HAND" && item.item?.id)) {
    throw new Error("two_hand_requires_offhand_removal");
  }
  if (input.loadout) validateGearLoadout([
    ...input.loadout.filter((item) => item.slotType !== slotType),
    candidateLoadoutItem(input.candidate),
  ], input.candidate.compatibility.specId);
  else if (input.candidate.constraints.limitCategoryId) throw new Error("equipment_constraints_unverified");
  const enchantId = input.customization?.enchantId;
  const gemIds = input.customization?.gemIds ?? [];
  if (enchantId !== undefined && (!integerId(enchantId) || !enchantableSlots.has(slotType))) throw new Error("invalid_enchant_for_slot");
  if (gemIds.length > 3 || gemIds.some((id) => !integerId(id)) || (gemIds.length > 0 && !socketableSlots.has(slotType))) throw new Error("invalid_gems_for_slot");
  return {
    slot: simcSlot,
    itemId: input.candidate.itemId,
    bonusIds: [...variant.bonusIds],
    ...(variant.contextId ? {contextId:variant.contextId}:{}),
    ...(variant.modifiers?.length ? {modifiers:[...variant.modifiers]}:{}),
    ...(enchantId ? { enchantId } : {}),
    ...(gemIds.length ? { gemIds: [...gemIds] } : {}),
  };
}

export function gearComparisonFingerprint(input: {
  profileFingerprint: string;
  talentLoadout: string;
  scenario: GearSimulationScenario;
  duration: number;
  targets: number;
  rules: string[];
  change?: SimcGearChange;
  changes?: SimcGearChange[];
  engineVersion?: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function compareGearSimulationResults(
  baseline: { dps: number; dpsError: number; confidence: number },
  candidate: { dps: number; dpsError: number; confidence: number },
) {
  if (![baseline.dps, baseline.dpsError, candidate.dps, candidate.dpsError].every(Number.isFinite) || baseline.dps <= 0 || candidate.dps <= 0) {
    throw new Error("invalid_simulation_result");
  }
  const deltaDps = candidate.dps - baseline.dps;
  const deltaPercent = deltaDps / baseline.dps * 100;
  const marginDps = 1.96 * Math.hypot(Math.max(0, baseline.dpsError), Math.max(0, candidate.dpsError));
  return {
    baselineDps: baseline.dps,
    candidateDps: candidate.dps,
    deltaDps,
    deltaPercent,
    confidence: Math.min(baseline.confidence || 95, candidate.confidence || 95),
    uncertainty: { marginDps: Math.ceil(marginDps), marginPercent: marginDps / baseline.dps * 100, significant: Math.abs(deltaDps) > marginDps },
  };
}

export function candidateLoadoutItem(candidate: GearCandidate): GearLoadoutItem {
  return { slotType: candidate.slotType, itemId: candidate.itemId, inventoryType: candidate.inventoryType,
    itemSubclassId: candidate.itemSubclassId, ...candidate.constraints };
}
export function prepareGearLoadout(input: {
  selections: Array<{candidate: GearCandidate; variantKey: string; customization?: GearCustomization}>;
  equipment: Record<string, unknown>; loadout: GearLoadoutItem[]; specId: number;
}) {
  const replaced = new Set(input.selections.map((s)=>s.candidate.slotType));
  if (replaced.size !== input.selections.length) throw new Error("duplicate_equipment_slot");
  const main = input.selections.find((s)=>s.candidate.slotType === "MAIN_HAND")?.candidate;
  const removeOffhand = Boolean(main && isTwoHandWeapon(main.inventoryType) && !supportsTitanGrip(input.specId, main.itemSubclassId));
  if (removeOffhand && replaced.has("OFF_HAND")) throw new Error("two_hand_offhand_conflict");
  const final = [...input.loadout.filter((item)=>!replaced.has(item.slotType) && !(removeOffhand && item.slotType === "OFF_HAND")), ...input.selections.map(s=>candidateLoadoutItem(s.candidate))];
  validateGearLoadout(final, input.specId);
  const equipment = removeOffhand ? {...input.equipment, equipped_items: equippedItems(input.equipment).filter((item)=>item.slot?.type !== "OFF_HAND")} : input.equipment;
  // Validate each replacement against the final state, allowing simultaneous swaps of unique categories.
  const changes = input.selections.map(({candidate,variantKey,customization})=>prepareGearChange({slotType:candidate.slotType,candidate,variantKey,customization,equipment: {
    ...equipment, equipped_items: equippedItems(equipment).filter(item=>!replaced.has(item.slot?.type ?? "") || item.slot?.type === candidate.slotType),
  },loadout: final.filter(item=>item.slotType!==candidate.slotType)}));
  return { changes, equipment, removedSlots: removeOffhand && input.loadout.some(i=>i.slotType==="OFF_HAND") ? ["OFF_HAND"] : [] };
}
