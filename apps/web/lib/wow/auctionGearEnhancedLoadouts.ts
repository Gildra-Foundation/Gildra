import { createHash } from "node:crypto";
import { auctionPlanCost, auctionPlanLoadout } from "./auctionGearPlanner";
import { parseAuctionGearSlots } from "./auctionGearSelection";
import { prepareGearLoadout } from "./gearSimulation";
import type { GearLoadoutItem } from "./gearCompatibility";
import type { AuctionGearOption } from "./auctionGearTypes";

export type AuctionGearEnhancedLoadoutInput = {
  loadout: GearLoadoutItem[];
  equipment: Record<string, unknown>;
  specId: number;
  options: AuctionGearOption[];
  selectedSlots: readonly string[];
  budgetCopper: number;
};
/** Points to the next complete assignment. Decimal strings keep large domains exact. */
export type AuctionGearEnhancedLoadoutState = {
  version: 1;
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

/** Prepare once per runner turn, then request bounded batches without rebuilding
 * the option pool. Every physical option is retained. A branch can be skipped only when its
 * fixed purchases already exceed the budget. Compatibility uses the final loadout.
 * Inputs must remain unchanged while this iterator is in use. */
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
  const choices = slots.map(slot => options.filter(option => option.candidate.slotType === slot && option.candidate.eligible &&
    option.candidate.compatibility.specId === input.specId && option.candidate.variants.some(variant => variant.key === option.variantKey)));
  // Zero keeps the equipped item (or the empty slot). It also emits the empty
  // purchase set, allowing the caller to process the retained-equipment case.
  const radices = choices.map(rows => rows.length + 1);
  const total = radices.reduce((count, radix) => count * BigInt(radix), 1n);
  const inputKey = createHash("sha256").update(JSON.stringify({ slots, options, loadout: input.loadout,
    equipment: input.equipment, specId: input.specId, budgetCopper: input.budgetCopper })).digest("hex");
  // Each stride counts the suffix assignments below one choice at this slot.
  let suffixCount = total;
  const strides = radices.map(radix => {
    suffixCount /= BigInt(radix);
    return suffixCount;
  });
  const initialState = (): AuctionGearEnhancedLoadoutState => ({ version: 1, inputKey, cursor: slots.map(() => 0), exhausted: false, visited: "0" });
  const restore = (saved: AuctionGearEnhancedLoadoutState): AuctionGearEnhancedLoadoutState => {
    if (!saved || saved.version !== 1 || saved.inputKey !== inputKey || !Array.isArray(saved.cursor) || saved.cursor.length !== radices.length ||
        saved.cursor.some((index, slot) => !Number.isSafeInteger(index) || index < 0 || index >= radices[slot]) ||
        typeof saved.exhausted !== "boolean" || typeof saved.visited !== "string" || saved.visited.length > total.toString().length ||
        !/^(0|[1-9]\d*)$/.test(saved.visited)) throw new Error("invalid_search_checkpoint");
    const ordinal = saved.cursor.reduce((value, index, slot) => value * BigInt(radices[slot]) + BigInt(index), 0n);
    const visited = BigInt(saved.visited);
    if (saved.exhausted ? visited !== total || ordinal !== 0n : visited !== ordinal || visited >= total) throw new Error("invalid_search_checkpoint");
    return { version: 1, inputKey, cursor: [...saved.cursor], exhausted: saved.exhausted, visited: saved.visited };
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
  async function nextBatch(saved: AuctionGearEnhancedLoadoutState, limits: AuctionGearEnhancedLoadoutBatchOptions): Promise<AuctionGearEnhancedLoadoutBatch> {
    limits.signal.throwIfAborted();
    if (!Number.isSafeInteger(limits.maxAssignments) || limits.maxAssignments < 1 ||
        !Number.isSafeInteger(limits.maxResults) || limits.maxResults < 1) throw new Error("invalid_search_limit");
    const state = restore(saved), loadouts: AuctionGearEnhancedLoadout[] = [];
    let assignments = 0;
    while (!state.exhausted && assignments < limits.maxAssignments && loadouts.length < limits.maxResults) {
      limits.signal.throwIfAborted();
      if (limits.shouldYield?.()) break;
      const selected = state.cursor.flatMap((index, slot) => index === 0 ? [] : [choices[slot][index - 1]]);
      let advanceAxis = slots.length - 1;
      try {
        // Whole-lot prices and quantities can be shared by aliases in different
        // slots. Only the complete assignment determines its exact cost.
        const spentCopper = auctionPlanCost(selected);
        if (spentCopper > input.budgetCopper) {
          // auctionPlanCost has validated these aliases. Buying more pieces
          // can reuse a paid lot but cannot make that lot cheaper.
          const paid = new Set<number>();
          let prefixCost = 0;
          for (let axis = 0; axis < advanceAxis; axis++) {
            const index = state.cursor[axis];
            if (!index) continue;
            const option = choices[axis][index - 1];
            if (paid.has(option.auctionId)) continue;
            paid.add(option.auctionId);
            prefixCost += option.costCopper;
            if (prefixCost > input.budgetCopper) {
              advanceAxis = axis;
              break;
            }
          }
        } else {
          const loadout = auctionPlanLoadout(input.loadout, selected, input.specId, slots);
          // Match the exact simulator preparation, including unique-item swaps,
          // native variants/customization and removal of a retained off-hand.
          prepareGearLoadout({ selections: selected, equipment: input.equipment, loadout: input.loadout, specId: input.specId });
          loadouts.push({ options: selected, loadout, spentCopper, remainingCopper: input.budgetCopper - spentCopper,
            removedSlots: input.loadout.filter(item => !loadout.some(final => final.slotType === item.slotType)).map(item => item.slotType) });
        }
      } catch (error) {
        if (!(error instanceof Error) || !incompatible.has(error.message)) throw error;
      }
      advance(state, advanceAxis); assignments++;
      if (assignments % 128 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    }
    limits.signal.throwIfAborted();
    return { state, loadouts, complete: state.exhausted };
  }
  return { inputKey, totalAssignments: total.toString(), initialState, nextBatch };
}
