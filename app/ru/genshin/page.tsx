import type { Metadata } from "next";
import { GameHubPage } from "@/components/platform/games/GameHubPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getGameIntelligence } from "@/lib/platform/games/intelligence";

export const metadata: Metadata = { title: "Genshin Impact — Gildra", description: "Персонажи, артефакты, оружие и разведка Витой Бездны." };

export default async function Page() {
  const [data, intelligence] = await Promise.all([getPlatformHomeData("ru"), getGameIntelligence("genshin", "ru")]);
  return <GameHubPage data={data} intelligence={intelligence} lang="ru" gameId="genshin" />;
}
