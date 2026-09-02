import { defineBlock, type RenderContext } from "@/lib/blocks/types";
import { ANCHORS } from "@/lib/anchors";
import { raid } from "@/data/site";
import { RaidFeature, type RaidFeatureData, type RaidFeatureProps } from "./RaidFeature";

export const raidFeatureBlock = defineBlock<RaidFeatureProps, RaidFeatureData>({
  type: "wow.raidFeature",
  Component: RaidFeature,
  load: async (ctx: RenderContext) => ({ raid: await ctx.source.raid() }),
  anchor: { id: ANCHORS.raid, label: "Raid" },
  demo: { props: {}, data: { raid } },
});
