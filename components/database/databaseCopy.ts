import type { Lang } from "@/lib/i18n";

/**
 * Interface copy of the WoW database hub, its record rows and the library
 * dataset pages (same workspace). Game terms (item, spell, zone names) stay
 * English by project convention; numbers and facts come from the catalog API,
 * never from here. RU ledes stay short enough for two lines in every web-font
 * loading state: the Latin and Cyrillic subsets arrive separately, and a
 * re-wrap of the lede is measured as layout shift.
 */
export const databaseCopy = {
  ru: {
    title: "База данных World of Warcraft",
    lede: "Предметы, заклинания, задания, существа и игровые системы World of Warcraft — с подсказками, связями и историей версий.",
    statsLabel: "Объём каталога",
    statRecords: "записей",
    statTypes: "типов записей",
    sourcesLabel: "Источники данных",
    // Workspace
    workspaceLabel: "Каталог",
    searchLabel: "Поиск по базе данных",
    searchPlaceholder: "Название или игровой ID…",
    searchSubmit: "Найти",
    gameVersion: "Версия игры",
    sectionsLabel: "Разделы каталога",
    typesLabel: "Типы записей раздела",
    allRecords: "Все записи",
    filtersTitle: "Фильтры",
    filtersActive: (count: number) => `активно: ${count}`,
    any: "Любой",
    itemLevelFrom: "Уровень предмета от",
    itemLevelTo: "Уровень предмета до",
    charLevelFrom: "Уровень персонажа от",
    charLevelTo: "Уровень персонажа до",
    apply: "Применить",
    reset: "Сбросить",
    resultsLabel: "Записи каталога",
    pagesLabel: "Страницы каталога",
    found: "Найдено",
    back: "Назад",
    next: "Следующая страница",
    emptyTitle: "Подходящих записей нет",
    emptyText: "Попробуйте другой запрос или выберите другой раздел.",
    categories: "Категории",
    allCategories: "Все",
    itemLevel: "Уровень предмета",
    gameId: "ID",
    previewLabel: (name: string) => `Игровая подсказка: ${name}`,
    englishOnly: "только EN",
    englishOnlyTitle: "Русского названия в клиенте нет — показано английское",
    loadingTooltip: "Загружаем подсказку…",
    tooltipError: "Не удалось загрузить подсказку.",
    retry: "Повторить",
    loading: "Загрузка базы данных",
  },
  en: {
    title: "World of Warcraft database",
    lede: "Items, spells, quests, creatures and game systems of World of Warcraft — with in-game tooltips, relations and change history across client builds.",
    statsLabel: "Catalog size",
    statRecords: "records",
    statTypes: "record types",
    sourcesLabel: "Data sources",
    workspaceLabel: "Catalog",
    searchLabel: "Search the database",
    searchPlaceholder: "Name or game ID…",
    searchSubmit: "Search",
    gameVersion: "Game version",
    sectionsLabel: "Catalog sections",
    typesLabel: "Record types of the section",
    allRecords: "All records",
    filtersTitle: "Filters",
    filtersActive: (count: number) => `${count} active`,
    any: "Any",
    itemLevelFrom: "Item level from",
    itemLevelTo: "Item level to",
    charLevelFrom: "Character level from",
    charLevelTo: "Character level to",
    apply: "Apply",
    reset: "Reset",
    resultsLabel: "Catalog records",
    pagesLabel: "Catalog pages",
    found: "Found",
    back: "Back",
    next: "Next page",
    emptyTitle: "No matching records",
    emptyText: "Try another search term or choose a different section.",
    categories: "Categories",
    allCategories: "All",
    itemLevel: "Item level",
    gameId: "ID",
    previewLabel: (name: string) => `In-game tooltip: ${name}`,
    englishOnly: "EN only",
    englishOnlyTitle: "The client has no localized name; the English one is shown",
    loadingTooltip: "Loading the tooltip…",
    tooltipError: "Could not load the tooltip.",
    retry: "Retry",
    loading: "Loading the database",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type DatabaseCopy = (typeof databaseCopy)[Lang];

/** Labels the preview button needs on the client (plain strings, no functions). */
export function previewCopy(lang: Lang) {
  const copy = databaseCopy[lang];
  return { loading: copy.loadingTooltip, error: copy.tooltipError, retry: copy.retry };
}

export const DATA_SOURCES = [
  { label: "Blizzard API", href: "https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis" },
  { label: "Raidbots", href: "https://www.raidbots.com/developers" },
  { label: "Wago.Tools", href: "https://wago.tools/" },
  { label: "wow.export", href: "https://github.com/Kruithne/wow.export" },
  { label: "wow-listfile", href: "https://github.com/wowdev/wow-listfile" },
];

export const GROUP_LABELS: Record<string, [en: string, ru: string]> = {
  equipment: ["Equipment", "Экипировка"], combat: ["Classes & combat", "Классы и бой"],
  encounters: ["Dungeons & raids", "Подземелья и рейды"], crafting: ["Professions", "Профессии"],
  world: ["World & quests", "Мир и задания"], collections: ["Collections", "Коллекции"],
  system: ["Game systems", "Игровые системы"], other: ["Other records", "Другие записи"],
};

export const FACET_LABELS: Record<string, [en: string, ru: string]> = {
  class: ["Class", "Класс"], specialization: ["Specialization", "Специализация"], race: ["Race", "Раса"],
  equipment_slot: ["Equipment slot", "Слот"], armor_type: ["Armor type", "Тип брони"], weapon_type: ["Weapon type", "Тип оружия"],
  profession: ["Profession", "Профессия"], item_class: ["Item class", "Класс предмета"],
};

/** Singular, player-facing name of one catalog record type (the API labels are plural section names). */
const ENTITY_TYPE_LABELS: Record<string, [en: string, ru: string]> = {
  item: ["Item", "Предмет"], gem: ["Gem", "Камень"], enchantment: ["Enchantment", "Чары"], item_set: ["Item set", "Комплект"],
  food: ["Food", "Еда"], flask: ["Flask", "Настой"], potion: ["Potion", "Зелье"], spell: ["Spell", "Заклинание"],
  class: ["Class", "Класс"], specialization: ["Specialization", "Специализация"], talent: ["Talent", "Талант"],
  pvp_talent: ["PvP talent", "PvP-талант"], talent_tree: ["Talent tree", "Дерево талантов"],
  instance: ["Dungeon or raid", "Подземелье или рейд"], encounter: ["Boss encounter", "Сражение с боссом"],
  profession: ["Profession", "Профессия"], recipe: ["Recipe", "Рецепт"], creature: ["Creature", "Существо"],
  quest_reward_package: ["Quest reward set", "Набор наград за задание"], quest: ["Quest", "Задание"],
  map: ["Map", "Карта"], ui_map: ["Interface map", "Карта интерфейса"], area: ["Zone", "Зона"], faction: ["Faction", "Фракция"],
  currency: ["Currency", "Валюта"], mount: ["Mount", "Транспорт"], battle_pet: ["Battle pet", "Боевой питомец"],
  toy: ["Toy", "Игрушка"], transmog_set: ["Transmog set", "Комплект трансмогрификации"], achievement: ["Achievement", "Достижение"],
  season: ["Season", "Сезон"],
};

export function entityTypeLabel(type: string, lang: Lang, fallback?: string) {
  const label = ENTITY_TYPE_LABELS[type];
  if (label) return label[lang === "ru" ? 1 : 0];
  if (fallback) return fallback;
  const words = type.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SPELL_SCHOOLS: Record<string, [en: string, ru: string]> = {
  physical: ["Physical", "Физический"], holy: ["Holy", "Свет"], fire: ["Fire", "Огонь"], nature: ["Nature", "Природа"],
  frost: ["Frost", "Лёд"], shadow: ["Shadow", "Тьма"], arcane: ["Arcane", "Тайная магия"],
};

/** Card highlights arrive as raw catalog values ("physical+fire", "1500 ms"); show them as a player reads them. */
export function highlightLabel(key: string, value: string, lang: Lang) {
  const ru = lang === "ru";
  if (key === "school") {
    return value.split("+").map((school) => SPELL_SCHOOLS[school.trim()]?.[ru ? 1 : 0] ?? school).join(" + ");
  }
  if (key === "cast_time") {
    if (/^instant$/i.test(value.trim())) return ru ? "Мгновенное действие" : "Instant";
    const ms = /^(\d+)\s*ms$/i.exec(value.trim());
    if (ms) {
      const seconds = Number(ms[1]) / 1000;
      const text = seconds.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
      return ru ? `Применение: ${text} сек.` : `${text} sec cast`;
    }
  }
  return value;
}

/** Blizzard item quality colours — data colours, used only on the item they describe. */
export const ITEM_QUALITY_COLORS: Record<number, string> = {
  0: "#9d9d9d", 1: "#ffffff", 2: "#1eff00", 3: "#0070dd", 4: "#a335ee", 5: "#ff8000", 6: "#e6cc80", 7: "#00ccff",
};

export function formatCount(value: number, lang: Lang) {
  return value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
}
