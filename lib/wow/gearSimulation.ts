import { createHash } from "node:crypto";
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
  enchantId?: number;
  gemIds?: number[];
};

type RawEquippedItem = {
  item?: { id?: number };
  slot?: { type?: string };
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
  if (!variant || !variant.bonusIds.length) throw new Error("simulation_variant_not_found");
  return variant;
}

export function prepareGearChange(input: {
  slotType: string;
  candidate: GearCandidate;
  variantKey: string;
  customization?: GearCustomization;
  equipment: Record<string, unknown>;
}): SimcGearChange {
  const slotType = input.slotType.toUpperCase();
  const simcSlot = simcSlotByBattleNet[slotType];
  if (!simcSlot || !input.candidate.eligible || input.candidate.slotType !== slotType) throw new Error("candidate_slot_mismatch");
  const variant = selectGearVariant(input.candidate, input.variantKey);
  const equipped = equippedItems(input.equipment);
  const current = equipped.find((item) => item.slot?.type === slotType);
  if (!current?.item?.id) throw new Error("equipped_slot_missing");
  if (current.item.id === input.candidate.itemId) throw new Error("candidate_matches_equipped_item");
  if (input.candidate.constraints.uniqueEquipped && equipped.some((item) => item.slot?.type !== slotType && item.item?.id === input.candidate.itemId)) {
    throw new Error("unique_equipped_conflict");
  }
  if (slotType === "MAIN_HAND" && input.candidate.inventoryType === 17 && equipped.some((item) => item.slot?.type === "OFF_HAND" && item.item?.id)) {
    throw new Error("two_hand_requires_offhand_removal");
  }
  const enchantId = input.customization?.enchantId;
  const gemIds = input.customization?.gemIds ?? [];
  if (enchantId !== undefined && (!integerId(enchantId) || !enchantableSlots.has(slotType))) throw new Error("invalid_enchant_for_slot");
  if (gemIds.length > 3 || gemIds.some((id) => !integerId(id)) || (gemIds.length > 0 && !socketableSlots.has(slotType))) throw new Error("invalid_gems_for_slot");
  return {
    slot: simcSlot,
    itemId: input.candidate.itemId,
    bonusIds: [...variant.bonusIds],
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
