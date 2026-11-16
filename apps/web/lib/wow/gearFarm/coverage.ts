import type { GearFarmResult } from "./types";
import { farmCoverageCopy } from "./coverageCopy";

export type FarmCoverageState = "complete" | "partial" | "unverified";

/** Completion of the background job is not proof of complete loot coverage. */
export function farmCoverageState(result: GearFarmResult): FarmCoverageState {
  const unresolved = result.activities.some(activity => activity.variantsUnverified > 0 ||
    activity.targets.some(target => target.verification === "scaling_unverified" ||
      target.verification === "variant_verified" || target.verification === "item_level"));
  // A baseline alone does not constitute an item comparison.
  if (result.coverage.simulations < 2) return "unverified";
  return result.coverage.searchLimited || Boolean(result.coverage.unsupportedSources?.length) || unresolved ? "partial" : "complete";
}

export function farmCoverageMessage(result: GearFarmResult, locale: "en" | "ru"): string | null {
  const state = farmCoverageState(result);
  if (state === "complete") return null;
  return farmCoverageCopy[locale][state];
}
