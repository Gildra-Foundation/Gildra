import type { AuctionItemDetails } from "./auctionItemDetails";
/** Public auction browsing contracts. Prices are copper; a buyout is for the whole lot. */
export const auctionRegions = ["eu", "us", "kr", "tw"] as const;
export type AuctionRegion = typeof auctionRegions[number];
export type AuctionQuery = { region: AuctionRegion; lang: "en" | "ru"; realm: string; market: "realm" | "commodities"; q: string; sort: "price" | "quantity"; page: number };
export type AuctionListing = {
  id: number; itemId: number; quantity: number; unitPrice: number | null; buyout: number | null;
  bid: number | null; timeLeft: string; bonusIds: number[]; context: number; petSpeciesId?: number; petLevel?: number; petBreedId?: number; petQualityId?: number;
  modifiers: { type: number; value: number }[];
};
export type AuctionResult = {
  rows: (AuctionListing & { name: string | null; item?: AuctionItemDetails | null })[]; total: number; page: number; pages: number;
  sourceUpdatedAt: string | null; fetchedAt: string; stale: boolean; connectedRealmId: number | null;
  market: AuctionQuery["market"]; searchTruncated: boolean;
};
export const validAuctionRealm = (value: string) => /^[\p{L}\p{N}][\p{L}\p{N}\p{M}-]{0,79}$/u.test(value);
const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
export function auctionQuery(params: URLSearchParams): AuctionQuery {
  const region = params.get("region") ?? "eu", lang = params.get("lang") ?? "en";
  const market = params.get("market") ?? "realm", sort = params.get("sort") ?? "price";
  const realm = params.get("realm") ?? "", q = (params.get("q") ?? "").trim();
  const rawPage = params.get("page") ?? "1", page = Number(rawPage);
  if (!(auctionRegions as readonly string[]).includes(region) || !["en", "ru"].includes(lang)
    || !["realm", "commodities"].includes(market) || !["price", "quantity"].includes(sort)
    || !/^\d{1,6}$/.test(rawPage) || !positive(page) || page > 100000
    || (realm !== "" && !validAuctionRealm(realm)) || q.length > 100 || /[\u0000-\u001f]/.test(q)
    || (q.length === 1 && !/^\d$/.test(q)) || (/^\d+$/.test(q) && (!positive(Number(q)) || Number(q) > 10000000))) {
    throw new Error("invalid_query");
  }
  return { region, lang, realm, market, q, sort, page } as AuctionQuery;
}
export function parseAuctionListings(payload: unknown, market: AuctionQuery["market"]): AuctionListing[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { auctions?: unknown }).auctions)) throw new Error("invalid_market");
  const seen = new Set<number>();
  return (payload as { auctions: Record<string, unknown>[] }).auctions.map(row => {
    const item = row?.item as Record<string, unknown> | undefined;
    if (!item || !positive(row.id) || !positive(item.id) || !positive(row.quantity) || seen.has(row.id)) throw new Error("invalid_market");
    seen.add(row.id);
    for (const value of [row.buyout, row.bid, row.unit_price]) if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0)) throw new Error("invalid_market");
    if (market === "realm" && !positive(row.buyout) && !positive(row.bid)) throw new Error("invalid_market");
    if (market === "commodities" && !positive(row.unit_price)) throw new Error("invalid_market");
    const bonusIds = item.bonus_lists ?? [], modifiers = item.modifiers ?? [], context = item.context ?? 0;
    if (!Array.isArray(bonusIds) || bonusIds.some(n => !positive(n)) || !Array.isArray(modifiers)
      || !Number.isSafeInteger(context) || Number(context) < 0 || modifiers.some(m => !m || !positive(m.type) || !Number.isSafeInteger(m.value) || m.value < 0)
      || (item.pet_species_id !== undefined && !positive(item.pet_species_id))) throw new Error("invalid_market");
    return {
      id: row.id, itemId: item.id, quantity: row.quantity,
      unitPrice: market === "commodities" ? Number(row.unit_price) : positive(row.buyout) ? row.buyout / row.quantity : null,
      buyout: positive(row.buyout) ? row.buyout : null, bid: positive(row.bid) ? row.bid : null,
      timeLeft: typeof row.time_left === "string" ? row.time_left : "", bonusIds, context: Number(context),
      modifiers, ...(positive(item.pet_species_id) ? { petSpeciesId: item.pet_species_id,
        ...(positive(item.pet_level) ? { petLevel: item.pet_level } : {}),
        ...(positive(item.pet_breed_id) ? { petBreedId: item.pet_breed_id } : {}),
        ...(Number.isSafeInteger(item.pet_quality_id) && Number(item.pet_quality_id) >= 0 ? { petQualityId: Number(item.pet_quality_id) } : {}),
      } : {}),
    };
  });
}
export function auctionPage(rows: AuctionListing[], query: AuctionQuery, itemIds?: Set<number>) {
  const filtered = itemIds ? rows.filter(row => itemIds.has(row.itemId)) : [...rows];
  filtered.sort((a, b) => query.sort === "quantity" ? b.quantity - a.quantity || a.id - b.id
    : (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity) || a.id - b.id);
  const pages = Math.max(1, Math.ceil(filtered.length / 40)), page = Math.min(query.page, pages);
  return { rows: filtered.slice((page - 1) * 40, page * 40), total: filtered.length, page, pages };
}
export function copperParts(copper: number) {
  const value = Math.ceil(copper);
  return { gold: Math.floor(value / 10000), silver: Math.floor(value % 10000 / 100), copper: value % 100 };
}
