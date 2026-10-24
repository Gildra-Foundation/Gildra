import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidBossGuide } from "@/components/wow/raid/RaidBossGuide";
import { getMidnightRaid, raidSlugs } from "@/components/wow/raid/midnightRaidData";
import { raidPageData } from "@/lib/data/gamecontent/pages";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

// Known routes are prerendered; new published slugs resolve at runtime. Unknown entities remain 404.
export const dynamicParams = true;
export const revalidate = 60;

type PageProps = { params: Promise<{ raid: string; boss: string }> };

export function generateStaticParams() {
  return raidSlugs.flatMap((raidSlug) => {
    const raid = getMidnightRaid(raidSlug);
    return raid?.bosses.map((boss) => ({ raid: raidSlug, boss: boss.slug })) ?? [];
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { raid: raidSlug, boss: bossSlug } = await params;
  const data = await raidPageData(raidSlug).catch(() => null);
  const raid = data?.raid;
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
  const data = await raidPageData(raidSlug).catch(() => null);
  if (!data) return <ContentUnavailable locale="en" />;
  const { raid, published } = data;
  const boss = raid?.bosses.find((entry) => entry.slug === bossSlug);
  if (!raid || !boss) notFound();
  return <div data-game-content-release={published?.release.releaseId}><ContentStatus locale="en" stale={published?.stale ?? false} /><RaidBossGuide raid={raid} boss={boss} locale="en" content={published?.payload} /></div>;
}
