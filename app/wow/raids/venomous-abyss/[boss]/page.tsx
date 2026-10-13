import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenomousBossPage } from "@/components/wow/raid/VenomousBossPage";
import { bossBySlug, lt, venomousAbyss } from "@/lib/data/wow";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return venomousAbyss.map((boss) => ({ boss: boss.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ boss: string }> }): Promise<Metadata> {
  const { boss: slug } = await params;
  const boss = bossBySlug(slug);
  if (!boss) return {};
  const bossName = lt(boss.name, "en");
  return {
    title: `${bossName} Raid Guide — Gildra`,
    description: `${bossName} — The Venomous Abyss boss guide: abilities from the Adventure Guide, a draft strategy, phases and rewards by difficulty.`,
    alternates: {
      canonical: `/wow/raids/venomous-abyss/${slug}`,
      languages: { en: `/wow/raids/venomous-abyss/${slug}`, ru: `/ru/wow/raids/venomous-abyss/${slug}`, "x-default": `/wow/raids/venomous-abyss/${slug}` },
    },
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  const { boss: slug } = await params;
  const boss = bossBySlug(slug);
  if (!boss) notFound();
  return <VenomousBossPage boss={boss} bosses={venomousAbyss} locale="en" />;
}
