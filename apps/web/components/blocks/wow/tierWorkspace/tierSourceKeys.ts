/** Shared by the server loader and the client tabs: which tier-list sources
 *  exist and how one source slice (source × mode × raid difficulty) is keyed. */
import type { TierActivity, TierEntry, TierRole } from "@/lib/platform/games/intelligence";

/** `gildra` is the blended Wowhead + wow.gg list; the others are external sites. */
export type TierSourceId = "gildra" | "mythicstats" | "ugg";
export type ExternalTierSource = Exclude<TierSourceId, "gildra">;
export const TIER_SOURCES: TierSourceId[] = ["gildra", "mythicstats", "ugg"];
/** Raid difficulties a source tab offers; `raid_hero` is the default. */
export const SOURCE_DIFFICULTIES = ["all", "raid_myth", "raid_hero", "raid_normal"];
export const DEFAULT_SOURCE_DIFFICULTY = "raid_hero";

export type SourceSlice = { roles: Record<TierRole, TierEntry[]>; updatedAt: string };
/** Slices rendered on the server, by `sourceKey`. */
export type TierSourceSlices = Record<string, SourceSlice>;

export function isTierSource(value: string | null): value is TierSourceId {
  return Boolean(value && (TIER_SOURCES as string[]).includes(value));
}

/** Mythic+ has no difficulty, so it is left out of the key. */
export function sourceKey(source: ExternalTierSource, activity: TierActivity, difficulty: string) {
  return activity === "raid" ? `${source}|raid|${difficulty}` : `${source}|${activity}`;
}
