import type { Metadata } from "next";
import { pairedAlternates } from "@/lib/seo/metadata";
import { notFound } from "next/navigation";
import { MythicRouteMap } from "@/components/wow/mythic/MythicRouteMap";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { dungeonRoutes, getDungeonRoute, getDungeonSelectorOptions, type DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { localizedRoute } from "@/components/wow/mythic/localizedRoute";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(dungeonRoutes).map((dungeon) => ({ season: "midnight-season-2", dungeon })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string; dungeon: string }> }): Promise<Metadata> { const { season, dungeon: slug } = await params; const dungeon = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null; return dungeon ? { title: `${dungeon.name} — Midnight Season 2 Mythic+ — Gildra`, alternates: pairedAlternates("en", `/wow/mythic-plus/${season}/${dungeon.slug}`) } : {}; }
export default async function Page({ params }: { params: Promise<{ season: string; dungeon: string }> }) {
  const { season, dungeon: slug } = await params;
  const route = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null;
  if (!route) notFound();
  return <MythicRouteMap key={route.slug} locale="en" dungeon={localizedRoute(route, "en")} dungeonOptions={getDungeonSelectorOptions()} combatIntel={getDungeonCombatIntel(route)} />;
}
