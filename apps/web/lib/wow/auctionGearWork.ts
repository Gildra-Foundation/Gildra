import "server-only";
import { getAuctionGearJob, getAuctionGearPendingWork, resumeAuctionGearJob, type AuctionGearTask } from "./auctionGearJobs";
import { getAuctionGearSearch, reserveAuctionGearSearch } from "./auctionGearSearchStore";
import { assembleAuctionGearSearch, continueAuctionGearSearch, selectedAuctionGearAssemblyOptions, startAuctionGearSearch, verifyAuctionGearSearch } from "./auctionGearRunner";

/** Reattach interrupted work only after the route authenticates its owner. */
export function resumeOwnedAuctionGearWork(owner: string, id: string, token: string) {
  const work = getAuctionGearPendingWork(owner, id);
  if (!work) return;
  const job = getAuctionGearJob(owner, id)!;
  let release: (() => void) | undefined;
  let task: AuctionGearTask;
  try {
    const searchId = work.action === "search" ? job.searchId : work.searchId;
    if (!searchId && work.action === "search") {
      if (work.input.characterSlug !== job.scope?.characterSlug || work.input.locale !== job.scope.locale) throw new Error("invalid_auction_checkpoint");
      task = (signal, progress, hooks) => startAuctionGearSearch(work.input, owner, token, signal, progress, hooks.searchCreated);
    } else {
      const entry = getAuctionGearSearch(owner, searchId ?? "");
      if (!entry || entry.context.input.characterSlug !== job.scope?.characterSlug || entry.context.input.locale !== job.scope.locale) throw new Error("search_expired");
      const selection = work.action === "assemble" ? work.selection : undefined;
      if (work.action === "assemble") selectedAuctionGearAssemblyOptions(entry, selection);
      release = reserveAuctionGearSearch(entry);
      task = async (signal, progress) => {
        entry.busy = true;
        try {
          await verifyAuctionGearSearch(entry, token, signal);
          return work.action === "assemble" ? await assembleAuctionGearSearch(entry, selection, signal, progress, token)
            : await continueAuctionGearSearch(entry, signal, progress, token);
        } finally { entry.busy = false; }
      };
    }
  } catch (error) {
    // A bad/missing checkpoint becomes an owned terminal failure, not a
    // permanently queued handle or an unverified fresh calculation.
    task = async () => { throw error; };
  }
  try {
    if (!resumeAuctionGearJob(owner, id, task, { onSettled: release })) release?.();
  } catch (error) { release?.(); throw error; }
}
