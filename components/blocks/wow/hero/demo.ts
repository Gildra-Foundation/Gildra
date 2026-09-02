import { liveStats, patchHighlights, season } from "@/data/site";
import type { HeroData, HeroProps } from "./schema";

export const demo: { props: HeroProps; data: HeroData } = {
  props: {},
  data: { season, liveStats, patchHighlights },
};
