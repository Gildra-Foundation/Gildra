import { defineBlock, type RenderContext } from "@/lib/blocks/types";
import { ANCHORS } from "@/lib/anchors";
import { featuredGuide, guidesList } from "@/data/site";
import type { GuidesData } from "@/lib/data/source";
import { GuidesSection, type GuidesProps } from "./GuidesSection";

export const guidesBlock = defineBlock<GuidesProps, GuidesData>({
  type: "wow.guides",
  Component: GuidesSection,
  load: (ctx: RenderContext) => ctx.source.guides(),
  anchor: { id: ANCHORS.guides, label: "Guides" },
  demo: { props: {}, data: { featured: featuredGuide, list: guidesList } },
});
