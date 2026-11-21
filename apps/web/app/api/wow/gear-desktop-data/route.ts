import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { getBattleNetCharacterBySlug, isBattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { getBattleNetSimulationSnapshot } from "@/lib/wow/battleNetCharacterDetails";
import { getCharacterAuctionMarket } from "@/lib/wow/auctionMarketProvider";
import { exactCommodityPrices } from "@/lib/wow/auctionBrowserData";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const invalid = () => json({ error: "invalid_desktop_request" }, 400);

/** Read-only inputs for the desktop planner. The OAuth token stays on the site. */
export async function GET(request: Request) {
  const url = new URL(request.url), params = url.searchParams;
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") && request.headers.get("origin") !== url.origin)) return json({ error: "cross_site_blocked" }, 403);
  if (url.search.length > 8192 || new Set(params.keys()).size !== params.size) return invalid();
  const session = await auth(), token = session?.battleNetAccessToken;
  if (!token) return json({ error: "session_expired" }, 401);
  const owner = createHash("sha256").update("gear-desktop:" + token).digest("hex");
  if (params.has("owner") && params.get("owner") !== owner) return json({ error: "session_expired" }, 401);
  const action = params.get("read"), region = params.get("region") ?? "", lang = params.get("lang") ?? "en";
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
  try {
    if (action === "session") return json({ protocol: 1, owner });
    if (action === "item" || action === "icon") {
      const id = params.get("id") ?? "", locale = params.get("locale") ?? "en_GB";
      if (!isBattleNetRegion(region) || !/^[1-9]\d{0,8}$/.test(id) || !["en_GB", "en_US", "ru_RU"].includes(locale)) return invalid();
      const path = action === "item" ? "item" : "media/item";
      const response = await fetch(`https://${region}.api.blizzard.com/data/wow/${path}/${id}?namespace=static-${region}&locale=${locale}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal,
      });
      if (!response.ok) return json({ error: "item_unavailable" }, response.status);
      return new Response(response.body, { headers: { ...headers, "Content-Type": "application/json" } });
    }
    if (action === "prices") {
      const ids = params.get("ids")?.split(",") ?? [];
      if (!isBattleNetRegion(region) || !ids.length || ids.length > 512 || !ids.every(id => /^[1-9]\d{0,8}$/.test(id))) return invalid();
      return json(await exactCommodityPrices(region, ids.map(Number), { refresh: true, signal }));
    }
    if (!["character", "snapshot", "market", "equipment"].includes(action ?? "") || (lang !== "en" && lang !== "ru")) return invalid();
    const slug = params.get("slug");
    if (!slug || slug.length > 200) return invalid();
    const fresh = params.get("fresh") === "1";
    const character = await getBattleNetCharacterBySlug(token, lang, slug, signal, { cache: fresh ? "no-store" : "default" });
    if (!character) return json({ error: "character_not_found" }, 404);
    if (action === "character") return json(character);
    if (action === "snapshot") return json(await getBattleNetSimulationSnapshot(token, character, signal, { professions: true }));
    if (action === "market") {
      const market = await getCharacterAuctionMarket(character, token, { refresh: fresh, signal });
      if (params.get("known") === market.id) return json({ unchanged: market.id });
      return json(market);
    }
    const base = `https://${character.region}.api.blizzard.com/profile/wow/character`;
    const itemUrl = `${base}/${encodeURIComponent(character.realm.slug)}/${encodeURIComponent(character.name.toLowerCase())}/equipment?namespace=profile-${character.region}&locale=ru_RU`;
    const response = await fetch(itemUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal });
    if (!response.ok) return json({ error: "equipment_unavailable" }, response.status);
    return new Response(response.body, { headers: { ...headers, "Content-Type": "application/json" } });
  } catch {
    return json({ error: "desktop_data_unavailable" }, 503);
  }
}
