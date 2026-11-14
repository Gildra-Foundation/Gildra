import { compareGearSimulationResults } from "./gearSimulation";
import type { GearPlanSimulation } from "./auctionGearTypes";
import { parseAuctionGearEncounter, type AuctionGearEncounter } from "./auctionGearScenarios";
export type AuctionGearScenarioComparison<T> = { encounter: AuctionGearEncounter; baseline: GearPlanSimulation;
  candidates: Array<{ finalist: T; simulation: GearPlanSimulation; comparison: ReturnType<typeof compareGearSimulationResults> }> };
/** Caller must include encounter, profile, exact customization and engine in its simulation cache key.
 * This helper deliberately does not reuse the primary encounter's baseline or select a winner. */
export async function evaluateAuctionGearScenarios<T>(finalists: readonly T[], encounters: readonly AuctionGearEncounter[], signal: AbortSignal,
  simulate: (selection: T | null, encounter: AuctionGearEncounter, signal: AbortSignal) => Promise<GearPlanSimulation>,
  options: { shouldYield?: () => boolean; onYield?: () => void; onProgress?: (results: AuctionGearScenarioComparison<T>[]) => void | Promise<void> } = {}) {
  if (!finalists.length || finalists.length > 3 || !encounters.length || encounters.length > 3) throw new Error("invalid_scenario_limit");
  const normalized = encounters.map(parseAuctionGearEncounter);
  if (new Set(normalized.map(e => JSON.stringify(e))).size !== normalized.length) throw new Error("duplicate_scenario");
  const results: AuctionGearScenarioComparison<T>[] = [];
  const yieldRequested = () => {
    if (!options.shouldYield?.()) return false;
    options.onYield?.();
    return true;
  };
  for (const encounter of normalized) {
    signal.throwIfAborted();
    if (yieldRequested()) return results;
    const baseline = await simulate(null, encounter, signal);
    const candidates: AuctionGearScenarioComparison<T>["candidates"] = [];
    results.push({ encounter, baseline, candidates });
    for (const finalist of finalists) {
      signal.throwIfAborted();
      if (yieldRequested()) return results;
      const simulation = await simulate(finalist, encounter, signal);
      signal.throwIfAborted();
      if (simulation.engine !== baseline.engine || simulation.dpsError < 0 || baseline.dpsError < 0 || simulation.confidence !== 95 || baseline.confidence !== 95) throw new Error("invalid_simulation_result");
      candidates.push({ finalist, simulation, comparison: compareGearSimulationResults(baseline, simulation) });
      await options.onProgress?.(results.map(row => ({ ...row, candidates: [...row.candidates] })));
    }
  }
  return results;
}
