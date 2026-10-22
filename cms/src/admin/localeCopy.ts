import { filled, hasText } from "./completeness";

type LocaleFields = { title?: unknown; summary?: unknown; content?: unknown };

/** Copy only empty, localized content fields. Status, slug, site and authors never travel. */
export function emptyLocaleFields(current: LocaleFields, source: LocaleFields): LocaleFields {
  const patch: LocaleFields = {};
  if (!filled(current.title) && filled(source.title)) patch.title = source.title;
  if (!filled(current.summary) && filled(source.summary)) patch.summary = source.summary;
  if (!hasText(current.content) && hasText(source.content)) patch.content = structuredClone(source.content);
  return patch;
}
