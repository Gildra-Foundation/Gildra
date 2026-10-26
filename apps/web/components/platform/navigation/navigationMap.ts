import { atlasScenes, type AtlasSceneId } from "@/lib/atlas/scenes";

/**
 * The atlas map of the top bar: each realm is a hub page with its real
 * sub-pages. Only pages that exist and render without a session are listed;
 * placeholders (gear, Prey) stay out until they have content. The painting of
 * a realm is its section's scene, so the menu shows the art the page opens with.
 */
type Words = { en: string; ru: string };
export type NavigationLink = { href: string; label: Words; note: Words };
export type NavigationRealm = {
  id: string;
  label: Words;
  /** One line under the realm's title in the portal panel. */
  lede: Words;
  scene: AtlasSceneId;
  /** Other path prefixes that belong to this realm (detail pages, tools). */
  also?: readonly string[];
  links: readonly [NavigationLink, ...NavigationLink[]];
};

export const navigationRealms: readonly NavigationRealm[] = [
  {
    id: "heroes",
    label: { en: "Characters", ru: "Персонажи" },
    lede: { en: "Your Battle.net heroes with gear, talents and combat tools.", ru: "Ваши герои Battle.net: экипировка, таланты и боевые инструменты." },
    scene: "wow",
    also: ["/talents", "/wow/rotation", "/wow/shared"],
    links: [
      { href: "/wow/characters", label: { en: "My characters", ru: "Мои персонажи" }, note: { en: "Official Blizzard profile", ru: "Официальный профиль Blizzard" } },
      { href: "/wow/classes", label: { en: "Classes and specs", ru: "Классы и специализации" }, note: { en: "Talent trees of every spec", ru: "Деревья талантов всех специализаций" } },
    ],
  },
  {
    id: "mythic",
    label: { en: "Mythic+", ru: "Mythic+" },
    lede: { en: "Key timers, MDT routes and sourced mechanics for the season.", ru: "Таймеры ключей, маршруты MDT и механики сезона по источникам." },
    scene: "mythicPlus",
    also: ["/wow/mythic"],
    links: [
      { href: "/wow/mythic-plus", label: { en: "Mythic+ atlas", ru: "Атлас Mythic+" }, note: { en: "Timers and routes", ru: "Таймеры и маршруты" } },
      { href: "/wow/mythic-plus/meta", label: { en: "Mythic+ meta", ru: "Мета Mythic+" }, note: { en: "Top specs of the week", ru: "Лучшие спеки недели" } },
      { href: "/wow/dungeons", label: { en: "Dungeons", ru: "Подземелья" }, note: { en: "Every Midnight dungeon", ru: "Все подземелья Midnight" } },
      { href: "/wow/delves", label: { en: "Delves", ru: "Вылазки" }, note: { en: "Midnight delves", ru: "Вылазки Midnight" } },
    ],
  },
  {
    id: "raids",
    label: { en: "Raids", ru: "Рейды" },
    lede: { en: "Boss portraits, abilities and strategy for the raid season.", ru: "Портреты боссов, способности и тактика рейдового сезона." },
    scene: "raids",
    links: [
      { href: "/wow/raids", label: { en: "Raid journal", ru: "Рейдовый журнал" }, note: { en: "Current raid and archive", ru: "Текущий рейд и архив" } },
      { href: "/wow/lairs", label: { en: "Lairs and world bosses", ru: "Логова и мировые боссы" }, note: { en: "Outdoor encounters", ru: "Боссы открытого мира" } },
      { href: "/wow/midnight/season-2", label: { en: "Season 2 guide", ru: "Гид по сезону 2" }, note: { en: "What the season brings", ru: "Что принёс сезон" } },
    ],
  },
  {
    id: "meta",
    label: { en: "Tier lists", ru: "Тир-листы" },
    lede: { en: "Compare classes and specializations, then look up the details.", ru: "Сравнение классов и специализаций — и подробности в базе." },
    scene: "tierLists",
    also: ["/specs", "/library"],
    links: [
      { href: "/tier-lists", label: { en: "Tier lists", ru: "Тир-листы" }, note: { en: "Specialization rankings", ru: "Рейтинг специализаций" } },
      { href: "/database", label: { en: "Database", ru: "База данных" }, note: { en: "Spells, items and NPCs", ru: "Заклинания, предметы и NPC" } },
    ],
  },
  {
    id: "chronicle",
    label: { en: "What's new", ru: "Что нового" },
    lede: { en: "What changed on Gildra.", ru: "Новое на Gildra." },
    scene: "articles",
    links: [
      { href: "/wow/whats-new", label: { en: "What's new", ru: "Что нового" }, note: { en: "Gildra updates", ru: "Обновления Gildra" } },
    ],
  },
  {
    id: "stories",
    label: { en: "Story Library", ru: "Библиотека историй" },
    lede: { en: "Books about the lives and journeys of Azeroth’s heroes.", ru: "Книги о судьбах и странствиях героев Азерота." },
    scene: "library",
    links: [
      { href: "/wow/stories", label: { en: "Story Library", ru: "Библиотека историй" }, note: { en: "Books and character chronicles", ru: "Книги и хроники персонажей" } },
    ],
  },
  {
    id: "tools",
    label: { en: "Tools", ru: "Инструменты" },
    lede: { en: "Useful tools for your adventures in Azeroth.", ru: "Полезные инструменты для приключений в Азероте." },
    scene: "articles",
    links: [
      { href: "/wow/auction", label: { en: "Auction House", ru: "Аукцион" }, note: { en: "Browse realm auctions and regional commodities", ru: "Лоты серверов и региональный рынок реагентов" } },
      { href: "/wow/transmog", label: { en: "Transmog Studio", ru: "Трансмогрификация" }, note: { en: "Build outfits and export pictures for social media", ru: "Образы из любых обликов и картинки для соцсетей" } },
    ],
  },
];

export const realmArt = (realm: NavigationRealm) => atlasScenes[realm.scene];

/** Locale prefix and trailing slash removed: the page identity the bar compares. */
export const barePathOf = (path: string) => path.replace(/^\/ru(?=\/|$)/, "").replace(/\/$/, "") || "/";

const within = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The realm the reader stands in (the longest matching link wins). */
export function currentRealm(barePath: string) {
  let best: { realm: NavigationRealm; href: string } | null = null;
  for (const realm of navigationRealms) {
    for (const href of [...realm.links.map(link => link.href), ...(realm.also ?? [])]) {
      if (within(barePath, href) && (!best || href.length > best.href.length)) best = { realm, href };
    }
  }
  return best;
}
