import "server-only";
import { internalApiJson } from "@/lib/api/internal";
import { runtimeFlags } from "@/lib/flags";
import { LEGACY_SOURCES, TIER_MODES, isTierSource, type TierSourceInfo, type TierSourceTabs } from "@/components/blocks/wow/tierWorkspace/tierSourceKeys";

type SourcesResponse = { sources: { id: string; activities: string[]; anyBracket?: boolean; regions?: boolean; status: "live" | "stale" | "empty" }[] };

/** The source tabs /tier-lists offers: every source with a published list, in the API's order.
 *  An API without the sources endpoint gets the tabs every version serves; with the meta API off, none. */
export async function getTierSources(): Promise<TierSourceTabs> {
  if (!runtimeFlags().wowMetaApi) return { tabs: [], ladder: false };
  try {
    const response = await internalApiJson<SourcesResponse>("/v1/meta/wow/tier-list/sources", {
      label: "tier-list sources", timeoutMs: 3_000, next: { revalidate: 300, tags: ["game-intelligence"] },
    });
    const live = response.sources.filter((source) => source.status !== "empty");
    const tabs: TierSourceInfo[] = live
      .filter((source) => isTierSource(source.id) && source.id !== "gildra" && source.id !== "sim" && source.id !== "wowhead")
      .map(({ id, activities, anyBracket, regions }) => ({
        id: id as TierSourceInfo["id"], activities: TIER_MODES.filter((mode) => activities.includes(mode)), anyBracket, regions,
      }));
    // The Blizzard ladder is Gildra's own arena tier: it is the Gildra tab of the arena mode, not a tab of its own.
    return { tabs, ladder: live.some((source) => source.id === "ladder") };
  } catch (error) {
    console.error("tier-list sources unavailable", error);
    return { tabs: LEGACY_SOURCES, ladder: false };
  }
}
