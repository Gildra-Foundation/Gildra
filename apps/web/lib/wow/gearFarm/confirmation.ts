import type { GearCandidate } from "../gearCandidates";
import type { GearLoadoutItem } from "../gearCompatibility";
import { compareGearSimulationResults, prepareGearLoadout, type GearSimulationScenario } from "../gearSimulation";
import type { GearPlanSimulation } from "../auctionGearPlanner";
import type { FarmActivity, FarmProgress, FarmTarget } from "./types";

export type FarmSimulationOption = {
  activityId: string;
  target: FarmTarget;
  candidate: GearCandidate;
  variantKey: string;
};
export type FarmSimulation = (prepared: ReturnType<typeof prepareGearLoadout>, signal: AbortSignal) => Promise<GearPlanSimulation>;

/** Compare one obtainable replacement at a time with the unchanged equipped
 * baseline. Gains from separate drops must never be added together. */
export async function confirmFarmImprovements(input: {
  activities: FarmActivity[];
  options: FarmSimulationOption[];
  equipment: Record<string, unknown>;
  loadout: GearLoadoutItem[];
  specId: number;
  characterLevel: number;
  signal: AbortSignal;
  simulate: FarmSimulation;
  onProgress?: (progress: FarmProgress) => void;
  limit?: number;
}) {
  // Every proven reward is checked by default; reward discovery has its own
  // bounded coverage. An explicit caller budget must remain visible as partial.
  if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1)) {
    throw new Error("invalid_simulation_limit");
  }
  const limit = input.limit ?? input.options.length;
  const access = new Map(input.activities.map(activity => [activity.id, activity.access]));
  const options = [...input.options]
    .filter(option => access.get(option.activityId) === "level_condition_met")
    .sort((a, b) => a.target.currentItemLevel - b.target.currentItemLevel ||
      b.candidate.itemLevel - a.candidate.itemLevel || a.candidate.itemId - b.candidate.itemId ||
      a.candidate.slotType.localeCompare(b.candidate.slotType));
  const selected = options.slice(0, limit);
  if (!selected.length) return { simulations: 0, searchLimited: false, engine: "", baselineDps: undefined };
  input.signal.throwIfAborted();
  input.onProgress?.({ phase: "simulating", completed: 0, total: selected.length + 1 });
  const prepare = (option?: FarmSimulationOption) => prepareGearLoadout({
    selections: option ? [{ candidate: option.candidate, variantKey: option.variantKey }] : [],
    equipment: input.equipment, loadout: input.loadout, specId: input.specId,
  });
  const metadataEngines = new Set(selected.map(option => {
    const variant = option.candidate.variants.find(variant => variant.key === option.variantKey);
    if (!variant?.resolution || variant.resolution.requiredLevel > input.characterLevel ||
      variant.itemLevel !== option.target.itemLevel) throw new Error("farm_reward_unverified");
    return variant.resolution.engine;
  }));
  if (metadataEngines.size !== 1) throw new Error("simulation_version_changed");
  const validMeasurement = (result: GearPlanSimulation) => result.confidence === 95 &&
    Number.isFinite(result.dps) && result.dps > 0 && Number.isFinite(result.dpsError) && result.dpsError >= 0 &&
    Number.isSafeInteger(result.iterations) && result.iterations > 0 && result.engine.startsWith("SimulationCraft");
  const baseline = await input.simulate(prepare(), input.signal);
  if (!validMeasurement(baseline)) throw new Error("invalid_simulation_result");
  if (!metadataEngines.has(baseline.engine)) throw new Error("simulation_version_changed");
  let simulations = 1;
  for (const option of selected) {
    input.signal.throwIfAborted();
    input.onProgress?.({ phase: "simulating", completed: simulations, total: selected.length + 1 });
    const result = await input.simulate(prepare(option), input.signal);
    simulations++;
    if (!validMeasurement(result)) {
      throw new Error("invalid_simulation_result");
    }
    if (result.engine !== baseline.engine) throw new Error("simulation_version_changed");
    const comparison = compareGearSimulationResults(baseline, result);
    // A resolved reward with lower/indeterminate performance is a tested
    // non-upgrade. Only a statistically positive result earns upgrade status.
    Object.assign(option.target, {
      verification: comparison.deltaDps > 0 && comparison.uncertainty.significant ? "simulated" : "not_upgrade",
      deltaDps: comparison.deltaDps,
      deltaPercent: comparison.deltaPercent,
      marginPercent: comparison.uncertainty.marginPercent,
    });
  }
  input.onProgress?.({ phase: "simulating", completed: simulations, total: simulations });
  return { simulations, searchLimited: selected.length < options.length, engine: baseline.engine, baselineDps: baseline.dps };
}
export const farmSimulationScenario: GearSimulationScenario = "single-target";
