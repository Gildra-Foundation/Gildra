/**
 * Block registry — the only place that maps a `type` string to a block.
 * Server-only: block loaders touch the data layer. Client code may import
 * `typeof registry` types via lib/blocks/page.ts.
 *
 * Adding a block: create its folder (copy components/blocks/_template),
 * import its definition here, and it becomes available in every page config.
 * Keys: shared blocks are plain ("columns"), game blocks are "<game>.<name>".
 */
import "server-only";
import type { BlockDef } from "./types";
import { containerBlock } from "@/components/blocks/shared/container";
import { columnsBlock } from "@/components/blocks/shared/columns";
import { sectionNavBlock } from "@/components/blocks/shared/sectionNav";
import { adSlotBlock } from "@/components/blocks/shared/adSlot";
import { legalBlock } from "@/components/blocks/shared/legal";
import { heroBlock } from "@/components/blocks/wow/hero";
import { metaPulseBlock } from "@/components/blocks/wow/metaPulse";
import { mythicMetaBlock } from "@/components/blocks/wow/mythicMeta";
import { metaTrendsBlock } from "@/components/blocks/wow/metaTrends";
import { raidFeatureBlock } from "@/components/blocks/wow/raidFeature";
import { guidesBlock } from "@/components/blocks/wow/guides";
import { tierPreviewBlock } from "@/components/blocks/wow/tierPreview";
import { tierWorkspaceBlock } from "@/components/blocks/wow/tierWorkspace";
import { specBodyBlock } from "@/components/blocks/wow/specBody";
import { leagueMainBlock } from "@/components/blocks/league-of-legends/main";
import { leagueHeroBlock } from "@/components/blocks/league-of-legends/hero";
import { championCatalogBlock } from "@/components/blocks/league-of-legends/championCatalog";
import { championDetailBlock } from "@/components/blocks/league-of-legends/championDetail";
import { contentCategoryBlock } from "@/components/blocks/league-of-legends/contentCategory";

export const registry = {
  container: containerBlock,
  columns: columnsBlock,
  sectionNav: sectionNavBlock,
  adSlot: adSlotBlock,
  legal: legalBlock,
  "wow.hero": heroBlock,
  "wow.metaPulse": metaPulseBlock,
  "wow.mythicMeta": mythicMetaBlock,
  "wow.metaTrends": metaTrendsBlock,
  "wow.raidFeature": raidFeatureBlock,
  "wow.guides": guidesBlock,
  "wow.tierPreview": tierPreviewBlock,
  "wow.tierWorkspace": tierWorkspaceBlock,
  "wow.specBody": specBodyBlock,
  "lol.main": leagueMainBlock,
  "lol.hero": leagueHeroBlock,
  "lol.championCatalog": championCatalogBlock,
  "lol.championDetail": championDetailBlock,
  "lol.contentCategory": contentCategoryBlock,
} as const satisfies Record<string, BlockDef<any, any, boolean>>;

export type Registry = typeof registry;
