import type { Lang } from "@/lib/i18n-paths";

/**
 * Meta descriptions of the Forever and Mists pages that have no lede of their own. Without one
 * a page shows the site-wide description of the root document, the same line on every such page.
 * Each says only what its page does.
 */
const lines = {
  foreverDungeons: {
    en: "Dungeons of World of Warcraft: Forever, new and returning, by level: where the entrance is, the map and the tactics for every boss.",
    ru: "Подземелья World of Warcraft: Forever, новые и вернувшиеся, по уровням: где вход, карта и тактика на каждого босса.",
  },
  foreverRaids: {
    en: "Raids of World of Warcraft: Forever for level 60: the raid list, the opening date and the Onyxia attunement.",
    ru: "Рейды World of Warcraft: Forever для 60-го уровня: список рейдов, дата открытия и допуск к Ониксии.",
  },
  foreverLibrary: {
    en: "Items, spells, NPCs, quests and recipes of World of Warcraft: Forever with search, level and quality filters and links between records.",
    ru: "Предметы, заклинания, персонажи, задания и рецепты World of Warcraft: Forever: поиск, фильтры по уровню и качеству, связи между записями.",
  },
  foreverTalents: {
    en: "Talent calculator for World of Warcraft: Forever: pick a class, spend points in its talent trees and share the build by link.",
    ru: "Калькулятор талантов World of Warcraft: Forever: выберите класс, распределите очки по веткам талантов и поделитесь билдом по ссылке.",
  },
  mistsTalents: {
    en: "Talent calculator for Mists of Pandaria Classic: pick a class and specialization, choose a talent in every tier and share the build by link.",
    ru: "Калькулятор талантов Mists of Pandaria Classic: выберите класс и специализацию, талант на каждом уровне и поделитесь билдом по ссылке.",
  },
} as const;

export const versionDescription = (page: keyof typeof lines, lang: Lang) => lines[page][lang];

/** One class's calculator: the same line with the class named first. */
export const classTalentsDescription = (page: "foreverTalents" | "mistsTalents", lang: Lang, className: string) => {
  const game = page === "foreverTalents" ? "World of Warcraft: Forever" : "Mists of Pandaria Classic";
  const how = page === "foreverTalents"
    ? { en: "spend points in the talent trees", ru: "распределите очки по веткам талантов" }
    : { en: "pick a specialization and a talent in every tier", ru: "выберите специализацию и талант на каждом уровне" };
  return lang === "ru"
    ? `${className}: калькулятор талантов ${game} — ${how.ru} и поделитесь билдом по ссылке.`
    : `${className} talent calculator for ${game}: ${how.en} and share the build by link.`;
};
