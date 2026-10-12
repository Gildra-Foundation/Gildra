/** Strings of the quick search (⌘K): the toolbar button and its dialog. */
export const siteSearchCopy = {
  en: {
    button: "Search",
    open: "Search the site",
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
    open: "Поиск по сайту",
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
    count: (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      const word = mod10 === 1 && mod100 !== 11 ? "результат" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "результата" : "результатов";
      return `${n} ${word}`;
    },
  },
} as const;

export type SiteSearchLang = keyof typeof siteSearchCopy;
