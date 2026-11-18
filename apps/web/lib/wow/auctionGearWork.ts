import "server-only";
import { getAuctionGearJob, getAuctionGearPendingWork, resumeAuctionGearJob, type AuctionGearTask } from "./auctionGearJobs";
import { getAuctionGearSearch, reserveAuctionGearSearch } from "./auctionGearSearchStore";
import { assembleAuctionGearSearch, continueAuctionGearSearch, selectedAuctionGearAssemblyOptions, startAuctionGearSearch, verifyAuctionGearSearch } from "./auctionGearRunner";
import { fullAuctionGearTask } from "./auctionGearBackground";

/** Reattach interrupted work only after the route authenticates its owner. */
export function resumeOwnedAuctionGearWork(owner: string, id: string, token: string) {
  const work = getAuctionGearPendingWork(owner, id);
  if (!work) return;
  const job = getAuctionGearJob(owner, id)!;
  let release: (() => void) | undefined;
  let task: AuctionGearTask;
  let clearResult = false;
  try {
    const searchId = work.action === "search" ? job.searchId : work.searchId;
    if (!searchId && work.action === "search") {
      if (work.input.characterSlug !== job.scope?.characterSlug || work.input.locale !== job.scope.locale) throw new Error("invalid_auction_checkpoint");
      task = (signal, progress, hooks) => startAuctionGearSearch(work.input, owner, token, signal, progress, hooks.searchCreated, hooks.publishResult);
    } else {
      const entry = getAuctionGearSearch(owner, searchId ?? "");
      if (!entry || entry.context.input.characterSlug !== job.scope?.characterSlug || entry.context.input.locale !== job.scope.locale) throw new Error("search_expired");
      const selection = work.action === "assemble" ? work.selection : undefined;
      clearResult = entry.metadataRebuildRequired === true;
      if (work.action === "assemble") selectedAuctionGearAssemblyOptions(entry, selection);
      release = reserveAuctionGearSearch(entry);
      task = async (signal, progress, hooks) => {
        entry.busy = true;
        try {
          await verifyAuctionGearSearch(entry, token, signal);
          const result = work.action === "assemble" ? await assembleAuctionGearSearch(entry, selection, signal, progress, token, hooks.publishResult)
            : await continueAuctionGearSearch(entry, signal, progress, token, hooks.publishResult);
          // A parked manual assembly owns its original selected/excluded IDs.
          // Yield the bootstrap turn fairly, then finish that same assembly.
          // Full jobs already requeue through fullAuctionGearTask.
          if (clearResult && work.action === "assemble" && work.runMode !== "full" && result.kind === "search") hooks.continueWith(task);
          return result;
        } finally { entry.busy = false; }
      };
    }
  } catch (error) {
    // A bad/missing checkpoint becomes an owned terminal failure, not a
    // permanently queued handle or an unverified fresh calculation.
    task = async () => { throw error; };
  }
  try {
    if (!resumeAuctionGearJob(owner, id, work.runMode === "full" ? fullAuctionGearTask(task, owner, token, work.action === "assemble" ? work.selection : undefined) : task, { onSettled: release, clearResult })) release?.();
  } catch (error) { release?.(); throw error; }
}
