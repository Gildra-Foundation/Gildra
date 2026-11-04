/** Blizzard's 12.1.5 announcement; overview only, no encounter strategy inferred.
 * The Russian title is an editorial translation of the English raid name.
 * The location scene and complete material kit are shared with Venomous Abyss.
 */
export const kithixRaid = {
  slug: "the-unbinding-of-kithix" as const,
  names: { en: "The Unbinding of Kith’ix", ru: "Освобождение К’тикса" },
  descriptions: {
    en: "Beneath the Venomous Abyss, Kith’ix breaks free of his ancient bonds. Stand with Lady Liadrin against the C’Thraxxi general in a single-boss raid.",
    ru: "Под Отравленной бездной К’тикс освобождается от древних оков. Вместе с леди Лиадрин вам предстоит сразиться с генералом к’тракси в рейде на одного босса.",
  },
  location: { en: "Beneath the Venomous Abyss", ru: "Под Отравленной бездной" },
  artwork: "/assets/wow/raids/hub/venomous-abyss.webp",
  accent: "#74c8a8",
  bosses: [{ slug: "kithix", anchor: "kithix", names: { en: "Kith’ix", ru: "К’тикс" } }],
};

export const kithixSource = "https://worldofwarcraft.blizzard.com/en-gb/news/24304162";

export const kithixCopy = {
  ru: {
    eyebrow: "Midnight · Сезон 2 · 12.1.5",
    back: "Все рейды",
    boss: "К’тикс",
    bossText: "Единственный босс рейда — древний генерал к’тракси, которого амани удерживали под землёй. После поражения Ула’тека его оковы ослабли.",
    format: "Формат рейда",
    difficulties: "Сложности",
    difficultyText: "Сюжетная, поиск рейда, обычная, героическая и эпохальная.",
    mythic: "Эпохальная группа",
    mythicText: "От 15 до 25 игроков — гибкий размер группы.",
    source: "Обзор рейда от Blizzard",
  },
  en: {
    eyebrow: "Midnight · Season 2 · 12.1.5",
    back: "All raids",
    boss: "Kith’ix",
    bossText: "The raid’s only boss is an ancient C’Thraxxi general imprisoned underground by the Amani. Ula’tek’s defeat weakened the bonds that held him.",
    format: "Raid format",
    difficulties: "Difficulties",
    difficultyText: "Story Mode, Raid Finder, Normal, Heroic and Mythic.",
    mythic: "Mythic group",
    mythicText: "15–25 players with flexible group size.",
    source: "Blizzard’s raid overview",
  },
};
