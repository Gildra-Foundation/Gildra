import { defineBlock } from "@/lib/blocks/types";
import { tierTable } from "@/data/site";
import { MetaPulse } from "./MetaPulse";
import { deriveMovers, load } from "./data";
import type { MetaPulseData, MetaPulseProps } from "./schema";

export const metaPulseBlock = defineBlock<MetaPulseProps, MetaPulseData>({
  type: "wow.metaPulse",
  Component: MetaPulse,
  load,
  demo: { props: {}, data: deriveMovers(tierTable) },
});
