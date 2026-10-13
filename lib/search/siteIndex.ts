import "server-only";
import { dungeonRoutes, dungeonSlugs } from "@/components/wow/mythic/dungeonRoutes";
import { getMidnightRaid, raidSlugs } from "@/components/wow/raid/midnightRaidData";
import contentManifest from "@/data/wow/content-manifest.json";
import { midnightDelves } from "@/data/wow/midnight-delves";
import { midnightLairEncounters } from "@/data/wow/midnight-lairs";
import { midnightClasses, midnightSpecializations } from "@/data/wow/midnight-specializations";
import { getBoss } from "@/lib/lairs";
import { routeSections, type RouteSection } from "@/lib/routes/registry";

/**
 * The quick-search index of the site (⌘K): every section, raid, boss, lair,
 * dungeon, class, specialization and delve, in both languages. Built at build
 * time (app/api/platform/site-search/route.ts; nginx sends /api/platform/* to the web app) and fetched once when the dialog opens.
 * `h` is the English path; Russian pages prefix /ru. `k` holds the other
 * language's names so either spelling finds the entry.
 */
export type SiteSearchEntry = { t: string; s: string; h: string; k?: string };
type Locale = "en" | "ru";

const label = {
  section: { en: "Section", ru: "Раздел" },
  raid: { en: "Raid", ru: "Рейд" },
  boss: { en: "Raid boss", ru: "Босс рейда" },
  lair: { en: "Lair", ru: "Логово" },
  world: { en: "World boss", ru: "Мировой босс" },
  dungeon: { en: "Mythic+ dungeon", ru: "Подземелье M+" },
  class: { en: "Class", ru: "Класс" },
  talents: { en: "Talent tree", ru: "Дерево талантов" },
  delve: { en: "Delve", ru: "Вылазка" },
} as const;

// Sections come from the route registry (lib/routes/registry.ts).
const sections = Object.values(routeSections as Record<string, RouteSection>).map((section) => ({
  h: section.path,
  en: section.search?.en ?? section.title.en,
  ru: section.search?.ru ?? section.title.ru,
  k: section.search?.keywords,
}));

type Manifest = { canonicalSlug: string; instance?: string; order?: number; names: { en: string | null; ru: string | null } };

function entries(locale: Locale): SiteSearchEntry[] {
  const other: Locale = locale === "ru" ? "en" : "ru";
  const list: SiteSearchEntry[] = sections.map((section) => ({ t: section[locale], s: label.section[locale], h: section.h, k: [section[other], section.k].filter(Boolean).join(" ") }));

  for (const slug of raidSlugs) {
    const raid = getMidnightRaid(slug);
    if (!raid) continue;
    list.push({ t: raid.nameEn, s: label.raid[locale], h: `/wow/raids/${raid.slug}`, k: raid.nameRu });
    for (const boss of raid.bosses) list.push({ t: boss.nameEn, s: `${label.boss[locale]} · ${raid.nameEn}`, h: `/wow/raids/${raid.slug}/${boss.slug}`, k: boss.nameRu });
  }

  const manifestRaids = contentManifest.instances as Manifest[];
  const manifestBosses = contentManifest.encounters as Manifest[];
  for (const raidSlug of ["venomous-abyss", "sporefall"]) {
    const raid = manifestRaids.find((entry) => entry.canonicalSlug === raidSlug);
    if (!raid?.names.en) continue;
    list.push({ t: raid.names.en, s: label.raid[locale], h: `/wow/raids/${raidSlug}`, k: raid.names.ru ?? undefined });
    for (const boss of manifestBosses.filter((entry) => entry.instance === raidSlug).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      if (boss.names.en) list.push({ t: boss.names.en, s: `${label.boss[locale]} · ${raid.names.en}`, h: `/wow/raids/${raidSlug}/${boss.canonicalSlug}`, k: boss.names.ru ?? undefined });
    }
  }

  for (const encounter of midnightLairEncounters) {
    const boss = getBoss(encounter.slug, locale);
    if (!boss) continue;
    list.push({ t: boss.name, s: `${boss.kind === "lair" ? label.lair[locale] : label.world[locale]} · ${boss.zone}`, h: `/wow/lairs/${boss.slug}`, k: [boss.title, getBoss(encounter.slug, other)?.title].filter(Boolean).join(" ") });
  }

  for (const slug of dungeonSlugs) {
    const dungeon = dungeonRoutes[slug];
    list.push({ t: locale === "ru" ? dungeon.nameRu : dungeon.name, s: label.dungeon[locale], h: `/wow/mythic-plus/midnight-season-2/${slug}`, k: locale === "ru" ? dungeon.name : dungeon.nameRu });
  }

  for (const entry of midnightClasses) list.push({ t: locale === "ru" ? entry.nameRu : entry.nameEn, s: label.class[locale], h: `/wow/classes/${entry.slug}`, k: locale === "ru" ? entry.nameEn : entry.nameRu });
  for (const spec of midnightSpecializations) {
    list.push({
      t: locale === "ru" ? `${spec.specNameRu} · ${spec.classNameRu}` : `${spec.specName} ${spec.className}`,
      s: label.talents[locale],
      h: `/talents/${spec.slug}`,
      k: locale === "ru" ? `${spec.specName} ${spec.className}` : `${spec.specNameRu} ${spec.classNameRu}`,
    });
  }

  for (const delve of midnightDelves) list.push({ t: delve.name, s: label.delve[locale], h: `/wow/delves/${delve.slug}` });
  return list;
}

export function siteSearchIndex() {
  return { en: entries("en"), ru: entries("ru") };
}
