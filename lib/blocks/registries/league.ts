import type { BlockDef } from "../types";
import { sharedRegistry } from "./shared";
import { leagueMainBlock } from "@/components/blocks/league-of-legends/main";
import { leagueHeroBlock } from "@/components/blocks/league-of-legends/hero";
import { championCatalogBlock } from "@/components/blocks/league-of-legends/championCatalog";
import { championDetailBlock } from "@/components/blocks/league-of-legends/championDetail";
import { contentCategoryBlock } from "@/components/blocks/league-of-legends/contentCategory";

export const leagueRegistry = {
  ...sharedRegistry,
  "lol.main": leagueMainBlock,
  "lol.hero": leagueHeroBlock,
  "lol.championCatalog": championCatalogBlock,
  "lol.championDetail": championDetailBlock,
  "lol.contentCategory": contentCategoryBlock,
} as const satisfies Record<string, BlockDef<any, any, boolean>>;
