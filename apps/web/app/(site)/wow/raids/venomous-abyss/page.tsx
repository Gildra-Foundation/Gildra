import type { Metadata } from "next";
import { VenomousAbyssPage } from "@/components/wow/raid/VenomousAbyssPage";
import { gameContentEnabled, getPublishedRaids } from "@/lib/data/gamecontent/server";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

export const revalidate = 60;
const legacyMetadata: Metadata = {
  title: "The Venomous Abyss Raid Guide — Gildra",
  description: "Midnight Season 2 raid index with eight encounter pages and the verified Raid Finder schedule. Detailed entity verification is still in progress.",
  alternates: {
    canonical: "/wow/raids/venomous-abyss",
    languages: { en: "/wow/raids/venomous-abyss", ru: "/ru/wow/raids/venomous-abyss", "x-default": "/wow/raids/venomous-abyss" },
  },
  robots: { index: false, follow: true },
};

export async function generateMetadata(): Promise<Metadata> {
  if (!gameContentEnabled()) return legacyMetadata;
  const data = await getPublishedRaids().catch(() => null);
  const entry = data?.payload.catalog.entries.find((entry) => entry.slug === "venomous-abyss");
  const names = entry?.names;
  return names ? { ...legacyMetadata, title: `${names.en || names.en} — Gildra` } : { ...legacyMetadata, robots: { index: false, follow: true } };
}
export default async function Page() {
  if (gameContentEnabled()) {
    const data = await getPublishedRaids().catch(() => null);
    if (!data) return <ContentUnavailable locale="en" />;
    return <div data-game-content-release={data.release.releaseId}><ContentStatus locale="en" stale={data.stale} /><VenomousAbyssPage locale="en" content={data.payload} /></div>;
  }
  return <VenomousAbyssPage locale="en" />;
}
