import { defineBlock } from "@/lib/blocks/types";
import { ANCHORS } from "@/lib/anchors";
import { Hero } from "./Hero";
import { load } from "./data";
import { demo } from "./demo";
import type { HeroData, HeroProps } from "./schema";

export const heroBlock = defineBlock<HeroProps, HeroData>({
  type: "wow.hero",
  Component: Hero,
  load,
  // Target only (empty label): SectionNav's season link scrolls here.
  anchor: { id: ANCHORS.overview, label: "" },
  demo: { ...demo, layout: "full" },
});
