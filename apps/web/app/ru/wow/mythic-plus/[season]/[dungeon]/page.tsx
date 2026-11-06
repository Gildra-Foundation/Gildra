import type { Metadata } from "next";
import { dungeonMetadata } from "@/lib/seo/dungeonMetadata";
import { notFound } from "next/navigation";
import { MythicRouteMap } from "@/components/wow/mythic/MythicRouteMap";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { dungeonRoutes, getDungeonRoute, getDungeonSelectorOptions, type DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(dungeonRoutes).map((dungeon) => ({ season: "midnight-season-2", dungeon })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string; dungeon: string }> }): Promise<Metadata> { const { season, dungeon } = await params; return dungeonMetadata("ru", season, dungeon); }
export default async function Page({ params }: { params: Promise<{ season: string; dungeon: string }> }) {
  const { season, dungeon: slug } = await params;
  const route = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null;
  if (!route) notFound();
  return <MythicRouteMap key={route.slug} locale="ru" dungeon={route} dungeonOptions={getDungeonSelectorOptions()} combatIntel={getDungeonCombatIntel(route)} />;
}
