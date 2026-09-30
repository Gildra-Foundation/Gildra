import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicRouteMap } from "@/components/wow/mythic/MythicRouteMap";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { dungeonSlugs, getDungeonRoute, getDungeonSelectorOptions } from "@/components/wow/mythic/dungeonRoutes";
import { preloadDungeonBackdrop } from "@/lib/wow/dungeonBackdropPreload";

type PageProps = { params: Promise<{ dungeon: string }> };

export function generateStaticParams() {
  return dungeonSlugs.map((dungeon) => ({ dungeon }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const route = getDungeonRoute((await params).dungeon);
  if (!route) return {};
  return {
    title: `${route.name} Mythic+ Route — Gildra`,
    description: `Interactive ${route.name} route, pulls, boss tactics, interrupts and party assignments for Midnight Season 2.`,
  };
}

export default async function DungeonMythicPage({ params }: PageProps) {
  const slug = (await params).dungeon;
  const dungeon = getDungeonRoute(slug);
  if (!dungeon) notFound();
  preloadDungeonBackdrop(dungeon);
  return <MythicRouteMap key={dungeon.slug} locale="en" dungeon={dungeon} dungeonOptions={getDungeonSelectorOptions()} combatIntel={getDungeonCombatIntel(dungeon)} />;
}
