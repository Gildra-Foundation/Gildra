import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicPlusCatalogPage } from "@/components/wow/mythic/MythicPlusCatalogPage";
import { gameContentEnabled, getPublishedMythic } from "@/lib/data/gamecontent/server";
import { PublishedMythicCatalog } from "@/components/gamecontent/PublishedCatalogs";
import { ContentUnavailable } from "@/components/gamecontent/ContentState";

const seasons = ["midnight-season-1", "midnight-season-2"] as const;
type Season = typeof seasons[number];
/** "midnight-season-2" → "Midnight Season 2". */
const seasonName = (season: string) => season.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const dynamicParams = true;
export const revalidate = 60;
export function generateStaticParams() { return seasons.map((season) => ({ season })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string }> }): Promise<Metadata> {
  const { season } = await params;
  return seasons.includes(season as Season) ? { title: `${seasonName(season)} Mythic+ — Gildra`, robots: { index: false, follow: true } } : {};
}
export default async function Page({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  const data = gameContentEnabled() ? await getPublishedMythic().catch(() => null) : null;
  if (gameContentEnabled()) {
    if (!data) return <ContentUnavailable locale="en" />;
    if (season === data.payload.catalog.season.slug) return <PublishedMythicCatalog data={data} locale="en" />;
  }
  if (!seasons.includes(season as Season)) notFound();
  return <div data-game-content-release={data?.release.releaseId}><MythicPlusCatalogPage locale="en" season={season as Season} /></div>;
}
