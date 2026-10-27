import type { Lang } from "@/lib/i18n";

/** Interface copy of /search and /ru/search (the library search). Record names and types come from the catalog. */
export const searchCopy = {
  ru: {
    wow: "World of Warcraft",
    library: "Библиотека",
    crumb: "Поиск",
    breadcrumbsLabel: "Навигация",
    eyebrow: "Библиотека",
    title: "Поиск по библиотеке",
    lede: "Предметы, заклинания, задания, NPC и коллекции. Ищите по названию на русском или английском.",
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
    resultsFor: (count: number, query: string) => `Показано ${count} ${plural(count, "запись", "записи", "записей")} по запросу «${query}».`,
    searching: (game: string) => `Ищем в ${game}…`,
    unavailable: "Каталог временно недоступен",
    empty: "В библиотеке ничего не найдено",
    emptyHint: "Попробуйте более общий запрос или другое написание. Названия можно искать на русском и английском.",
    itemLevel: "Уровень предмета",
    libraryLink: "Все разделы библиотеки",
    startTitle: "Что найти?",
    startText: "Введите название предмета, заклинания, задания или NPC — на русском или английском.",
    results: "Результаты поиска",
  },
  en: {
    wow: "World of Warcraft",
    library: "Library",
    crumb: "Search",
    breadcrumbsLabel: "Breadcrumbs",
    eyebrow: "Library",
    title: "Search the library",
    lede: "Items, spells, quests, NPCs and collections. Search by name in English or Russian.",
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
    resultsFor: (count: number, query: string) => `Showing ${count} ${count === 1 ? "record" : "records"} for “${query}”.`,
    searching: (game: string) => `Searching ${game}…`,
    unavailable: "Catalog temporarily unavailable",
    empty: "No matching records",
    emptyHint: "Try a broader term or another spelling. Names can be searched in English and Russian.",
    itemLevel: "Item level",
    libraryLink: "All library sections",
    startTitle: "What are you looking for?",
    startText: "Type the name of an item, spell, quest or NPC — in English or Russian.",
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
