import type { CollectionBeforeChangeHook, Config } from "payload";

/**
 * Payload words for the publish flow. The stock strings say "Updated
 * successfully" for every save and "Publish changes" without saying that both
 * languages go live; here the primary action names the languages and the
 * toasts name the result.
 */
export const PUBLISH_TRANSLATIONS: Record<string, Record<string, Record<string, string>>> = {
  ru: {
    general: {
      updatedSuccessfully: "Сохранено.",
      selectValue: "Выберите…",
      createNewLabel: "Создать: {{label}}",
      editLabel: "Редактировать",
    },
    fields: { addNewLabel: "Добавить" },
    version: {
      publishChanges: "Опубликовать RU и EN",
      publishIn: "Опубликовать только версию: {{locale}}",
      publishAllLocales: "Опубликовать RU и EN",
      unpublishIn: "Снять с публикации только версию: {{locale}}",
      unpublishedSuccessfully: "Снято с публикации.",
      scheduledSuccessfully: "Запланировано.",
      publishedSuccessfully: "Опубликовано.",
      modifiedOnly: "Только изменённые",
    },
  },
  en: {
    general: { updatedSuccessfully: "Saved.", editLabel: "Edit" },
    fields: { addNewLabel: "Add new" },
    version: {
      publishChanges: "Publish RU and EN",
      publishIn: "Publish only the {{locale}} version",
      publishAllLocales: "Publish RU and EN",
      unpublishIn: "Unpublish only the {{locale}} version",
      unpublishedSuccessfully: "Unpublished.",
      scheduledSuccessfully: "Scheduled.",
      publishedSuccessfully: "Published.",
    },
  },
};

/** Merge the groups above into the sanitised config's translations. */
export function applyTranslations(
  target: Record<string, Record<string, Record<string, string>>>,
  groups: Record<string, Record<string, Record<string, string>>>,
): void {
  for (const [lang, byGroup] of Object.entries(groups)) {
    const language = (target[lang] ??= {});
    for (const [group, labels] of Object.entries(byGroup)) language[group] = { ...language[group], ...labels };
  }
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Payload answers every non-draft save of a versioned document with
 * `general:updatedSuccessfully`. For drafts-enabled collections that save is
 * always a publish, so the toast is switched to "Published" for that request.
 */
export const announcePublish: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== "update" || data?._status !== "published") return data;
  const original = req.t as unknown as Translate;
  (req as { t: Translate }).t = (key, options) =>
    original(key === "general:updatedSuccessfully" ? "version:publishedSuccessfully" : key, options);
  return data;
};

/** Add the publish toast hook to the versioned editorial collections. */
export function withPublishToast<T extends Pick<Config, "collections">>(config: T): T {
  for (const collection of config.collections ?? []) {
    if (collection.slug !== "guides" && collection.slug !== "pages") continue;
    collection.hooks = { ...collection.hooks, beforeChange: [...(collection.hooks?.beforeChange ?? []), announcePublish] };
  }
  return config;
}
