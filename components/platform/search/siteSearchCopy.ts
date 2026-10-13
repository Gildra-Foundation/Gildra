import { pluralRu } from "@gildra/atlas-ui/format";

/** Strings of the quick search (⌘K): the toolbar button and its dialog. */
export const siteSearchCopy = {
  en: {
    button: "Search",
    buttonRest: " the site",
    dialog: "Site search",
    placeholder: "Raid, boss, dungeon, class, section…",
    recent: "Recently opened",
    sections: "Sections",
    results: "Results",
    loading: "Loading the index…",
    failed: "The index did not load. You can still search the database.",
    nothing: "Nothing found on the site.",
    database: (query: string) => `Search the database for “${query}”`,
    databaseGroup: "Database",
    hints: [["↑↓", "choose"], ["Enter", "open"], ["Esc", "close"]] as const,
    count: (n: number) => `${n} ${n === 1 ? "result" : "results"}`,
  },
  ru: {
    button: "Поиск",
    buttonRest: " по сайту",
    dialog: "Поиск по сайту",
    placeholder: "Рейд, босс, подземелье, класс, раздел…",
    recent: "Недавно открытые",
    sections: "Разделы",
    results: "Найдено",
    loading: "Загружаю указатель…",
    failed: "Указатель не загрузился. Можно искать в базе данных.",
    nothing: "На сайте ничего не нашлось.",
    database: (query: string) => `Искать «${query}» в базе данных`,
    databaseGroup: "База данных",
    hints: [["↑↓", "выбрать"], ["Enter", "открыть"], ["Esc", "закрыть"]] as const,
    count: (n: number) => `${n} ${pluralRu(n, "результат", "результата", "результатов")}`,
  },
} as const;

export type SiteSearchLang = keyof typeof siteSearchCopy;
