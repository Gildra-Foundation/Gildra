/** Strings of the "What's new" page; `en` and `ru` keep the same keys. */
export const whatsNewCopy = {
  en: {
    breadcrumbs: "Breadcrumbs",
    wow: "World of Warcraft",
    title: "What's new",
    lede: "What changed on Gildra for players, newest first. Data updates of the season are announced on their own pages.",
    kinds: { new: "New", better: "Better", fixed: "Fixed" },
    releases: "releases",
  },
  ru: {
    breadcrumbs: "Навигация",
    wow: "World of Warcraft",
    title: "Что нового",
    lede: "Что изменилось на Gildra для игроков, сначала свежее. Обновления данных сезона объявляются на их страницах.",
    kinds: { new: "Новое", better: "Улучшено", fixed: "Исправлено" },
    releases: "выпусков",
  },
} as const satisfies Record<"en" | "ru", unknown>;
