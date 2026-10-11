/**
 * Block lists other pages may reference by id (`sectionNav` with
 * `anchorsFrom: "<page id>"`). Only `*.blocks.ts` modules belong here — they
 * import nothing from the registry, so there is no import cycle. Empty since
 * the block-based WoW homepage was retired (/wow renders WowHome).
 */
import type { BlockInstance } from "./page";

export const PAGE_BLOCKS: Record<string, BlockInstance[]> = {};
