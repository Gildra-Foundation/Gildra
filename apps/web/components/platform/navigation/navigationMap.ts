import type { Lang } from "@/lib/i18n-paths";

/**
 * The atlas map of the top bar: each realm is a tab with its real pages,
 * grouped under short headings. Only pages that exist and render without a
 * session are listed. Every page has its own icon (a key of `NavigationIcon`,
 * drawn by the bar) and an optional one-line note.
 */
type Words = { en: string; ru: string };
export type NavigationIcon =
  | "characters" | "classes"
  | "atlas" | "guide" | "meta" | "comps" | "stats" | "leaderboard" | "routes"
  | "journal" | "lairs" | "raidComp"
  | "auction" | "professions" | "transmog"
  | "library" | "stories";
export type NavigationLink = {
  href: string;
  label: Words;
  icon: NavigationIcon;
  note?: Words;
  /** Languages the page exists in (all when absent). */
  langs?: readonly Lang[];
};
export type NavigationGroup = { title?: Words; links: readonly NavigationLink[] };
export type NavigationRealm = {
  id: string;
  label: Words;
  /** Where the tab itself leads. */
  hub: string;
  /** Other path prefixes that belong to this realm (detail pages, old addresses). */
  also?: readonly string[];
  groups: readonly NavigationGroup[];
};

export const navigationRealms: readonly NavigationRealm[] = [
  {
    id: "heroes",
    label: { en: "Characters", ru: "Персонажи" },
    hub: "/wow/characters",
    also: ["/wow/shared"],
    groups: [{
      links: [
        { href: "/wow/characters", icon: "characters", label: { en: "My characters", ru: "Мои персонажи" }, note: { en: "Gear and talents", ru: "Экипировка и таланты" } },
      ],
    }],
  },
  {
    // Classes, specs and everything per spec (talent trees, rotation) are one
    // area: a talent page lights «Classes», not the reader's own characters.
    id: "classes",
    label: { en: "Classes", ru: "Классы" },
    hub: "/wow/classes",
    also: ["/talents", "/specs", "/wow/rotation"],
    groups: [{
      links: [
        { href: "/wow/classes", icon: "classes", label: { en: "Classes and specs", ru: "Классы и специализации" }, note: { en: "Talent trees", ru: "Деревья талантов" } },
      ],
    }],
  },
  {
    id: "mythic",
    label: { en: "Mythic+", ru: "Mythic+" },
    hub: "/wow/mythic-plus",
    // A player's page opens from the Mythic+ leaderboard (its breadcrumbs say so).
    also: ["/wow/mythic", "/wow/dungeons", "/wow/players"],
    groups: [
      {
        title: { en: "Season", ru: "Сезон" },
        links: [
          { href: "/wow/mythic-plus", icon: "atlas", label: { en: "Mythic+ atlas", ru: "Атлас Mythic+" }, note: { en: "Timers and routes", ru: "Таймеры и маршруты" } },
          { href: "/wow/midnight/season-2", icon: "guide", label: { en: "Season 2 guide", ru: "Гид по сезону 2" }, note: { en: "Raid, keys, delves", ru: "Рейд, ключи, вылазки" } },
        ],
      },
      {
        title: { en: "Meta and data", ru: "Мета и данные" },
        links: [
          { href: "/wow/mythic-plus/meta", icon: "meta", label: { en: "Mythic+ meta", ru: "Мета Mythic+" }, note: { en: "Top specs of the week", ru: "Лучшие спеки недели" } },
          { href: "/wow/mythic-plus/comps", icon: "comps", label: { en: "Team compositions", ru: "Составы групп" }, note: { en: "Groups that time high keys", ru: "С кем закрывают ключи" } },
          { href: "/wow/mythic-plus/stats", icon: "stats", label: { en: "Season stats", ru: "Статистика сезона" }, note: { en: "Rating cutoffs", ru: "Пороги рейтинга" } },
          { href: "/wow/mythic-plus/leaderboard", icon: "leaderboard", label: { en: "Leaderboard", ru: "Рейтинг игроков" }, note: { en: "Top players", ru: "Лучшие игроки" } },
          { href: "/wow/mythic-plus/routes", icon: "routes", label: { en: "Route finder", ru: "Поиск маршрутов" }, note: { en: "Runs of groups like yours", ru: "Забеги групп как ваша" } },
        ],
      },
    ],
  },
  {
    id: "raids",
    label: { en: "Raids", ru: "Рейды" },
    hub: "/wow/raids",
    groups: [{
      links: [
        { href: "/wow/raids", icon: "journal", label: { en: "Raid journal", ru: "Рейдовый журнал" }, note: { en: "Bosses and tactics", ru: "Боссы и тактика" } },
        { href: "/wow/lairs", icon: "lairs", label: { en: "Lairs and world bosses", ru: "Логова и мировые боссы" }, note: { en: "Outdoor encounters", ru: "Боссы открытого мира" } },
        { href: "/wow/raids/composition", icon: "raidComp", label: { en: "Raid composition", ru: "Состав рейда" }, note: { en: "Buffs and roles", ru: "Баффы и роли" } },
      ],
    }],
  },
  {
    id: "meta",
    label: { en: "Tier lists", ru: "Тир-листы" },
    hub: "/tier-lists",
    groups: [{ links: [{ href: "/tier-lists", icon: "meta", label: { en: "Tier lists", ru: "Тир-листы" } }] }],
  },
  {
    id: "tools",
    label: { en: "Tools", ru: "Инструменты" },
    hub: "/wow/auction",
    groups: [{
      links: [
        { href: "/wow/auction", icon: "auction", label: { en: "Auction House", ru: "Аукцион" }, note: { en: "Realm and region prices", ru: "Цены серверов и региона" } },
        { href: "/wow/professions", icon: "professions", label: { en: "Professions", ru: "Профессии" }, note: { en: "Leveling and profit", ru: "Прокачка и выгода" } },
        { href: "/wow/transmog", icon: "transmog", label: { en: "Transmog Studio", ru: "Трансмогрификация" }, note: { en: "Outfits from any look", ru: "Образы из любых обликов" } },
        { href: "/wow/map", icon: "atlas", label: { en: "World map", ru: "Карта мира" }, note: { en: "Azeroth through the eras", ru: "Азерот сквозь эпохи" } },
      ],
    }],
  },
  {
    // The game data library and the story books share one tab: two tabs named
    // "Library" and "Library of stories" read as the same place.
    id: "library",
    label: { en: "Library", ru: "Библиотека" },
    hub: "/library",
    also: ["/database", "/search"],
    groups: [{
      links: [
        { href: "/library", icon: "library", label: { en: "Game library", ru: "Библиотека игры" }, note: { en: "Items, spells, mounts", ru: "Предметы, заклинания, транспорт" } },
        // The manuscript is Russian; the English URL redirects (lib/routes/registry.ts `only`).
        { href: "/wow/stories", icon: "stories", langs: ["ru"], label: { en: "Stories", ru: "Истории" }, note: { en: "Books about heroes", ru: "Книги о героях Азерота" } },
      ],
    }],
  },
  {
    id: "chronicle",
    label: { en: "What's new", ru: "Что нового" },
    hub: "/wow/whats-new",
    groups: [{ links: [{ href: "/wow/whats-new", icon: "guide", label: { en: "What's new", ru: "Что нового" } }] }],
  },
];

const inLang = (lang: Lang) => (link: NavigationLink) => !link.langs || link.langs.includes(lang);

/** A realm's groups in a language (groups left empty are dropped). */
export const groupsFor = (realm: NavigationRealm, lang: Lang) => realm.groups
  .map(group => ({ ...group, links: group.links.filter(inLang(lang)) }))
  .filter(group => group.links.length > 0);

/** Every page of a realm in a language, in menu order. */
export const linksFor = (realm: NavigationRealm, lang: Lang) => groupsFor(realm, lang).flatMap(group => group.links);

/** The realms of the bar in a language. */
export const foreverRealms: readonly NavigationRealm[] = [
  { id: "forever-dungeons", label: { en: "Dungeons", ru: "Подземелья" }, hub: "/wow/forever/dungeons",
    groups: [{ links: [{ href: "/wow/forever/dungeons", icon: "atlas", label: { en: "Dungeons", ru: "Подземелья" } }] }] },
  { id: "forever-raids", label: { en: "Raids", ru: "Рейды" }, hub: "/wow/forever/raids",
    groups: [{ links: [{ href: "/wow/forever/raids", icon: "journal", label: { en: "Raids", ru: "Рейды" } }] }] },
];
export const realmsFor = (_lang: Lang, path = "/") => within(barePathOf(path), "/wow/forever") ? foreverRealms : navigationRealms;

/** Locale prefix and trailing slash removed: the page identity the bar compares. */
export const barePathOf = (path: string) => path.replace(/^\/ru(?=\/|$)/, "").replace(/\/$/, "") || "/";

const within = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The realm the reader stands in (the longest matching link wins). */
export function currentRealm(barePath: string) {
  let best: { realm: NavigationRealm; href: string } | null = null;
  for (const realm of [...navigationRealms, ...foreverRealms]) {
    const hrefs = [realm.hub, ...realm.groups.flatMap(group => group.links.map(link => link.href)), ...(realm.also ?? [])];
    for (const href of hrefs) {
      if (within(barePath, href) && (!best || href.length > best.href.length)) best = { realm, href };
    }
  }
  return best;
}
