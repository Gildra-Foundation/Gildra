import "server-only";
import { contentManifest, midnightDelves, midnightLairEncounters } from "@gildra/game-data";

type Words = { en: string | null; ru: string | null };
type Instance = { canonicalSlug: string; season: string; activity: string; names: Words; encounterCount?: number | null; pagePath?: string | null };
type Season = { canonicalSlug: string; names: Words; patch: string; status: string; sourceUrl: string; lastVerifiedAt: string };

/**
 * What is live in the game right now, from the verified content manifest
 * (roadmap item 40): the live season, its raid(s), Mythic+ dungeons, lairs and
 * delves. Null when the manifest has no live season — the hub then shows nothing.
 */
export function liveSeason() {
  const season = (contentManifest.seasons as Season[]).find((entry) => entry.status === "live");
  if (!season) return null;
  const instances = (contentManifest.instances as Instance[]).filter((entry) => entry.season === season.canonicalSlug);
  const of = (activity: string) => instances.filter((entry) => entry.activity === activity);
  return {
    slug: season.canonicalSlug,
    names: season.names,
    patch: season.patch,
    sourceUrl: season.sourceUrl,
    verifiedAt: season.lastVerifiedAt.slice(0, 10),
    raids: of("raid").map((raid) => ({ slug: raid.canonicalSlug, names: raid.names, bosses: raid.encounterCount ?? null, path: raid.pagePath ?? null })),
    dungeons: of("mythic-plus").length,
    lairs: midnightLairEncounters.filter((entry) => entry.season === season.canonicalSlug && entry.kind === "lair").length,
    worldBosses: midnightLairEncounters.filter((entry) => entry.season === season.canonicalSlug && entry.kind === "world-boss").length,
    delves: midnightDelves.filter((delve) => delve.season === season.canonicalSlug).length,
  };
}
