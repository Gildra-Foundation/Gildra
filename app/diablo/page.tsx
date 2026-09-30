import type { Metadata } from "next";
import { GameHubPage } from "@/components/platform/games/GameHubPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getGameIntelligence } from "@/lib/platform/games/intelligence";

export const metadata: Metadata = { title: "Diablo IV — Gildra", description: "Seasonal builds, Pit rankings and loot intelligence." };

export default async function Page() {
  const [data, intelligence] = await Promise.all([getPlatformHomeData("en"), getGameIntelligence("diablo", "en")]);
  return <GameHubPage data={data} intelligence={intelligence} lang="en" gameId="diablo" />;
}
