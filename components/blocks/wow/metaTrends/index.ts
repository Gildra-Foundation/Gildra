import { defineBlock, type RenderContext } from "@/lib/blocks/types";
import { trends } from "@/data/site";
import { MetaTrends, type MetaTrendsData, type MetaTrendsProps } from "./MetaTrends";

export const metaTrendsBlock = defineBlock<MetaTrendsProps, MetaTrendsData>({
  type: "wow.metaTrends",
  Component: MetaTrends,
  load: async (ctx: RenderContext) => ({ trends: await ctx.source.trends() }),
  demo: { props: {}, data: { trends } },
});
