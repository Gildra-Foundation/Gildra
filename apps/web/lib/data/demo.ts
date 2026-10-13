/** Demo implementation of DataSource over the static dataset in data/site.ts. */
import {
  builds,
  classChips,
  featuredGuide,
  guidesList,
  liveStats,
  mythicRunnersUp,
  mythicSpotlight,
  mythicTierRows,
  patchHighlights,
  raid,
  season,
  tierTable,
  trends,
} from "@/data/site";
import type { DataSource } from "./source";

export const demoSource: DataSource = {
  season: async () => season,
  liveStats: async () => liveStats,
  patchHighlights: async () => patchHighlights,
  mythicMeta: async () => ({
    spotlight: mythicSpotlight,
    runnersUp: mythicRunnersUp,
    tierRows: mythicTierRows,
  }),
  trends: async () => trends,
  raid: async () => raid,
  tierTable: async () => tierTable,
  classChips: async () => classChips,
  builds: async () => builds,
  guides: async () => ({ featured: featuredGuide, list: guidesList }),
};
