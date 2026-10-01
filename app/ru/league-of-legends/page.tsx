import type { Metadata } from "next";
import { GameHubPage } from "@/components/platform/games/GameHubPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getGameIntelligence } from "@/lib/platform/games/intelligence";
import { hiddenForMvp } from "@/lib/mvp";

export const metadata: Metadata = { title: "League of Legends — Gildra", description: "Чемпионы, матчапы, предметы и живая патч-разведка.", alternates: { canonical: "/ru/league-of-legends", languages: { en: "/league-of-legends", ru: "/ru/league-of-legends", "x-default": "/league-of-legends" } } };

export default async function Page() {
  // Hidden for the WoW-only MVP: answers 404 until the flag in lib/mvp.ts is flipped.
  hiddenForMvp("league-of-legends");
  const [data, intelligence] = await Promise.all([getPlatformHomeData("ru"), getGameIntelligence("league", "ru")]);
  return <GameHubPage data={data} intelligence={intelligence} lang="ru" gameId="league" />;
}
