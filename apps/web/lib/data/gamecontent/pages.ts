import "server-only";
import { getPublishedMythic, getPublishedRaids } from "./server";
import { getMidnightRaid } from "@/components/wow/raid/midnightRaidData";
import { getDungeonCombatIntel } from "@/components/wow/mythic/dungeonCombatIntel.server";
import { getDungeonRoute, getDungeonSelectorOptions, type DungeonSlug } from "@/components/wow/mythic/dungeonRoutes";

export async function raidPageData(slug: string) {
  const published = await getPublishedRaids();
  return { published, raid: published ? published.payload.legacyRaids[slug] ?? null : getMidnightRaid(slug) };
}

export async function dungeonPageData(season: string, slug: string) {
  const published = await getPublishedMythic();
  if (published) {
    const dungeon = season === published.payload.catalog.season.slug ? published.payload.dungeons[slug] : null;
    return {
      published, dungeon,
      options: published.payload.catalog.dungeonOrder.map((slug) => published.payload.dungeons[slug]).map(({ slug, name, nameRu, location, backdropImage, timerSeconds }) => ({ slug, name, nameRu, location, backdropImage, timerSeconds })),
      combatIntel: dungeon ? published.payload.combatIntel[slug] : null,
    };
  }
  const dungeon = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null;
  return { published: null, dungeon, options: getDungeonSelectorOptions(), combatIntel: dungeon ? getDungeonCombatIntel(dungeon) : null };
}
