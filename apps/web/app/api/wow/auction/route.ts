import { NextResponse } from "next/server";
import { auctionQuery } from "@/lib/wow/auctionBrowser";
import { auctionRealms, browseAuctions, auctionLotTooltip } from "@/lib/wow/auctionBrowserData";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, query = auctionQuery(params);
    const rawId = params.get("auctionId") ?? "";
    if (params.get("action") === "tooltip" && (!/^\d{1,16}$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) < 1)) throw new Error("invalid_query");
    const data = params.get("action") === "tooltip" ? await auctionLotTooltip(query, Number(rawId)) : params.get("action") === "realms" ? { realms: await auctionRealms(query.region, query.lang) }
      : await browseAuctions(query);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "upstream_unavailable";
    const invalid = ["invalid_query", "invalid_realm"].includes(code);
    const busy = ["market_busy", "rate_limited"].includes(code);
    const unavailable = ["listing_not_found", "item_variant_unavailable"].includes(code);
    return NextResponse.json({ error: invalid || busy || unavailable || code === "not_configured" ? code : "upstream_unavailable" }, {
      status: invalid ? 400 : busy ? 429 : code === "listing_not_found" ? 404 : code === "item_variant_unavailable" ? 422 : 503,
      headers: { "Cache-Control": "no-store", ...(busy ? { "Retry-After": "30" } : {}) },
    });
  }
}
