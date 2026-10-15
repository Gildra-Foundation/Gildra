/** Catalog imports contain both DB2 numeric inventory IDs and Battle.net enum codes. */
export function normalizeInventoryType(value: unknown): number {
  const codes: Record<string, number> = {
    NON_EQUIP: 0,
    HEAD: 1,
    NECK: 2,
    SHOULDER: 3,
    SHOULDERS: 3,
    BODY: 4,
    CHEST: 5,
    WAIST: 6,
    LEGS: 7,
    FEET: 8,
    WRIST: 9,
    WRISTS: 9,
    HAND: 10,
    HANDS: 10,
    FINGER: 11,
    TRINKET: 12,
    WEAPON: 13,
    SHIELD: 14,
    RANGED: 15,
    CLOAK: 16,
    TWOHWEAPON: 17,
    BAG: 18,
    TABARD: 19,
    ROBE: 20,
    WEAPONMAINHAND: 21,
    WEAPONOFFHAND: 22,
    HOLDABLE: 23,
    AMMO: 24,
    THROWN: 25,
    RANGEDRIGHT: 26,
    QUIVER: 27,
    RELIC: 28
  };
  if (typeof value === "string" && Object.hasOwn(codes, value)) return codes[value];
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : -1;
  return Number.isSafeInteger(n) && n >= 0 && n <= 28 ? n : -1;
}
/** Retail inventory and weapon proficiency IDs. Keep specialization rules explicit. */
const armorByClass: Record<number, number> = {
  1: 4,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
  6: 4,
  7: 3,
  8: 1,
  9: 1,
  10: 2,
  11: 2,
  12: 2,
  13: 3
};
const weaponsByClass: Record<number, number[]> = {
  1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 13, 15, 18],
  2: [0, 1, 4, 5, 6, 7, 8],
  3: [0, 1, 2, 3, 6, 7, 8, 10, 13, 15, 18],
  4: [0, 2, 3, 4, 7, 13, 15, 18],
  5: [4, 10, 15, 19],
  6: [0, 1, 4, 5, 6, 7, 8],
  7: [0, 1, 4, 5, 10, 13, 15],
  8: [7, 10, 15, 19],
  9: [7, 10, 15, 19],
  10: [0, 4, 6, 7, 10, 13],
  11: [4, 5, 6, 10, 13, 15],
  12: [0, 7, 9, 13],
  13: [0, 4, 7, 10, 13, 15]
};
const specsByClass: Record<number, number[]> = {
  1: [71, 72, 73],
  2: [65, 66, 70],
  3: [253, 254, 255],
  4: [259, 260, 261],
  5: [256, 257, 258],
  6: [250, 251, 252],
  7: [262, 263, 264],
  8: [62, 63, 64],
  9: [265, 266, 267],
  10: [268, 269, 270],
  11: [102, 103, 104, 105],
  12: [577, 581, 1480],
  13: [1467, 1468, 1473]
};
const dualWieldSpecs = new Set([72, 251, 259, 260, 261, 263, 268, 269, 577, 581, 1480]);
const shieldSpecs = new Set([65, 66, 73, 262, 264]);
const twoHandSpecs = new Set([71, 70, 250, 252, 255, 103, 104]);
const rangedSpecs = new Set([253, 254]);
const armorSlots = new Set([1, 3, 5, 6, 7, 8, 9, 10, 20]);
export const isTwoHandWeapon = (inventoryType: number) => [15, 17].includes(inventoryType);
export const supportsTitanGrip = (specId: number, subclass: number) => specId === 72 && [1, 5, 6, 8, 10].includes(subclass);
export function equipmentCompatibility(input: {
  classId: number;
  specId: number;
  slotType: string;
  itemClassId: number;
  itemSubclassId: number;
  inventoryType: number;
}) {
  const {
    classId,
    specId,
    slotType,
    itemClassId,
    itemSubclassId,
    inventoryType
  } = input;
  if (!specsByClass[classId]?.includes(specId)) return "specialization_unverified";
  const allowedSlots: Record<string, number[]> = {
    HEAD: [1],
    NECK: [2],
    SHOULDER: [3],
    CHEST: [5, 20],
    WAIST: [6],
    LEGS: [7],
    FEET: [8],
    WRIST: [9],
    HANDS: [10],
    FINGER_1: [11],
    FINGER_2: [11],
    TRINKET_1: [12],
    TRINKET_2: [12],
    BACK: [16],
    MAIN_HAND: [13, 15, 17, 21, 26],
    OFF_HAND: [13, 14, 17, 22, 23]
  };
  if (!allowedSlots[slotType]?.includes(inventoryType)) return "slot_mismatch";
  if (itemClassId === 4) {
    if (["MAIN_HAND", "OFF_HAND"].includes(slotType) && ![14, 23].includes(inventoryType)) return "weapon_not_supported";
    if (armorSlots.has(inventoryType) && itemSubclassId !== armorByClass[classId]) return "armor_specialization_mismatch";
    if (inventoryType === 14 && !shieldSpecs.has(specId)) return "shield_not_supported";
    if (inventoryType === 23 && (dualWieldSpecs.has(specId) || twoHandSpecs.has(specId) || rangedSpecs.has(specId) || [66, 73].includes(specId))) return "held_offhand_not_supported";
    return null;
  }
  if (itemClassId !== 2 || !weaponsByClass[classId]?.includes(itemSubclassId)) return "weapon_not_supported";
  if (slotType !== "MAIN_HAND" && slotType !== "OFF_HAND") return "slot_mismatch";
  if (rangedSpecs.has(specId) && ![2, 3, 18].includes(itemSubclassId)) return "weapon_specialization_mismatch";
  if (!rangedSpecs.has(specId) && [2, 3, 18].includes(itemSubclassId)) return "weapon_specialization_mismatch";
  if (twoHandSpecs.has(specId) && !isTwoHandWeapon(inventoryType)) return "two_hand_required";
  if ([66, 73, 259, 260, 261, 263, 577, 581, 1480].includes(specId) && isTwoHandWeapon(inventoryType)) return "one_hand_required";
  if (specId === 72 && isTwoHandWeapon(inventoryType) && !supportsTitanGrip(specId, itemSubclassId)) return "weapon_specialization_mismatch";
  if (specId === 259 && itemSubclassId !== 15) return "dagger_required";
  if ([259, 261].includes(specId) && slotType === "MAIN_HAND" && itemSubclassId !== 15) return "dagger_required";
  if (specId === 260 && slotType === "MAIN_HAND" && itemSubclassId === 15) return "weapon_specialization_mismatch";
  if (slotType === "OFF_HAND" && (!dualWieldSpecs.has(specId) || isTwoHandWeapon(inventoryType) && !supportsTitanGrip(specId, itemSubclassId))) return "offhand_weapon_not_supported";
  return null;
}
export type GearLoadoutItem = {
  slotType: string;
  itemId: number;
  inventoryType: number;
  itemSubclassId: number;
  uniqueEquipped?: boolean;
  limitCategoryId?: number;
  limitQuantity?: number;
};
export function validateGearLoadout(items: GearLoadoutItem[], specId: number) {
  const slots = new Set<string>(),
    counts = new Map<string, number>();
  for (const item of items) {
    if (slots.has(item.slotType)) throw new Error("duplicate_equipment_slot");
    slots.add(item.slotType);
    counts.set(`item:${item.itemId}`, (counts.get(`item:${item.itemId}`) ?? 0) + 1);
    if (item.limitCategoryId) counts.set(`category:${item.limitCategoryId}`, (counts.get(`category:${item.limitCategoryId}`) ?? 0) + 1);
  }
  for (const item of items) {
    if (item.uniqueEquipped && counts.get(`item:${item.itemId}`)! > 1) throw new Error("unique_equipped_conflict");
    if (item.limitCategoryId && counts.get(`category:${item.limitCategoryId}`)! > (item.limitQuantity ?? 1)) throw new Error("unique_equipped_conflict");
  }
  const main = items.find(item => item.slotType === "MAIN_HAND"),
    off = items.find(item => item.slotType === "OFF_HAND");
  if (off && isTwoHandWeapon(off.inventoryType) && !supportsTitanGrip(specId, off.itemSubclassId)) throw new Error("offhand_weapon_not_supported");
  if (main && off && isTwoHandWeapon(main.inventoryType)) {
    if (!supportsTitanGrip(specId, main.itemSubclassId) || ![13, 17, 22].includes(off.inventoryType)) throw new Error("two_hand_offhand_conflict");
  }
}
