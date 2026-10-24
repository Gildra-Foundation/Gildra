import { notFound, redirect } from "next/navigation";
import { auth, isBattleNetAuthConfigured } from "@/auth";
import { createHash } from "node:crypto";
import { CharacterProfileMvp } from "@/components/wow/characters/CharacterProfileMvp";
import { CharacterProfileLoadError } from "@/components/wow/characters/CharacterProfileLoadError";
import { BattleNetCharacterDataError, characterSlug, getBattleNetCharacterDetails } from "@/lib/wow/battleNetCharacterDetails";
import { BattleNetProfileError, getBattleNetCharacters, isBattleNetRegion } from "@/lib/wow/battleNetCharacters";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }> };

export default async function CharacterPage({ params }: PageProps) {
  const session = isBattleNetAuthConfigured ? await auth() : null;
  if (!session?.battleNetAccessToken) redirect("/ru/login");
  const rawSlug = (await params).slug;
  const requested = decodeURIComponent(rawSlug).toLowerCase();
  const requestedRegion = requested.split("--", 1)[0];
  let characters;
  try { characters = await getBattleNetCharacters(session.battleNetAccessToken, "ru", isBattleNetRegion(requestedRegion) ? requestedRegion : undefined); }
  catch (error) {
    const code = error instanceof BattleNetProfileError ? error.status === 401 ? "expired" : error.status === 403 ? "forbidden" : error.status === 429 ? "rate_limited" : "unavailable" : "unavailable";
    return <CharacterProfileLoadError locale="ru" code={code} retryHref={`/ru/wow/characters/${rawSlug}`} />;
  }
  const character = characters.find((item) => decodeURIComponent(characterSlug(item)).toLowerCase() === requested);
  if (!character) notFound();
  let details;
  try { details = await getBattleNetCharacterDetails(session.battleNetAccessToken, character, "ru", true); }
  catch (error) {
    const code = error instanceof BattleNetCharacterDataError ? error.code === "expired" ? "expired" : error.code === "forbidden" ? "forbidden" : error.code === "rate_limited" ? "rate_limited" : error.code === "incomplete" ? "incomplete" : "unavailable" : "unavailable";
    return <CharacterProfileLoadError locale="ru" code={code} retryHref={`/ru/wow/characters/${rawSlug}`} />;
  }
  if (!session.user?.id) redirect("/ru/login");
  const owner = createHash("sha256").update(`battlenet:${session.user.id}`).digest("hex").slice(0, 32);
  return <CharacterProfileMvp details={details} owner={owner} lang="ru" />;
}
