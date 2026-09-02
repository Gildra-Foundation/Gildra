/**
 * WoW homepage block list — the executable form of design.md §G. Kept in its
 * own module (no page/registry imports) so other pages can reference its
 * anchors (`sectionNav` with `anchorsFrom: "wow/home"`).
 */
import type { BlockInstance } from "@/lib/blocks/page";
import { ANCHORS } from "@/lib/anchors";

export const homeBlocks: BlockInstance[] = [
  { type: "wow.hero" },
  { type: "sectionNav" },
  {
    type: "container",
    children: [
      { type: "wow.metaPulse" },
      {
        type: "columns",
        props: { layout: "meta", id: ANCHORS.meta, anchor: "Meta" },
        children: [{ type: "wow.mythicMeta" }, { type: "wow.metaTrends" }],
      },
      { type: "adSlot" },
      { type: "wow.raidFeature" },
      { type: "wow.guides" },
      { type: "wow.tierPreview" },
    ],
  },
];
