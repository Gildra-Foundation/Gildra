import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenomousBossPage } from "@/components/wow/raid/VenomousBossPage";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";
import { bossBySlug, lt, venomousAbyss } from "@/lib/data/wow";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = true;
export const revalidate = 60;

export function generateStaticParams() {
  return venomousAbyss.map((boss) => ({ boss: boss.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ boss: string }> }): Promise<Metadata> {
  const { boss: slug } = await params;
  const data = await getPublishedRaids().catch(() => null);
  const boss = gameContentEnabled() ? data?.payload.venomousBosses.find((boss) => boss.slug === slug) : bossBySlug(slug);
  if (!boss) return {};
  const bossName = lt(boss.name, "ru");
  return {
    title: `${bossName} — гайд по боссу Gildra`,
    description: `${bossName} — гайд по боссу «Отравленной бездны»: способности из журнала приключений, черновик тактики, фазы и награды по сложностям.`,
    alternates: {
      canonical: `/ru/wow/raids/venomous-abyss/${slug}`,
      languages: { en: `/wow/raids/venomous-abyss/${slug}`, ru: `/ru/wow/raids/venomous-abyss/${slug}`, "x-default": `/wow/raids/venomous-abyss/${slug}` },
    },
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  const { boss: slug } = await params;
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    if (!data) return <ContentUnavailable locale="ru" />;
    const boss = data.payload.venomousBosses.find((boss) => boss.slug === slug);
    if (!boss) notFound();
    return <div data-game-content-release={data.release.releaseId}><ContentStatus locale="ru" stale={data.stale} /><VenomousBossPage boss={boss} bosses={data.payload.venomousBosses} content={data.payload} locale="ru" /></div>;
  }
  const boss = bossBySlug(slug);
  if (!boss) notFound();
  return <VenomousBossPage boss={boss} bosses={venomousAbyss} locale="ru" />;
}
