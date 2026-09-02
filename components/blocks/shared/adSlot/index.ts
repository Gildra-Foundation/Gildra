import { defineBlock } from "@/lib/blocks/types";
import { AdSlot, type AdSlotProps } from "./AdSlot";

export const adSlotBlock = defineBlock<AdSlotProps, undefined>({
  type: "adSlot",
  Component: AdSlot,
  defaults: { variant: "billboard" },
  demo: { props: { variant: "billboard" }, data: undefined },
});
