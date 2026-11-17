import type { AuctionGearAssemblyResult } from "./auctionGearTypes";

export type AuctionGearEnhancementMode = "equipment" | "enhanced";

/** Missing fields retain the pre-mode enhancement behavior of saved searches. */
export function parseAuctionGearEnhancementMode(value: unknown): AuctionGearEnhancementMode {
  if (value === undefined) return "enhanced";
  if (value !== "equipment" && value !== "enhanced") throw new Error("invalid_plan_request");
  return value;
}

/** Stage completion is terminal even when exact enhancement data is unavailable;
 * the stage status and searchLimited flag retain that distinction for the UI. */
export function auctionGearAssemblyGoalComplete(result: Pick<AuctionGearAssemblyResult,
  "exhaustiveComplete" | "scenarioComparisonsComplete" | "enhancementOptimization" | "enhancementMode">): boolean {
  return result.exhaustiveComplete && result.scenarioComparisonsComplete !== false &&
    (result.enhancementMode === "equipment" || (result.enhancementMode === "enhanced"
      ? result.enhancementOptimization?.complete === true : result.enhancementOptimization?.complete !== false));
}
