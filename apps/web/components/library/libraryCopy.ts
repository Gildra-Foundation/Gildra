import type { Lang } from "@/lib/i18n";

/** Interface copy of /library and /library/<dataset> (RU and EN). Dataset names and descriptions come from the API. */
export const libraryCopy = {
  ru: {
    emptyProduct: "Пока нет данных",
    unavailableProduct: "Недоступно в этом издании",
    title: "Библиотека World of Warcraft",
    wow: "World of Warcraft",
    defaultProduct: "World of Warcraft",
    editions: "Издание игры",
    datasetsTitle: "Все разделы",
    featuredTitle: "Предметы и коллекции",
    searchLabel: "Поиск по библиотеке",
    searchPlaceholder: "Предмет, маунт, заклинание…",
    searchSubmit: "Найти",
    searchTitle: "Поиск по библиотеке",
    searchFieldLabel: "Название на русском или английском",
    filtersTitle: "Поиск и фильтры",
    datasetSearchLabel: (name: string) => `Поиск: ${name}`,
    datasetSearchPlaceholder: "Название…",
    breadcrumbsLabel: "Навигация",
    library: "Библиотека",
    unavailableTitle: "Библиотека временно закрыта",
    unavailableText: "Данные не удалены — откройте страницу немного позже.",
    retry: "Обновить",
    site: "Библиотека WowArcana",
    datasetDescription: (name: string, what: string) => `${name} World of Warcraft: ${what}.`,
    datasetDescriptionMore: " Игровые подсказки, иконки и связи между записями.",
    loading: "Загружаем…",
  },
  en: {
    emptyProduct: "No data yet",
    unavailableProduct: "Unavailable in this edition",
    title: "World of Warcraft Library",
    wow: "World of Warcraft",
    defaultProduct: "World of Warcraft",
    editions: "Game edition",
    datasetsTitle: "All sections",
    featuredTitle: "Items and collections",
    searchLabel: "Search the library",
    searchPlaceholder: "Item, mount, spell…",
    searchSubmit: "Search",
    searchTitle: "Search the library",
    searchFieldLabel: "Name in English or Russian",
    filtersTitle: "Search and filters",
    datasetSearchLabel: (name: string) => `Search ${name}`,
    datasetSearchPlaceholder: "Name…",
    breadcrumbsLabel: "Breadcrumbs",
    library: "Library",
    unavailableTitle: "The library is temporarily closed",
    unavailableText: "No data was deleted — open the page again a little later.",
    retry: "Try again",
    site: "WowArcana Library",
    datasetDescription: (name: string, what: string) => `World of Warcraft ${name}: ${what}.`,
    datasetDescriptionMore: " In-game tooltips, icons and links between records.",
    loading: "Loading…",
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

export { LIBRARY_HIDDEN_DATASETS } from "@/lib/library/recordPath";
