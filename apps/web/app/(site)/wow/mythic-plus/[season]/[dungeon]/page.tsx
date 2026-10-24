import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicRouteMap } from "@/components/wow/mythic/MythicRouteMap";
import { dungeonRoutes } from "@/components/wow/mythic/dungeonRoutes";
import { localizedRoute } from "@/components/wow/mythic/localizedRoute";
import { preloadDungeonBackdrop } from "@/lib/wow/dungeonBackdropPreload";
import { dungeonPageData } from "@/lib/data/gamecontent/pages";
import { ContentStatus, ContentUnavailable } from "@/components/gamecontent/ContentState";

export const dynamicParams = true;
export const revalidate = 60;
export function generateStaticParams() { return Object.keys(dungeonRoutes).map((dungeon) => ({ season: "midnight-season-2", dungeon })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string; dungeon: string }> }): Promise<Metadata> {
  const { season, dungeon: slug } = await params;
  const data = await dungeonPageData(season, slug).catch(() => null);
  return data?.dungeon ? { title: `${data.dungeon.name} — ${data.published?.payload.catalog.season.names.en ?? "Midnight Season 2"} Mythic+ — Gildra`, robots: { index: false, follow: true } } : {};
}
export default async function Page({ params }: { params: Promise<{ season: string; dungeon: string }> }) {
  const { season, dungeon: slug } = await params;
  const data = await dungeonPageData(season, slug).catch(() => null);
  if (!data) return <ContentUnavailable locale="en" />;
  const { dungeon: route, published, options, combatIntel } = data;
  if (!route || !combatIntel) notFound();
  preloadDungeonBackdrop(route);
  return <div data-game-content-release={published?.release.releaseId}><ContentStatus locale="en" stale={published?.stale ?? false} /><MythicRouteMap key={route.slug} locale="en" dungeon={localizedRoute(route, "en")} dungeonOptions={options} combatIntel={combatIntel} verification={published?.payload.verification} seasonSlug={published?.payload.catalog.season.slug} /></div>;
}
