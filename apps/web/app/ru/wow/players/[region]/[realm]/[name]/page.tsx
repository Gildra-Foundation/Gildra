// Generated from app/(site)/wow/players/[region]/[realm]/[name]/page.tsx by npm run routes:mirror — edit the English page.
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
  return key ? playerMetadata(key, "ru") : {};
}
export default async function Page({ params }: Props) {
  const key = parsePlayerKey(await params);
  if (!key) notFound();
  const load = await loadPlayerProfile(key, "ru");
  if (load.state === "missing") notFound();
  const talentData = load.state === "ready" ? await loadPlayerTalentData(load.profile, "ru") : null;
  return (
    <CharacterProfileFrame locale="ru">
      {load.state === "ready" ? <PlayerProfilePage locale="ru" profile={load.profile} talentData={talentData} /> : <PlayerProfileUnavailable locale="ru" playerKey={key} />}
    </CharacterProfileFrame>
  );
}
