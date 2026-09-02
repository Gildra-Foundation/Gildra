/**
 * Block lists other pages may reference by id (e.g. SectionNav on /tier-lists
 * shows the homepage anchors). Only `*.blocks.ts` modules belong here — they
 * import nothing from the registry, so there is no import cycle.
 */
import type { BlockInstance } from "./page";
import { homeBlocks } from "@/lib/games/wow/pages/home.blocks";

export const PAGE_BLOCKS: Record<string, BlockInstance[]> = {
  "wow/home": homeBlocks,
};
