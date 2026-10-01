import type { Metadata } from "next";
import { ComparisonPage } from "@/components/platform/compare/ComparisonPage";
import { catalogGames, isAvailableKind, isCatalogGame, type ComparisonKind } from "@/lib/platform/catalog/types";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { hiddenForMvp } from "@/lib/mvp";

export const metadata: Metadata = { title: "Comparison Lab — Gildra", description: "Compare database items inside a single game catalog." };

export default async function Page({ searchParams }: { searchParams: Promise<{ game?: string; kind?: string }> }) {
  // Hidden for the WoW-only MVP: answers 404 until the flag in lib/mvp.ts is flipped.
  hiddenForMvp();
  const params = await searchParams;
  const game = params.game && isCatalogGame(params.game) && catalogGames.find((item) => item.id === params.game)?.available ? params.game : "wow";
  const kind = params.kind && isAvailableKind(game, params.kind) ? params.kind : catalogGames.find((item) => item.id === game)!.kinds[0].id as ComparisonKind;
  return <ComparisonPage lang="en" home={await getPlatformHomeData("en")} initialGame={game} initialKind={kind} />;
}
