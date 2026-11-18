import type { AuctionEnhancedRecommendation } from "./auctionGearEnhancementStage";
import type { AuctionGearAssemblyResult, AuctionGearComparison, AuctionGearObjective, AuctionGearPurchase } from "./auctionGearTypes";
import { auctionGearEncounterMatches, type AuctionGearEncounter } from "./auctionGearScenarios";
import { parseAuctionGearSlots } from "./auctionGearSelection";
import { parseAuctionGearEnhancementMode, type AuctionGearEnhancementMode } from "./auctionGearEnhancementMode";

export function auctionGearResultMatchesIntent(intent: { budgetGold: string; objective: AuctionGearObjective; selectedSlots: readonly string[]; scenario: string;
  enhancementMode?: AuctionGearEnhancementMode; fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[] }, result: { budgetCopper: number; objective?: AuctionGearObjective;
  enhancementMode?: AuctionGearEnhancementMode; selectedSlots: readonly string[]; scenario: string; fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[] }) {
  const expectedSlots = new Set(intent.selectedSlots), actualSlots = new Set<string>(parseAuctionGearSlots(result.selectedSlots));
  return Number(intent.budgetGold) === result.budgetCopper / 10000 && intent.objective === (result.objective ?? "dps") &&
    parseAuctionGearEnhancementMode(intent.enhancementMode) === parseAuctionGearEnhancementMode(result.enhancementMode) &&
    auctionGearEncounterMatches(intent, result) && expectedSlots.size === actualSlots.size && [...expectedSlots].every(slot => actualSlots.has(slot));
}

/** Every number and purchase in the primary result belongs to this one candidate. */
export type AuctionGearResult = {
  key: string;
  kind: "enhanced" | "items";
  purchases: AuctionGearPurchase[];
  comparison: AuctionGearComparison;
  itemsCopper: number;
  gemsCopper: number | null;
  enchantsCopper: number | null;
  totalCopper: number | null;
  remainingCopper: number | null;
  significant: boolean;
  fullyEnhanced: boolean;
  removedSlots: string[];
  enhancement?: AuctionEnhancedRecommendation;
};
const signature = (purchases: AuctionGearPurchase[]) => JSON.stringify(purchases.map(p => [p.slotType, p.auctionId, p.variantKey]).sort());
const subtotal = (rows: { quotedCopper: number | null }[]) => rows.some(row => row.quotedCopper === null)
  ? null : rows.reduce((sum, row) => sum + row.quotedCopper!, 0);
const significant = (comparison: AuctionGearComparison) => comparison.deltaDps > 0 && comparison.uncertainty.significant;

export function auctionGearResults(assembly: AuctionGearAssemblyResult): AuctionGearResult[] {
  const results: AuctionGearResult[] = [];
  for (const plan of [assembly.bestConfirmed, assembly.bestValueConfirmed, assembly.bestDpsConfirmed, assembly]) {
    if (!plan) continue;
    const key = `items:${signature(plan.purchases)}`;
    if (results.some(result => result.key === key)) continue;
    const equipmentTotal = assembly.enhancementMode === "equipment" && Number.isSafeInteger(plan.spentCopper) &&
      plan.spentCopper >= 0 && plan.spentCopper <= assembly.budgetCopper ? plan.spentCopper : null;
    results.push({ key, kind: "items", purchases: plan.purchases, comparison: plan.comparison,
      itemsCopper: plan.spentCopper, gemsCopper: equipmentTotal === null ? null : 0, enchantsCopper: equipmentTotal === null ? null : 0,
      totalCopper: equipmentTotal, remainingCopper: equipmentTotal === null ? null : assembly.budgetCopper - equipmentTotal,
      significant: significant(plan.comparison), fullyEnhanced: false, removedSlots: plan.removedSlots });
  }
  for (const enhancement of assembly.enhancementOptimization?.recommendations ?? []) {
    const configuration = enhancement.configuration;
    const gemsCopper = subtotal(configuration.consumables.filter(row => row.kind === "gem"));
    const enchantsCopper = subtotal(configuration.consumables.filter(row => row.kind === "enchant"));
    // A partial/unverified quote must never turn into an affordable shopping promise.
    const totalCopper = configuration.status === "priced" && configuration.totalCopper !== null && gemsCopper !== null && enchantsCopper !== null &&
      configuration.totalCopper === configuration.itemsCopper + gemsCopper + enchantsCopper && configuration.totalCopper <= assembly.budgetCopper
      ? configuration.totalCopper : null;
    const original = [assembly.bestConfirmed, assembly.bestValueConfirmed, assembly.bestDpsConfirmed, assembly].find(plan => plan && signature(plan.purchases) === signature(enhancement.purchases));
    results.push({ key: `enhanced:${configuration.key}`, kind: "enhanced", purchases: enhancement.purchases,
      comparison: enhancement.comparison, itemsCopper: configuration.itemsCopper, gemsCopper, enchantsCopper,
      totalCopper, remainingCopper: totalCopper === null ? null : assembly.budgetCopper - totalCopper,
      significant: significant(enhancement.comparison), fullyEnhanced: configuration.fullyEnhanced,
      removedSlots: original?.removedSlots ?? [], enhancement });
  }
  return results;
}

/** Choose among computed results only; this does not compute a second optimum. */
export function recommendedAuctionGearResult(results: AuctionGearResult[], objective: AuctionGearObjective): AuctionGearResult | undefined {
  const verified = results.filter(result => result.significant && result.totalCopper !== null);
  const equipment = results.filter(result => result.significant && result.kind === "items");
  // A quick equipment-only result has known item prices but no enhancement
  // quote. Compare its item cost/gain without inventing a fully enhanced total.
  const candidates = verified.length ? verified : objective === "value" && equipment.length ? equipment : results.filter(result => result.significant);
  return [...(candidates.length ? candidates : results)].sort((a, b) => {
    const aCost = a.kind === "items" ? a.itemsCopper : a.totalCopper;
    const bCost = b.kind === "items" ? b.itemsCopper : b.totalCopper;
    if (objective === "value" && aCost !== null && bCost !== null && a.comparison.deltaDps > 0 && b.comparison.deltaDps > 0) {
      const difference = aCost / a.comparison.deltaDps - bCost / b.comparison.deltaDps;
      if (difference) return difference;
    }
    return b.comparison.deltaDps - a.comparison.deltaDps || Number(b.fullyEnhanced) - Number(a.fullyEnhanced) || a.itemsCopper - b.itemsCopper;
  })[0];
}

/** Two independently ranked, priced, significant choices from this calculation.
 * Unknown totals and extra physical copies never create a second buying promise. */
export function auctionGearLoadoutComparison(results: readonly AuctionGearResult[]): { value: AuctionGearResult; dps: AuctionGearResult } | null {
  const priced = results.filter(result => result.significant && result.totalCopper !== null &&
    Number.isSafeInteger(result.totalCopper) && result.totalCopper >= 0 &&
    Number.isFinite(result.comparison.deltaDps) && result.comparison.deltaDps > 0);
  const value = recommendedAuctionGearResult(priced, "value"), dps = recommendedAuctionGearResult(priced, "dps");
  if (!value || !dps || value.key === dps.key || dps.comparison.deltaDps <= value.comparison.deltaDps) return null;
  const loadout = (result: AuctionGearResult) => JSON.stringify([
    result.purchases.map(item => [item.slotType, item.itemId, item.variantKey]).sort(),
    result.enhancement?.configuration.slots.map(slot => [slot.slotType, slot.variantKey, slot.enchantId, slot.gemIds]).sort() ?? [],
  ]);
  return loadout(value) === loadout(dps) ? null : { value, dps };
}
