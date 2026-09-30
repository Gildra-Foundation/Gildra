import type { Metadata } from "next";
import { GameHubPage } from "@/components/platform/games/GameHubPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getGameIntelligence } from "@/lib/platform/games/intelligence";

export const metadata: Metadata = { title: "Diablo IV — Gildra", description: "Сезонные билды, рейтинги Ямы и разведка лута." };

export default async function Page() {
  const [data, intelligence] = await Promise.all([getPlatformHomeData("ru"), getGameIntelligence("diablo", "ru")]);
  return <GameHubPage data={data} intelligence={intelligence} lang="ru" gameId="diablo" />;
}
