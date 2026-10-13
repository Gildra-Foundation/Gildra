import type { Metadata } from "next";
import { GameHubPage } from "@/components/platform/games/GameHubPage";
import { getPlatformHomeData } from "@/lib/platform/home/repository";
import { getGameIntelligence } from "@/lib/platform/games/intelligence";
import { hiddenForMvp } from "@/lib/mvp";

export const metadata: Metadata = { title: "Genshin Impact — Gildra", description: "Character, artifact, weapon and Spiral Abyss intelligence." };

export default async function Page() {
  // Hidden for the WoW-only MVP: answers 404 until the flag in lib/mvp.ts is flipped.
  hiddenForMvp();
  const [data, intelligence] = await Promise.all([getPlatformHomeData("en"), getGameIntelligence("genshin", "en")]);
  return <GameHubPage data={data} intelligence={intelligence} lang="en" gameId="genshin" />;
}
