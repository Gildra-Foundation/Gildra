/** Entirely synthetic facts. These fixtures never represent a live character/market. */
export const characterSlug = "eu--synthetic-reliability--synthetic";
export const iconUrl = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#714da0"/><path d="M10 24h28M24 10v28" stroke="white" stroke-width="4"/></svg>').toString("base64");
export const scope = (locale: string) => ({ characterSlug, locale });
export const comparison = (candidateDps: number, significant = true) => ({
  baselineDps: 1000, candidateDps, deltaDps: candidateDps - 1000,
  deltaPercent: (candidateDps - 1000) / 10, confidence: 95,
  uncertainty: { marginDps: significant ? 1 : 400, marginPercent: significant ? .1 : 40, significant },
});
export const market = { snapshotId: "synthetic-reliability-market", region: "eu", realm: "SYNTHETIC FIXTURE",
  connectedRealmId: 1, updatedAt: "2026-10-16T12:00:00.000Z", validatedAt: "2026-10-16T12:00:00.000Z" };
export const coverage = { discoveryComplete: true, dataComplete: true, itemsTotal: 2, itemsScanned: 2,
  itemsDetailed: 2, catalogItemsMissing: 0, catalogUnmatchedItemIds: 0, eligibilityUnverifiedItems: 0,
  supportedModifierLots: 2, unsupportedModifierLots: 0, variantsPending: 0, variantsResolved: 2,
  variantsRejected: 0, referenceItemsVerified: 2, referenceItemsRejected: 0, matchedLots: 2, affordableLots: 2 };
export function item(auctionId: number, slotType: string) {
  return { auctionId, itemId: auctionId + 100000, name: `Synthetic exact item ${auctionId}`, iconUrl,
    quality: 3, slotType, variantKey: `synthetic-exact-${auctionId}`, itemLevel: 100, requiredLevel: 1,
    bonusIds: [70001], contextId: 0, modifiers: [], stats: { strength: 21, crit_rating: 17 },
    effectsVerified: false, lotCostCopper: 10000, quantity: 1,
    currentItem: { itemId: 990000, name: `Synthetic equipped ${slotType}`, iconUrl, slotType, quality: 3,
      itemLevel: 90, requiredLevel: 1, stats: { strength: 10 }, effectsVerified: true, effects: ["Synthetic exact equipped effect"] } };
}
export const ring1 = { ...item(780001, "FINGER_1"), optionId: "synthetic-780001:FINGER_1",
  comparison: comparison(990), evaluation: "not_upgrade" };
export const ring2 = { ...ring1, slotType: "FINGER_2", optionId: "synthetic-780001:FINGER_2" };
export const head = { ...item(780002, "HEAD"), optionId: "synthetic-780002:HEAD",
  comparison: comparison(990), evaluation: "not_upgrade" };
export const wrist = { ...item(780003, "WRIST"), optionId: "synthetic-780003:WRIST",
  comparison: comparison(1050), evaluation: "upgrade" };
export const aliasIds = [ring1.optionId, ring2.optionId];
export const selectedSlots = ["HEAD", "FINGER_1", "FINGER_2", "WRIST"];
export function searchResult() {
  return { kind: "search", searchId: "synthetic-reliability-search", selectedSlots, budgetCopper: 100000000,
    baseline: { dps: 1000, dpsError: .1, confidence: 95, iterations: 1000, engine: "SimulationCraft SYNTHETIC FIXTURE" },
    items: [ring1, ring2, head, wrist], searchComplete: true, discoveryComplete: true, dataComplete: true,
    pendingItems: 0, simulations: 4, engine: "SimulationCraft SYNTHETIC FIXTURE", searchLimited: false,
    optionsConsidered: 4, market, profileFingerprint: "synthetic-stable-profile", scenario: "single-target", coverage };
}
export function assemblyResult({ complete = false, noisyMaximum = false } = {}) {
  const confirmed = { purchases: [item(780001, "FINGER_1"), item(780002, "HEAD")], spentCopper: 20000,
    remainingCopper: 99980000, removedSlots: [], comparison: comparison(1200) };
  return { kind: "assembly", searchId: searchResult().searchId, selectedSlots, budgetCopper: 100000000,
    ...confirmed, ...(noisyMaximum ? { purchases: [item(780003, "WRIST")], spentCopper: 10000,
      remainingCopper: 99990000, comparison: comparison(1250, false) } : {}),
    bestConfirmed: confirmed, engine: "SimulationCraft SYNTHETIC FIXTURE", simulations: 4,
    optionsConsidered: 4, searchLimited: !complete, exhaustiveComplete: complete,
    combinationsChecked: complete ? 12 : 2, validCombinations: complete ? 8 : 2,
    combinationCount: "12", combinationKind: "effects", discoveryComplete: true, dataComplete: true,
    updatedSearch: searchResult(), market, profileFingerprint: "synthetic-stable-profile", scenario: "single-target", coverage,
    marketChange: { removedLots: 0, repricedLots: 0, quantityChangedLots: 0, variantsChangedLots: 0 } };
}
export function completedJob(locale: string, result: ReturnType<typeof searchResult> | ReturnType<typeof assemblyResult>) {
  return { id: `synthetic-${result.kind}-job`, status: "completed", result, progress: null, error: null,
    scope: scope(locale), searchId: result.searchId };
}
export const unavailableDescriptions = /Описание особых эффектов этого варианта недоступно|Special effect description.*unavailable|Special effects.*unavailable/i;
export const unavailableWeapon = /Параметры оружия этого варианта недоступны|Weapon (?:properties|details|stats).*unavailable/i;
