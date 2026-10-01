import type { Metadata } from "next";
import { auth, isBattleNetAuthConfigured } from "@/auth";
import { ConnectedCharacterRosterLoader } from "@/components/wow/characters/ConnectedCharacterRosterLoader";
import { CharacterRosterEntryPage } from "@/components/wow/characters/CharacterRosterEntryPage";
import { BATTLE_NET_REGIONS, getBattleNetPreferredRegion } from "@/lib/wow/battleNetCharacters";

// The page depends on the visitor's Battle.net session and on runtime secrets.
// Without this it is prerendered during the image build (no AUTH_SECRET, no
// cookies) and that logged-out, "not configured" HTML is served to everyone.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WoW Characters — Gildra",
  description: "Browse World of Warcraft characters connected to your Battle.net account.",
  alternates: { canonical: "/wow/characters", languages: { en: "/wow/characters", ru: "/ru/wow/characters", "x-default": "/wow/characters" } },
  robots: { index: false, follow: true },
};

export default async function CharactersPage() {
  const session = isBattleNetAuthConfigured ? await auth() : null;
  const preferredRegion = getBattleNetPreferredRegion();
  const remainingRegions = BATTLE_NET_REGIONS.filter((region) => region !== preferredRegion);
  const apiError = !session?.battleNetAccessToken && session?.battleNetError ? "expired" : undefined;
  const accountName = session?.user?.name ?? undefined;
  if (!session?.battleNetAccessToken) {
    return <CharacterRosterEntryPage locale="en" accountName={accountName} apiError={apiError} />;
  }
  return <ConnectedCharacterRosterLoader locale="en" accountName={accountName} pendingRegions={[preferredRegion, ...remainingRegions]} />;
}
