import "server-only";
import type { AuctionGearTask } from "./auctionGearJobs";
import { auctionGearAssemblyGoalComplete } from "./auctionGearEnhancementMode";
import { assembleAuctionGearSearch, continueAuctionGearSearch, selectedAuctionGearAssemblyOptions, verifyAuctionGearSearch, type AuctionGearAssemblySelection } from "./auctionGearRunner";
import { getAuctionGearSearch } from "./auctionGearSearchStore";

/** Every completed turn returns to the shared queue. One owned job retains
 * cancellation, identity and durable results across all server continuations;
 * neither its token nor its lifetime is attached to an HTTP request. */
export function fullAuctionGearTask(turn: AuctionGearTask, owner: string, token: string,
  selection?: AuctionGearAssemblySelection): AuctionGearTask {
  return async (signal, progress, hooks) => {
    const turnSignal = AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)]);
    const result = await turn(turnSignal, progress, hooks);
    turnSignal.throwIfAborted();
    if (result.kind === "assembly" && auctionGearAssemblyGoalComplete(result)) return result;
    const entry = getAuctionGearSearch(owner, result.searchId);
    if (!entry) throw new Error("search_expired");
    const acceptedSelection = selection ?? { excludedOptionIds: [...(entry.excludedOptionIds ?? [])],
      excludedVariantKeys: [...(entry.excludedVariantKeys ?? [])] };
    if (result.kind === "search" && result.searchComplete && entry.context.input.enhancementMode !== "enhanced" && !selectedAuctionGearAssemblyOptions(entry, acceptedSelection).length) return result;
    const next: AuctionGearTask = async (nextSignal, nextProgress, nextHooks) => {
      // Keep the existing authoritative freshness checks, exact traversal,
      // native precision and persisted planner checkpoints for every turn.
      await verifyAuctionGearSearch(entry, token, nextSignal);
      nextSignal.throwIfAborted();
      return result.kind === "search" && !result.searchComplete
        ? continueAuctionGearSearch(entry, nextSignal, nextProgress, token, nextHooks.publishResult, true)
        : assembleAuctionGearSearch(entry, acceptedSelection, nextSignal, nextProgress, token, nextHooks.publishResult, true);
    };
    hooks.continueWith(fullAuctionGearTask(next, owner, token, acceptedSelection));
    return result;
  };
}
