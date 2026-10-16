import "server-only";
import { getAuctionGearSearch } from "./auctionGearSearchStore";
import { getActiveAuctionGearJob } from "./auctionGearJobs";

/** Restore only public DTOs owned by the authenticated caller, never context. */
export function recoverAuctionGearSearch(owner: string, searchId: string, characterSlug: string, locale: "en" | "ru") {
  const entry = getAuctionGearSearch(owner, searchId);
  if (!entry || entry.context.input.characterSlug !== characterSlug || entry.context.input.locale !== locale || !entry.latestSearchResult) return null;
  const { context } = entry;
  return {
    kind: "recovery" as const,
    search: { market: context.publicMarket, profileFingerprint: context.profileFingerprint,
      scenario: context.input.scenario, coverage: context.coverage, ...entry.latestSearchResult },
    assembly: entry.latestAssemblyResult ?? null,
    excludedOptionIds: [...(entry.excludedOptionIds ?? [])],
    activeJob: getActiveAuctionGearJob(owner, searchId),
    // Recovery does not contact Blizzard or run a simulation. A subsequent
    // resume/assembly verifies the mechanical snapshot and current market.
    needsRefresh: true as const,
  };
}
