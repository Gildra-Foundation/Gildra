import { defineBlock } from "@/lib/blocks/types";
import { builds, guidesList, liveStats, season } from "@/data/site";
import { specPages } from "@/lib/specs";
import { SpecBody } from "./SpecBody";
import { deriveSpecBody, load } from "./data";
import type { SpecBodyData, SpecBodyProps } from "./schema";

export const specBodyBlock = defineBlock<SpecBodyProps, SpecBodyData>({
  type: "wow.specBody",
  Component: SpecBody,
  load,
  demo: {
    props: { slug: specPages[0].slug },
    data: deriveSpecBody(specPages[0], builds, guidesList, season, liveStats),
  },
});
