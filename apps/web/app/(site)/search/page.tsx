import type { Metadata } from "next";
import { pairedAlternates } from "@/lib/seo/metadata";
import { SearchPage } from "@/components/platform/search/SearchPage";
import { searchCatalogGame } from "@/lib/platform/catalog/repository";
import { catalogGames, isCatalogGame, type CatalogGameId, type SearchKind } from "@/lib/platform/catalog/types";

// Result pages are endless query variants: kept out of the index, links still followed.
export const metadata: Metadata = {
  title: "Search — Gildra",
  description: "Search every published Gildra game catalog.",
  alternates: pairedAlternates("en", "/search"),
  robots: { index: false, follow: true },
};

type Params = { q?: string; type?: string; game?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 200);
  const kind: SearchKind = params.type === "characters" || params.type === "items" ? params.type : "all";
  const rawGames = Array.isArray(params.game) ? params.game : params.game ? [params.game] : [];
  const selectedGames = rawGames.filter(isCatalogGame).filter((id) => catalogGames.find((game) => game.id === id)?.available) as CatalogGameId[];
  const games = selectedGames.length ? selectedGames : catalogGames.filter((game) => game.available).map((game) => game.id);
  const results = (query ? games : []).map((gameId) => ({
    gameId,
    result: searchCatalogGame({ gameId, kind, query, locale: "en_US", limitPerGame: 12 }),
  }));
  return <SearchPage lang="en" query={query} kind={kind} selectedGames={games} results={results} />;
}
