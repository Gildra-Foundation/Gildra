/** Browser progress belongs to the exact character snapshot and computed loadout. */
export function auctionShoppingProgressKey(characterSlug: string, snapshotKey: string, recommendationKey: string) {
  return `gildra:auction-shopping:${JSON.stringify([characterSlug, snapshotKey, recommendationKey])}`;
}
export function parseAuctionShoppingProgress(raw: string | null, allowedKeys: readonly string[]): Set<string> {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("purchasedKeys" in value) ||
      !Array.isArray(value.purchasedKeys) || value.purchasedKeys.length > 100) return new Set();
    const allowed = new Set(allowedKeys);
    return new Set(value.purchasedKeys.filter((key): key is string => typeof key === "string" && allowed.has(key)));
  } catch { return new Set(); }
}
