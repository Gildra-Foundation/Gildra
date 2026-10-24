import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicPlusCatalogPage } from "@/components/wow/mythic/MythicPlusCatalogPage";
import { gameContentEnabled, getPublishedMythic } from "@/lib/data/gamecontent/server";
import { PublishedMythicCatalog } from "@/components/gamecontent/PublishedCatalogs";
import { ContentUnavailable } from "@/components/gamecontent/ContentState";

const seasons = ["midnight-season-1", "midnight-season-2"] as const;
type Season = typeof seasons[number];
/** "midnight-season-2" → "Midnight, сезон 2". */
const seasonName = (season: string) => season.replace(/^(\w)(\w*)-season-(\d+)$/, (_, first: string, rest: string, number: string) => `${first.toUpperCase()}${rest}, сезон ${number}`);
export const dynamicParams = true;
export const revalidate = 60;
export function generateStaticParams() { return seasons.map((season) => ({ season })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string }> }): Promise<Metadata> { const { season } = await params; return seasons.includes(season as Season) ? { title: `Эпохальный+ ${seasonName(season)} — Gildra`, robots: { index: false, follow: true } } : {}; }
export default async function Page({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  const data = gameContentEnabled() ? await getPublishedMythic().catch(() => null) : null;
  if (gameContentEnabled()) {
    if (!data) return <ContentUnavailable locale="ru" />;
    if (season === data.payload.catalog.season.slug) return <PublishedMythicCatalog data={data} locale="ru" />;
  }
  if (!seasons.includes(season as Season)) notFound();
  return <div data-game-content-release={data?.release.releaseId}><MythicPlusCatalogPage locale="ru" season={season as Season} /></div>;
}
