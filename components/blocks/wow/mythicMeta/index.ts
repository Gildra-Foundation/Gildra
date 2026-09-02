import { defineBlock } from "@/lib/blocks/types";
import { liveStats, mythicRunnersUp, mythicSpotlight, mythicTierRows } from "@/data/site";
import { MythicMeta } from "./MythicMeta";
import { load } from "./data";
import type { MythicMetaBlockData, MythicMetaProps } from "./schema";

export const mythicMetaBlock = defineBlock<MythicMetaProps, MythicMetaBlockData>({
  type: "wow.mythicMeta",
  Component: MythicMeta,
  load,
  demo: {
    props: {},
    data: { spotlight: mythicSpotlight, runnersUp: mythicRunnersUp, tierRows: mythicTierRows, liveStats },
  },
});
