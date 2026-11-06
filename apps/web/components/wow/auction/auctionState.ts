import { AUCTION_COMPARE_LIMIT, auctionRegions, validAuctionRealm, type AuctionRegion } from "@/lib/wow/auctionBrowser";
import { auctionCategory, type AuctionCategoryKey } from "@/lib/wow/auctionMarketCategories";
import type { AuctionSortKey } from "@/lib/wow/auctionMarketSummary";

/**
 * Everything the Auction House shows lives in the URL, so a view can be shared and Back returns to it:
 * ?region=eu&realm=gordunni&cat=ore | q=… &items=1,2&view=compare&item=1&market=realm&sort=min&dir=asc&all=1
 */
export type AuctionView = {
  region: AuctionRegion; realm: string;
  category: AuctionCategoryKey | ""; q: string;
  items: number[]; compare: boolean;
  item: number | null; itemMarket: "commodities" | "realm";
  sort: AuctionSortKey | ""; dir: "asc" | "desc"; all: boolean;
};
export const DEFAULT_CATEGORY: AuctionCategoryKey = "ore";
export const defaultAuctionView: AuctionView = { region: "eu", realm: "", category: DEFAULT_CATEGORY, q: "", items: [], compare: false, item: null, itemMarket: "commodities", sort: "", dir: "asc", all: false };

const id = (value: string) => /^\d{1,8}$/.test(value) && Number(value) > 0 ? Number(value) : null;

export function readAuctionView(params: URLSearchParams, remembered: { region?: string; realm?: string } = {}): AuctionView {
  const view: AuctionView = { ...defaultAuctionView, items: [] };
  const region = params.get("region") ?? remembered.region ?? "";
  if ((auctionRegions as readonly string[]).includes(region)) view.region = region as AuctionRegion;
  const realm = params.get("realm") ?? (params.has("region") && params.get("region") !== remembered.region ? "" : remembered.realm ?? "");
  if (realm && validAuctionRealm(realm)) view.realm = realm;
  view.q = (params.get("q") ?? "").trim().slice(0, 100);
  const category = auctionCategory(params.get("cat"));
  view.category = category ? category.key : view.q ? "" : DEFAULT_CATEGORY;
  if (category && view.q) view.q = "";
  view.items = [...new Set((params.get("items") ?? "").split(",").map(id).filter((v): v is number => v !== null))].slice(0, AUCTION_COMPARE_LIMIT);
  view.compare = params.get("view") === "compare" && view.items.length > 0;
  view.item = id(params.get("item") ?? "");
  view.itemMarket = params.get("market") === "realm" ? "realm" : "commodities";
  const sort = params.get("sort");
  if (sort === "name" || sort === "min" || sort === "median" || sort === "quantity") view.sort = sort;
  view.dir = params.get("dir") === "desc" ? "desc" : "asc";
  view.all = params.get("all") === "1";
  return view;
}

/** Only what differs from the defaults goes into the address. */
export function writeAuctionView(view: AuctionView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.region !== "eu") params.set("region", view.region);
  if (view.realm) params.set("realm", view.realm);
  if (view.q) params.set("q", view.q);
  else if (view.category && view.category !== DEFAULT_CATEGORY) params.set("cat", view.category);
  if (view.all) params.set("all", "1");
  if (view.sort) { params.set("sort", view.sort); if (view.dir === "desc") params.set("dir", "desc"); }
  if (view.items.length) params.set("items", view.items.join(","));
  if (view.compare && view.items.length) params.set("view", "compare");
  if (view.item) { params.set("item", String(view.item)); if (view.itemMarket === "realm") params.set("market", "realm"); }
  return params;
}

/** Clicking a column: a new column starts with its natural direction, the same column flips. */
export function nextSort(view: Pick<AuctionView, "sort" | "dir">, key: AuctionSortKey): Pick<AuctionView, "sort" | "dir"> {
  if (view.sort === key) return { sort: key, dir: view.dir === "asc" ? "desc" : "asc" };
  return { sort: key, dir: key === "quantity" ? "desc" : "asc" };
}

/** The newest expansion's items: the highest item level present (reagents of one expansion share it). */
export function currentItems<T extends { level: number | null }>(rows: readonly T[]): { rows: T[]; split: boolean } {
  const levels = new Set(rows.map(row => row.level).filter((level): level is number => level !== null && level > 0));
  if (levels.size < 2) return { rows: [...rows], split: false };
  const top = Math.max(...levels);
  return { rows: rows.filter(row => row.level === top), split: true };
}

export function toggleItem(items: readonly number[], itemId: number) {
  return items.includes(itemId) ? items.filter(value => value !== itemId) : items.length >= AUCTION_COMPARE_LIMIT ? [...items] : [...items, itemId];
}
