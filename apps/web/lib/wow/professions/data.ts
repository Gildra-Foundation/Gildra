import "server-only";
import { commodityPrices } from "@/lib/wow/auctionBrowserData";
import { getCatalogPage } from "@/lib/api/client";
import { runtimeFlags } from "@/lib/flags";
import type { AuctionRegion } from "@/lib/wow/auctionBrowser";
import index from "@/data/wow/professions/index.json";
import { buyCost, planRoute, professionPriceIds, profitRows, shoppingList } from "./leveling";
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

/** Library record of a game item: hover tooltip and link. */
export type ProfessionRecord = { id: string; slug: string };

/**
 * Library records of the items a profession page shows (reagents, crafted goods), keyed by item id; empty while the
 * library is closed or does not answer — the page then shows plain names.
 */
export async function loadProfessionRecords(data: ProfessionData, lang: "en" | "ru"): Promise<Record<string, ProfessionRecord>> {
  if (!runtimeFlags().catalogPublic) return {};
  const ids = new Set<number>();
  for (const recipe of data.recipes) {
    recipe.reagents.forEach(([id]) => ids.add(id));
    if (recipe.output) ids.add(recipe.output.item);
  }
  const list = [...ids].sort((a, b) => a - b);
  const records: Record<string, ProfessionRecord> = {};
  try {
    const pages = await Promise.all(Array.from({ length: Math.ceil(list.length / 100) }, (_, i) => getCatalogPage({
      externalIds: list.slice(i * 100, i * 100 + 100), type: "item", locale: lang === "ru" ? "ru_RU" : "en_US", limit: 100, timeoutMs: 5000,
    })));
    for (const record of pages.flatMap((page) => page.data)) {
      if (record.externalId) records[record.externalId] = { id: record.id, slug: record.slug ?? "" };
    }
  } catch (error) {
    console.error("profession records unavailable", error instanceof Error ? error.message : error);
  }
  return records;
}

export type ProfessionHubFacts = { slug: string; leveling: number | null; best: { name: { en: string; ru: string }; icon: string | null; value: number; kind: "craft" | "gathered" } | null };

/** Per profession: what 1–max costs at current prices and its most profitable craft (or most valuable gathered good). */
export async function loadProfessionHubFacts(region: ProfessionRegion): Promise<ProfessionHubFacts[]> {
  const all = (await Promise.all(professionSlugs.map(loadProfession))).filter((p): p is ProfessionData => p !== null);
  let prices: ProfessionPrices = {};
  try {
    const ids = [...new Set(all.flatMap((p) => professionPriceIds(p.recipes, p.items, p.gathered)))];
    prices = (await commodityPrices(region, ids)).prices;
  } catch (error) {
    console.error("profession prices unavailable", error instanceof Error ? error.message : error);
  }
  const priced = Object.keys(prices).length > 0;
  return all.map((data) => {
    if (!priced) return { slug: data.slug, leveling: null, best: null };
    let leveling: number | null = null;
    if (data.kind !== "gathering" && data.recipes.length > 3) {
      const route = planRoute(data.recipes, data.items, prices);
      if (route.reached >= data.maxSkill && route.steps.length) {
        leveling = shoppingList(route.steps, data.items, prices).reduce((sum, entry) => sum + (buyCost(entry, entry.qty, data.items, prices)?.total ?? 0), route.trainingCost);
      }
    }
    const top = profitRows(data.recipes, data.items, prices).find((row) => row.margin > 0);
    let best: ProfessionHubFacts["best"] = top ? { name: top.recipe.name, icon: data.items[top.output]?.icon ?? data.items[top.recipe.output?.item ?? 0]?.icon ?? null, value: top.margin, kind: "craft" } : null;
    if (!best && data.gathered?.length) {
      for (const id of data.gathered) for (const rank of data.items[id]?.ranks ?? [id]) {
        const price = prices[rank]?.min;
        if (price && (!best || price > best.value)) best = { name: data.items[id].name, icon: data.items[id].icon, value: price, kind: "gathered" };
      }
    }
    return { slug: data.slug, leveling, best };
  });
}
