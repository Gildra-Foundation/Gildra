import { routeSections, type SectionId } from "@/lib/routes/registry";
import { dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { midnightLairEncounters } from "@/lib/data/wow";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import professions from "@/data/wow/professions/index.json";
import { talentSpecThemes } from "@/lib/talentSpecThemes";

/**
 * Sections of the route registry that are not listed: /wow/dungeons answers
 * 308 to the Mythic+ hub, /wow/characters is the visitor's own account page
 * (noindex), and the library is listed only while the catalog is public.
 */
const UNLISTED_SECTIONS: ReadonlySet<SectionId> = new Set(["dungeons", "characters", "library"]);

/**
 * Game-relative static paths listed in /sitemaps/static (both locales, or the
 * one language of a single-language section). Built from the same data as the
 * pages: the route registry, the raid hub, the Mythic+ dungeon routes, the
 * lair encounters and the professions. Boss pages are not listed: each answers 308 to its raid page.
 */
export const staticPaths = ({ catalogPublic = false }: { catalogPublic?: boolean } = {}): string[] => [
  "/",
  ...(Object.keys(routeSections) as SectionId[]).filter((id) => !UNLISTED_SECTIONS.has(id)).map((id) => routeSections[id].path),
  ...(catalogPublic ? [routeSections.library.path] : []),
  ...dungeonSlugs.map((slug) => `/wow/mythic-plus/midnight-season-2/${slug}`),
  ...raidHubEntries.map(({ slug }) => `/wow/raids/${slug}`),
  ...midnightLairEncounters.map(({ slug }) => `/wow/lairs/${slug}`),
  ...professions.map(({ slug }) => `/wow/professions/${slug}`),
  ...talentSpecThemes.map(({ slug }) => `/wow/mythic-plus/leaderboard/${slug}`),
  "/privacy",
];
