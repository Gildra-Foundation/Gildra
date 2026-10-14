import { wowSourceName } from "@/lib/wow/sourceLocale";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicRouteMap } from "@/components/wow/mythic/MythicRouteMap";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { dungeonSlugs, getDungeonRoute, getDungeonSelectorOptions } from "@/components/wow/mythic/dungeonRoutes";
import { preloadDungeonBackdrop } from "@/lib/wow/dungeonBackdropPreload";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

type PageProps = { params: Promise<{ dungeon: string }> };

export function generateStaticParams() {
  return dungeonSlugs.map((dungeon) => ({ dungeon }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const route = getDungeonRoute((await params).dungeon);
  if (!route) return {};
  return {
    title: `${wowSourceName(route.name, "ru", route.nameRu)}: маршрут Эпохальный+ — Gildra`,
    description: `Интерактивный маршрут ${wowSourceName(route.name, "ru", route.nameRu)}: паки, боссы, прерывания и назначения группы для Midnight · Сезон 2.`,
  };
}

export default async function DungeonMythicPage({ params }: PageProps) {
  const slug = (await params).dungeon;
  const dungeon = getDungeonRoute(slug);
  if (!dungeon) notFound();
  preloadDungeonBackdrop(dungeon);
  return <MythicRouteMap key={dungeon.slug} locale="ru" dungeon={dungeon} dungeonOptions={getDungeonSelectorOptions()} combatIntel={getDungeonCombatIntel(dungeon)} />;
}
