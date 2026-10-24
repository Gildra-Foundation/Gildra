import "server-only";
import { auctionItemIcon, parseAuctionItemDetails, type AuctionItemDetails } from "./auctionItemDetails";
import { resolveExactAuctionTooltip } from "./auctionExactTooltip";
import { auctionVariantKey } from "./auctionItemVariant";
import { auctionPage, parseAuctionListings, validAuctionRealm, type AuctionListing, type AuctionQuery, type AuctionRegion, type AuctionResult } from "./auctionBrowser";

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
    // Blizzard includes auxiliary realms with null names; they are not public choices.
    const realms = payload.realms.filter((r): r is { slug: string; name: string } => typeof r?.slug === "string" && validAuctionRealm(r.slug) && typeof r.name === "string" && r.name.trim().length > 0);
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
async function snapshot(query: AuctionQuery, connectedId: number | null): Promise<Snapshot> {
  // Large snapshots have their own four-entry bound, including requests in flight.
  const key = `market:${query.region}:${connectedId ?? "commodities"}`;
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
async function matchingItems(query: AuctionQuery): Promise<{ ids?: Set<number>; truncated: boolean }> {
  if (!query.q) return { truncated: false };
  if (/^\d+$/.test(query.q)) return { ids: new Set([Number(query.q)]), truncated: false };
  const result = await memo(`search:${query.region}:${query.lang}:${query.q.toLowerCase()}`, 10 * 60_000, async () => {
    const params = new URLSearchParams({ [`name.${query.lang === "ru" ? "ru_RU" : "en_US"}`]: query.q, _pageSize: "1000", _page: "1", orderby: "id" });
    const payload = await readJSON(await blizzard(query.region, "/data/wow/search/item", "static", params), 4 * 1024 * 1024) as { results?: { data: { id: number; name?: Record<string, string> } }[]; pageCount?: number };
    if (!Array.isArray(payload.results) || payload.results.some(r => !Number.isSafeInteger(r.data?.id))) throw new Error("upstream_unavailable");
    // Blizzard matches individual words with OR semantics. Keep phrase/substring
    // matches in the requested locale so unrelated old items do not hide the result.
    const locale = query.lang === "ru" ? "ru_RU" : "en_US", needle = query.q.toLocaleLowerCase(query.lang);
    return { ids: payload.results.filter(r => r.data.name?.[locale]?.toLocaleLowerCase(query.lang).includes(needle)).map(r => r.data.id), truncated: Number(payload.pageCount) > 1 };
  });
  return { ids: new Set(result.ids), truncated: result.truncated };
}
async function itemDetails(region: AuctionRegion, lang: "ru" | "en", id: number): Promise<AuctionItemDetails> {
  return memo(`item-details:${region}:${lang}:${id}`, 24 * 60 * 60_000, async () => {
    const params = new URLSearchParams({ locale: lang === "ru" ? "ru_RU" : "en_US" });
    const [payload, icon] = await Promise.all([
      blizzard(region, `/data/wow/item/${id}`, "static", params, 3000).then(r => readJSON(r)),
      memo(`item-icon:${region}:${id}`, 24 * 60 * 60_000, async () => auctionItemIcon(await readJSON(await blizzard(region, `/data/wow/media/item/${id}`, "static", new URLSearchParams(), 3000)))).catch(() => null),
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
