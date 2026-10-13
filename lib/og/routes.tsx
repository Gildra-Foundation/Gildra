import { pluralRu } from "@/components/atlas/format";
import { getMidnightRaid, raidSceneArt, raidSlugs } from "@/components/wow/raid/midnightRaidData";
import { getBossStrategy } from "@/components/wow/raid/raidStrategy";
import { dungeonRoutes, getDungeonRoute, type DungeonSlug } from "@/components/wow/mythic/dungeonRoutes";
import contentManifest from "@/data/wow/content-manifest.json";
import { midnightDelves } from "@/data/wow/midnight-delves";
import { midnightLairEncounters } from "@/data/wow/midnight-lairs";
import { getMidnightClass, getMidnightClassSpec, getMidnightClassSpecs, midnightClasses, midnightSpecializations } from "@/data/wow/midnight-specializations";
import { atlasScenes, type AtlasSceneId } from "@/lib/atlas/scenes";
import { getBoss } from "@/lib/lairs";
import { getTalentSpecTheme, talentSpecThemes } from "@/lib/talentSpecThemes";
import { atlasOgImage, type AtlasOgSpec } from "./atlasOg";

/**
 * Open Graph cards of the atlas routes. Each `opengraph-image.tsx` in app/ is a
 * two-line wrapper: `export default ogImage("<locale>", "<kind>")`. A kind turns
 * the route params into the card (scene, eyebrow, title, facts); unknown params
 * fall back to the section card, so a card is never broken.
 */
type Locale = "en" | "ru";
type Params = Record<string, string>;
type Spec = Omit<AtlasOgSpec, "locale">;

const L = "/assets/wow/loading";
/** Art and preview crop of a section scene (lib/atlas/scenes.ts). */
const scene = (id: AtlasSceneId) => ({ art: atlasScenes[id].art, focus: atlasScenes[id].og });
const ru = (locale: Locale) => locale === "ru";
const count = (locale: Locale, value: number, one: string, few: string, many: string, en: string, enPlural = `${en}s`) =>
  `${value} ${ru(locale) ? pluralRu(value, one, few, many) : value === 1 ? en : enPlural}`;

type Manifest = { canonicalSlug: string; instance?: string; order?: number; names: { en: string | null; ru: string | null } };
const instances = contentManifest.instances as Manifest[];
const encounters = contentManifest.encounters as Manifest[];

const mythicPlusHub = (locale: Locale): Spec => ({ ...scene("mythicPlus"), eyebrow: ru(locale) ? "Midnight · Сезон 2" : "Midnight · Season 2", title: ru(locale) ? "Атлас Mythic+" : "Mythic+ atlas", subtitle: ru(locale) ? "Маршруты, таймеры и тактика подземелий сезона." : "Routes, timers and tactics for the dungeons of the season.", facts: [count(locale, Object.keys(dungeonRoutes).length, "подземелье", "подземелья", "подземелий", "dungeon")] });

const hubs = {
  wow: (locale) => ({ ...scene("wow"), eyebrow: "Midnight", title: ru(locale) ? "Командный центр в Азероте" : "Command center in Azeroth", subtitle: ru(locale) ? "Рейды, Mythic+, логова, классы и база данных World of Warcraft." : "Raids, Mythic+, lairs, classes and the World of Warcraft database." }),
  raids: (locale) => ({ ...scene("raids"), eyebrow: "Midnight", title: ru(locale) ? "Рейдовый журнал" : "Raid journal", subtitle: ru(locale) ? "Боссы, способности и тактика рейдов Midnight." : "Bosses, abilities and strategy of the Midnight raids." }),
  mythicPlus: mythicPlusHub,
  dungeons: (locale) => ({ ...mythicPlusHub(locale), ...scene("dungeons"), title: ru(locale) ? "Подземелья" : "Dungeons" }),
  lairs: (locale) => ({ ...scene("lairs"), eyebrow: ru(locale) ? "Midnight · Сезон 2" : "Midnight · Season 2", title: ru(locale) ? "Логова и мировые боссы" : "Lairs and world bosses", subtitle: ru(locale) ? "Где найти, что делать в бою и какая добыча падает." : "Where to find them, what to do and what drops." }),
  classes: (locale) => ({ ...scene("classes"), eyebrow: "Midnight", title: ru(locale) ? "Классы и специализации" : "Classes and specializations", facts: [count(locale, midnightClasses.length, "класс", "класса", "классов", "class", "classes"), count(locale, midnightSpecializations.length, "специализация", "специализации", "специализаций", "specialization")] }),
  delves: (locale) => ({ ...scene("delves"), eyebrow: "Midnight", title: ru(locale) ? "Вылазки" : "Delves", facts: [count(locale, midnightDelves.length, "вылазка", "вылазки", "вылазок", "delve")] }),
  tierLists: (locale) => ({ ...scene("tierLists"), eyebrow: "Mythic+ · Raids", title: ru(locale) ? "Тир-листы" : "Tier lists", subtitle: ru(locale) ? "Сила специализаций в ключах и рейдах." : "Specialization strength in keys and raids." }),
  database: (locale) => ({ ...scene("archive"), eyebrow: "World of Warcraft", title: ru(locale) ? "База данных" : "Database", subtitle: ru(locale) ? "Предметы, заклинания, задания и существа с подсказками и историей версий." : "Items, spells, quests and creatures with tooltips and version history." }),
  library: (locale) => ({ ...scene("library"), eyebrow: "World of Warcraft", title: ru(locale) ? "Библиотека" : "Library", subtitle: ru(locale) ? "Наборы игровых данных: подсказки, изображения и связи." : "Game datasets: tooltips, images and relations." }),
} satisfies Record<string, (locale: Locale) => Spec>;

const kinds = {
  ...hubs,

  raid: (locale: Locale, { raid: slug }: Params): Spec => {
    const raid = getMidnightRaid(slug);
    if (!raid) return hubs.raids(locale);
    return {
      art: raidSceneArt(raid),
      focus: [0.5, 0.35],
      eyebrow: ru(locale) ? `Midnight · Сезон 1 · ${raid.locationRu}` : `Midnight · Season 1 · ${raid.locationEn}`,
      title: raid.nameEn,
      facts: [count(locale, raid.bosses.length, "встреча", "встречи", "встреч", "encounter")],
    };
  },

  raidBoss: (locale: Locale, { raid: raidSlug, boss: bossSlug }: Params): Spec => {
    const raid = getMidnightRaid(raidSlug);
    const boss = raid?.bosses.find((entry) => entry.slug === bossSlug);
    if (!raid || !boss) return hubs.raids(locale);
    const order = raid.bosses.indexOf(boss) + 1;
    const mechanics = getBossStrategy(raid, boss)?.guide?.mechanics.length;
    return {
      art: boss.artwork,
      focus: [0.5, 0.3],
      eyebrow: `${raid.nameEn} · ${ru(locale) ? `встреча ${order} из ${raid.bosses.length}` : `encounter ${order} of ${raid.bosses.length}`}`,
      title: boss.nameEn,
      facts: mechanics ? [count(locale, mechanics, "механика", "механики", "механик", "mechanic"), ru(locale) ? "План боя" : "Battle plan"] : undefined,
    };
  },

  venomous: (locale: Locale): Spec => {
    const bosses = encounters.filter((entry) => entry.instance === "venomous-abyss");
    return { ...scene("venomousAbyss"), eyebrow: ru(locale) ? "Midnight · Сезон 2 · рейд" : "Midnight · Season 2 · raid", title: "The Venomous Abyss", facts: [count(locale, bosses.length, "босс", "босса", "боссов", "boss", "bosses"), ru(locale) ? "Текущий рейд" : "Current raid"] };
  },

  venomousBoss: (locale: Locale, { boss: slug }: Params): Spec => {
    const bosses = encounters.filter((entry) => entry.instance === "venomous-abyss").sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const index = bosses.findIndex((entry) => entry.canonicalSlug === slug);
    if (index < 0) return kinds.venomous(locale);
    return { ...scene("venomousBoss"), eyebrow: `The Venomous Abyss · ${ru(locale) ? `встреча ${index + 1} из ${bosses.length}` : `encounter ${index + 1} of ${bosses.length}`}`, title: bosses[index].names.en ?? slug };
  },

  sporefall: (locale: Locale): Spec => {
    const raid = instances.find((entry) => entry.canonicalSlug === "sporefall");
    return { ...scene("sporefall"), eyebrow: ru(locale) ? "Midnight · рейд" : "Midnight · raid", title: raid?.names.en ?? "Sporefall", facts: [ru(locale) ? "Подробности позже" : "Details later"] };
  },

  lair: (locale: Locale, { slug }: Params): Spec => {
    const boss = getBoss(slug, locale);
    if (!boss) return hubs.lairs(locale);
    return {
      art: boss.portrait,
      focus: [0.5, 0.25],
      eyebrow: `${boss.kind === "lair" ? (ru(locale) ? "Логово" : "Lair") : (ru(locale) ? "Мировой босс" : "World boss")} · ${boss.zone}`,
      title: boss.name,
      subtitle: boss.title,
      facts: [count(locale, boss.mechanics.length, "способность", "способности", "способностей", "ability", "abilities"), count(locale, boss.loot.length, "предмет", "предмета", "предметов", "item")],
    };
  },

  dungeon: (locale: Locale, { dungeon: slug }: Params): Spec => {
    const dungeon = getDungeonRoute(slug as DungeonSlug);
    if (!dungeon) return hubs.mythicPlus(locale);
    const minutes = Math.round(dungeon.timerSeconds / 60);
    return {
      art: dungeon.backdropImage,
      focus: [0.5, 0.4],
      eyebrow: `Mythic+ · ${dungeon.location}`,
      title: ru(locale) ? dungeon.nameRu : dungeon.name,
      subtitle: ru(locale) ? dungeon.name : undefined,
      facts: [ru(locale) ? `Таймер ${minutes}:00` : `Timer ${minutes}:00`, ru(locale) ? "Маршрут по шагам" : "Step-by-step route"],
    };
  },

  class: (locale: Locale, { class: slug }: Params): Spec => {
    const entry = getMidnightClass(slug);
    if (!entry) return hubs.classes(locale);
    const specs = getMidnightClassSpecs(slug);
    return {
      art: `${L}/talents-wow.webp`,
      focus: [0.5, 0.4],
      emblem: specs[0]?.classIconUrl,
      eyebrow: ru(locale) ? "Класс · Midnight" : "Class · Midnight",
      title: ru(locale) ? entry.nameRu : entry.nameEn,
      facts: specs.map((spec) => (ru(locale) ? spec.specNameRu : spec.specName)),
    };
  },

  spec: (locale: Locale, { class: classSlug, spec: specSlug }: Params): Spec => {
    const entry = getMidnightClassSpec(classSlug, specSlug);
    if (!entry) return hubs.classes(locale);
    return {
      art: `${L}/talents-wow.webp`,
      focus: [0.5, 0.4],
      emblem: entry.iconUrl,
      eyebrow: ru(locale) ? `${entry.classNameRu} · ${entry.roleRu}` : `${entry.className} · ${entry.role[0].toUpperCase()}${entry.role.slice(1)}`,
      title: ru(locale) ? entry.specNameRu : entry.specName,
      facts: [ru(locale) ? "Дерево талантов" : "Talent tree", "Midnight 12.1"],
    };
  },

  talents: (locale: Locale, { spec: slug }: Params): Spec => {
    const theme = getTalentSpecTheme(slug);
    if (!theme) return hubs.classes(locale);
    return {
      art: `${L}/talents-wow.webp`,
      focus: [0.5, 0.4],
      emblem: theme.iconUrl,
      eyebrow: ru(locale) ? `Калькулятор талантов · ${theme.classNameRu}` : `Talent calculator · ${theme.className}`,
      title: ru(locale) ? theme.specNameRu : `${theme.specName} ${theme.className}`,
      facts: theme.heroPaths.map((path) => (ru(locale) ? path.nameRu : path.name)),
    };
  },

  delve: (locale: Locale, { delve: slug }: Params): Spec => {
    const delve = midnightDelves.find((entry) => entry.slug === slug);
    if (!delve) return hubs.delves(locale);
    const season = delve.season.endsWith("2") ? 2 : 1;
    return { art: `${L}/dungeon.webp`, focus: [0.5, 0.45], eyebrow: ru(locale) ? `Вылазка · Midnight · Сезон ${season}` : `Delve · Midnight · Season ${season}`, title: delve.name, facts: [ru(locale) ? `Патч ${delve.patch}` : `Patch ${delve.patch}`] };
  },
} satisfies Record<string, (locale: Locale, params: Params) => Spec>;

export type OgKind = keyof typeof kinds;

/** Params of the dynamic card routes, so every card is drawn once at build time. */
const staticParams = {
  raid: () => raidSlugs.map((raid) => ({ raid })),
  raidBoss: () => raidSlugs.flatMap((raid) => (getMidnightRaid(raid)?.bosses ?? []).map((boss) => ({ raid, boss: boss.slug }))),
  venomousBoss: () => encounters.filter((entry) => entry.instance === "venomous-abyss").map((entry) => ({ boss: entry.canonicalSlug })),
  lair: () => midnightLairEncounters.map(({ slug }) => ({ slug })),
  dungeon: () => Object.keys(dungeonRoutes).map((dungeon) => ({ dungeon })),
  seasonDungeon: () => Object.keys(dungeonRoutes).map((dungeon) => ({ season: "midnight-season-2", dungeon })),
  class: () => midnightClasses.map(({ slug }) => ({ class: slug })),
  spec: () => midnightSpecializations.map((entry) => ({ class: entry.classSlug, spec: entry.slug })),
  talents: () => talentSpecThemes.map(({ slug }) => ({ spec: slug })),
  delve: () => midnightDelves.map(({ slug }) => ({ delve: slug })),
};

export function ogStaticParams(key: keyof typeof staticParams) {
  return staticParams[key]();
}

/** The default export of an `opengraph-image.tsx`: the card of this route kind in this locale. */
export function ogImage(locale: Locale, kind: OgKind) {
  return async function Image({ params }: { params?: Promise<Params> }) {
    const resolved = (await params) ?? {};
    return atlasOgImage({ locale, ...kinds[kind](locale, resolved) });
  };
}
