import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicRouteMap } from "@/components/wow/mythic/MythicRouteMap";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { dungeonRoutes, getDungeonRoute, getDungeonSelectorOptions, type DungeonSlug } from "@/components/wow/mythic/dungeonRoutes";
import { preloadDungeonBackdrop } from "@/lib/wow/dungeonBackdropPreload";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(dungeonRoutes).map((dungeon) => ({ dungeon })); }
export async function generateMetadata({ params }: { params: Promise<{ dungeon: string }> }): Promise<Metadata> {
  const dungeon = getDungeonRoute((await params).dungeon as DungeonSlug);
  return dungeon ? { title: `${dungeon.name} — Midnight Dungeon | Gildra`, robots: { index: false, follow: true } } : {};
}
export default async function Page({ params }: { params: Promise<{ dungeon: string }> }) {
  const slug = (await params).dungeon as DungeonSlug;
  const dungeon = getDungeonRoute(slug);
  if (!dungeon) notFound();
  preloadDungeonBackdrop(dungeon);
  return <MythicRouteMap key={dungeon.slug} locale="en" dungeon={dungeon} dungeonOptions={getDungeonSelectorOptions()} combatIntel={getDungeonCombatIntel(dungeon)} />;
}
