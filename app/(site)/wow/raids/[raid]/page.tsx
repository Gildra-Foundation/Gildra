import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidOverview } from "@/components/wow/raid/RaidOverview";
import { getMidnightRaid, raidSlugs } from "@/components/wow/raid/midnightRaidData";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

type PageProps = { params: Promise<{ raid: string }> };

export function generateStaticParams() {
  return raidSlugs.map((raid) => ({ raid }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const raid = getMidnightRaid((await params).raid);
  if (!raid) return {};
  return {
    title: `${raid.nameEn} Raid Guide — Gildra`,
    description: `${raid.bosses.length} Midnight Season 1 encounters in a source-backed strategy draft. Entity-level verification is still in progress.`,
    alternates: {
      canonical: `/wow/raids/${raid.slug}`,
      languages: { en: `/wow/raids/${raid.slug}`, ru: `/ru/wow/raids/${raid.slug}`, "x-default": `/wow/raids/${raid.slug}` },
    },
    robots: { index: false, follow: true },
  };
}

export default async function RaidPage({ params }: PageProps) {
  const raid = getMidnightRaid((await params).raid);
  if (!raid) notFound();
  return <RaidOverview raid={raid} locale="en" />;
}
