import type { Lang } from "@/lib/i18n";

/**
 * Interface copy of the library dataset workspace (search, filters, cards,
 * paging) and the tooltip preview. Game terms (item, spell, zone names) stay
 * English by project convention; numbers and facts come from the catalog API,
 * never from here.
 */
export const databaseCopy = {
  ru: {
    searchLabel: (name: string) => `Поиск: ${name}`,
    searchPlaceholder: "Название…",
    searchSubmit: "Найти",
    gameVersion: "Издание игры",
    any: "Любой",
    levelsTitle: "Уровни",
    itemLevelFrom: "Уровень предмета от",
    itemLevelTo: "Уровень предмета до",
    charLevelFrom: "Уровень персонажа от",
    charLevelTo: "Уровень персонажа до",
    apply: "Применить",
    reset: "Сбросить всё",
    remove: "убрать фильтр",
    appliedLabel: "Выбранные фильтры",
    resultsLabel: (name: string) => `Записи: ${name}`,
    pagesLabel: "Страницы",
    found: "Найдено",
    back: "Назад",
    next: "Следующая страница",
    emptyTitle: "Подходящих записей нет",
    emptyText: "Попробуйте другое название или уберите часть фильтров.",
    previewLabel: (name: string) => `Игровая подсказка: ${name}`,
    loadingTooltip: "Загружаем подсказку…",
    tooltipError: "Не удалось загрузить подсказку.",
    retry: "Повторить",
  },
  en: {
    searchLabel: (name: string) => `Search ${name}`,
    searchPlaceholder: "Name…",
    searchSubmit: "Search",
    gameVersion: "Game edition",
    any: "Any",
    levelsTitle: "Levels",
    itemLevelFrom: "Item level from",
    itemLevelTo: "Item level to",
    charLevelFrom: "Character level from",
    charLevelTo: "Character level to",
    apply: "Apply",
    reset: "Reset all",
    remove: "remove the filter",
    appliedLabel: "Applied filters",
    resultsLabel: (name: string) => `${name} records`,
    pagesLabel: "Pages",
    found: "Found",
    back: "Back",
    next: "Next page",
    emptyTitle: "No matching records",
    emptyText: "Try another name or remove some of the filters.",
    previewLabel: (name: string) => `In-game tooltip: ${name}`,
    loadingTooltip: "Loading the tooltip…",
    tooltipError: "Could not load the tooltip.",
    retry: "Retry",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type DatabaseCopy = (typeof databaseCopy)[Lang];

/** Labels the preview button needs on the client (plain strings, no functions). */
export function previewCopy(lang: Lang) {
  const copy = databaseCopy[lang];
  return { loading: copy.loadingTooltip, error: copy.tooltipError, retry: copy.retry };
}

export const FACET_LABELS: Record<string, [en: string, ru: string]> = {
  class: ["Class", "Класс"], specialization: ["Specialization", "Специализация"], race: ["Race", "Раса"],
  equipment_slot: ["Equipment slot", "Слот"], armor_type: ["Armor type", "Тип брони"], weapon_type: ["Weapon type", "Тип оружия"],
  profession: ["Profession", "Профессия"], item_class: ["Item class", "Класс предмета"],
};

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

export function formatCount(value: number, lang: Lang) {
  return value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
}
