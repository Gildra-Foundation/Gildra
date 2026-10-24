import { mvpRoute } from "@/components/wow/mythic/mvpRoute";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MythicWalkthrough } from "@/components/wow/mythic/MythicWalkthrough";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { dungeonRoutes, getDungeonRoute, getDungeonSelectorOptions, type DungeonSlug } from "@/components/wow/mythic/dungeonRoutes";
import { isPublicationReady } from "@/lib/wow/publication";
import { pairedAlternates } from "@/lib/seo/metadata";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(dungeonRoutes).map((dungeon) => ({ season: "midnight-season-2", dungeon })); }
export async function generateMetadata({ params }: { params: Promise<{ season: string; dungeon: string }> }): Promise<Metadata> { const { season, dungeon: slug } = await params; const dungeon = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null; return dungeon ? { title: `${wowSourceName(dungeon.name, "ru", dungeon.nameRu)} — Эпохальный+ Midnight, сезон 2 — Gildra`, alternates: pairedAlternates("ru", `/wow/mythic-plus/${season}/${slug}`), robots: { index: isPublicationReady(`/wow/mythic-plus/${season}/${slug}`), follow: true } } : {}; }
export default async function Page({ params }: { params: Promise<{ season: string; dungeon: string }> }) {
  const { season, dungeon: slug } = await params;
  const route = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null;
  if (!route) notFound();
  const prepared = mvpRoute(route, "ru");
  return <MythicWalkthrough key={route.slug} locale="ru" dungeon={prepared} dungeonOptions={getDungeonSelectorOptions()} combatIntel={getDungeonCombatIntel(prepared)} />;
}
