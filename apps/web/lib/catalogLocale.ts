import type { Lang } from "./i18n-paths";

type LocalizedFields = { name: string; description: string; resolvedDescription: string };
type CatalogText = {
  name: string; type?: string; description?: string; locale?: string; resolvedLocale?: string; localeFallback?: boolean;
  localizations?: Record<string, LocalizedFields>; rawDescription?: string; resolvedDescription?: string; tooltip?: unknown;
};

/** A display projection only: keep the API's original source payload intact. */
export function catalogLocaleView<T extends CatalogText>(record: T, lang: Lang): T {
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  const source = record.localizations?.[locale];
  if (source) {
    const invalidName = wrongName(source.name, lang, record.type);
    return { ...record, name: invalidName ? "" : source.name, description: invalidName ? "" : displayText(source.resolvedDescription || source.description, lang),
      rawDescription: invalidName ? "" : displayText(source.description, lang), resolvedDescription: invalidName ? "" : displayText(source.resolvedDescription, lang),
      ...(invalidName || record.localeFallback || (record.resolvedLocale && record.resolvedLocale !== locale) ? { tooltip: undefined } : {}) };
  }
  if (record.localeFallback || (record.resolvedLocale && record.resolvedLocale !== locale) || (record.locale && record.locale !== locale)) {
    return { ...record, name: "", description: "", rawDescription: "", resolvedDescription: "", tooltip: undefined };
  }
  if (wrongName(record.name, lang, record.type)) return { ...record, name: "", description: "", rawDescription: "", resolvedDescription: "", tooltip: undefined };
  return record;
}

function wrongName(value: string, lang: Lang, type?: string) {
  if (type === "expansion" || type === "product" || value === "World of Warcraft") return false;
  return lang === "ru" ? /[A-Za-z]/.test(value) : /[А-Яа-яЁё]/.test(value);
}
function displayText(value: string | undefined, lang: Lang) {
  if (!value) return value;
  const wrong = lang === "ru" ? /[A-Za-z]/.test(value) && !/[А-Яа-яЁё]/.test(value) : /[А-Яа-яЁё]/.test(value) && !/[A-Za-z]/.test(value);
  return wrong ? "" : value;
}
