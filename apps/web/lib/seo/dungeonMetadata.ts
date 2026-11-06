import type { Metadata } from "next";
import { pluralRu } from "@gildra/atlas-ui/format";
import { getDungeonRoute, type DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";
import type { Lang as Locale } from "@/lib/i18n-paths";

/** Title, description, canonical + hreflang and Open Graph of a Mythic+ dungeon route page; empty for an unknown dungeon. */
export function dungeonMetadata(locale: Locale, season: string, slug: string): Metadata {
  const dungeon = season === "midnight-season-2" ? getDungeonRoute(slug as DungeonSlug) : null;
  if (!dungeon) return {};
  const minutes = Math.round(dungeon.timerSeconds / 60);
  const bosses = dungeon.stops.filter((stop) => stop.kind === "boss").length;
  const steps = dungeon.stops.length;
  const name = locale === "ru" ? wowSourceName(dungeon.name, "ru", dungeon.nameRu) : dungeon.name;
  const title = locale === "ru" ? `${name} — Mythic+ Midnight, сезон 2 — Gildra` : `${name} — Midnight Season 2 Mythic+ — Gildra`;
  const description = locale === "ru"
    ? `Маршрут Mythic+ «${name}» в Midnight, сезон 2: ${steps} ${pluralRu(steps, "шаг", "шага", "шагов")} на карте, ${bosses} ${pluralRu(bosses, "босс", "босса", "боссов")}, таймер ${minutes}:00, пулы, задачи ролей и тактика.`
    : `${name} Mythic+ route for Midnight Season 2: ${steps} steps on the map, ${bosses} bosses, a ${minutes}:00 timer, pulls, role tasks and boss tactics.`;
  const alternates = pairedAlternates(locale, `/wow/mythic-plus/${season}/${dungeon.slug}`);
  return { title, description, alternates, openGraph: pageOpenGraph(locale, { title, description, path: String(alternates.canonical) }) };
}
