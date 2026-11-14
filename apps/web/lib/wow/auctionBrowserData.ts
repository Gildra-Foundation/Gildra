import "server-only";
import { auctionItemIcon, parseAuctionItemDetails, type AuctionItemDetails } from "./auctionItemDetails";
import { resolveExactAuctionTooltip } from "./auctionExactTooltip";
import { auctionVariantKey } from "./auctionItemVariant";
import { auctionPage, parseAuctionListings, serviceAuctionRealm, validAuctionRealm, type AuctionListing, type AuctionMarketItem, type AuctionMarketQuery, type AuctionMarketView, type AuctionQuery, type AuctionRegion, type AuctionResult } from "./auctionBrowser";
import { auctionCategory, inAuctionCategory, type AuctionCategory } from "./auctionMarketCategories";
import { compactLadder, reagentRanks, summarizeAuctions, type AuctionItemSummary } from "./auctionMarketSummary";

// All caches are process-local, bounded, and share in-flight requests. No user token is used.
type Cached = { value?: unknown; expires: number; pending?: Promise<unknown>; error?: Error };
const globals = globalThis as typeof globalThis & { __auctionBrowser?: Map<string, Cached> };
const cache = globals.__auctionBrowser ??= new Map<string, Cached>();
let active = 0;
async function memo<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const found = cache.get(key);
  if (found?.pending) return found.pending as Promise<T>;
  if (found?.error && found.expires > Date.now()) throw found.error;
  if (found?.value !== undefined && found.expires > Date.now()) return found.value as T;
  if (active >= 12) throw new Error("market_busy");
  if (cache.size >= 1600) {
    const victim = [...cache].find(([, entry]) => !entry.pending)?.[0];
    if (victim) cache.delete(victim);
  }
  const entry: Cached = { expires: 0 };
  active++;
  const pending = load().then(value => { entry.value = value; entry.expires = Date.now() + ttl; return value; })
    .catch(error => { entry.error = error instanceof Error ? error : new Error("upstream_unavailable"); entry.expires = Date.now() + 10000; throw error; }).finally(() => { active--; delete entry.pending; });
  entry.pending = pending;
  cache.set(key, entry);
  return pending;
}
async function readJSON(response: Response, limit = 2 * 1024 * 1024): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 429 ? "rate_limited" : response.status === 404 ? "not_found" : "upstream_unavailable");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("upstream_unavailable");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error("response_too_large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function token(): Promise<string> {
  return memo("oauth", 50 * 60_000, async () => {
    const id = process.env.BATTLENET_CLIENT_ID, secret = process.env.BATTLENET_CLIENT_SECRET;
    if (!id || !secret) throw new Error("not_configured");
    const response = await fetch("https://oauth.battle.net/token", {
      method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const result = await readJSON(response) as { access_token?: string; expires_in?: number };
    if (!result.access_token || !result.expires_in || result.expires_in < 3600) throw new Error("upstream_unavailable");
    return result.access_token;
  });
}
async function blizzard(region: AuctionRegion, path: string, namespace = "dynamic", params = new URLSearchParams(), timeout = 10000) {
  params.set("namespace", `${namespace}-${region}`);
  return fetch(`https://${region}.api.blizzard.com${path}?${params}`, {
    headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout),
  });
}
export async function auctionRealms(region: AuctionRegion, lang: "ru" | "en") {
  return memo(`realms:${region}:${lang}`, 24 * 60 * 60_000, async () => {
    const payload = await readJSON(await blizzard(region, "/data/wow/realm/index", "dynamic", new URLSearchParams({ locale: lang === "ru" ? "ru_RU" : "en_US" }))) as { realms?: { slug: string; name: string | null }[] };
    if (!Array.isArray(payload.realms)) throw new Error("upstream_unavailable");
    // Blizzard includes auxiliary realms with null names and internal realms; they are not public choices.
    const realms = payload.realms.filter((r): r is { slug: string; name: string } => typeof r?.slug === "string" && validAuctionRealm(r.slug) && !serviceAuctionRealm(r.slug) && typeof r.name === "string" && r.name.trim().length > 0);
    if (!realms.length) throw new Error("upstream_unavailable");
    return realms.map(({ slug, name }) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name, lang));
  });
}
async function connectedRealm(query: AuctionQuery) {
  const realms = await auctionRealms(query.region, query.lang);
  if (!realms.some(r => r.slug === query.realm)) throw new Error("invalid_realm");
  return memo(`connected:${query.region}:${query.realm}`, 24 * 60 * 60_000, async () => {
    const payload = await readJSON(await blizzard(query.region, `/data/wow/realm/${encodeURIComponent(query.realm)}`)) as { connected_realm?: { href?: string } };
    const url = new URL(payload.connected_realm?.href ?? "https://invalid.invalid");
    const match = url.pathname.match(/^\/data\/wow\/connected-realm\/(\d+)$/);
    if (url.origin !== `https://${query.region}.api.blizzard.com` || !match) throw new Error("invalid_realm");
    return Number(match[1]);
  });
}
type Snapshot = { rows: AuctionListing[]; sourceUpdatedAt: string | null; fetchedAt: string };
let marketRequests = 0;
async function snapshot(query: AuctionQuery, connectedId: number | null, refresh = false): Promise<Snapshot> {
  // Large snapshots have their own four-entry bound, including requests in flight.
  const key = `market:${query.region}:${connectedId ?? "commodities"}`;
  // Refresh procurement quotes while retaining global in-flight deduplication.
  const existing = cache.get(key);
  if (refresh && existing && !existing.pending) existing.expires = 0;
  if (!cache.has(key)) {
    const markets = [...cache].filter(([id]) => id.startsWith("market:"));
    if (markets.length >= 4) {
      const victim = markets.find(([, entry]) => !entry.pending)?.[0];
      if (!victim) throw new Error("market_busy");
      cache.delete(victim);
    }
  }
  return memo(key, 5 * 60_000, async () => {
    if (marketRequests >= 2) throw new Error("market_busy");
    marketRequests++;
    try {
      const path = connectedId === null ? "/data/wow/auctions/commodities" : `/data/wow/connected-realm/${connectedId}/auctions`;
      const response = await blizzard(query.region, path, "dynamic", new URLSearchParams(), 30000);
      const rawDate = response.headers.get("last-modified"), timestamp = Date.parse(rawDate ?? "");
      const sourceUpdatedAt = Number.isFinite(timestamp) && timestamp <= Date.now() + 5 * 60_000 ? new Date(timestamp).toISOString() : null;
      return { rows: parseAuctionListings(await readJSON(response, 64 * 1024 * 1024), query.market), sourceUpdatedAt, fetchedAt: new Date().toISOString() };
    } finally { marketRequests--; }
  });
}
/** The fields of a Blizzard item search document the market view needs; anything missing stays null. */
export type AuctionItemDoc = { id: number; names: { en: string | null; ru: string | null }; qualityId: number | null; classId: number | null; subclassId: number | null; level: number | null };
const qualityIds: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const whole = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const label = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
export function parseItemSearchPage(payload: unknown): { docs: AuctionItemDoc[]; pageCount: number } {
  const results = record(payload).results;
  if (!Array.isArray(results)) throw new Error("upstream_unavailable");
  const docs = results.map(result => {
    const data = record(record(result).data), name = record(data.name);
    if (!Number.isSafeInteger(data.id) || Number(data.id) < 1) throw new Error("upstream_unavailable");
    return { id: Number(data.id), names: { en: label(name.en_US) ?? label(name.en_GB), ru: label(name.ru_RU) },
      qualityId: qualityIds[String(record(data.quality).type)] ?? null, classId: whole(record(data.item_class).id),
      subclassId: whole(record(data.item_subclass).id), level: whole(data.level) };
  });
  return { docs, pageCount: Math.max(1, whole(record(payload).pageCount) ?? 1) };
}
async function searchByName(region: AuctionRegion, lang: "ru" | "en", q: string) {
  return memo(`search:${region}:${lang}:${q.toLowerCase()}`, 10 * 60_000, async () => {
    const params = new URLSearchParams({ [`name.${lang === "ru" ? "ru_RU" : "en_US"}`]: q, _pageSize: "1000", _page: "1", orderby: "id" });
    const page = parseItemSearchPage(await readJSON(await blizzard(region, "/data/wow/search/item", "static", params), 8 * 1024 * 1024));
    // Blizzard matches individual words with OR semantics. Keep phrase/substring
    // matches in the requested locale so unrelated old items do not hide the result.
    const needle = q.toLocaleLowerCase(lang);
    return { docs: page.docs.filter(doc => doc.names[lang]?.toLocaleLowerCase(lang).includes(needle)), truncated: page.pageCount > 1 };
  });
}
async function matchingItems(query: AuctionQuery): Promise<{ ids?: Set<number>; truncated: boolean }> {
  if (!query.q) return { truncated: false };
  if (/^\d+$/.test(query.q)) return { ids: new Set([Number(query.q)]), truncated: false };
  const result = await searchByName(query.region, query.lang, query.q);
  return { ids: new Set(result.docs.map(doc => doc.id)), truncated: result.truncated };
}
function itemIcon(region: AuctionRegion, id: number) {
  return memo(`item-icon:${region}:${id}`, 24 * 60 * 60_000, async () => auctionItemIcon(await readJSON(await blizzard(region, `/data/wow/media/item/${id}`, "static", new URLSearchParams(), 3000))));
}
async function itemDetails(region: AuctionRegion, lang: "ru" | "en", id: number): Promise<AuctionItemDetails> {
  return memo(`item-details:${region}:${lang}:${id}`, 24 * 60 * 60_000, async () => {
    const params = new URLSearchParams({ locale: lang === "ru" ? "ru_RU" : "en_US" });
    const [payload, icon] = await Promise.all([
      blizzard(region, `/data/wow/item/${id}`, "static", params, 3000).then(r => readJSON(r)),
      itemIcon(region, id).catch(() => null),
    ]);
    return parseAuctionItemDetails(payload, id, icon);
  });
}
export async function browseAuctions(query: AuctionQuery): Promise<AuctionResult> {
  const connectedRealmId = query.market === "realm" ? await connectedRealm(query) : null;
  const [market, matched] = await Promise.all([snapshot(query, connectedRealmId), matchingItems(query)]);
  const page = auctionPage(market.rows, query, matched.ids);
  const namesDeadline = Date.now() + 6000;
  const items = new Map<number, AuctionItemDetails | null>(), ids = [...new Set(page.rows.map(row => row.itemId))];
  // Four workers keep the first page bounded instead of making one request per market item.
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (Date.now() < namesDeadline) {
      const id = ids.pop(); if (id === undefined) break;
      try { items.set(id, await itemDetails(query.region, query.lang, id)); } catch { items.set(id, null); }
    }
  }));
  return { ...page, rows: page.rows.map(row => ({ ...row, name: items.get(row.itemId)?.name ?? null, item: items.get(row.itemId) ?? null })),
    sourceUpdatedAt: market.sourceUpdatedAt, fetchedAt: market.fetchedAt, connectedRealmId, market: query.market,
    stale: market.sourceUpdatedAt === null || Date.now() - Date.parse(market.sourceUpdatedAt) > 2 * 60 * 60_000,
    searchTruncated: matched.truncated };
}
let tooltipRequests = 0;
export async function auctionLotTooltip(query: AuctionQuery, auctionId: number) {
  const connectedId = query.market === "realm" ? await connectedRealm(query) : null;
  const market = await snapshot(query, connectedId);
  const row = market.rows.find(row => row.id === auctionId);
  if (!row) throw new Error("listing_not_found");
  const key = auctionVariantKey({ itemId: row.itemId, contextId: row.context, bonusIds: row.bonusIds, modifiers: row.modifiers });
  return memo(`tooltip:${query.region}:${query.lang}:${key}`, 15 * 60_000, async () => {
    if (tooltipRequests >= 2) throw new Error("market_busy");
    tooltipRequests++;
    try { return await resolveExactAuctionTooltip(row, await itemDetails(query.region, query.lang, row.itemId), query.lang); }
    finally { tooltipRequests--; }
  });
}

/* ---------- Market view: one row per item ---------- */

const summaries = new WeakMap<Snapshot, Map<number, AuctionItemSummary>>();
function summaryOf(market: Snapshot) {
  let summary = summaries.get(market);
  if (!summary) summaries.set(market, summary = summarizeAuctions(market.rows));
  return summary;
}
/** Search pages of one item class, newest items first; a realm category keeps only the newest two pages. */
async function categoryDocs(region: AuctionRegion, category: AuctionCategory) {
  return memo(`category:${region}:${category.key}`, 12 * 60 * 60_000, async () => {
    const pages = category.market === "realm" ? 2 : 5, docs: AuctionItemDoc[] = [];
    for (const [cls, sub] of category.classes) {
      const params = (page: number, order: string) => new URLSearchParams({ "item_class.id": String(cls), ...(sub === undefined ? {} : { "item_subclass.id": String(sub) }), orderby: order, _pageSize: "1000", _page: String(page) });
      let order = "id:desc", first;
      try { first = parseItemSearchPage(await readJSON(await blizzard(region, "/data/wow/search/item", "static", params(1, order), 15000), 12 * 1024 * 1024)); }
      catch (error) {
        if (error instanceof Error && error.message === "rate_limited") throw error;
        order = "id"; first = parseItemSearchPage(await readJSON(await blizzard(region, "/data/wow/search/item", "static", params(1, order), 15000), 12 * 1024 * 1024));
      }
      docs.push(...first.docs);
      for (let page = 2; page <= Math.min(first.pageCount, pages); page++) {
        docs.push(...parseItemSearchPage(await readJSON(await blizzard(region, "/data/wow/search/item", "static", params(page, order), 15000), 12 * 1024 * 1024)).docs);
      }
    }
    // A class search can return neighbouring subclasses; keep what the category really holds.
    return docs.filter(doc => inAuctionCategory(category, doc.classId, doc.subclassId));
  });
}
/** Fill icons (and, when the search document lacked them, names) within a short deadline; the rest stay empty. */
async function decorate(region: AuctionRegion, lang: "ru" | "en", rows: AuctionMarketItem[], deadline = Date.now() + 4000) {
  const queue = [...rows];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (Date.now() < deadline) {
      const row = queue.shift(); if (!row) break;
      try {
        if (!row.name || row.qualityId === null) {
          const details = await itemDetails(region, lang, row.itemId);
          row.name ??= details.name; row.iconUrl = details.iconUrl;
          row.qualityId ??= Number.isInteger(details.qualityId) ? details.qualityId! : null;
          row.classId ??= Number.isInteger(details.itemClassId) ? details.itemClassId! : null;
          row.subclassId ??= Number.isInteger(details.itemSubclassId) ? details.itemSubclassId! : null;
        } else row.iconUrl = await itemIcon(region, row.itemId);
      } catch { /* A missing icon or name must not hide the price. */ }
    }
  }));
}
function marketRows(summary: Map<number, AuctionItemSummary>, market: AuctionMarketItem["market"], docs: Map<number, AuctionItemDoc | null>, lang: "ru" | "en", ladder: boolean) {
  const rows: AuctionMarketItem[] = [];
  for (const [itemId, doc] of docs) {
    const item = summary.get(itemId); if (!item) continue;
    rows.push({ itemId, market, name: doc?.names[lang] ?? null, iconUrl: null, qualityId: doc?.qualityId ?? null, classId: doc?.classId ?? null,
      subclassId: doc?.subclassId ?? null, level: doc?.level ?? null, rank: null, minPrice: item.minPrice, medianPrice: item.medianPrice,
      quantity: item.quantity, lots: item.lots, ...(ladder ? { ladder: compactLadder(item.ladder) } : {}) });
  }
  return rows;
}
const freshness = (updated: string | null) => updated === null || Date.now() - Date.parse(updated) > 2 * 60 * 60_000;
/**
 * Items of a category, a name search or an explicit list, each with min / median unit price and units listed.
 * Commodities are always included; a realm's own auction house only when a realm is chosen.
 */
export async function auctionMarket(query: AuctionMarketQuery): Promise<AuctionMarketView> {
  const category = auctionCategory(query.category);
  const base = { region: query.region, lang: query.lang, realm: query.realm, q: "", sort: "price" as const, page: 1 };
  const wantRealm = category ? category.market === "realm" : query.realm !== "";
  const wantCommodities = !category || category.market === "commodities";
  if (category?.market === "realm" && !query.realm) throw new Error("realm_required");
  let docs = new Map<number, AuctionItemDoc | null>(), truncated = false;
  const [commodities, realm] = await Promise.all([
    wantCommodities ? snapshot({ ...base, market: "commodities" }, null) : null,
    wantRealm ? connectedRealm({ ...base, market: "realm" }).then(id => snapshot({ ...base, market: "realm" }, id)) : null,
    (async () => {
      if (category) docs = new Map((await categoryDocs(query.region, category)).map(doc => [doc.id, doc]));
      else if (query.items.length) docs = new Map(query.items.map(id => [id, null]));
      else if (/^\d+$/.test(query.q)) docs = new Map([[Number(query.q), null]]);
      else { const found = await searchByName(query.region, query.lang, query.q); truncated = found.truncated; docs = new Map(found.docs.map(doc => [doc.id, doc])); }
    })(),
  ]);
  const ladder = query.items.length > 0;
  let items = [
    ...(commodities ? marketRows(summaryOf(commodities), "commodities", docs, query.lang, ladder) : []),
    ...(realm ? marketRows(summaryOf(realm), "realm", docs, query.lang, ladder) : []),
  ];
  // Suggestions: the best-supplied matches first, then cut.
  if (query.limit) {
    // Names that start a word with the typed text come first, then the newest items, then the best supplied.
    const needle = query.q.toLocaleLowerCase(query.lang);
    const starts = (item: AuctionMarketItem) => (item.name ?? "").toLocaleLowerCase(query.lang).split(/[\s'’-]+/).some(word => word.startsWith(needle)) ? 0 : 1;
    items = items.sort((a, b) => starts(a) - starts(b) || (b.level ?? 0) - (a.level ?? 0) || b.quantity - a.quantity || a.itemId - b.itemId).slice(0, query.limit);
  }
  else if (items.length > 400) { items = items.sort((a, b) => b.quantity - a.quantity).slice(0, 400); truncated = true; }
  await decorate(query.region, query.lang, items);
  const ranks = reagentRanks(items);
  for (const item of items) item.rank = ranks.get(item.itemId) ?? null;
  const updated = [commodities?.sourceUpdatedAt, realm?.sourceUpdatedAt].filter((v): v is string | null => v !== undefined);
  const sourceUpdatedAt = updated.length && updated.every(Boolean) ? (updated as string[]).sort()[0] : null;
  return { items, sourceUpdatedAt, stale: updated.some(freshness), truncated };
}

/**
 * Commodity prices of a fixed list of items for server-rendered pages (professions): min / median unit price,
 * units listed and the cheapest price levels. Shares the cached region snapshot with the market view; no names or icons.
 */
export async function commodityPrices(region: AuctionRegion, itemIds: readonly number[], ladderLimit = 30) {
  const market = await snapshot({ region, lang: "en", realm: "", market: "commodities", q: "", sort: "price", page: 1 }, null);
  const summary = summaryOf(market);
  const prices: Record<string, { min: number; median: number; quantity: number; ladder: [number, number][] }> = {};
  for (const id of itemIds) {
    const item = summary.get(id);
    if (item) prices[id] = { min: item.minPrice, median: item.medianPrice, quantity: item.quantity, ladder: compactLadder(item.ladder, ladderLimit) as [number, number][] };
  }
  return { prices, sourceUpdatedAt: market.sourceUpdatedAt };
}

/** Procurement endpoint: original exact price levels, never compactLadder's median tail.
 * Freshness must be checked against sourceUpdatedAt before budget certification. */
function awaitCommoditySnapshot<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", aborted);
    const aborted = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener("abort", aborted, { once: true });
    // The bounded, deduplicated upstream request may still serve other waiters.
    // Keep both handlers attached so late failures are always consumed.
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) aborted();
  });
}
export async function exactCommodityPrices(region: AuctionRegion, itemIds: readonly number[], options: { refresh?: boolean; signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  // This is a bounded local projection of one region snapshot, not one HTTP request per ID.
  if (itemIds.length > 512 || itemIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("invalid_commodity_items");
  const market = await awaitCommoditySnapshot(snapshot({ region, lang: "en", realm: "", market: "commodities", q: "", sort: "price", page: 1 }, null, options.refresh), options.signal);
  options.signal?.throwIfAborted();
  const summary = summaryOf(market);
  const prices: Record<string, { ladder: [number, number][] }> = {};
  for (const id of new Set(itemIds)) {
    const item = summary.get(id);
    if (item) prices[id] = { ladder: item.ladder.map(([price, quantity]) => [price, quantity]) };
  }
  return { prices, sourceUpdatedAt: market.sourceUpdatedAt, fetchedAt: market.fetchedAt };
}
