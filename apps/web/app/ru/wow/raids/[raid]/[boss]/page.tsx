import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidBossGuide } from "@/components/wow/raid/RaidBossGuide";
import { getMidnightRaid, raidSlugs } from "@/components/wow/raid/midnightRaidData";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

type PageProps = { params: Promise<{ raid: string; boss: string }> };

export function generateStaticParams() {
  return raidSlugs.flatMap((raidSlug) => {
    const raid = getMidnightRaid(raidSlug);
    return raid?.bosses.map((boss) => ({ raid: raidSlug, boss: boss.slug })) ?? [];
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { raid: raidSlug, boss: bossSlug } = await params;
  const raid = getMidnightRaid(raidSlug);
  const boss = raid?.bosses.find((entry) => entry.slug === bossSlug);
  if (!raid || !boss) return {};
  const path = `/ru/wow/raids/${raid.slug}/${boss.slug}`;
  const enPath = `/wow/raids/${raid.slug}/${boss.slug}`;
  return {
    title: `${boss.nameRu} — рейдовый гайд Midnight — Gildra`,
    description: `${boss.nameRu}: черновик тактики Midnight · Сезон 1 с источником. Данные способностей и добычи ещё не подтверждено автоматически.`,
    alternates: { canonical: path, languages: { en: enPath, ru: path, "x-default": enPath } },
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: PageProps) {
  const { raid: raidSlug, boss: bossSlug } = await params;
  const raid = getMidnightRaid(raidSlug);
  const boss = raid?.bosses.find((entry) => entry.slug === bossSlug);
  if (!raid || !boss) notFound();
  return <RaidBossGuide raid={raid} boss={boss} locale="ru" />;
}
