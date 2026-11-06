import "server-only";
import { commodityPrices } from "@/lib/wow/auctionBrowserData";
import type { AuctionRegion } from "@/lib/wow/auctionBrowser";
import index from "@/data/wow/professions/index.json";
import { professionPriceIds } from "./leveling";
import type { ProfessionData, ProfessionPrices, ProfessionSummary } from "./types";

export const professionList = index as ProfessionSummary[];
export const professionSlugs = professionList.map((profession) => profession.slug);

const loaders: Record<string, () => Promise<{ default: unknown }>> = {
  alchemy: () => import("@/data/wow/professions/alchemy.json"),
  blacksmithing: () => import("@/data/wow/professions/blacksmithing.json"),
  enchanting: () => import("@/data/wow/professions/enchanting.json"),
  engineering: () => import("@/data/wow/professions/engineering.json"),
  inscription: () => import("@/data/wow/professions/inscription.json"),
  jewelcrafting: () => import("@/data/wow/professions/jewelcrafting.json"),
  leatherworking: () => import("@/data/wow/professions/leatherworking.json"),
  tailoring: () => import("@/data/wow/professions/tailoring.json"),
  herbalism: () => import("@/data/wow/professions/herbalism.json"),
  mining: () => import("@/data/wow/professions/mining.json"),
  skinning: () => import("@/data/wow/professions/skinning.json"),
  cooking: () => import("@/data/wow/professions/cooking.json"),
  fishing: () => import("@/data/wow/professions/fishing.json"),
};

export async function loadProfession(slug: string): Promise<ProfessionData | null> {
  const load = loaders[slug];
  return load ? (await load()).default as ProfessionData : null;
}

export const PROFESSION_REGIONS = ["eu", "us"] as const satisfies readonly AuctionRegion[];
export type ProfessionRegion = typeof PROFESSION_REGIONS[number];
export const professionRegion = (value: unknown): ProfessionRegion =>
  value === "us" ? "us" : "eu";

/** Current commodity prices of everything the page needs; empty when the auction house cannot be read now. */
export async function loadProfessionPrices(data: ProfessionData, region: ProfessionRegion): Promise<{ prices: ProfessionPrices; updatedAt: string | null }> {
  try {
    const result = await commodityPrices(region, professionPriceIds(data.recipes, data.items, data.gathered));
    return { prices: result.prices, updatedAt: result.sourceUpdatedAt };
  } catch (error) {
    console.error("profession prices unavailable", error instanceof Error ? error.message : error);
    return { prices: {}, updatedAt: null };
  }
}
