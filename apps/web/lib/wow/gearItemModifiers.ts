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

/** Keep the worker's exact options when the pinned parser or modifier validation is unavailable. */
export function auctionNativeItemOptions(item: {contextId?: number; modifiers?: AuctionModifier[]}, engine: string, omitUnusedScaling = false) {
  const { contextId, modifiers } = item;
  if (!validAuctionItemContext(contextId) || !ignoresItemContext(engine) || !supportedAuctionModifiers(modifiers ?? [])) return { contextId, modifiers };
  const native = modifiers?.filter(modifier => (modifier.type < 38 || modifier.type > 51) &&
    !(omitUnusedScaling && (modifier.type === 9 || modifier.type === 28)));
  return { contextId: undefined, modifiers: native?.length ? native : undefined };
}
