import { notFound, redirect } from "next/navigation";
import { auth, isBattleNetAuthConfigured } from "@/auth";
import { CharacterAuditPage } from "@/components/wow/audit/CharacterAuditPage";
import { CharacterProfileLoadError } from "@/components/wow/characters/CharacterProfileLoadError";
import { BattleNetCharacterDataError, characterSlug, getBattleNetCharacterDetails } from "@/lib/wow/battleNetCharacterDetails";
import { BattleNetProfileError, getBattleNetCharacters, isBattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { toCharacterAuditSnapshot } from "@/lib/wow/battleNetAuditSnapshot";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { characterProfileFingerprint } from "@/lib/wow/characterProfileFingerprint";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }> };

export default async function CharacterPage({ params }: PageProps) {
  const session = isBattleNetAuthConfigured ? await auth() : null;
  if (!session?.battleNetAccessToken) redirect("/login");
  const rawSlug = (await params).slug;
  const requested = decodeURIComponent(rawSlug).toLowerCase();
  const requestedRegion = requested.split("--", 1)[0];
  let characters;
  try { characters = await getBattleNetCharacters(session.battleNetAccessToken, "en", isBattleNetRegion(requestedRegion) ? requestedRegion : undefined); }
  catch (error) {
    const code = error instanceof BattleNetProfileError ? error.status === 401 ? "expired" : error.status === 403 ? "forbidden" : error.status === 429 ? "rate_limited" : "unavailable" : "unavailable";
    return <CharacterProfileLoadError locale="en" code={code} retryHref={`/wow/characters/${rawSlug}`} />;
  }
  const character = characters.find((item) => decodeURIComponent(characterSlug(item)).toLowerCase() === requested);
  if (!character) notFound();
  let details;
  try { details = await getBattleNetCharacterDetails(session.battleNetAccessToken, character, "en"); }
  catch (error) {
    const code = error instanceof BattleNetCharacterDataError ? error.code === "expired" ? "expired" : error.code === "forbidden" ? "forbidden" : error.code === "rate_limited" ? "rate_limited" : error.code === "incomplete" ? "incomplete" : "unavailable" : "unavailable";
    return <CharacterProfileLoadError locale="en" code={code} retryHref={`/wow/characters/${rawSlug}`} />;
  }
  const snapshot = toCharacterAuditSnapshot(details, "en");
  const [talentData, rotationPreset] = await Promise.all([
    getMidnightTalentData(snapshot.specialization.slug, snapshot.activeHeroTalentTreeId, "en").catch(() => null),
    getRotationPreset(snapshot.specialization.slug, "en").catch(() => null),
  ]);
  return <CharacterAuditPage initialSnapshot={snapshot} initialFingerprint={characterProfileFingerprint(snapshot)} localePrefix="" dataMode="battle-net" talentData={talentData} rotationPreset={rotationPreset} />;
}
