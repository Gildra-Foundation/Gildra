import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuctionGearSearch } from "@/lib/wow/auctionGearSearchStore";
import { auctionGearResults } from "@/lib/wow/auctionGearResult";
import { buildAuctionShoppingRows } from "@/lib/wow/auctionShoppingList";
import { checkAuctionShoppingRows, remainingShoppingCost } from "@/lib/wow/auctionShoppingCheck";
import { getBattleNetCharacterBySlug } from "@/lib/wow/battleNetCharacters";
import { getCharacterAuctionMarket } from "@/lib/wow/auctionMarketProvider";
import { auctionVariantKey } from "@/lib/wow/auctionItemVariant";
import { exactCommodityPrices } from "@/lib/wow/auctionBrowserData";
import { assertFreshMarket } from "@/lib/wow/auctionMarket";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status,
  headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "cross_site_blocked" }, 403);
  try {
    if (origin && new URL(origin).host !== (request.headers.get("x-forwarded-host") ?? request.headers.get("host")))
      return reply({ error: "cross_site_blocked" }, 403);
  } catch { return reply({ error: "cross_site_blocked" }, 403); }
  const session = await auth(), token = session?.battleNetAccessToken;
  if (!token) return reply({ error: "session_expired" }, 401);
  let body: Record<string, unknown>;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) { await reader.cancel(); return reply({ error: "request_too_large" }, 413); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || Array.isArray(body) || typeof body !== "object" ||
      Object.keys(body).some(key => !["searchId", "recommendationKey", "purchasedKeys"].includes(key)) ||
      typeof body.searchId !== "string" || body.searchId.length > 100 ||
      typeof body.recommendationKey !== "string" || body.recommendationKey.length > 8192 ||
      !Array.isArray(body.purchasedKeys) || body.purchasedKeys.length > 100 ||
      body.purchasedKeys.some(key => typeof key !== "string" || key.length > 512)) throw new Error();
  } catch { return reply({ error: "invalid_plan_request" }, 400); }
  const owner = createHash("sha256").update(`battle-net:${token}`).digest("hex");
  const entry = getAuctionGearSearch(owner, body.searchId as string);
  if (!entry?.latestAssemblyResult) return reply({ error: "search_not_found" }, 404);
  const result = auctionGearResults(entry.latestAssemblyResult).find(result => result.key === body.recommendationKey);
  if (!result?.significant) return reply({ error: "recommendation_not_found" }, 404);
  const rows = buildAuctionShoppingRows(result.purchases, result.enhancement?.configuration.consumables, result.enhancement?.consumableNames);
  const purchasedKeys = body.purchasedKeys as string[];
  if (purchasedKeys.some(key => !rows.some(row => row.key === key))) return reply({ error: "invalid_plan_request" }, 400);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    const character = await getBattleNetCharacterBySlug(token, entry.context.input.locale, entry.context.input.characterSlug, signal, { cache: "no-store" });
    if (!character || character.id !== entry.context.character.id || character.region !== entry.context.character.region || character.realm.slug !== entry.context.character.realm.slug)
      return reply({ error: "character_not_found" }, 404);
    const market = await getCharacterAuctionMarket(character, token, { refresh: true, signal });
    if (market.connectedRealmId !== entry.context.market.connectedRealmId || market.region !== entry.context.market.region)
      return reply({ error: "auction_market_changed" }, 409);
    assertFreshMarket(market);
    const ids = [...new Set(rows.filter(row => row.kind !== "item" && !purchasedKeys.includes(row.key)).map(row => row.itemId))];
    const commodities = ids.length ? await exactCommodityPrices(character.region, ids, { refresh: true, signal }) : null;
    if (commodities) assertFreshMarket({ sourceUpdatedAt: commodities.sourceUpdatedAt ?? "" });
    const lotIds = new Set(rows.filter(row => row.kind === "item").map(row => row.auctionId));
    const checked = checkAuctionShoppingRows(rows, purchasedKeys, market.offers.filter(offer => lotIds.has(offer.auctionId)).map(offer => ({ ...offer, variantKey: auctionVariantKey(offer) })), commodities?.prices ?? {});
    return reply({ rows: checked, remainingCopper: remainingShoppingCost(checked),
      checkedAt: new Date().toISOString(), sourceUpdatedAt: market.sourceUpdatedAt,
      commoditySourceUpdatedAt: commodities?.sourceUpdatedAt ?? null });
  } catch { return reply({ error: "shopping_market_unavailable" }, 503); }
}
