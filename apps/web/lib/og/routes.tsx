import { pluralRu } from "@gildra/atlas-ui/format";
import { getMidnightRaid, raidRouteSlugs, raidSceneArt } from "@/lib/data/wow/raid/midnightRaidData";
import { getBossStrategy } from "@/lib/data/wow/raid/raidStrategy";
import { dungeonRoutes, getDungeonRoute, type DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { contentManifest, midnightLairEncounters } from "@gildra/game-data";
import { getMidnightClass, getMidnightClassSpec, getMidnightClassSpecs, midnightClasses, midnightSpecializations } from "@/lib/data/wow/specializations";
import { atlasScenes, type AtlasSceneId } from "@/lib/atlas/scenes";
import { getBoss } from "@/lib/lairs";
import { getTalentSpecTheme, talentSpecThemes } from "@/lib/talentSpecThemes";
import professionIndex from "@/data/wow/professions/index.json";
import { libraryDatasetText } from "@/components/library/libraryCopy";
import { kithixRaid } from "@/components/wow/raid/kithixRaidData";
import { CACHED_MYTHIC_PAGES } from "@/lib/routes/cachedViews";
import { atlasOgImage, type AtlasOgSpec } from "./atlasOg";
import type { Lang as Locale } from "@/lib/i18n-paths";

/**
 * Open Graph cards of the atlas routes. Each `opengraph-image.tsx` in app/ is a
 * two-line wrapper: `export default ogImage("<locale>", "<kind>")`. A kind turns
 * the route params into the card (scene, eyebrow, title, facts); unknown params
 * fall back to the section card, so a card is never broken.
 */
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
  mythicPlusComps: (locale) => ({ ...scene("mythicPlus"), eyebrow: "Midnight · Mythic+", title: ru(locale) ? "Составы групп" : "Team compositions", subtitle: ru(locale) ? "Кто закрывает самые высокие ключи сезона и кого взять в группу." : "Who times the highest keys of the season and who to bring." }),
  mythicPlusStats: (locale) => ({ ...scene("mythicPlus"), eyebrow: "Midnight · Mythic+", title: ru(locale) ? "Статистика сезона" : "Season stats", subtitle: ru(locale) ? "Пороги рейтинга по регионам и лучшие ключи сезона." : "Rating cutoffs of every region and the season's top keys." }),
  mythicPlusRoutes: (locale) => ({ ...scene("mythicPlus"), eyebrow: "Midnight · Mythic+", title: ru(locale) ? "Поиск маршрутов" : "Route finder", subtitle: ru(locale) ? "Лучшие забеги групп, похожих на вашу." : "Top runs of groups like yours." }),
  mythicPlusLeaderboard: (locale) => ({ ...scene("mythicPlus"), eyebrow: "Midnight · Mythic+", title: ru(locale) ? "Рейтинг игроков Mythic+" : "Mythic+ leaderboard", subtitle: ru(locale) ? "Сильнейшие персонажи региона по рейтингу Mythic+." : "The strongest characters of the region by Mythic+ rating." }),
  mythicPlusMeta: (locale) => ({ ...scene("mythicPlus"), eyebrow: "Midnight · Mythic+", title: ru(locale) ? "Мета Mythic+" : "Mythic+ meta", subtitle: ru(locale) ? "Какие специализации встречаются в топ-2000 ключей недели — по ролям." : "Which specializations appear in the top 2000 keys of the week, by role." }),
  lairs: (locale) => ({ ...scene("lairs"), eyebrow: ru(locale) ? "Midnight · Сезон 2" : "Midnight · Season 2", title: ru(locale) ? "Логова и мировые боссы" : "Lairs and world bosses", subtitle: ru(locale) ? "Где найти, что делать в бою и какая добыча падает." : "Where to find them, what to do and what drops." }),
  classes: (locale) => ({ ...scene("classes"), eyebrow: "Midnight", title: ru(locale) ? "Классы и специализации" : "Classes and specializations", facts: [count(locale, midnightClasses.length, "класс", "класса", "классов", "class", "classes"), count(locale, midnightSpecializations.length, "специализация", "специализации", "специализаций", "specialization")] }),
  tierLists: (locale) => ({ ...scene("tierLists"), eyebrow: "Mythic+ · Raids", title: ru(locale) ? "Тир-листы" : "Tier lists", subtitle: ru(locale) ? "Сила специализаций в ключах и рейдах." : "Specialization strength in keys and raids." }),
  database: (locale) => ({ ...scene("archive"), eyebrow: "World of Warcraft", title: ru(locale) ? "База данных" : "Database", subtitle: ru(locale) ? "Предметы, заклинания, задания и существа с подсказками и историей версий." : "Items, spells, quests and creatures with tooltips and version history." }),
  professions: (locale) => ({ ...scene("articles"), eyebrow: "Midnight", title: ru(locale) ? "Профессии" : "Professions", subtitle: ru(locale) ? "Прокачка 1–100 по ценам аукциона и выгодные рецепты." : "Leveling 1–100 at auction prices and profitable crafts.", facts: [count(locale, professionIndex.length, "профессия", "профессии", "профессий", "profession")] }),
  raidComposition: (locale) => ({ ...scene("raids"), eyebrow: "Midnight · Raids", title: ru(locale) ? "Состав рейда" : "Raid composition", subtitle: ru(locale) ? "Баффы, рассеивания и полезности вашего ростера." : "Buffs, dispels and utility of your roster." }),
  transmog: (locale) => ({ ...scene("transmog"), eyebrow: "World of Warcraft", title: ru(locale) ? "Трансмогрификация" : "Transmog studio", subtitle: ru(locale) ? "Примеряйте облики и наборы на свою модель." : "Try appearances and sets on your character model." }),
  auction: (locale) => ({ ...scene("articles"), eyebrow: "World of Warcraft", title: ru(locale) ? "Аукцион" : "Auction House", subtitle: ru(locale) ? "Цены товаров и снаряжения по регионам." : "Commodity and gear prices by region." }),
  season2: (locale) => ({ ...scene("dungeons"), eyebrow: "Midnight", title: ru(locale) ? "Сезон 2" : "Season 2", subtitle: ru(locale) ? "Подземелья Mythic+, рейды и вылазки сезона." : "Mythic+ dungeons, raids and delves of the season." }),
  whatsNew: (locale) => ({ ...scene("articles"), eyebrow: "Gildra", title: ru(locale) ? "Что нового" : "What's new", subtitle: ru(locale) ? "Что изменилось на сайте для игроков." : "What changed on the site for players." }),
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

  kithix: (locale: Locale): Spec => ({
    art: kithixRaid.artwork,
    focus: [0.5, 0.4],
    eyebrow: ru(locale) ? `Midnight · рейд · ${kithixRaid.location.ru}` : `Midnight · raid · ${kithixRaid.location.en}`,
    title: kithixRaid.names[locale],
    facts: [count(locale, kithixRaid.bosses.length, "босс", "босса", "боссов", "boss", "bosses")],
  }),

  privacy: (locale: Locale): Spec => ({ ...hubs.wow(locale), title: ru(locale) ? "Конфиденциальность" : "Privacy", subtitle: undefined }),

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

  /** Cards of the cached default views (/wow/mythic-plus/cached/<page>, lib/routes/cachedViews.ts): the section's own card. */
  mythicPlusPage: (locale: Locale, { page }: Params): Spec => {
    const sections = { stats: hubs.mythicPlusStats, comps: hubs.mythicPlusComps, routes: hubs.mythicPlusRoutes, meta: hubs.mythicPlusMeta, leaderboard: hubs.mythicPlusLeaderboard } as const;
    return (sections[page as keyof typeof sections] ?? hubs.mythicPlus)(locale);
  },

  libraryDataset: (locale: Locale, { dataset }: Params): Spec => {
    const line = libraryDatasetText[dataset]?.[locale];
    if (!line) return hubs.library(locale);
    return { ...scene("library"), eyebrow: ru(locale) ? "Библиотека · World of Warcraft" : "Library · World of Warcraft", title: line };
  },

  profession: (locale: Locale, { slug }: Params): Spec => {
    const entry = professionIndex.find((profession) => profession.slug === slug);
    if (!entry) return hubs.professions(locale);
    return {
      ...scene("articles"),
      eyebrow: ru(locale) ? "Профессия · Midnight" : "Profession · Midnight",
      title: entry.name[locale],
      subtitle: entry.kind === "crafting" ? (ru(locale) ? "Прокачка 1–100 по ценам аукциона." : "Leveling 1–100 at auction prices.") : undefined,
      facts: [
        ...(entry.recipes ? [count(locale, entry.recipes, "рецепт", "рецепта", "рецептов", "recipe")] : []),
        ...(entry.treasures ? [count(locale, entry.treasures, "сокровище", "сокровища", "сокровищ", "treasure")] : []),
      ],
    };
  },

  leaderboardSpec: (locale: Locale, { spec: slug }: Params): Spec => {
    const theme = getTalentSpecTheme(slug);
    if (!theme) return hubs.mythicPlusLeaderboard(locale);
    return {
      ...scene("mythicPlus"),
      emblem: theme.iconUrl,
      eyebrow: ru(locale) ? "Рейтинг игроков Mythic+" : "Mythic+ leaderboard",
      title: ru(locale) ? `${theme.specNameRu} · ${theme.classNameRu}` : `${theme.specName} ${theme.className}`,
      subtitle: ru(locale) ? "Лучшие игроки специализации по рейтингу." : "The specialization's top players by rating.",
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
} satisfies Record<string, (locale: Locale, params: Params) => Spec>;

export type OgKind = keyof typeof kinds;

/** Params of the dynamic card routes, so every card is drawn once at build time. */
const staticParams = {
  raid: () => raidRouteSlugs.map((raid) => ({ raid })),
  raidBoss: () => raidRouteSlugs.flatMap((raid) => (getMidnightRaid(raid)?.bosses ?? []).map((boss) => ({ raid, boss: boss.slug }))),
  venomousBoss: () => encounters.filter((entry) => entry.instance === "venomous-abyss").map((entry) => ({ boss: entry.canonicalSlug })),
  lair: () => midnightLairEncounters.map(({ slug }) => ({ slug })),
  dungeon: () => Object.keys(dungeonRoutes).map((dungeon) => ({ dungeon })),
  seasonDungeon: () => Object.keys(dungeonRoutes).map((dungeon) => ({ season: "midnight-season-2", dungeon })),
  class: () => midnightClasses.map(({ slug }) => ({ class: slug })),
  spec: () => midnightSpecializations.map((entry) => ({ class: entry.classSlug, spec: entry.slug })),
  talents: () => talentSpecThemes.map(({ slug }) => ({ spec: slug })),
  leaderboardSpec: () => talentSpecThemes.map(({ slug }) => ({ spec: slug })),
  profession: () => professionIndex.map(({ slug }) => ({ slug })),
  libraryDataset: () => Object.keys(libraryDatasetText).map((dataset) => ({ dataset })),
  mythicPlusPage: () => CACHED_MYTHIC_PAGES.map((page) => ({ page })),
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
