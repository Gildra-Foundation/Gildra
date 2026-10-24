import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidOverview } from "@/components/wow/raid/RaidOverview";
import { raidSlugs } from "@/components/wow/raid/midnightRaidData";
import { raidPageData } from "@/lib/data/gamecontent/pages";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

// Known routes are prerendered; new published slugs resolve at runtime. Unknown entities remain 404.
export const dynamicParams = true;
export const revalidate = 60;

type PageProps = { params: Promise<{ raid: string }> };

export function generateStaticParams() {
  return raidSlugs.map((raid) => ({ raid }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await raidPageData((await params).raid).catch(() => null);
  const raid = data?.raid;
  if (!raid) return {};
  return {
    title: `${raid.nameRu}: рейдовый журнал — Gildra`,
    description: `${raid.bosses.length} встреч Midnight · Сезон 1 в черновике тактики с источником. Проверка на уровне сущностей продолжается.`,
    alternates: {
      canonical: `/ru/wow/raids/${raid.slug}`,
      languages: { en: `/wow/raids/${raid.slug}`, ru: `/ru/wow/raids/${raid.slug}`, "x-default": `/wow/raids/${raid.slug}` },
    },
    robots: { index: false, follow: true },
  };
}

export default async function RaidPage({ params }: PageProps) {
  const data = await raidPageData((await params).raid).catch(() => null);
  if (!data) return <ContentUnavailable locale="ru" />;
  const { raid, published } = data;
  if (!raid) notFound();
  return <div data-game-content-release={published?.release.releaseId}><ContentStatus locale="ru" stale={published?.stale ?? false} /><RaidOverview raid={raid} locale="ru" content={published?.payload} /></div>;
}
