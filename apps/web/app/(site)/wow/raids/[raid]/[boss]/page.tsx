import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidBossGuide } from "@/components/wow/raid/RaidBossGuide";
import { getMidnightRaid, raidSlugs } from "@/lib/data/wow/raid/midnightRaidData";

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
  const path = `/wow/raids/${raid.slug}/${boss.slug}`;
  return {
    title: `${boss.nameEn} — Midnight Raid Guide — Gildra`,
    description: `${boss.nameEn} — Midnight Season 1 raid boss: battle plan, mechanics and abilities.`,
    alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: PageProps) {
  const { raid: raidSlug, boss: bossSlug } = await params;
  const raid = getMidnightRaid(raidSlug);
  const boss = raid?.bosses.find((entry) => entry.slug === bossSlug);
  if (!raid || !boss) notFound();
  return <RaidBossGuide raid={raid} boss={boss} locale="en" />;
}
