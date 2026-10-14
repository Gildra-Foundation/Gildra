import type { Lang } from "@/lib/i18n";

/** Interface copy of /search and /ru/search. Record names and types come from the catalog. */
export const searchCopy = {
  ru: {
    title: "Поиск по архивам Азерота",
    lede: "Предметы, заклинания, задания и существа из базы Gildra. Ищите по названию на русском или английском либо по игровому ID.",
    placeholder: "Предмет, заклинание, задание…",
    inputLabel: "Что найти",
    submit: "Найти",
    clearQuery: "Очистить запрос",
    shortcut: "Быстрый поиск — клавиша /",
    kindsLabel: "Что искать",
    all: "Все записи",
    characters: "Персонажи",
    items: "Предметы",
    games: "Игры",
    apply: "Применить",
    soon: "скоро",
    counting: "Считаем результаты…",
    resultsFor: (count: number, query: string) => query ? `Показано ${count} ${plural(count, "запись", "записи", "записей")} по запросу «${query}».` : "Примеры записей из базы данных — введите название, чтобы найти нужное.",
    allInDatabase: "Все совпадения в базе данных",
    searching: (game: string) => `Ищем в ${game}…`,
    unavailable: "Каталог временно недоступен",
    empty: "В базе ничего не найдено",
    emptyHint: "Попробуйте более общий запрос или другое написание. Названия можно искать на русском и английском.",
    itemLevel: "Уровень предмета",
    databaseLink: "Разделы и фильтры — в базе данных",
    results: "Результаты поиска",
  },
  en: {
    title: "Search the Azeroth archives",
    lede: "Items, spells, quests, creatures and achievements from the Gildra database. Search by name in English or Russian — for example “Thunderfury”.",
    placeholder: "Item, spell or quest name…",
    inputLabel: "What to find",
    submit: "Search",
    clearQuery: "Clear the query",
    shortcut: "Quick search — press /",
    kindsLabel: "What to search",
    all: "All records",
    characters: "Characters",
    items: "Items",
    games: "Games",
    apply: "Apply",
    soon: "soon",
    counting: "Counting results…",
    resultsFor: (count: number, query: string) => query ? `Showing ${count} ${count === 1 ? "record" : "records"} for “${query}”.` : "Sample records from the database — type a name to find what you need.",
    allInDatabase: "All matches in the database",
    searching: (game: string) => `Searching ${game}…`,
    unavailable: "Catalog temporarily unavailable",
    empty: "No matching records",
    emptyHint: "Try a broader term or another spelling. Names can be searched in English and Russian.",
    itemLevel: "Item level",
    databaseLink: "Sections and filters are in the database",
    results: "Search results",
  },
} satisfies Record<Lang, Record<string, unknown>>;

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
