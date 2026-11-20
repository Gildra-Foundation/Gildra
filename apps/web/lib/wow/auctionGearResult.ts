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
  unresolvedCheaperKey?: string;
  verifiedFor?: AuctionGearObjective[];
  preferredFinalist?: boolean;
  preferredValueFinalist?: boolean;
};
const signature = (purchases: AuctionGearPurchase[]) => JSON.stringify(purchases.map(p => [p.slotType, p.auctionId, p.variantKey]).sort());
const subtotal = (rows: { quotedCopper: number | null }[]) => rows.some(row => row.quotedCopper === null)
  ? null : rows.reduce((sum, row) => sum + row.quotedCopper!, 0);
const significant = (comparison: AuctionGearComparison) => comparison.deltaDps > 0 && comparison.uncertainty.significant;

export function auctionGearResults(assembly: AuctionGearAssemblyResult): AuctionGearResult[] {
  const results: AuctionGearResult[] = [];
  const recheck = assembly.enhancementOptimization?.finalistRecheck;
  const valueKey = assembly.enhancementOptimization?.complete && assembly.enhancementOptimization.traversal === "exhaustive"
    ? assembly.enhancementOptimization.verifiedValueKey : undefined;
  const verifiedObjectives = assembly.enhancementOptimization?.complete && assembly.enhancementOptimization.traversal === "exhaustive"
    ? assembly.enhancementOptimization.verifiedObjectives : undefined;
  const checked = (key: string) => key === verifiedObjectives?.dps || key === verifiedObjectives?.value || key === valueKey || recheck?.keys.includes(key);
  const rechecked = assembly.enhancementOptimization?.recommendations.filter(row => checked(row.configuration.key)) ?? [];
  const preciseKeys = new Map<string, string>();
  const exactEnhancements = assembly.enhancementOptimization?.traversal === "exhaustive";
  for (const plan of [assembly.bestConfirmed, assembly.bestValueConfirmed, assembly.bestDpsConfirmed, assembly]) {
    if (!plan) continue;
    const key = `items:${signature(plan.purchases)}`;
    if (results.some(result => result.key === key)) continue;
    const equipmentTotal = (assembly.enhancementMode === "equipment" || exactEnhancements) && Number.isSafeInteger(plan.spentCopper) &&
      plan.spentCopper >= 0 && plan.spentCopper <= assembly.budgetCopper ? plan.spentCopper : null;
    const refined = rechecked.find(row => !row.configuration.consumables.length && !row.configuration.ownedChanges?.length && signature(row.purchases) === signature(plan.purchases));
    if (refined) preciseKeys.set(refined.configuration.key, key);
    const comparison = refined?.comparison ?? plan.comparison;
    results.push({ key, kind: "items", purchases: plan.purchases, comparison,
      itemsCopper: plan.spentCopper, gemsCopper: equipmentTotal === null ? null : 0, enchantsCopper: equipmentTotal === null ? null : 0,
      totalCopper: equipmentTotal, remainingCopper: equipmentTotal === null ? null : assembly.budgetCopper - equipmentTotal,
      significant: significant(comparison), fullyEnhanced: false, removedSlots: plan.removedSlots });
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
    if (preciseKeys.has(configuration.key)) continue;
    if (checked(configuration.key)) preciseKeys.set(configuration.key, `enhanced:${configuration.key}`);
    if (exactEnhancements && original && configuration.consumables.length === 0 &&
        totalCopper === original.spentCopper && enhancement.comparison.candidateDps === original.comparison.candidateDps) continue;
    results.push({ key: `enhanced:${configuration.key}`, kind: "enhanced", purchases: enhancement.purchases,
      comparison: enhancement.comparison, itemsCopper: configuration.itemsCopper, gemsCopper, enchantsCopper,
      totalCopper, remainingCopper: totalCopper === null ? null : assembly.budgetCopper - totalCopper,
      significant: significant(enhancement.comparison), fullyEnhanced: configuration.fullyEnhanced,
      removedSlots: enhancement.removedSlots ?? original?.removedSlots ?? [], enhancement });
  }
  if (verifiedObjectives) for (const objective of ["dps", "value"] as const) {
    const winner = results.find(result => result.key === preciseKeys.get(verifiedObjectives[objective]));
    if (winner && winner.totalCopper !== null) (winner.verifiedFor ??= []).push(objective);
  }
  const value = valueKey && results.find(row => row.key === preciseKeys.get(valueKey));
  if (value && value.totalCopper !== null && value.significant) value.preferredValueFinalist = true;
  if (recheck) {
    const checkedResult = (key: string) => results.find(row => row.key === preciseKeys.get(key));
    const tied = (recheck.indistinguishableKeys ?? (recheck.significant ? [] : recheck.keys))
      .map(checkedResult).filter((row): row is AuctionGearResult => Boolean(row && row.totalCopper !== null));
    const preferred = recheck.preferredKey ? checkedResult(recheck.preferredKey) :
      [...tied].sort((a, b) => a.totalCopper! - b.totalCopper!)[0];
    if (preferred) {
      if (recheck.preferredKey) preferred.preferredFinalist = true;
      for (const row of tied) if (row.totalCopper! > preferred.totalCopper!) row.unresolvedCheaperKey = preferred.key;
    }
  }
  return results;
}

/** Choose among computed results only; this does not compute a second optimum. */
export function recommendedAuctionGearResult(results: AuctionGearResult[], objective: AuctionGearObjective): AuctionGearResult | undefined {
  const verified = results.find(row => row.verifiedFor?.includes(objective));
  if (verified) return verified;
  if (objective === "value") {
    const value = results.find(row => row.preferredValueFinalist && row.significant && row.totalCopper !== null);
    if (value) return value;
  }
  const preferred = results.find(row => row.preferredFinalist && row.totalCopper !== null);
  if (objective === "dps" && preferred && (preferred.significant || !results.some(row => row.significant))) return preferred;
  const confirmedKeys = new Set(results.filter(row => row.significant).map(row => row.key));
  const priced = results.filter(result => result.significant && result.totalCopper !== null &&
    !(result.unresolvedCheaperKey && confirmedKeys.has(result.unresolvedCheaperKey)));
  const equipment = results.filter(result => result.significant && result.kind === "items");
  // A quick equipment-only result has known item prices but no enhancement
  // quote. Compare its item cost/gain without inventing a fully enhanced total.
  const candidates = priced.length ? priced : objective === "value" && equipment.length ? equipment : results.filter(result => result.significant);
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
  const pool = results.some(row => row.verifiedFor?.length) ? [...results] : priced;
  const value = recommendedAuctionGearResult(pool, "value"), dps = recommendedAuctionGearResult(pool, "dps");
  if (!value?.significant || !dps?.significant || value.key === dps.key || dps.comparison.deltaDps <= value.comparison.deltaDps) return null;
  const loadout = (result: AuctionGearResult) => JSON.stringify([
    result.purchases.map(item => [item.slotType, item.itemId, item.variantKey]).sort(),
    result.enhancement?.configuration.slots.map(slot => [slot.slotType, slot.variantKey, slot.enchantId, slot.gemIds]).sort() ?? [],
  ]);
  return loadout(value) === loadout(dps) ? null : { value, dps };
}
