/**
 * Data contract consumed by block `data.ts` loaders. Blocks never import
 * `data/site.ts` or `lib/api/*` directly — they ask `ctx.source`, so the demo
 * dataset and the live API are interchangeable implementations.
 */
import type {
  Build,
  ClassChip,
  FeaturedGuide,
  GuideItem,
  LiveStats,
  MythicSpotlight,
  MythicTierRow,
  Raid,
  RunnerUp,
  Season,
  TierGroup,
  Trend,
} from "@/data/site";

export type MythicMetaData = {
  spotlight: MythicSpotlight;
  runnersUp: readonly RunnerUp[];
  tierRows: readonly MythicTierRow[];
};

export type GuidesData = {
  featured: FeaturedGuide;
  list: readonly GuideItem[];
};

export interface DataSource {
  season(): Promise<Season>;
  liveStats(): Promise<LiveStats>;
  patchHighlights(): Promise<readonly string[]>;
  mythicMeta(): Promise<MythicMetaData>;
  trends(): Promise<readonly Trend[]>;
  raid(): Promise<Raid>;
  tierTable(): Promise<readonly TierGroup[]>;
  classChips(): Promise<readonly ClassChip[]>;
  builds(): Promise<readonly Build[]>;
  guides(): Promise<GuidesData>;
}
