import "server-only";
import { loadSpecBuilds } from "@/lib/games/wow/classMeta";
import { getMidnightTalentPageData, type TalentCalculatorData } from "@/lib/talentCalculatorData";
import type { PopularBuild } from "@/lib/talentPopularBuilds";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import { decodeWoWTalentLoadout } from "@/lib/wowTalentLoadout";

type Query = Record<string, string | string[] | undefined>;
export type TalentPageLoad = { data: TalentCalculatorData | null; search: string; builds: PopularBuild[] };

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

/**
 * Everything /talents/<spec> needs from the server. The in-game string decides the hero path: a `?build=`
 * of the other path (or one opened without `?hero=`) loads that path's tree, so its points are not dropped.
 */
export async function loadTalentPage(theme: TalentSpecTheme, query: Query, lang: "en" | "ru"): Promise<TalentPageLoad> {
  // The opening build (?build=, ?pvp=, ?returnTo=…) reaches the calculator as a string; it then owns the address.
  const search = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (Array.isArray(value) ? value : value === undefined ? [] : [value]).map((item) => [key, item]))).toString();
  // Top players' builds load next to the trees; without them the calculator simply has no picker.
  const builds = loadSpecBuilds(theme);
  let data: TalentCalculatorData | null = null;
  try {
    data = await getMidnightTalentPageData(theme.slug, Number(first(query.hero)) || undefined, lang);
    const build = first(query.build) ?? first(query.import);
    const heroEntryIndex = build ? decodeWoWTalentLoadout(data, build)?.heroEntryIndex : undefined;
    if (build && heroEntryIndex !== undefined && heroEntryIndex !== data.heroSelectionEntryIndex) {
      const heroId = data.heroPaths?.find((path) => path.entryIndex === heroEntryIndex)?.id
        ?? theme.heroPaths.find((path) => path.id !== data!.heroSubtreeId)?.id;
      if (heroId && heroId !== data.heroSubtreeId) {
        // Switching paths keeps class and spec points in a string that still names the old path but has no
        // points in it: then the requested path stays. Points in the string's own path win over ?hero=.
        const other = await getMidnightTalentPageData(theme.slug, heroId, lang);
        const decoded = decodeWoWTalentLoadout(other, build);
        const bought = new Set(other.trees.hero.nodes.filter((node) => !node.freeNode).map((node) => node.id));
        if (!first(query.hero) || [...(decoded?.ranks.keys() ?? [])].some((id) => bought.has(id))) data = other;
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error(`[talents/${theme.slug}] data load failed`, error);
  }
  return { data, search, builds: data ? await builds : [] };
}
