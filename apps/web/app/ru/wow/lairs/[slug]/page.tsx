import { pairedAlternates } from "@/lib/seo/metadata";
import { isPublicationReady } from "@/lib/wow/publication";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LairBossGuide } from "@/components/wow/lairs/LairBossGuide";
import { getMidnightLairEncounter, midnightLairEncounters } from "@/lib/data/wow";
import { getBoss } from "@/lib/lairs";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return midnightLairEncounters.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const encounter = getMidnightLairEncounter((await params).slug);
  return encounter ? { title: `${wowSourceName(encounter.name, "ru")} — Midnight · Сезон 2 — Gildra`, description: `${wowSourceName(encounter.name, "ru")}: где найти, способности, сложность и добыча — Midnight · Сезон 2.`, alternates: pairedAlternates("ru", `/wow/lairs/${encounter.slug}`), robots: { index: isPublicationReady(`/wow/lairs/${encounter.slug}`), follow: true } } : {};
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
