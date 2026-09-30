import type { Metadata } from "next";
import { SearchPage } from "@/components/platform/search/SearchPage";
import { searchCatalogGame } from "@/lib/platform/catalog/repository";
import { catalogGames, isCatalogGame, type CatalogGameId, type SearchKind } from "@/lib/platform/catalog/types";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { preloadSharedWowBackdrop } from "@/lib/wow/sharedBackdropPreload";

export const metadata: Metadata = { title: "Search — Gildra", description: "Search every published Gildra game catalog." };

type Params = { q?: string; type?: string; game?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  preloadSharedWowBackdrop();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 200);
  const kind: SearchKind = params.type === "characters" || params.type === "items" ? params.type : "all";
  const rawGames = Array.isArray(params.game) ? params.game : params.game ? [params.game] : [];
  const selectedGames = rawGames.filter(isCatalogGame).filter((id) => catalogGames.find((game) => game.id === id)?.available) as CatalogGameId[];
  const games = selectedGames.length ? selectedGames : catalogGames.filter((game) => game.available).map((game) => game.id);
  const results = games.map((gameId) => ({
    gameId,
    result: searchCatalogGame({ gameId, kind, query, locale: "en_US", limitPerGame: query ? 12 : 4 }),
  }));
  const home = await getPlatformHomeData("en");
  return <SearchPage lang="en" query={query} kind={kind} selectedGames={games} results={results} home={home} />;
}
