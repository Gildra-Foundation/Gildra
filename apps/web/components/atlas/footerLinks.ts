/** Existing flat contract is retained for callers/tests that only need the essentials. */
export const ATLAS_FOOTER_LINKS = [
  { href: "/wow/mythic-plus", en: "Mythic+", ru: "Mythic+" },
  { href: "/wow/raids", en: "Raids", ru: "Рейды" },
  { href: "/tier-lists", en: "Tier lists", ru: "Тир-листы" },
  { href: "/library", en: "Library", ru: "Библиотека" },
  { href: "/wow/whats-new", en: "What's new", ru: "Что нового" },
  { href: "/privacy", en: "Privacy", ru: "Конфиденциальность" },
] as const;

export const footerCopy = {
  ru: { description: "Маршруты, тактики и инструменты World of Warcraft.", navigation: "Навигация в подвале", language: "Язык в подвале", groups: ["World of Warcraft", "Ваш герой", "Библиотека", "WowArcana"] },
  en: { description: "World of Warcraft routes, tactics and tools.", navigation: "Footer navigation", language: "Footer language", groups: ["World of Warcraft", "Your hero", "Library", "WowArcana"] },
} as const;

/** All destinations are existing mirrored routes, never speculative footer pages. */
export const FOOTER_GROUPS = [
  [
    { href: "/wow/mythic-plus", en: "Mythic+", ru: "Mythic+" },
    { href: "/wow/raids", en: "Raids", ru: "Рейды" },
    { href: "/wow/map", en: "World map", ru: "Карта мира" },
    { href: "/wow/lairs", en: "Lairs & world bosses", ru: "Логова и мировые боссы" },
  ],
  [
    { href: "/wow/classes", en: "Classes & talents", ru: "Классы и таланты" },
    { href: "/wow/characters", en: "Characters", ru: "Персонажи" },
    { href: "/tier-lists", en: "Tier lists", ru: "Тир-листы" },
    { href: "/wow/transmog", en: "Transmog Studio", ru: "Трансмогрификация" },
    { href: "/wow/auction", en: "Auction House", ru: "Аукцион" },
  ],
  [
    { href: "/library", en: "Library", ru: "Библиотека" },
    { href: "/library/items", en: "Items", ru: "Предметы" },
    { href: "/library/spells", en: "Spells", ru: "Заклинания" },
  ],
  [
    { href: "/wow/whats-new", en: "What's new", ru: "Что нового" },
    { href: "/privacy", en: "Privacy", ru: "Конфиденциальность" },
  ],
] as const;
