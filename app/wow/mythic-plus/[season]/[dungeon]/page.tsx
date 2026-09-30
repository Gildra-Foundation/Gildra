import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicRouteMap } from "@/components/wow/mythic/MythicRouteMap";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { dungeonRoutes, getDungeonRoute, getDungeonSelectorOptions, type DungeonSlug } from "@/components/wow/mythic/dungeonRoutes";
import { preloadDungeonBackdrop } from "@/lib/wow/dungeonBackdropPreload";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(dungeonRoutes).map((dungeon) => ({ season: "midnight-season-2", dungeon })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string; dungeon: string }> }): Promise<Metadata> { const { season, dungeon: slug } = await params; const dungeon = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null; return dungeon ? { title: `${dungeon.name} — Midnight Season 2 Mythic+ | Gildra`, robots: { index: false, follow: true } } : {}; }
export default async function Page({ params }: { params: Promise<{ season: string; dungeon: string }> }) {
  const { season, dungeon: slug } = await params;
  const route = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null;
  if (!route) notFound();
  preloadDungeonBackdrop(route);
  return <MythicRouteMap key={route.slug} locale="en" dungeon={route} dungeonOptions={getDungeonSelectorOptions()} combatIntel={getDungeonCombatIntel(route)} />;
}
