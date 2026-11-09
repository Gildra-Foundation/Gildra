import { pluralRu } from "@gildra/atlas-ui/format";
import type { SiteSearchGroup } from "@/lib/search/siteIndex";

/** Strings of the quick search (⌘K): the toolbar button and its dialog. */
export const siteSearchCopy = {
  en: {
    button: "Search",
    buttonRest: " the site",
    dialog: "Site search",
    placeholder: "Raid, boss, dungeon, class, section…",
    recent: "Recently opened",
    recentQueries: "Recent searches",
    sections: "Sections",
    groups: { section: "Sections", place: "Map", raid: "Raids", boss: "Raid bosses", lair: "Lairs and world bosses", dungeon: "Mythic+ dungeons", class: "Classes", talents: "Specializations" },
    clear: "Clear",
    close: "Close",
    results: "Results",
    failed: "Search did not load. The database search below still works.",
    nothing: "Nothing found.",
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
    recentQueries: "Недавние запросы",
    sections: "Разделы",
    groups: { section: "Разделы", place: "Карта", raid: "Рейды", boss: "Боссы рейдов", lair: "Логова и мировые боссы", dungeon: "Подземелья M+", class: "Классы", talents: "Специализации" },
    clear: "Очистить",
    close: "Закрыть",
    results: "Найдено",
    failed: "Поиск не загрузился. Поиск по базе данных ниже работает.",
    nothing: "Ничего не нашлось.",
    database: (query: string) => `Искать «${query}» в базе данных`,
    databaseGroup: "База данных",
    hints: [["↑↓", "выбрать"], ["Enter", "открыть"], ["Esc", "закрыть"]] as const,
    count: (n: number) => `${n} ${pluralRu(n, "результат", "результата", "результатов")}`,
  },
} as const satisfies Record<string, { groups: Record<SiteSearchGroup, string>; [key: string]: unknown }>;

export type SiteSearchLang = keyof typeof siteSearchCopy;
