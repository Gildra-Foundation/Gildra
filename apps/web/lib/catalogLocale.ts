import type { Lang } from "./i18n-paths";

type LocalizedFields = { name: string; description: string; resolvedDescription: string };
type CatalogText = {
  name: string; description?: string; locale?: string; resolvedLocale?: string; localeFallback?: boolean;
  localizations?: Record<string, LocalizedFields>; rawDescription?: string; resolvedDescription?: string; tooltip?: unknown;
};

/** A display projection only: keep the API's original source payload intact. */
export function catalogLocaleView<T extends CatalogText>(record: T, lang: Lang): T {
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  const source = record.localizations?.[locale];
  if (source) {
    return { ...record, name: source.name, description: source.resolvedDescription || source.description,
      rawDescription: source.description, resolvedDescription: source.resolvedDescription,
      ...(record.localeFallback || (record.resolvedLocale && record.resolvedLocale !== locale) ? { tooltip: undefined } : {}) };
  }
  if (record.localeFallback || (record.resolvedLocale && record.resolvedLocale !== locale) || (record.locale && record.locale !== locale)) {
    return { ...record, name: "", description: "", rawDescription: "", resolvedDescription: "", tooltip: undefined };
  }
  return record;
}
