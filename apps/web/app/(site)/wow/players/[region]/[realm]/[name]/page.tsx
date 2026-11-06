// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayerProfilePage, PlayerProfileUnavailable } from "@/components/wow/audit/PlayerProfilePage";
import { CharacterProfileFrame } from "@/components/wow/characters/CharacterProfileFrame";
import { loadPlayerProfile, loadPlayerTalentData } from "@/lib/wow/playerProfile";
import { playerMetadata } from "@/lib/wow/playerProfileMetadata";
import { parsePlayerKey } from "@/lib/wow/playerProfileView";

type Props = { params: Promise<{ region: string; realm: string; name: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const key = parsePlayerKey(await params);
  return key ? playerMetadata(key, "en") : {};
}
export default async function Page({ params }: Props) {
  const key = parsePlayerKey(await params);
  if (!key) notFound();
  const load = await loadPlayerProfile(key, "en");
  if (load.state === "missing") notFound();
  const talentData = load.state === "ready" ? await loadPlayerTalentData(load.profile, "en") : null;
  return (
    <CharacterProfileFrame locale="en">
      {load.state === "ready" ? <PlayerProfilePage locale="en" profile={load.profile} talentData={talentData} /> : <PlayerProfileUnavailable locale="en" playerKey={key} />}
    </CharacterProfileFrame>
  );
}
