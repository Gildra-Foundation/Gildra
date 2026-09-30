/**
 * WoW homepage block list — the executable form of design.md §G. Kept in its
 * own module (no page/registry imports) so other pages can reference its
 * anchors (`sectionNav` with `anchorsFrom: "wow/home"`).
 */
import type { BlockInstance } from "@/lib/blocks/page";

export const homeBlocks: BlockInstance[] = [
  { type: "wow.hero" },
  { type: "sectionNav" },
  {
    type: "container",
    children: [
      { type: "wow.quickLaunch" },
      { type: "adSlot" },
      { type: "wow.raidFeature" },
      { type: "wow.guides" },
    ],
  },
];
