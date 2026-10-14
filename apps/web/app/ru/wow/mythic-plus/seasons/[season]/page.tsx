import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicPlusCatalogPage } from "@/components/wow/mythic/MythicPlusCatalogPage";

const seasons = ["midnight-season-1", "midnight-season-2"] as const;
type Season = typeof seasons[number];
/** "midnight-season-2" → "Midnight, сезон 2". */
const seasonName = (season: string) => season.replace(/^(\w)(\w*)-season-(\d+)$/, (_, first: string, rest: string, number: string) => `${first.toUpperCase()}${rest}, сезон ${number}`);
export const dynamicParams = false;
export function generateStaticParams() { return seasons.map((season) => ({ season })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string }> }): Promise<Metadata> { const { season } = await params; return seasons.includes(season as Season) ? { title: `Эпохальный+ ${seasonName(season)} — Gildra`, robots: { index: false, follow: true } } : {}; }
export default async function Page({ params }: { params: Promise<{ season: string }> }) { const { season } = await params; if (!seasons.includes(season as Season)) notFound(); return <MythicPlusCatalogPage locale="ru" season={season as Season} />; }
