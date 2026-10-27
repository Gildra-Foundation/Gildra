import type { AtlasSceneId } from "@/lib/atlas/scenes";
import { registryCopy } from "./registryCopy";
import type { Lang as Locale } from "@/lib/i18n-paths";

/**
 * One registry of the site's sections (roadmap items 24, 73): path, parent and
 * short name in both languages. Breadcrumbs (`trail`), the quick-search index
 * and other navigation read it, so a section is renamed or moved in one place.
 * Paths are English; Russian pages prefix /ru. Client-safe data.
 */
type Words = { en: string; ru: string };
export type RouteSection = {
  path: string;
  /** Short name: breadcrumb label and search title. */
  title: Words;
  /** Id of the parent section (checked by tests/atlas/routes.test.ts). */
  parent?: string;
  scene?: AtlasSceneId;
  /** How the quick search lists the section when it differs from the short name, plus extra keywords. */
  search?: Partial<Words> & { keywords?: string };
  /** The only language the section exists in (the English URL redirects to it). */
  only?: Locale;
};

export const routeSections = {
  transmog: { path: "/wow/transmog", parent: "wow", title: { en: "Transmog Studio", ru: "Трансмогрификация" }, scene: "articles", search: { keywords: "transmog transmogrification outfit appearance sets dressing room screenshot трансмогрификация трансмог образ облик наборы примерочная скриншот" } },
  auction: { path: "/wow/auction", parent: "wow", title: { en: "Auction House", ru: "Аукцион" }, scene: "articles", search: { keywords: "auction house tools market prices аукцион инструменты рынок цены реагенты" } },
  wow: { path: "/wow", title: { en: "World of Warcraft", ru: "World of Warcraft" }, scene: "wow", search: { en: "World of Warcraft hub", ru: "Центр World of Warcraft", keywords: "home главная хаб" } },
  raids: { path: "/wow/raids", parent: "wow", title: { en: "Raids", ru: "Рейды" }, scene: "raids", search: { en: "Raid journal", ru: "Рейдовый журнал", keywords: "raids рейды" } },
  mythicPlus: { path: "/wow/mythic-plus", parent: "wow", title: { en: "Mythic+", ru: "Mythic+" }, scene: "mythicPlus", search: { en: "Mythic+ atlas", ru: "Атлас Mythic+", keywords: "mythic plus keys ключи эпохальные" } },
  mythicPlusMeta: { path: "/wow/mythic-plus/meta", parent: "mythicPlus", title: { en: "Mythic+ meta", ru: "Мета Mythic+" }, scene: "mythicPlus", search: { keywords: "meta spec popularity top keys мета популярность спеков mythicstats" } },
  dungeons: { path: "/wow/dungeons", parent: "wow", title: { en: "Dungeons", ru: "Подземелья" }, scene: "dungeons" },
  lairs: { path: "/wow/lairs", parent: "wow", title: { en: "Lairs and world bosses", ru: "Логова и мировые боссы" }, scene: "lairs" },
  classes: { path: "/wow/classes", parent: "wow", title: { en: "Classes and specializations", ru: "Классы и специализации" }, scene: "classes", search: { keywords: "specs спеки" } },
  delves: { path: "/wow/delves", parent: "wow", title: { en: "Delves", ru: "Вылазки" }, scene: "delves" },
  tierLists: { path: "/tier-lists", parent: "wow", title: { en: "Tier lists", ru: "Тир-листы" }, scene: "tierLists", search: { keywords: "tier list рейтинг" } },
  characters: { path: "/wow/characters", parent: "wow", title: { en: "Characters", ru: "Персонажи" }, search: { keywords: "battle.net armory оружейная" } },
  season2: { path: "/wow/midnight/season-2", parent: "wow", title: { en: "Midnight Season 2", ru: "Midnight · Сезон 2" } },
  whatsNew: { path: "/wow/whats-new", parent: "wow", title: { en: "What's new", ru: "Что нового" }, scene: "articles", search: { keywords: "changelog news updates обновления новости изменения" } },
  database: { path: "/database", title: { en: "Database", ru: "База данных" }, scene: "archive", search: { keywords: "items spells quests предметы заклинания задания" } },
  library: { path: "/library", title: { en: "Library", ru: "Библиотека" }, scene: "library", search: { keywords: "datasets наборы данных" } },
  // The Anduin manuscript exists only in Russian: the section is Russian-only until it is translated.
  stories: { path: "/wow/stories", parent: "wow", only: "ru", title: { en: "Story Library", ru: "Библиотека историй" }, scene: "library", search: { keywords: "lore books Azeroth Anduin Wrynn истории книги хроники Азерот Андуин Ринн" } },
} as const satisfies Record<string, RouteSection>;

export type SectionId = keyof typeof routeSections;

/** Language-less paths of the sections that exist in one language only. */
export const singleLanguagePaths: ReadonlyMap<string, Locale> = new Map(
  Object.values(routeSections as Record<string, RouteSection>).flatMap((section) => (section.only ? [[section.path, section.only] as const] : [])),
);

/** The section's URL in a language. */
export function sectionHref(id: SectionId, locale: Locale) {
  return `${locale === "ru" ? "/ru" : ""}${routeSections[id].path}`;
}

/** Accessible name of the breadcrumb trail. */
export const trailLabel = (locale: Locale) => registryCopy[locale].breadcrumbs;

/**
 * Breadcrumbs of a page inside `id`: every ancestor section and the section
 * itself (linked when the page is deeper), then the page's own items.
 *   trail("ru", "lairs")                       → World of Warcraft › Логова и мировые боссы
 *   trail("ru", "lairs", { label: boss.name }) → … › Логова и мировые боссы › Нимрисса
 */
export function trail(locale: Locale, id: SectionId, ...tail: Array<{ label: string; href?: string }>) {
  const chain: SectionId[] = [];
  for (let current: SectionId | undefined = id; current; current = (routeSections[current] as RouteSection).parent as SectionId | undefined) chain.unshift(current);
  const crumbs = chain.map((section, index) => {
    const last = index === chain.length - 1 && tail.length === 0;
    return { label: routeSections[section].title[locale], ...(last ? {} : { href: sectionHref(section, locale) }) };
  });
  return [...crumbs, ...tail];
}
