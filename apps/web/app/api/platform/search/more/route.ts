import { NextResponse, type NextRequest } from "next/server";
import { catalogReadable, catalogSessionPresent } from "@/lib/library/server";
import { searchCatalogGame } from "@/lib/platform/catalog/repository";
import { catalogGames, isCatalogGame, searchPageSize, type SearchKind } from "@/lib/platform/catalog/types";
import { searchCursor } from "@/components/platform/search/searchList";
import { searchRow } from "@/components/platform/search/searchRow";

/**
 * The next page of a site search ("Show more"): the query of the search page
 * plus `cursor`, answered as ready rows (`SearchRow`) and the cursor after
 * them. Read-only, through the cached catalog client.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 200);
  const cursor = searchCursor(params.get("cursor"));
  const lang = params.get("lang") === "ru" ? "ru" : "en";
  const type = params.get("type");
  const kind: SearchKind = type === "characters" || type === "items" ? type : "all";
  const named = params.get("game");
  const game = named && isCatalogGame(named) ? named : "wow";
  if (!query || !cursor || !catalogGames.some((entry) => entry.id === game && entry.available)) {
    return NextResponse.json({ message: "Invalid search query" }, { status: 400 });
  }
  if (!(await catalogReadable())) return NextResponse.json({ message: "The library is closed" }, { status: 401 });
  const privateRead = await catalogSessionPresent();
  const found = await searchCatalogGame({ gameId: game, kind, query, locale: lang === "ru" ? "ru_RU" : "en_US", limitPerGame: searchPageSize, cursor });
  if (found.unavailableGames.length) {
    return NextResponse.json({ message: "Catalog service is temporarily unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ rows: found.items.map((item) => searchRow(item, lang)), next: found.next }, {
    headers: { "Cache-Control": privateRead ? "private, no-store" : "public, max-age=120, stale-while-revalidate=600" },
  });
}
