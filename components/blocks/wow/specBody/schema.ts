import type { Build, GuideItem, LiveStats, Season } from "@/data/site";
import type { SpecPage } from "@/lib/specs";

export type SpecBodyProps = {
  /** Spec page slug ("frost-death-knight"). */
  slug: string;
};

export type SpecBodyData = {
  page: SpecPage;
  season: Season;
  liveStats: LiveStats;
  builds: readonly Build[];
  guides: readonly GuideItem[];
  /** Total number of spec pages (for the rank bar). */
  total: number;
  /** Best values across all spec pages — bars are honest relative shares. */
  maxima: { pop: number; key: number; top1: number };
};
