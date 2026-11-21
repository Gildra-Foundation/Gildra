import { createHash } from "node:crypto";
import { auctionMeasurementContract, candidateLoadoutItem } from "./gearSimulation";
import type { GearLoadoutItem } from "./gearCompatibility";
import { auctionMissiveComparison, auctionNativeItemOptions, ignoresItemContext, supportedAuctionModifiers, validAuctionItemContext, verifiedAuctionDropCurve } from "./gearItemModifiers";
import type { AuctionGearOption } from "./auctionGearTypes";

/** Native input identity: auction price/lot identity does not change item effects. */
export function auctionSelectionEffectKey(options: AuctionGearOption[], engine?: string, craftedSymmetry: boolean | "missive" = false, groupUnusedScaling: boolean | "tuning-cap" | "drop-curve" = false) {
  return createHash("sha256").update(JSON.stringify(options.map(option => {
    const variant = option.candidate.variants.find(v => v.key === option.variantKey);
    if (!variant) throw new Error("simulation_variant_not_found");
    const bare = groupUnusedScaling && !option.customization && variant.bonusIds?.length === 0;
    const resolution = engine && variant.resolution?.engine === engine ? variant.resolution : undefined;
    const curve = groupUnusedScaling === "drop-curve" ? resolution?.nativeDropCurveV1 : undefined;
    const tuning = typeof groupUnusedScaling === "string" && resolution
      ? resolution.nativeContentTuningV1 : undefined;
    const missive = engine && craftedSymmetry === "missive" && !option.customization
      ? auctionMissiveComparison(variant, option.candidate.slotType, engine) : undefined;
    const source = missive ? { ...variant, ...missive } : variant;
    const item = engine ? auctionNativeItemOptions(source, engine, bare, tuning, curve) : source;
    const cap = "dropCurveLevel" in item && item.dropCurveLevel !== undefined ? ["drop-curve-v1", item.dropCurveLevel] :
      "contentTuningCap" in item ? [item.contentTuningCap] : [];
    let modifiers = [...(item.modifiers ?? [])].sort((a, b) => a.type - b.type || a.value - b.value);
    // Keep certified groups separate from historical and uncertified offers,
    // even when the latter already use ascending crafting modifier values.
    const symmetric = craftedSymmetry && !option.customization && engine && ignoresItemContext(engine) &&
      variant.resolution?.engine === engine && variant.resolution.nativeCraftedSymmetryV1 === true &&
      validAuctionItemContext(variant.contextId) && supportedAuctionModifiers(modifiers);
    if (symmetric) {
      const first = modifiers.find(m => m.type === 29), second = modifiers.find(m => m.type === 30);
      if (first && second && first.value !== second.value) {
        modifiers = modifiers.map(m => m === first ? { ...m, value: Math.min(first.value, second.value) } :
          m === second ? { ...m, value: Math.max(first.value, second.value) } : m);
        return [option.candidate.slotType, option.candidate.itemId, variant.bonusIds, item.contextId ?? 0, modifiers, "crafted-symmetry-v1", ...cap];
      }
    }
    return [option.candidate.slotType, option.candidate.itemId, source.bonusIds,
      item.contextId ?? 0, modifiers, ...cap,
      ...(option.customization ? [{ enchantId: option.customization.enchantId ?? 0, gemIds: option.customization.gemIds ?? [] }] : [])];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}

const plainArmorSlots = new Set(["HEAD", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET"]);

// Pinned chest enchants with only STAT and RESISTANCE operations. SimC
// adds their contribution to the player's stats without rereading the item's
// unrounded rating allocations. The enchant ID remains part of the score key.
const directChestEnchants = new Set([
  15, 16, 17, 18, 24, 41, 242, 246, 254, 843, 850, 857,
  908, 913, 1843, 1893, 1953, 2381, 2503, 2659, 2792, 2793, 2794, 2841,
  2933, 3150, 3233, 3236, 3245, 3297, 3329, 3330, 4070, 4077, 4088, 4103,
  4120, 4121, 4417, 4418, 4420, 4869, 5237, 5260, 6614, 6615, 6616, 6620,
  6621, 6622, 6623, 6624, 6625,
]);

/** A certified substitution must preserve the item identity observable to APLs
 * and the ordered bonus IDs observable to other equipped items' effects. */
export function auctionAppliedStatsKey(options: AuctionGearOption[], engine: string, proofMode: boolean | "enchanted-suffix" = false): string | undefined {
  const pieces: Array<[string, unknown]> = [];
  let certified = false;
  let enchantedSuffix = false;
  const pinned = ignoresItemContext(engine);
  for (const option of options) {
    const enchant = option.customization?.enchantId;
    if (option.customization && (proofMode !== "enchanted-suffix" ||
        option.candidate.slotType !== "CHEST" || !enchant || !directChestEnchants.has(enchant) ||
        option.customization.gemIds?.length)) return;
    const c = option.candidate, t = c.constraints;
    const v = c.variants.find(row => row.key === option.variantKey), r = v?.resolution;
    if (!v || !validAuctionItemContext(v.contextId)) return;
    const e = r?.enhancements, stats = r?.appliedStatsV1;
    // This pinned waist program has two alternatives. 13695 adds one
    // prismatic socket, 13696 does nothing. Neither contributes a combat
    // effect or a cross-item description tag. Without a gem or socket bonus
    // their native stat vectors and all other inputs must still match.
    const emptySocket = proofMode === true && pinned && c.slotType === "WAIST" && c.inventoryType === 6 &&
      v.bonusIds.length === 4 && v.bonusIds[0] === 6652 && v.bonusIds[1] === 13663 && v.bonusIds[3] === 13901 &&
      e?.status === "verified" && e.socketColors?.length === 3 && e.socketColors[1] === 0 && e.socketColors[2] === 0 &&
      ((v.bonusIds[2] === 13695 && e.socketCount === 1 && e.socketColors[0] === 14) ||
       (v.bonusIds[2] === 13696 && e.socketCount === 0 && e.socketColors[0] === 0));
    if (plainArmorSlots.has(c.slotType) && c.itemClassId === 4 && Number.isSafeInteger(v.itemLevel) && v.itemLevel > 0 &&
        r?.engine === engine && r.nativeNoItemEffects === true && !r.effects?.length && !r.weapon &&
        !t.setId && !t.setName && !t.crafted && !t.uniqueEquipped && !t.limitCategoryId &&
        e?.status === "verified" && (e.socketCount === 0 || emptySocket) && e.socketBonusId === 0 && e.requiredProfessionId === 0 &&
        stats?.length === 46 && stats.every(Number.isSafeInteger) && supportedAuctionModifiers(v.modifiers ?? [])) {
      // The worker never emits reagent IDs (38–51). Drop level and content
      // tuning can be ignored only with positive evidence from the native resolver.
      const scaling = r.nativeScalingInputsV1;
      const certifiedScaling = !emptySocket && pinned && scaling?.length === 4 &&
        scaling.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647);
      // A legacy stat suffix can carry a different list ID for the exact same
      // ordered DBC operations. Every other bonus keeps its original identity.
      const suffix = r.nativeSuffixProgramV1;
      const verifiedSuffix = certifiedScaling && v.bonusIds.length === 1 && Number.isSafeInteger(v.bonusIds[0]) &&
        v.bonusIds[0] >= 1 && v.bonusIds[0] <= 500 && typeof suffix === "string" && /^[a-f0-9]{64}$/.test(suffix);
      let bonuses: string | number[] = emptySocket ? "empty-waist-socket-v1" : v.bonusIds;
      let appliedEnchant: number | undefined;
      if (verifiedSuffix) {
        // On this DBC the certified two-allocation suffixes below 251 only
        // add secondary ratings. Bare combat consumes their final integer
        // ratings via item_t::total_stats. Direct chest enchants only append
        // their own stats. Both items must carry the same enchant.
        const ratingsOnly = (proofMode === true || !!enchant) && v.bonusIds[0] <= 250 &&
          scaling.every(value => value === 0) && (v.modifiers ?? []).every(m => m.type === 28);
        bonuses = ratingsOnly ? "bare-secondary-suffix-v1" : suffix;
        if (ratingsOnly && enchant) {
          appliedEnchant = enchant;
          enchantedSuffix = true;
        }
      }
      if (option.customization && !appliedEnchant) return;
      const modifiers = (v.modifiers ?? []).filter(m => (m.type < 38 || m.type > 51) &&
        !(certifiedScaling && (m.type === 9 || m.type === 28))).sort((a, b) => a.type - b.type);
      pieces.push([c.slotType, [c.itemId, c.inventoryType, c.itemSubclassId, v.itemLevel, bonuses,
        pinned ? 0 : v.contextId ?? 0, modifiers, certifiedScaling ? scaling : null, stats, ...(appliedEnchant ? [appliedEnchant] : [])]]);
      certified = true;
    } else {
      if (option.customization) return;
      pieces.push([c.slotType, [auctionSelectionEffectKey([option]), v.bonusIds]]);
    }
  }
  if (!certified || (proofMode === "enchanted-suffix" && !enchantedSuffix)) return;
  pieces.sort(([a], [b]) => a.localeCompare(b));
  return "applied-v2:" + createHash("sha256").update(JSON.stringify([auctionMeasurementContract, engine, pieces])).digest("hex");
}

/** For every marked offer any legal completion can buy the cheaper equivalent
 * in the same slot. A shared lot or item identity could invalidate that receipt. */
export function auctionDominatedArmorOptions(options: AuctionGearOption[], loadout: GearLoadoutItem[],
  specId: number, engine: string, bareEquipmentProofs = false, replacements?: Map<string, string>): Set<string> {
  const itemSlots = new Map<number, string>(), lotSlots = new Map<number, string>();
  const recordSlot = (map: Map<number, string>, id: number, slot: string) => {
    const seen = map.get(id);
    map.set(id, seen === undefined || seen === slot ? slot : "multiple");
  };
  for (const item of loadout) recordSlot(itemSlots, item.itemId, item.slotType);
  for (const { candidate, auctionId } of options) {
    recordSlot(itemSlots, candidate.itemId, candidate.slotType);
    recordSlot(lotSlots, auctionId, candidate.slotType);
  }
  // The final tie-break compares sorted option IDs joined by "|". For
  // prefix-free IDs, inserting the same suffix purchases preserves that order.
  const ids = options.map(option => option.id).sort();
  const stableTies = ids.every((id, index) => !id.includes("|") && (!index || !id.startsWith(ids[index - 1])));
  const keyed: Array<[AuctionGearOption, string]> = [], cheapest = new Map<string, AuctionGearOption>();
  for (const option of options) {
    const { candidate, auctionId } = option;
    if (!candidate.eligible || candidate.compatibility.specId !== specId ||
        lotSlots.get(auctionId) !== candidate.slotType || itemSlots.get(candidate.itemId) !== candidate.slotType) continue;
    const keys = new Set([auctionAppliedStatsKey([option], engine)]);
    if (bareEquipmentProofs && (candidate.slotType === "WAIST" ||
        candidate.variants.some(v => v.key === option.variantKey && v.resolution?.nativeSuffixProgramV1)))
      keys.add(auctionAppliedStatsKey([option], engine, true));
    for (const key of keys) {
      if (!key) continue;
      keyed.push([option, key]);
      const best = cheapest.get(key);
      if (!best || option.costCopper < best.costCopper || option.costCopper === best.costCopper && option.id < best.id)
        cheapest.set(key, option);
    }
  }
  const dominated = new Set<string>();
  for (const [option, key] of keyed) {
    const best = cheapest.get(key)!;
    if (option.costCopper > best.costCopper || stableTies && option.id !== best.id) {
      dominated.add(option.id);
      replacements?.set(option.id, best.id);
    }
  }
  return dominated;
}

export type AuctionEffectGroup = { options: AuctionGearOption[] };

// Inclusive bonus-list ranges with the same native suffix name. Each member
// adds only two secondary ratings. verify-rating-suffixes.py checks all rows.
const jewelrySuffixRanges = [
  [19, 39, 13150], [45, 86, 13151], [87, 107, 13152], [108, 128, 13156],
  [129, 149, 13150], [150, 170, 13157], [175, 195, 13156], [196, 216, 13161],
  [217, 237, 13157], [238, 250, 13152], [1676, 1682, 13152], [1683, 1689, 13151],
  [1690, 1696, 13150], [1697, 1703, 13156], [1704, 1710, 13157], [1711, 1717, 13161],
] as const;

/** Bare local jewelry contributes the final integer ratings. Retain the
 * item ID, level and suffix name that other equipment and APLs can observe.
 * Legacy assembly cursors must reproduce their original ring group keys. */
export function bareJewelrySuffixIdentity(option: AuctionGearOption, engine: string, legacyRings = false) {
  const c = option.candidate;
  const ring = c.slotType === "FINGER_1" || c.slotType === "FINGER_2";
  const neck = !legacyRings && c.slotType === "NECK" && c.itemId !== 158075;
  if (option.customization || !(ring && c.inventoryType === 11 || neck && c.inventoryType === 2) ||
      c.itemClassId !== 4 || c.itemSubclassId !== 0 || c.constraints.crafted ||
      c.constraints.setId || c.constraints.setName || !ignoresItemContext(engine)) return;
  const v = c.variants.find(row => row.key === option.variantKey);
  if (!v || !Array.isArray(v.bonusIds) || v.bonusIds.length !== 1 || !Number.isSafeInteger(v.bonusIds[0]) ||
      !Number.isSafeInteger(v.itemLevel) || v.itemLevel <= 0 || !validAuctionItemContext(v.contextId) ||
      !supportedAuctionModifiers(v.modifiers ?? []) || v.modifiers?.some(m => m.type !== 28)) return;
  const id = v.bonusIds[0];
  if (legacyRings && id !== 1679 && id !== 1680) return;
  const family = jewelrySuffixRanges.find(([first, last]) => first <= id && id <= last);
  if (!family) return;
  const r = v.resolution, e = r?.enhancements;
  if (!r || r.engine !== engine || r.metadataVersion !== 3 || r.nativeNoItemEffects !== true || r.weapon || r.effects?.length ||
      r.nativeScalingInputsV1?.length !== 4 || !r.nativeScalingInputsV1.every(value => value === 0) ||
      e?.status !== "verified" || e.socketCount !== 0 || e.socketBonusId !== 0 || e.requiredProfessionId !== 0 ||
      e.socketColors?.length !== 3 || !e.socketColors.every(value => value === 0) ||
      r.appliedStatsV1?.length !== 46 || !r.appliedStatsV1.every(Number.isSafeInteger)) return;
  if (legacyRings) return ["bare-ring-suffix-13152", c.itemId, v.itemLevel, v.contextId ?? 0, v.modifiers ?? [], r.appliedStatsV1];
  if (id <= 250 && (typeof r.nativeSuffixProgramV1 !== "string" || !/^[a-f0-9]{64}$/.test(r.nativeSuffixProgramV1))) return;
  return ["bare-jewelry-suffix-v1", family[2], c.itemId, v.itemLevel, v.modifiers ?? [], r.appliedStatsV1];
}

/** 13668 adds the same prismatic socket to either ring. The other list
 * has exactly one level-setting operation and two ignored operations in
 * pinned SimC. The native certificate binds its output to this lot's drop
 * level and tuning. The caller must compare any installed gem and enchant. */
export function auctionSocketedRingCurve(option: AuctionGearOption, engine: string) {
  const c = option.candidate;
  if ((c.slotType !== "FINGER_1" && c.slotType !== "FINGER_2") || c.inventoryType !== 11 ||
      c.itemClassId !== 4 || c.itemSubclassId !== 0 || c.constraints.crafted || c.constraints.setId ||
      c.constraints.setName || !ignoresItemContext(engine)) return;
  const v = c.variants.find(row => row.key === option.variantKey), r = v?.resolution, e = r?.enhancements;
  if (!v || !Array.isArray(v.bonusIds) || v.bonusIds.length !== 2 || v.bonusIds[0] !== 13668 || (v.bonusIds[1] !== 13729 && v.bonusIds[1] !== 13900) ||
      !Number.isSafeInteger(v.itemLevel) || v.itemLevel <= 0 || !validAuctionItemContext(v.contextId) ||
      !supportedAuctionModifiers(v.modifiers ?? []) || v.modifiers?.some(m => m.type !== 9 && m.type !== 28) ||
      verifiedAuctionDropCurve(v.modifiers ?? [], r?.nativeDropCurveV1) !== v.itemLevel) return;
  if (!r || r.engine !== engine || r.metadataVersion !== 3 || r.nativeNoItemEffects !== true || r.weapon || r.effects?.length ||
      e?.status !== "verified" || e.socketCount !== 1 || e.socketBonusId !== 0 || e.requiredProfessionId !== 0 ||
      e.socketColors?.length !== 3 || e.socketColors[0] !== 14 || e.socketColors[1] !== 0 || e.socketColors[2] !== 0 ||
      r.appliedStatsV1?.length !== 46 || !r.appliedStatsV1.every(Number.isSafeInteger)) return;
  return ["socketed-ring-curve-v1", c.itemId, v.itemLevel, r.appliedStatsV1];
}

/** The native curve certificate verifies the raw item level written by the
 * one scaling operation. In 18428cd lists 13729 and 13900 only perform that
 * write. 13730 also writes quality, so retain that ordered program separately.
 * Weapon type, original item ID, level and quality fix the native damage table.
 * The display damage fields alone would lose unrounded weapon DPS. */
export function bareWeaponCurveIdentity(option: AuctionGearOption, engine: string) {
  const c = option.candidate, t = c.constraints;
  if (!ignoresItemContext(engine) || option.customization || c.itemClassId !== 2 ||
      (c.slotType !== "MAIN_HAND" && c.slotType !== "OFF_HAND") ||
      t.crafted || t.setId || t.setName) return;
  const v = c.variants.find(row => row.key === option.variantKey), r = v?.resolution;
  const e = r?.enhancements, w = r?.weapon;
  if (!v || !validAuctionItemContext(v.contextId) || !Number.isSafeInteger(v.itemLevel) || v.itemLevel <= 0 ||
      !supportedAuctionModifiers(v.modifiers ?? []) || v.modifiers?.some(m => m.type !== 9 && m.type !== 28) ||
      !r || r.engine !== engine || r.metadataVersion !== 3 || r.nativeNoItemEffects !== true || r.effects?.length ||
      verifiedAuctionDropCurve(v.modifiers ?? [], r.nativeWeaponCurveV1) !== v.itemLevel ||
      e?.status !== "verified" || e.socketCount !== 0 || e.socketColors?.length !== 3 || e.socketColors.some(Boolean) ||
      e.socketBonusId !== 0 || e.requiredProfessionId !== 0 || !w ||
      ![w.minDamage, w.maxDamage, w.dps, w.speedSeconds].every(Number.isFinite) ||
      w.minDamage < 0 || w.maxDamage <= 0 || w.maxDamage < w.minDamage || w.dps <= 0 || w.speedSeconds <= 0 ||
      r.appliedStatsV1?.length !== 46 || !r.appliedStatsV1.every(Number.isSafeInteger)) return;
  const b = v.bonusIds;
  const curveOnly = b?.length === 1 && (b[0] === 13729 || b[0] === 13900);
  if (!curveOnly && !(b?.length === 2 && b[0] === 6652 && b[1] === 13730)) return;
  return ["bare-weapon-curve-v1", c.itemId, c.inventoryType, c.itemSubclassId, v.itemLevel, curveOnly ? 0 : 13730,
    w.minDamage, w.maxDamage, w.dps, w.speedSeconds, r.appliedStatsV1];
}

/** Stable across lot refreshes, but changes when native identity or equip constraints change. */
/** At the pinned revision a positive certificate identifies a single type-51 level
 * write plus constant operations. Preserve the exact item and ordered bonus list,
 * including any quality write. Only drop level and content tuning are equivalent. */
export function bareArmorConstantCurveIdentity(option: AuctionGearOption, engine: string) {
  const c = option.candidate, t = c.constraints;
  if (!ignoresItemContext(engine) || option.customization || c.itemClassId !== 4 || !plainArmorSlots.has(c.slotType) ||
      t.crafted || t.setId || t.setName || t.uniqueEquipped || t.limitCategoryId) return;
  const v = c.variants.find(row => row.key === option.variantKey), r = v?.resolution, e = r?.enhancements;
  if (!v || !Number.isSafeInteger(v.itemLevel) || v.itemLevel <= 0 || !validAuctionItemContext(v.contextId) ||
      !v.bonusIds?.length || !supportedAuctionModifiers(v.modifiers ?? []) ||
      v.modifiers?.some(m => m.type !== 9 && m.type !== 28) ||
      r?.engine !== engine || r.metadataVersion !== 3 || r.nativeNoItemEffects !== true || r.weapon || r.effects?.length ||
      e?.status !== "verified" || e.socketCount !== 0 || e.socketColors?.length !== 3 || e.socketColors.some(Boolean) ||
      e.socketBonusId !== 0 || e.requiredProfessionId !== 0 ||
      verifiedAuctionDropCurve(v.modifiers ?? [], r.nativeArmorCurveV1) !== v.itemLevel ||
      r.appliedStatsV1?.length !== 46 || !r.appliedStatsV1.every(Number.isSafeInteger)) return;
  return ["bare-armor-constant-curve-v1", c.itemId, c.inventoryType, c.itemSubclassId, v.bonusIds, v.itemLevel, r.appliedStatsV1];
}

export function auctionEffectGroupKey(option: AuctionGearOption, engine?: string, craftedSymmetry: boolean | "missive" = false, groupUnusedScaling: boolean | "tuning-cap" | "drop-curve" = false, bareJewelry: boolean | "socket-curve" | "jewelry-suffix" = false, bareWeapon = false, bareArmorConstant = false) {
  const constraints = Object.entries(candidateLoadoutItem(option.candidate))
    .filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b));
  const suffix = bareJewelry && engine ? bareJewelrySuffixIdentity(option, engine, bareJewelry !== "jewelry-suffix") : undefined;
  const curve = typeof bareJewelry === "string" && !option.customization && engine ? auctionSocketedRingCurve(option, engine) : undefined;
  const weapon = bareWeapon && engine ? bareWeaponCurveIdentity(option, engine) : undefined;
  const armor = bareArmorConstant && engine ? bareArmorConstantCurveIdentity(option, engine) : undefined;
  const effect = armor ?? weapon ?? suffix ?? curve ?? auctionSelectionEffectKey([option], option.customization ? undefined : engine, craftedSymmetry, groupUnusedScaling);
  return createHash("sha256").update(JSON.stringify([effect, constraints])).digest("hex");
}

/** Equal simulation effects are grouped only when their equip constraints also agree. */
export function auctionEffectGroups(options: AuctionGearOption[], slots: readonly string[],
  groupKey = auctionEffectGroupKey): AuctionEffectGroup[][] {
  return slots.map(slot => {
    const groups = new Map<string, AuctionEffectGroup>();
    for (const option of options.filter(option => option.candidate.slotType === slot)) {
      const key = groupKey(option);
      const group = groups.get(key) ?? { options: [] };
      group.options.push(option);
      groups.set(key, group);
    }
    return [...groups.values()];
  });
}

type Purchase = { options: AuctionGearOption[]; costCopper: number };
const selectionKey = (options: AuctionGearOption[]) => options.map(option => option.id).sort().join("|");
const preferred = (a: Purchase, b?: Purchase) => !b || a.costCopper < b.costCopper ||
  a.costCopper === b.costCopper && selectionKey(a.options) < selectionKey(b.options);
const bitCount = (value: number) => { let count = 0; for (; value; value &= value - 1) count++; return count; };

/**
 * Allocate actual lots to one effect per slot. An auction can cover several slots
 * up to its quantity and is paid once. Connected components avoid multiplying
 * independent slots; within a component, exact subset DP retains non-greedy lots.
 */
export async function cheapestAuctionEffectSelection(groups: AuctionEffectGroup[], budgetCopper: number,
  signal: AbortSignal): Promise<Purchase | null> {
  signal.throwIfAborted();
  if (groups.length > 16) throw new Error("invalid_equipment_slots");
  type Lot = { mask: number; costCopper: number; quantity: number;
    itemId: number; variantKey: string; options: Map<number, AuctionGearOption> };
  const lots = new Map<number, Lot>();
  for (let index = 0; index < groups.length; index++) for (const option of groups[index].options) {
    const lot = lots.get(option.auctionId) ?? { mask: 0, costCopper: option.costCopper, quantity: option.quantity,
      itemId: option.candidate.itemId, variantKey: option.variantKey, options: new Map() };
    if (lot.costCopper !== option.costCopper || lot.quantity !== option.quantity ||
        lot.itemId !== option.candidate.itemId || lot.variantKey !== option.variantKey) throw new Error("invalid_auction_selection");
    lot.mask |= 1 << index;
    const previous = lot.options.get(index);
    if (!previous || option.id < previous.id) lot.options.set(index, option);
    lots.set(option.auctionId, lot);
  }
  const parents = groups.map((_, index) => index);
  const root = (index: number): number => parents[index] === index ? index : (parents[index] = root(parents[index]));
  const firstIndex = (mask: number) => 31 - Math.clz32(mask & -mask);
  for (const lot of lots.values()) {
    const first = firstIndex(lot.mask);
    for (let remaining = lot.mask & (lot.mask - 1); remaining; remaining &= remaining - 1)
      parents[root(firstIndex(remaining))] = root(first);
  }
  const components = new Map<number, { mask: number; lots: Lot[] }>();
  for (let index = 0; index < groups.length; index++) {
    const key = root(index), component = components.get(key) ?? { mask: 0, lots: [] };
    component.mask |= 1 << index;
    components.set(key, component);
  }
  // A lot cannot cross components after union. Preserve its original order so
  // subset DP, tie decisions and validation remain identical for shared lots.
  for (const lot of lots.values()) components.get(root(firstIndex(lot.mask)))!.lots.push(lot);
  const result: Purchase = { options: [], costCopper: 0 };
  let work = 0;
  for (const { mask: component, lots: componentLots } of components.values()) {
    signal.throwIfAborted();
    if (!(component & (component - 1))) {
      // One independent slot needs only its cheapest feasible lot. Still visit
      // every lot: unsafe costs and cooperative cancellation must not disappear
      // merely because a cheaper option has already been found.
      const index = firstIndex(component);
      let best: Purchase | undefined;
      for (const lot of componentLots) {
        if (++work % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); signal.throwIfAborted(); }
        if (1 > lot.quantity) continue;
        const costCopper = 0 + lot.costCopper;
        if (!Number.isSafeInteger(costCopper)) throw new Error("invalid_budget");
        if (costCopper > budgetCopper - result.costCopper) continue;
        const option = lot.options.get(index)!;
        if (!best || costCopper < best.costCopper || costCopper === best.costCopper && option.id < best.options[0].id)
          best = { options: [option], costCopper };
      }
      if (!best) return null;
      result.options.push(...best.options);
      result.costCopper += best.costCopper;
      continue;
    }
    let states = new Map<number, Purchase>([[0, { options: [], costCopper: 0 }]]);
    for (const lot of componentLots) {
      const next = new Map(states);
      for (const [covered, purchase] of states) {
        const available = lot.mask & component & ~covered;
        for (let subset = available; subset; subset = (subset - 1) & available) {
          if (++work % 256 === 0) { await new Promise<void>(resolve => setImmediate(resolve)); signal.throwIfAborted(); }
          if (bitCount(subset) > lot.quantity) continue;
          const costCopper = purchase.costCopper + lot.costCopper;
          if (!Number.isSafeInteger(costCopper)) {
            // Two valid lot prices can overflow only on an unaffordable branch
            // under the planner's safe-integer budget. Other receipts remain legal.
            if (Number.isSafeInteger(lot.costCopper) && Number.isSafeInteger(budgetCopper) && costCopper > budgetCopper) continue;
            throw new Error("invalid_budget");
          }
          if (costCopper > budgetCopper - result.costCopper) continue;
          const options = [...purchase.options, ...[...lot.options].filter(([index]) => subset & (1 << index)).map(([, option]) => option)];
          const candidate = { options, costCopper }, key = covered | subset;
          if (preferred(candidate, next.get(key))) next.set(key, candidate);
        }
      }
      states = next;
    }
    const best = states.get(component);
    if (!best) return null;
    result.options.push(...best.options);
    result.costCopper += best.costCopper;
  }
  result.options.sort((a, b) => a.candidate.slotType.localeCompare(b.candidate.slotType));
  signal.throwIfAborted();
  return result;
}
