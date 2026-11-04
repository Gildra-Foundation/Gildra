import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QueldanasPage } from "@/components/wow/raid/QueldanasPage";
import { DreamriftPage } from "@/components/wow/raid/DreamriftPage";
import { RaidOverview } from "@/components/wow/raid/RaidOverview";
import { getMidnightRaid, raidSlugs } from "@/lib/data/wow/raid/midnightRaidData";

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
    description: raid.slug === "march-on-queldanas" ? "Belo’ren and Midnight Falls on Normal and Heroic: encounter flow, positioning, adds and responses for your specialization." : raid.slug === "the-dreamrift" ? "Chimaerus Normal and Heroic guide: realm groups, positioning, minions and abilities for your specialization." : `${raid.nameEn}, Midnight Season 1 raid: pulls on the map, ${raid.bosses.length} bosses and what to know.`,
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
  if (raid.slug === "the-dreamrift") return <DreamriftPage locale="en" />;
  if (raid.slug === "march-on-queldanas") return <QueldanasPage locale="en" />;
  return <RaidOverview raid={raid} locale="en" />;
}
