export type AuctionModifier = {
  type: number;
  value: number;
};
// Official SimC add-on core.lua item exporter: 9 drop_level, 28 content_tuning,
// 29/30 crafted_stats, 64 redirected_base_stats. Reagent identities 38..51 do
// not independently change stats; their applied effects are in the bonus list.
export function supportedAuctionModifiers(modifiers: AuctionModifier[]) {
  if (!Array.isArray(modifiers) || modifiers.some(m => !m || typeof m !== "object")) return false;
  if (modifiers.length > 24 || new Set(modifiers.map(m => m.type)).size !== modifiers.length) return false;
  return modifiers.every(m => Number.isSafeInteger(m.type) && Number.isSafeInteger(m.value) && m.value >= 0 && m.value <= 10_000_000 && (m.type === 9 ? m.value >= 1 && m.value <= 90 : m.type === 28 || m.type === 64 ? m.value > 0 : m.type === 29 || m.type === 30 ? [32, 36, 40, 49].includes(m.value) : m.type >= 38 && m.type <= 51));
}

// The pinned SimC item parser stores context in a discarded local variable.
export const ignoresItemContext = (engine: string) => / · 18428cd(?:3902412abc8ee274d19567d603e674e66)?$/.test(engine);

export function validAuctionItemContext(contextId?: number) {
  return contextId === undefined || Number.isSafeInteger(contextId) && contextId >= 0 && contextId <= 10_000;
}

const jewelrySlots = new Set(["FINGER_1", "FINGER_2", "NECK", "finger1", "finger2", "neck"]);

/** Local SimC items apply these missives before decode_stats reads crafted_stats.
 * Each of their two type-25 operations replaces every occurrence of one remaining
 * placeholder. There are only two placeholder types, and no pinned bonus adds
 * either back. The paired rank markers below each contain just one type-0 no-op. */
export function auctionMissiveComparison(item: { bonusIds?: number[]; modifiers?: AuctionModifier[]; contextId?: number },
  slot: string, engine: string, physicalArmor = false) {
  const bonuses = item.bonusIds;
  const jewelry = jewelrySlots.has(slot);
  if ((!jewelry && !physicalArmor) || !Array.isArray(bonuses) || !bonuses.some(id => id >= 8790 && id <= 8795) ||
      !ignoresItemContext(engine) || !validAuctionItemContext(item.contextId) || !supportedAuctionModifiers(item.modifiers ?? [])) return;
  if (bonuses.length > 20 || bonuses.some(id => !Number.isInteger(id) || id <= 0 || id > 1_000_000) ||
      new Set(bonuses).size !== bonuses.length) return;
  // The armor proof keeps every physical bonus ID; only the already consumed
  // crafting placeholders are irrelevant to that measurement.
  const rankMarkers = jewelry ? bonuses.map(id => id === 10395 ? 10394 : id === 10833 ? 10832 : id) : bonuses;
  if (new Set(rankMarkers).size !== rankMarkers.length) return;
  return {
    bonusIds: rankMarkers,
    modifiers: item.modifiers?.filter(m => m.type !== 29 && m.type !== 30),
  };
}

export function verifiedAuctionDropCurve(modifiers: readonly AuctionModifier[], proof?: readonly number[]) {
  return Array.isArray(proof) && proof.length === 3 && Number.isSafeInteger(proof[2]) && proof[2] > 0 && proof[2] <= 2147483647 &&
    modifiers.some(m => m.type === 9 && m.value === proof[0]) &&
    (modifiers.find(m => m.type === 28)?.value ?? 0) === proof[1] ? proof[2] : undefined;
}

/** Keep the worker's exact options when the pinned parser or modifier validation is unavailable. */
export function auctionNativeItemOptions(item: {contextId?: number; modifiers?: AuctionModifier[]}, engine: string, omitUnusedScaling = false, tuning?: readonly number[], curve?: readonly number[]) {
  const { contextId, modifiers } = item;
  if (!validAuctionItemContext(contextId) || !ignoresItemContext(engine) || !supportedAuctionModifiers(modifiers ?? [])) return { contextId, modifiers };
  // Both content_tuning branches in the pinned apply_item_bonus use only
  // max_level_squish. Leave the drop level and every other modifier intact.
  const curveLevel = verifiedAuctionDropCurve(modifiers ?? [], curve);
  const cap = curveLevel === undefined && !omitUnusedScaling && tuning?.length === 2 && Number.isSafeInteger(tuning[1]) &&
    tuning[1] >= 0 && tuning[1] <= 2147483647 && modifiers?.some(m => m.type === 28 && m.value === tuning[0])
    ? tuning[1] : undefined;
  const native = modifiers?.filter(modifier => (modifier.type < 38 || modifier.type > 51) &&
    !((omitUnusedScaling || curveLevel !== undefined) && (modifier.type === 9 || modifier.type === 28)) &&
    !(cap !== undefined && modifier.type === 28));
  return { contextId: undefined, modifiers: native?.length ? native : undefined,
    ...(cap !== undefined ? { contentTuningCap: cap } : {}), ...(curveLevel !== undefined ? { dropCurveLevel: curveLevel } : {}) };
}
