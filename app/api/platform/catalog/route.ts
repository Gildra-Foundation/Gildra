import { NextResponse } from "next/server";
import { searchComparisonItems } from "@/lib/platform/catalog/repository";
import { catalogGames, isAvailableKind, isCatalogGame } from "@/lib/platform/catalog/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const game = params.get("game") ?? "";
  const kind = params.get("kind") ?? "";
  const query = (params.get("q") ?? "").trim();
  const locale = params.get("locale") === "ru_RU" ? "ru_RU" : "en_US";

  if (!isCatalogGame(game)) {
    return NextResponse.json({ error: "Choose one supported game." }, { status: 400 });
  }
  const definition = catalogGames.find((candidate) => candidate.id === game)!;
  if (!definition.available) {
    return NextResponse.json({ error: `${definition.name} does not have a published database catalog yet.` }, { status: 409 });
  }
  if (!isAvailableKind(game, kind)) {
    return NextResponse.json({ error: `Choose one ${definition.name} item category.` }, { status: 400 });
  }
  if (query.length > 200) {
    return NextResponse.json({ error: "Search query must not exceed 200 characters." }, { status: 400 });
  }

  const result = await searchComparisonItems({ gameId: game, kind, query, locale, limit: 24 });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
