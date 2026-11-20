import { createHash } from "node:crypto";
import { auctionEffectGroupKey, auctionEffectGroups, cheapestAuctionEffectSelection, type AuctionEffectGroup } from "./auctionGearEffects";
import { auctionNativeItemOptions, ignoresItemContext, validAuctionItemContext } from "./gearItemModifiers";
import { auctionConflictingPurchaseSlot, auctionPlanCost, auctionPlanLoadout } from "./auctionGearPlanner";
import { parseAuctionGearSlots } from "./auctionGearSelection";
import { prepareGearLoadout } from "./gearSimulation";
import type { GearLoadoutItem } from "./gearCompatibility";
import type { AuctionGearOption } from "./auctionGearTypes";

export type AuctionGearEnhancedLoadoutInput = {
  loadout: GearLoadoutItem[];
  engine?: string;
  nativeLotGroups?: 1 | 2 | 3;
  equipment: Record<string, unknown>;
  specId: number;
  options: AuctionGearOption[];
  selectedSlots: readonly string[];
  budgetCopper: number;
};
/** Points to the next complete assignment. Decimal strings keep large domains exact. */
export type AuctionGearEnhancedLoadoutState = {
  version: 2;
  nativeLotGroups?: 1 | 2 | 3;
  inputKey: string;
  cursor: number[];
  exhausted: boolean;
  visited: string;
};
export type AuctionGearEnhancedLoadout = {
  options: AuctionGearOption[];
  loadout: GearLoadoutItem[];
  spentCopper: number;
  remainingCopper: number;
  removedSlots: string[];
};
export type AuctionGearEnhancedLoadoutBatchOptions = {
  /** Includes invalid/over-budget assignments, so an empty batch is still bounded work. */
  maxAssignments: number;
  maxResults: number;
  signal: AbortSignal;
  shouldYield?: () => boolean;
};
export type AuctionGearEnhancedLoadoutBatch = {
  state: AuctionGearEnhancedLoadoutState;
  loadouts: AuctionGearEnhancedLoadout[];
  complete: boolean;
};

const incompatible = new Set([
  "auction_quantity_exceeded", "invalid_auction_selection", "invalid_budget",
  "equipment_slot_locked", "two_hand_offhand_conflict", "duplicate_equipment_slot",
  "unique_equipped_conflict", "offhand_weapon_not_supported", "candidate_slot_mismatch",
  "two_hand_requires_offhand_removal", "simulation_variant_not_found", "unsupported_item_modifiers",
  "invalid_enchant_for_slot", "invalid_gems_for_slot", "equipment_constraints_unverified",
]);

/** Keep different enhancement domains separate even when the bare native change
 * is identical. Socket order matters for the eventual native gem assignment. */
function enhancedGroupKey(option: AuctionGearOption, engine: string | undefined, version?: 1 | 2 | 3, compareFinalists = false) {
  const variant = option.candidate.variants.find(variant => variant.key === option.variantKey)!;
  const metadata = variant.resolution?.enhancements;
  const native = engine && variant.resolution?.engine === engine && variant.resolution.metadataVersion === 3 &&
    metadata?.status === "verified" && validAuctionItemContext(variant.contextId) && !option.customization;
  // With no socket or supplied bonus list, the pinned enchant table cannot
  // introduce a handler for drop level or content tuning (verify-unused-scaling.py).
  const socketless = native && metadata.socketCount === 0 && metadata.socketBonusId === 0 &&
    Array.isArray(metadata.socketColors) && metadata.socketColors.length === 3 && metadata.socketColors.every(color => color === 0);
  // Ordinary prismatic gems and enchants cannot introduce another scaling
  // handler via this DBC's enchantment programs (verify-unused-scaling.py).
  const prismatic = native && Array.isArray(metadata.socketColors) && metadata.socketColors.length === 3 &&
    metadata.socketColors.every(color => color === 0 || color === 14);
  const curve = version === 3 && prismatic && variant.resolution?.nativeDropCurveV1;
  const cap = compareFinalists && prismatic && variant.bonusIds.length > 0 && variant.resolution?.nativeContentTuningV1;
  const scaling = curve ? "drop-curve" : cap ? "tuning-cap" : version !== 1 && !!socketless;
  return JSON.stringify([auctionEffectGroupKey(option, native ? engine : undefined, false, scaling), native ? null : option.variantKey, option.candidate.itemClassId,
    option.customization?.enchantId, variant.itemLevel, variant.resolution?.metadataVersion, metadata?.status,
    ...(metadata?.status === "verified" ? [metadata.socketColors, metadata.socketCount, metadata.socketBonusId,
      metadata.requiredProfessionId, metadata.requiredProfessionRank,
      variant.resolution?.effectsVerified === true && variant.resolution.effects?.length === 0] : [])]);
}

/** Both native scaling handlers read only the resolved cap. This identity
 * is for combat comparisons. Keep every receipt in the traversal so equal-price
 * configurations still use their original tie-break keys. */
export function enhancedFinalistOptionKey(option: AuctionGearOption, engine: string) {
  const variant = option.candidate.variants.find(v => v.key === option.variantKey);
  const resolution = variant?.resolution;
  if (!variant || !resolution?.nativeContentTuningV1 || resolution.engine !== engine || !variant.bonusIds?.length ||
      option.customization || resolution.metadataVersion !== 3 || resolution.enhancements?.status !== "verified") return;
  const colors = resolution.enhancements.socketColors;
  if (colors?.length !== 3 || !colors.every(color => color === 0 || color === 14)) return;
  const native = auctionNativeItemOptions(variant, engine, false, resolution.nativeContentTuningV1);
  if (!("contentTuningCap" in native)) return;
  return enhancedGroupKey(option, engine, 3, true);
}

/** Traverse mechanical equipment choices. Allocate purchasable lots jointly for
 * the selected slots so a multi-piece lot can beat the cheapest individual offers. */
export function createAuctionGearEnhancedLoadoutIterator(input: AuctionGearEnhancedLoadoutInput) {
  const slots = parseAuctionGearSlots(input.selectedSlots);
  if (!Array.isArray(input.options) || !Array.isArray(input.loadout) || !input.equipment || typeof input.equipment !== "object" ||
      Array.isArray(input.equipment) || !Number.isSafeInteger(input.specId) || input.specId <= 0) throw new Error("invalid_auction_selection");
  if (!Number.isSafeInteger(input.budgetCopper) || input.budgetCopper < 0) throw new Error("invalid_budget");
  const ids = new Set<string>();
  const options = input.options.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const option of options) {
    if (typeof option.id !== "string" || !option.id || ids.has(option.id)) throw new Error("invalid_auction_selection");
    ids.add(option.id);
    auctionPlanCost([option]);
  }
  const slotOrder = new Map<string, number>(slots.map((slot, index) => [slot, index]));
  const eligible = options.filter(option => slotOrder.has(option.candidate.slotType) && option.candidate.eligible &&
    option.candidate.compatibility.specId === input.specId && option.candidate.variants.some(variant => variant.key === option.variantKey));
  const engine = input.engine && ignoresItemContext(input.engine) ? input.engine : undefined;
  const version = input.nativeLotGroups ?? 3;
  if (version !== 1 && version !== 2 && version !== 3) throw new Error("invalid_search_checkpoint");
  const groupsVersion = engine ? { nativeLotGroups: version } : {};
  const choices = auctionEffectGroups(eligible, slots, option => enhancedGroupKey(option, engine, groupsVersion.nativeLotGroups));
  // Zero keeps the equipped item (or the empty slot). It also emits the empty
  // purchase set, allowing the caller to process the retained-equipment case.
  const radices = choices.map(rows => rows.length + 1);
  const total = radices.reduce((count, radix) => count * BigInt(radix), 1n);
  const inputKey = createHash("sha256").update(JSON.stringify({ traversal: 3, ...groupsVersion, slots, options, loadout: input.loadout,
    equipment: input.equipment, specId: input.specId, budgetCopper: input.budgetCopper })).digest("hex");
  // Each stride counts the suffix assignments below one choice at this slot.
  let suffixCount = total;
  const strides = radices.map(radix => {
    suffixCount /= BigInt(radix);
    return suffixCount;
  });
  const initialState = (): AuctionGearEnhancedLoadoutState => ({ version: 2, ...groupsVersion, inputKey, cursor: slots.map(() => 0), exhausted: false, visited: "0" });
  const restore = (saved: AuctionGearEnhancedLoadoutState): AuctionGearEnhancedLoadoutState => {
    if (!saved || saved.version !== 2 || saved.inputKey !== inputKey || !Array.isArray(saved.cursor) || saved.cursor.length !== radices.length ||
        saved.cursor.some((index, slot) => !Number.isSafeInteger(index) || index < 0 || index >= radices[slot]) ||
        typeof saved.exhausted !== "boolean" || typeof saved.visited !== "string" || saved.visited.length > total.toString().length ||
        !/^(0|[1-9]\d*)$/.test(saved.visited)) throw new Error("invalid_search_checkpoint");
    const ordinal = saved.cursor.reduce((value, index, slot) => value * BigInt(radices[slot]) + BigInt(index), 0n);
    const visited = BigInt(saved.visited);
    if (saved.exhausted ? visited !== total || ordinal !== 0n : visited !== ordinal || visited >= total) throw new Error("invalid_search_checkpoint");
    return { version: 2, ...groupsVersion, inputKey, cursor: [...saved.cursor], exhausted: saved.exhausted, visited: saved.visited };
  };
  const advance = (state: AuctionGearEnhancedLoadoutState, axis: number) => {
    const visited = BigInt(state.visited);
    if (axis === state.cursor.length - 1) {
      state.visited = (visited + 1n).toString();
    } else {
      const stride = strides[axis];
      state.visited = ((visited / stride + 1n) * stride).toString();
      state.cursor.fill(0, axis + 1);
    }
    for (let slot = axis; slot >= 0; slot--) {
      if (++state.cursor[slot] < radices[slot]) return;
      state.cursor[slot] = 0;
    }
    state.exhausted = true;
  };
  // A physical lot always belongs to one base item. Fall back to joint
  // procurement if the supplied pool breaks that invariant.
  const lotItems = new Map<number, number>();
  let consistentItems = true;
  for (const option of eligible) {
    const prior = lotItems.get(option.auctionId);
    if (prior !== undefined && prior !== option.candidate.itemId) consistentItems = false;
    lotItems.set(option.auctionId, option.candidate.itemId);
  }
  const cheapest = new Map<AuctionEffectGroup, AuctionGearOption>();
  for (const rows of choices) for (const group of rows) {
    const distinctLots = new Set(group.options.map(option => option.auctionId));
    if (distinctLots.size !== group.options.length) consistentItems = false;
    cheapest.set(group, group.options.reduce((a, b) =>
      b.costCopper < a.costCopper || b.costCopper === a.costCopper && b.id < a.id ? b : a));
  }
  async function procure(groups: AuctionEffectGroup[], signal: AbortSignal) {
    if (consistentItems) {
      const selected = groups.map(group => cheapest.get(group)!);
      if (new Set(selected.map(option => option.candidate.itemId)).size === groups.length) {
        let remaining = input.budgetCopper;
        for (const option of selected) {
          if (option.costCopper > remaining) return null;
          remaining -= option.costCopper;
        }
        return { options: selected, costCopper: input.budgetCopper - remaining };
      }
    }
    if (groups.every(group => group.options.length === 1)) {
      const options = groups.map(group => group.options[0]);
      try {
        const costCopper = auctionPlanCost(options);
        return costCopper <= input.budgetCopper ? { options, costCopper } : null;
      } catch (error) {
        if (error instanceof Error && error.message === "auction_quantity_exceeded") return null;
        throw error;
      }
    }
    const purchase = await cheapestAuctionEffectSelection(groups, input.budgetCopper, signal);
    purchase?.options.sort((a, b) => slotOrder.get(a.candidate.slotType)! - slotOrder.get(b.candidate.slotType)!);
    return purchase;
  }
  async function nextBatch(saved: AuctionGearEnhancedLoadoutState, limits: AuctionGearEnhancedLoadoutBatchOptions): Promise<AuctionGearEnhancedLoadoutBatch> {
    limits.signal.throwIfAborted();
    if (!Number.isSafeInteger(limits.maxAssignments) || limits.maxAssignments < 1 ||
        !Number.isSafeInteger(limits.maxResults) || limits.maxResults < 1) throw new Error("invalid_search_limit");
    const state = restore(saved), loadouts: AuctionGearEnhancedLoadout[] = [];
    let assignments = 0;
    while (!state.exhausted && assignments < limits.maxAssignments && loadouts.length < limits.maxResults) {
      limits.signal.throwIfAborted();
      if (limits.shouldYield?.()) break;
      const chosen = state.cursor.flatMap((choice, axis) => choice ? [{ group: choices[axis][choice - 1], axis }] : []);
      let advanceAxis = slots.length - 1;
      try {
        const groups = chosen.map(choice => choice.group);
        const purchase = await procure(groups, limits.signal);
        if (!purchase) {
          // Affordability and supply are monotone: any receipt that satisfies a
          // longer assignment would also satisfy its prefix within budget.
          advanceAxis = chosen.at(-1)!.axis;
          for (let length = 1; length < groups.length; length++) {
            if (!await procure(groups.slice(0, length), limits.signal)) {
              advanceAxis = chosen[length - 1].axis;
              break;
            }
          }
        } else {
          const { options: selected, costCopper: spentCopper } = purchase;
          const loadout = auctionPlanLoadout(input.loadout, selected, input.specId, slots);
          // Match the exact simulator preparation, including unique-item swaps,
          // native variants/customization and removal of a retained off-hand.
          prepareGearLoadout({ selections: selected, equipment: input.equipment, loadout: input.loadout, specId: input.specId });
          loadouts.push({ options: selected, loadout, spentCopper, remainingCopper: input.budgetCopper - spentCopper,
            removedSlots: input.loadout.filter(item => !loadout.some(final => final.slotType === item.slotType)).map(item => item.slotType) });
        }
      } catch (error) {
        if (!(error instanceof Error) || !incompatible.has(error.message)) throw error;
        if (["unique_equipped_conflict", "offhand_weapon_not_supported", "two_hand_offhand_conflict"].includes(error.message)) {
          const conflict = auctionConflictingPurchaseSlot(chosen.map(choice => choice.group.options[0]), input.specId);
          if (conflict) advanceAxis = slotOrder.get(conflict)!;
        }
      }
      advance(state, advanceAxis); assignments++;
      if (assignments % 128 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    }
    limits.signal.throwIfAborted();
    return { state, loadouts, complete: state.exhausted };
  }
  // Completed compatible assignments can be revisited by ordinal without walking
  // the unchanged prefix or materializing the entire equipment domain.
  async function optionIdsAt(ordinal: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!/^(0|[1-9]\d*)$/.test(ordinal) || ordinal.length > total.toString().length || BigInt(ordinal) >= total)
      throw new Error("invalid_search_checkpoint");
    const at = BigInt(ordinal);
    const groups = choices.flatMap((rows, axis) => {
      const index = Number(at / strides[axis] % BigInt(radices[axis]));
      return index ? [rows[index - 1]] : [];
    });
    const purchase = await procure(groups, signal);
    if (!purchase) throw new Error("invalid_search_checkpoint");
    return purchase.options.map(option => option.id);
  }
  let singleAliases: Map<string, AuctionGearOption[]> | undefined;
  function equivalentSingles(id: string) {
    singleAliases ??= new Map(choices.flatMap(axis => axis.flatMap(group =>
      group.options.map(option => [option.id, group.options] as const))));
    return singleAliases.get(id) ?? [];
  }
  return { inputKey, totalAssignments: total.toString(), initialState, nextBatch, optionIdsAt, equivalentSingles };
}
