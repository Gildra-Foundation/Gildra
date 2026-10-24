import "server-only";
import { internalApiJson } from "@/lib/api/internal";
import { runtimeFlags } from "@/lib/flags";
import type { TierActivity, TierEntry, TierRole } from "./intelligence";
import { DEFAULT_SOURCE_DIFFICULTY, sourceKey, type ExternalTierSource, type SourceSlice, type TierSourceSlices } from "@/components/blocks/wow/tierWorkspace/tierSourceKeys";

const ROLES: TierRole[] = ["dps", "healer", "tank"];
/** The slices a source tab opens on: rendered with the page, so switching tabs needs no request. */
const PRELOADED: [ExternalTierSource, TierActivity][] = [["mythicstats", "mythic_plus"], ["ugg", "mythic_plus"], ["ugg", "raid"]];

async function slice(source: ExternalTierSource, activity: TierActivity): Promise<SourceSlice> {
  const snapshots = await Promise.all(ROLES.map((role) => {
    const params = new URLSearchParams({ source, activity, role, limit: "60" });
    if (activity === "raid") params.set("difficulty", DEFAULT_SOURCE_DIFFICULTY);
    return internalApiJson<{ entries: TierEntry[]; updatedAt: string }>(`/v1/meta/wow/tier-list?${params}`, {
      label: `${source} tier list`, timeoutMs: 3_000, next: { revalidate: 300, tags: ["game-intelligence"] },
    });
  }));
  return {
    roles: Object.fromEntries(ROLES.map((role, index) => [role, snapshots[index].entries])) as Record<TierRole, TierEntry[]>,
    updatedAt: snapshots.map((item) => item.updatedAt).sort()[0],
  };
}

/** External source slices of /tier-lists. A source that fails is left out; the tab then loads it in the browser. */
export async function getTierSourceSlices(): Promise<TierSourceSlices> {
  if (!runtimeFlags().wowMetaApi) return {};
  const results = await Promise.all(PRELOADED.map(async ([source, activity]) => {
    try {
      return [[sourceKey(source, activity, DEFAULT_SOURCE_DIFFICULTY), await slice(source, activity)]] as const;
    } catch (error) {
      console.error(`tier source ${source}/${activity} unavailable`, error);
      return [];
    }
  }));
  return Object.fromEntries(results.flat());
}
