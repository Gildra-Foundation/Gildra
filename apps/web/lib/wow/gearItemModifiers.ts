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
