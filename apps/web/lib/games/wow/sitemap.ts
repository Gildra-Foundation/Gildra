import { newDungeons, returningDungeonDetails } from "@/components/wow/forever/instanceData";
import { routeSections, type SectionId } from "@/lib/routes/registry";
import { dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { midnightClasses, midnightLairEncounters, midnightSpecializations } from "@/lib/data/wow";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import professions from "@/data/wow/professions/index.json";
import mistsClasses from "@/data/wow/mists/classes.json";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { tierModePaths } from "@/components/blocks/wow/tierWorkspace/tierModes";
import { mapPagePath } from "@/lib/wow/worldMap/bundle";
import { worldMapPages } from "@/lib/wow/worldMap/data.server";

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
 * lair encounters, the professions and the class and specialization pages. Boss pages are not listed: each answers 308 to its raid page.
 */
export const staticPaths = ({ catalogPublic = false }: { catalogPublic?: boolean } = {}): string[] => [
  "/",
  ...(Object.keys(routeSections) as SectionId[]).filter((id) => !UNLISTED_SECTIONS.has(id)).map((id) => routeSections[id].path),
  ...(catalogPublic ? [routeSections.library.path] : []),
  ...tierModePaths().filter((path) => path !== routeSections.tierLists.path),
  ...dungeonSlugs.map((slug) => `/wow/mythic-plus/midnight-season-2/${slug}`),
  ...raidHubEntries.map(({ slug }) => `/wow/raids/${slug}`),
  ...midnightLairEncounters.map(({ slug }) => `/wow/lairs/${slug}`),
  ...professions.map(({ slug }) => `/wow/professions/${slug}`),
  ...[...newDungeons, ...returningDungeonDetails].map(({ slug }) => `/wow/forever/dungeons/${slug}`),
  "/wow/mists", "/wow/mists/talents",
  ...mistsClasses.classes.map(({ slug }) => `/wow/mists/talents/${slug}`),
  ...talentSpecThemes.map(({ slug }) => `/wow/mythic-plus/leaderboard/${slug}`),
  ...midnightClasses.map(({ slug }) => `/wow/classes/${slug}`),
  ...midnightSpecializations.map((spec) => `/wow/classes/${spec.classSlug}/${spec.slug}`),
  ...worldMapPages().map(mapPagePath),
  "/privacy",
];
