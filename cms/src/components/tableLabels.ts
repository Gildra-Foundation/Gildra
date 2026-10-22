import type { AdminLang } from "../admin/text";
import type { DataTableLabels } from "./valyro-ui/data-display/DataTable";

/** Every built-in table action follows Payload's interface language. */
export function tableLabels(lang: AdminLang): DataTableLabels {
  if (lang === "ru") return {
    search: (name) => `Поиск: ${name ?? "таблица"}`, searchPlaceholder: "Найти в таблице…",
    selectAll: "Выбрать все", selectRow: (name) => `Выбрать ${name ?? "строку"}`,
    selected: (n, total) => `Выбрано ${n} из ${total}`, range: (a, b, total) => `${a}–${b} из ${total}`,
    rows: (n) => `Строк: ${n}`, page: (p, total) => `Страница ${p} из ${total}`,
    previousPage: "Предыдущая страница", nextPage: "Следующая страница",
    empty: "Нет данных", noResults: "Ничего не найдено", noResultsDescription: (query) => `Нет строк по запросу «${query}».`, yes: "Да", no: "Нет",
  };
  return {
    search: (name) => `Search ${name ?? "table"}`, searchPlaceholder: "Search table…",
    selectAll: "Select all", selectRow: (name) => `Select ${name ?? "row"}`,
    selected: (n, total) => `${n} of ${total} selected`, range: (a, b, total) => `${a}–${b} of ${total}`,
    rows: (n) => `${n} rows`, page: (p, total) => `Page ${p} of ${total}`,
    previousPage: "Previous page", nextPage: "Next page", empty: "No data", noResults: "No results",
    noResultsDescription: (query) => `No rows match “${query}”.`, yes: "Yes", no: "No",
  };
}
