import type { LiveStats, Season } from "@/data/site";
import type { EmptyProps } from "@/lib/blocks/types";

export type HeroProps = EmptyProps;

export type HeroData = {
  season: Season;
  liveStats: LiveStats;
  patchHighlights: readonly string[];
};
