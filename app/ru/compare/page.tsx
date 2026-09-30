import type { Metadata } from "next";
import { ComparisonPage } from "@/components/platform/compare/ComparisonPage";
import { catalogGames, isAvailableKind, isCatalogGame, type ComparisonKind } from "@/lib/platform/catalog/types";
import { getPlatformHomeData } from "@/lib/platform/home/repository";

export const metadata: Metadata = { title: "Лаборатория сравнения — Gildra", description: "Сравнение предметов внутри одной игровой базы." };

export default async function Page({ searchParams }: { searchParams: Promise<{ game?: string; kind?: string }> }) {
  const params = await searchParams;
  const game = params.game && isCatalogGame(params.game) && catalogGames.find((item) => item.id === params.game)?.available ? params.game : "wow";
  const kind = params.kind && isAvailableKind(game, params.kind) ? params.kind : catalogGames.find((item) => item.id === game)!.kinds[0].id as ComparisonKind;
  return <ComparisonPage lang="ru" home={await getPlatformHomeData("ru")} initialGame={game} initialKind={kind} />;
}
