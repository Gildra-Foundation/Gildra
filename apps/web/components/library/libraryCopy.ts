import type { Lang } from "@/lib/i18n";
import { pluralRu } from "@gildra/atlas-ui/format";

/** Interface copy of /library and /library/<dataset> (RU and EN). Dataset names and descriptions come from the API. */
export const libraryCopy = {
  ru: {
    title: "Библиотека World of Warcraft",
    eyebrow: "Игровые данные",
    wow: "World of Warcraft",
    defaultProduct: "World of Warcraft",
    lede: "Предметы, заклинания, задания, NPC и коллекции с игровыми подсказками — ищите по названию на русском или английском.",
    statsLabel: "Объём библиотеки",
    statRecords: "записей",
    recordsWord: (n: number) => pluralRu(n, "запись", "записи", "записей"),
    statDatasets: "разделов",
    editions: "Издание игры",
    datasetsTitle: "Все разделы",
    featuredTitle: "Предметы и коллекции",
    searchLabel: "Поиск по библиотеке",
    searchPlaceholder: "Предмет, маунт, заклинание…",
    searchSubmit: "Найти",
    datasetSearchLabel: (name: string) => `Поиск: ${name}`,
    datasetSearchPlaceholder: "Название…",
    updated: (date: string) => `Данные обновлены ${date}`,
    staleTitle: "Данные могут отставать от игры",
    staleText: "Записи открываются как обычно, но новые предметы и изменения последнего патча могут ещё не появиться.",
    failedTitle: "Последнее обновление данных не удалось",
    failedText: "Показана прошлая версия библиотеки; часть новых записей может отсутствовать.",
    breadcrumbsLabel: "Навигация",
    library: "Библиотека",
    unavailableTitle: "Библиотека временно закрыта",
    unavailableText: "Данные не удалены — откройте страницу немного позже.",
    retry: "Обновить",
  },
  en: {
    title: "World of Warcraft Library",
    eyebrow: "Game data",
    wow: "World of Warcraft",
    defaultProduct: "World of Warcraft",
    lede: "Items, spells, quests, NPCs and collections with their in-game tooltips — search by name in English or Russian.",
    statsLabel: "Library size",
    statRecords: "records",
    recordsWord: (n: number) => (n === 1 ? "record" : "records"),
    statDatasets: "sections",
    editions: "Game edition",
    datasetsTitle: "All sections",
    featuredTitle: "Items and collections",
    searchLabel: "Search the library",
    searchPlaceholder: "Item, mount, spell…",
    searchSubmit: "Search",
    datasetSearchLabel: (name: string) => `Search ${name}`,
    datasetSearchPlaceholder: "Name…",
    updated: (date: string) => `Data updated ${date}`,
    staleTitle: "Data may lag behind the game",
    staleText: "Records open as usual, but new items and changes of the latest patch may not be here yet.",
    failedTitle: "The last data update failed",
    failedText: "The previous version of the library is shown; some new records may be missing.",
    breadcrumbsLabel: "Breadcrumbs",
    library: "Library",
    unavailableTitle: "The library is temporarily closed",
    unavailableText: "No data was deleted — open the page again a little later.",
    retry: "Try again",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export const libraryGroupText: Record<string, { en: string; ru: string }> = {
  equipment: { en: "Items & equipment", ru: "Предметы и экипировка" },
  combat: { en: "Classes & combat", ru: "Классы и бой" },
  // The RU dataset "Instances" is called «Подземелья и рейды»: the group takes the game's own name of the journal.
  encounters: { en: "Adventure Guide", ru: "Путеводитель по приключениям" },
  crafting: { en: "Professions & crafting", ru: "Профессии и ремесло" },
  world: { en: "World & quests", ru: "Мир и задания" },
  collections: { en: "Collections", ru: "Коллекции" },
};

/**
 * One line about each dataset for players. The API descriptions speak about the import
 * ("All published items", "client metadata"), so the library writes its own; a dataset
 * missing here falls back to the API text.
 */
export const libraryDatasetText: Record<string, { en: string; ru: string }> = {
  items: { en: "Every item of the game: equipment, consumables, materials", ru: "Все предметы игры: экипировка, расходники, материалы" },
  weapons: { en: "Swords, staves, bows and every other weapon type", ru: "Мечи, посохи, луки и любое другое оружие" },
  armor: { en: "Cloth, leather, mail and plate by slot", ru: "Ткань, кожа, кольчуга и латы по слотам" },
  consumables: { en: "Food, potions, flasks and other consumables", ru: "Еда, зелья, настои и другие расходуемые предметы" },
  gems: { en: "Gems for sockets and the stats they give", ru: "Самоцветы для гнёзд и их характеристики" },
  "artifact-relics": { en: "Relics for Legion artifact weapons", ru: "Реликвии для артефактов Легиона" },
  reagents: { en: "Reagents used by spells and crafting", ru: "Реагенты для заклинаний и ремёсел" },
  "trade-goods": { en: "Materials and goods for professions", ru: "Материалы и товары для профессий" },
  "item-enhancements": { en: "Enchantments and other item upgrades", ru: "Зачарования и другие улучшения предметов" },
  spells: { en: "Abilities, auras and their effects", ru: "Способности, ауры и их эффекты" },
  classes: { en: "The playable classes", ru: "Игровые классы" },
  specializations: { en: "Specializations of every class", ru: "Специализации всех классов" },
  "pvp-talents": { en: "PvP talents and their requirements", ru: "PvP-таланты и их требования" },
  instances: { en: "Dungeons and raids of the Adventure Guide", ru: "Подземелья и рейды путеводителя" },
  encounters: { en: "Boss encounters and their loot", ru: "Сражения с боссами и их добыча" },
  professions: { en: "Professions and their skill lines", ru: "Профессии и их ветви навыков" },
  recipes: { en: "Crafting recipes, reagents and results", ru: "Рецепты, реагенты и результаты ремесла" },
  quests: { en: "Quests, chains and rewards", ru: "Задания, цепочки и награды" },
  npcs: { en: "Creatures, vendors, trainers and quest givers", ru: "Существа, торговцы, наставники и квестодатели" },
  maps: { en: "Continents, zones and instances on the world map", ru: "Континенты, зоны и инстансы на карте мира" },
  areas: { en: "Zones and subzones", ru: "Зоны и подзоны" },
  factions: { en: "Factions and reputations", ru: "Фракции и репутации" },
  currencies: { en: "Currencies and where they are spent", ru: "Валюты и на что их тратить" },
  mounts: { en: "Mounts and how to get them", ru: "Маунты и как их получить" },
  "battle-pets": { en: "Battle pet species", ru: "Виды боевых питомцев" },
  toys: { en: "Toys and what they do", ru: "Игрушки и что они делают" },
  "transmog-sets": { en: "Appearance sets for transmogrification", ru: "Комплекты обликов для трансмогрификации" },
  achievements: { en: "Achievements, criteria and rewards", ru: "Достижения, условия и награды" },
};

/** A dataset's line for players: the library's own words, or the API description. */
export function libraryDatasetLine(dataset: { slug: string; description?: string }, lang: Lang) {
  return libraryDatasetText[dataset.slug]?.[lang] ?? dataset.description ?? "";
}

/** Datasets of client internals (reward packages, UI maps): reachable by link, not listed to players. */
export const LIBRARY_HIDDEN_DATASETS = new Set(["quest-reward-packages", "ui-maps"]);
