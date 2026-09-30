import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LairBossGuide } from "@/components/wow/lairs/LairBossGuide";
import { getMidnightLairEncounter, midnightLairEncounters } from "@/data/wow/midnight-lairs";
import { getBoss } from "@/lib/lairs";

export function generateStaticParams() {
  return midnightLairEncounters.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const encounter = getMidnightLairEncounter((await params).slug);
  return encounter ? { title: `${encounter.name} — Midnight Season 2 | Gildra`, description: `${encounter.name}: подтверждённая идентичность в Midnight Season 2.`, robots: { index: false, follow: true } } : {};
}

export default async function BossPage({ params }: { params: Promise<{ slug: string }> }) {
  const encounter = getMidnightLairEncounter((await params).slug);
  if (!encounter) notFound();
  const boss = getBoss(encounter.slug, "ru");
  if (!boss) notFound();
  const index = midnightLairEncounters.findIndex((entry) => entry.slug === encounter.slug);
  const nextBoss = getBoss(midnightLairEncounters[(index + 1) % midnightLairEncounters.length].slug, "ru");
  if (!nextBoss) notFound();
  return <LairBossGuide boss={boss} nextBoss={nextBoss} locale="ru" />;
}
