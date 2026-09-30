import type { BlockDef } from "../types";
import { sharedRegistry } from "./shared";
import { heroBlock } from "@/components/blocks/wow/hero";
import { metaPulseBlock } from "@/components/blocks/wow/metaPulse";
import { quickLaunchBlock } from "@/components/blocks/wow/quickLaunch";
import { mythicMetaBlock } from "@/components/blocks/wow/mythicMeta";
import { metaTrendsBlock } from "@/components/blocks/wow/metaTrends";
import { raidFeatureBlock } from "@/components/blocks/wow/raidFeature";
import { guidesBlock } from "@/components/blocks/wow/guides";
import { tierPreviewBlock } from "@/components/blocks/wow/tierPreview";
import { tierWorkspaceBlock } from "@/components/blocks/wow/tierWorkspace";
import { specBodyBlock } from "@/components/blocks/wow/specBody";

export const wowRegistry = {
  ...sharedRegistry,
  "wow.hero": heroBlock,
  "wow.metaPulse": metaPulseBlock,
  "wow.quickLaunch": quickLaunchBlock,
  "wow.mythicMeta": mythicMetaBlock,
  "wow.metaTrends": metaTrendsBlock,
  "wow.raidFeature": raidFeatureBlock,
  "wow.guides": guidesBlock,
  "wow.tierPreview": tierPreviewBlock,
  "wow.tierWorkspace": tierWorkspaceBlock,
  "wow.specBody": specBodyBlock,
} as const satisfies Record<string, BlockDef<any, any, boolean>>;
