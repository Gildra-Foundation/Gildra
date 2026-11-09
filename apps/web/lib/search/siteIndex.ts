import "server-only";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { getMidnightRaid, raidSlugs } from "@/lib/data/wow/raid/midnightRaidData";
import { contentManifest, midnightLairEncounters } from "@gildra/game-data";
import { midnightClasses, midnightSpecializations } from "@/lib/data/wow/specializations";
import { getBoss } from "@/lib/lairs";
import { routeSections, type RouteSection } from "@/lib/routes/registry";
import { journalInstanceIcon } from "@/lib/games/wow/assets";
import { mapPagePath } from "@/lib/wow/worldMap/bundle";
import { worldMapBundle } from "@/lib/wow/worldMap/data.server";
import type { Lang as Locale } from "@/lib/i18n-paths";

/**
 * The quick-search index of the site (⌘K): every section, raid, boss, lair,
 * dungeon, class, specialization and delve, in both languages. Built at build
 * time (app/api/platform/site-search/route.ts; nginx sends /api/platform/* to the web app) and fetched once when the dialog opens.
 * `h` is the English path; Russian pages prefix /ru. `k` holds the other
 * language's names so either spelling finds the entry. `g` groups the results
 * of the dialog, `d` is the short context drawn after the title (a boss's raid,
 * a spec's class) and `i` the entry's own picture when the site has one.
 */
export type SiteSearchGroup = "section" | "raid" | "boss" | "lair" | "dungeon" | "class" | "talents" | "place";
export type SiteSearchEntry = { t: string; s: string; h: string; k?: string; g?: SiteSearchGroup; d?: string; i?: string };

/** A small variant of a large picture through the image optimiser (two device pixels per CSS pixel of the 32 px slot). */
const thumb = (src: string) => `/_next/image?url=${encodeURIComponent(src)}&w=64&q=50`;
const classIcon = (slug: string) => `/assets/classes/${slug.replace(/-/g, "")}.jpg`;

const label = {
  section: { en: "Section", ru: "Раздел" },
  raid: { en: "Raid", ru: "Рейд" },
  boss: { en: "Raid boss", ru: "Босс рейда" },
  lair: { en: "Lair", ru: "Логово" },
  world: { en: "World boss", ru: "Мировой босс" },
  dungeon: { en: "Mythic+ dungeon", ru: "Подземелье M+" },
  class: { en: "Class", ru: "Класс" },
  talents: { en: "Talent tree", ru: "Дерево талантов" },
  place: { en: "Map", ru: "Карта" },
} as const;

// Sections come from the route registry (lib/routes/registry.ts).
const sections = Object.values(routeSections as Record<string, RouteSection>).map((section) => ({
  only: section.only,
  h: section.path,
  en: section.search?.en ?? section.title.en,
  ru: section.search?.ru ?? section.title.ru,
  k: section.search?.keywords,
}));

type Manifest = { canonicalSlug: string; instance?: string; order?: number; names: { en: string | null; ru: string | null } };

function entries(locale: Locale): SiteSearchEntry[] {
  const other: Locale = locale === "ru" ? "en" : "ru";
  const ru = locale === "ru";
  const list: SiteSearchEntry[] = sections.filter((section) => !section.only || section.only === locale).map((section) => ({ t: section[locale], s: label.section[locale], h: section.h, k: [section[other], section.k].filter(Boolean).join(" "), g: "section" }));

  for (const slug of raidSlugs) {
    const raid = getMidnightRaid(slug);
    if (!raid) continue;
    const raidName = ru ? raid.nameRu : raid.nameEn;
    list.push({ t: raidName, s: label.raid[locale], h: `/wow/raids/${raid.slug}`, k: ru ? raid.nameEn : raid.nameRu, g: "raid", i: journalInstanceIcon(raid.slug) ?? thumb(raid.artwork) });
    for (const boss of raid.bosses) {
      list.push({ t: ru ? boss.nameRu : boss.nameEn, s: `${label.boss[locale]} · ${raidName}`, h: `/wow/raids/${raid.slug}/${boss.slug}`, k: ru ? boss.nameEn : boss.nameRu, g: "boss", d: raidName, i: thumb(boss.artwork) });
    }
  }

  const manifestRaids = contentManifest.instances as Manifest[];
  const manifestBosses = contentManifest.encounters as Manifest[];
  for (const raidSlug of ["venomous-abyss", "sporefall"]) {
    const raid = manifestRaids.find((entry) => entry.canonicalSlug === raidSlug);
    if (!raid?.names.en) continue;
    const raidName = (ru && raid.names.ru) || raid.names.en;
    list.push({ t: raidName, s: label.raid[locale], h: `/wow/raids/${raidSlug}`, k: (ru ? raid.names.en : raid.names.ru) ?? undefined, g: "raid", i: journalInstanceIcon(raidSlug) ?? undefined });
    for (const boss of manifestBosses.filter((entry) => entry.instance === raidSlug).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      if (boss.names.en) list.push({ t: (ru && boss.names.ru) || boss.names.en, s: `${label.boss[locale]} · ${raidName}`, h: `/wow/raids/${raidSlug}/${boss.canonicalSlug}`, k: (ru ? boss.names.en : boss.names.ru) ?? undefined, g: "boss", d: raidName });
    }
  }

  for (const encounter of midnightLairEncounters) {
    const boss = getBoss(encounter.slug, locale);
    if (!boss) continue;
    list.push({ t: boss.name, s: `${boss.kind === "lair" ? label.lair[locale] : label.world[locale]} · ${boss.zone}`, h: `/wow/lairs/${boss.slug}`, k: [boss.title, getBoss(encounter.slug, other)?.name, getBoss(encounter.slug, other)?.title].filter(Boolean).join(" "), g: "lair", d: boss.zone.split(" · ")[0], i: thumb(boss.portrait) });
  }

  for (const slug of dungeonSlugs) {
    const dungeon = dungeonRoutes[slug];
    list.push({ t: ru ? dungeon.nameRu : dungeon.name, s: label.dungeon[locale], h: `/wow/mythic-plus/midnight-season-2/${slug}`, k: ru ? dungeon.name : dungeon.nameRu, g: "dungeon", i: journalInstanceIcon(slug) ?? undefined });
  }

  for (const entry of midnightClasses) list.push({ t: ru ? entry.nameRu : entry.nameEn, s: label.class[locale], h: `/wow/classes#${entry.slug}`, k: ru ? entry.nameEn : entry.nameRu, g: "class", i: classIcon(entry.slug) });
  for (const spec of midnightSpecializations) {
    list.push({
      t: ru ? `${spec.specNameRu} · ${spec.classNameRu}` : `${spec.specName} ${spec.className}`,
      s: label.talents[locale],
      h: `/talents/${spec.slug}`,
      k: ru ? `${spec.specName} ${spec.className}` : `${spec.specNameRu} ${spec.classNameRu}`,
      g: "talents",
      i: spec.iconUrl,
    });
  }

  // Places of the world map with a page of their own (worlds, continents, zones, cities).
  try {
    const maps = worldMapBundle(locale).maps;
    const others = new Map(worldMapBundle(other).maps.map((map) => [map.id, map.name]));
    const byId = new Map(maps.map((map) => [map.id, map]));
    for (const map of maps) {
      if (!map.page || !map.name) continue;
      const parent = map.parent === null ? undefined : byId.get(map.parent);
      list.push({ t: map.name, s: label.place[locale], h: mapPagePath(map), k: others.get(map.id), g: "place", d: parent?.name });
    }
  } catch {
    // Without the map's data files the index simply has no places.
  }

  return list;
}

export function siteSearchIndex() {
  return { en: entries("en"), ru: entries("ru") };
}
