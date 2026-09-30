import type { BlockDef } from "../types";
import { containerBlock } from "@/components/blocks/shared/container";
import { columnsBlock } from "@/components/blocks/shared/columns";
import { sectionNavBlock } from "@/components/blocks/shared/sectionNav";
import { adSlotBlock } from "@/components/blocks/shared/adSlot";
import { legalBlock } from "@/components/blocks/shared/legal";

export const sharedRegistry = {
  container: containerBlock,
  columns: columnsBlock,
  sectionNav: sectionNavBlock,
  adSlot: adSlotBlock,
  legal: legalBlock,
} as const satisfies Record<string, BlockDef<any, any, boolean>>;
