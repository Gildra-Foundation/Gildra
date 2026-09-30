import type { Metadata } from "next";
import { auth, isBattleNetAuthConfigured } from "@/auth";
import { ConnectedCharacterRosterLoader } from "@/components/wow/characters/ConnectedCharacterRosterLoader";
import { CharacterRosterEntryPage } from "@/components/wow/characters/CharacterRosterEntryPage";
import { BATTLE_NET_REGIONS, getBattleNetPreferredRegion } from "@/lib/wow/battleNetCharacters";

export const metadata: Metadata = {
  title: "Персонажи WoW — Gildra",
  description: "Просматривайте персонажей World of Warcraft, подключённых к вашему аккаунту Battle.net.",
  alternates: { canonical: "/ru/wow/characters", languages: { en: "/wow/characters", ru: "/ru/wow/characters", "x-default": "/wow/characters" } },
  robots: { index: false, follow: true },
};

export default async function CharactersPage() {
  const session = isBattleNetAuthConfigured ? await auth() : null;
  const preferredRegion = getBattleNetPreferredRegion();
  const remainingRegions = BATTLE_NET_REGIONS.filter((region) => region !== preferredRegion);
  const apiError = !session?.battleNetAccessToken && session?.battleNetError ? "expired" : undefined;
  const accountName = session?.user?.name ?? undefined;
  if (!session?.battleNetAccessToken) {
    return <CharacterRosterEntryPage locale="ru" accountName={accountName} apiError={apiError} />;
  }
  return <ConnectedCharacterRosterLoader locale="ru" accountName={accountName} pendingRegions={[preferredRegion, ...remainingRegions]} />;
}
