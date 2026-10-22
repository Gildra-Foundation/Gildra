import { atlasScenes, type AtlasSceneId } from "@/lib/atlas/scenes";

/**
 * The atlas map of the top bar: five realms, each a hub page with its real
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
    label: { en: "Articles", ru: "Статьи" },
    lede: { en: "Guides and stories from Azeroth, and what changed on Gildra.", ru: "Гайды и истории Азерота, а также новое на Gildra." },
    scene: "articles",
    links: [
      { href: "/wow/articles", label: { en: "Articles", ru: "Статьи" }, note: { en: "Guides and stories", ru: "Гайды и истории" } },
      { href: "/wow/whats-new", label: { en: "What's new", ru: "Что нового" }, note: { en: "Gildra updates", ru: "Обновления Gildra" } },
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
