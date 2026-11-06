import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterAuditPage } from "@/components/wow/audit/CharacterAuditPage";
import { CharacterProfileFrame } from "@/components/wow/characters/CharacterProfileFrame";
import { furybarFixture } from "@/lib/wow/characterAudit";
import { getTestCharacter } from "@/lib/wow/testCharacters";
import { zulutFixture } from "@/lib/wow/devFixtures/zulut";
import { FURY_REFERENCE_LOADOUT } from "@/lib/wowTalentLoadout";
import { getMidnightTalentData } from "@/lib/talentCalculatorData";
import { getRotationPreset } from "@/lib/platform/rotation/repository";
import { characterProfileFingerprint } from "@/lib/wow/characterProfileFingerprint";

export const dynamic = "force-dynamic";
/** Real Battle.net loadouts for fixtures without one (voidara = a public Shadow priest build, Voidweaver). */
const previewLoadouts: Record<string, { code: string; heroTreeId: number }> = {
  voidara: { code: "CIQAR03Gt7xPmcDNOjs2Zlb3yOMjZGAAAAAAAAAAAgxDMLmxMbzMY2mZGzw2MzYmZGbIzYxMNAzMzAABY2mNBzGDAMYMzMjZbMDmZwM4CA", heroTreeId: 18 },
};
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Development-only preview of the character page on fixture data (the real page needs Battle.net sign-in). */
export default async function CharacterPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const slug = decodeURIComponent((await params).slug);
  const fixture = slug === "furybar" ? { ...furybarFixture, activeTalentLoadout: furybarFixture.activeTalentLoadout ?? FURY_REFERENCE_LOADOUT } : slug === "zulut" ? zulutFixture("ru") : getTestCharacter(slug);
  if (!fixture) notFound();
  const preview = previewLoadouts[slug];
  const snapshot = preview && !fixture.activeTalentLoadout ? { ...fixture, activeTalentLoadout: preview.code, activeHeroTalentTreeId: preview.heroTreeId } : fixture;
  const [talentData, rotationPreset] = await Promise.all([
    getMidnightTalentData(snapshot.specialization.slug, snapshot.activeHeroTalentTreeId, "ru").catch(() => null),
    getRotationPreset(snapshot.specialization.slug, "ru").catch(() => null),
  ]);
  return <CharacterProfileFrame locale="ru"><CharacterAuditPage initialSnapshot={snapshot} initialFingerprint={characterProfileFingerprint(snapshot)} localePrefix={"/ru"} dataMode="battle-net" talentData={talentData} rotationPreset={rotationPreset} /></CharacterProfileFrame>;
}
