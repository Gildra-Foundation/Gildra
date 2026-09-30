import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidGuidePage } from "@/components/wow/raid/RaidGuidePage";
import { getMidnightRaid, raidSlugs } from "@/components/wow/raid/midnightRaidData";

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
    description: `${boss.nameEn} source-backed strategy draft for Midnight Season 1. Ability and loot coverage is not yet automatically complete.`,
    alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: PageProps) {
  const { raid: raidSlug, boss: bossSlug } = await params;
  const raid = getMidnightRaid(raidSlug);
  if (!raid || !raid.bosses.some((boss) => boss.slug === bossSlug)) notFound();
  return <RaidGuidePage key={`${raid.slug}:${bossSlug}`} raid={raid} locale="en" initialBossSlug={bossSlug} />;
}
