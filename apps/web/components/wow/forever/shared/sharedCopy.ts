/** Words of the shared Forever parts (states, filters, paging). Page words stay in the page's own copy file. */
export const sharedCopy = {
  en: {
    root: "Forever", breadcrumbs: "Breadcrumbs",
    search: "Search", apply: "Apply", reset: "Reset",
    previous: "Previous", next: "Next",
    loading: "Loading", error: "The page did not load", errorText: "Try again in a moment.", retry: "Try again",
    empty: "Nothing found", emptyText: "Change the search or reset the filters.",
  },
  ru: {
    root: "Forever", breadcrumbs: "Навигация",
    search: "Поиск", apply: "Применить", reset: "Сбросить",
    previous: "Назад", next: "Дальше",
    loading: "Загрузка", error: "Страница не загрузилась", errorText: "Попробуйте ещё раз через минуту.", retry: "Повторить",
    empty: "Ничего не найдено", emptyText: "Измените запрос или сбросьте фильтры.",
  },
} as const;
