import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidGuidePage } from "@/components/wow/raid/RaidGuidePage";
import { getMidnightRaid, raidSlugs } from "@/components/wow/raid/midnightRaidData";

type PageProps = { params: Promise<{ raid: string }> };

export function generateStaticParams() {
  return raidSlugs.map((raid) => ({ raid }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const raid = getMidnightRaid((await params).raid);
  if (!raid) return {};
  return {
    title: `${raid.nameRu}: рейдовый журнал — Gildra`,
    description: `${raid.bosses.length} встреч Midnight Season 1 в черновике тактики с источником. Проверка на уровне сущностей продолжается.`,
    alternates: {
      canonical: `/ru/wow/raids/${raid.slug}`,
      languages: { en: `/wow/raids/${raid.slug}`, ru: `/ru/wow/raids/${raid.slug}`, "x-default": `/wow/raids/${raid.slug}` },
    },
    robots: { index: false, follow: true },
  };
}

export default async function RaidPage({ params }: PageProps) {
  const raid = getMidnightRaid((await params).raid);
  if (!raid) notFound();
  return <RaidGuidePage key={raid.slug} raid={raid} locale="ru" />;
}
