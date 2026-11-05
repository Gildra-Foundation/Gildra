/** Strings of the "What's new" page; `en` and `ru` keep the same keys. */
export const whatsNewCopy = {
  en: {
    breadcrumbs: "Breadcrumbs",
    wow: "World of Warcraft",
    title: "What's new",
    kinds: { new: "New", better: "Better", fixed: "Fixed" },
  },
  ru: {
    breadcrumbs: "Навигация",
    wow: "World of Warcraft",
    title: "Что нового",
    kinds: { new: "Новое", better: "Улучшено", fixed: "Исправлено" },
  },
} as const satisfies Record<"en" | "ru", unknown>;
