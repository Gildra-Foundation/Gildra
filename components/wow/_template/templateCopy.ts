/** Strings of the Template section; `en` and `ru` keep the same keys. */
export const templateCopy = {
  en: {
    breadcrumbs: "Breadcrumbs",
    wow: "World of Warcraft",
    title: "Template",
    lede: "One sentence on what this section answers for the player.",
    sectionTitle: "First chapter",
    empty: "Nothing verified here yet.",
  },
  ru: {
    breadcrumbs: "Навигация",
    wow: "World of Warcraft",
    title: "Шаблон",
    lede: "Одно предложение о том, на какой вопрос игрока отвечает раздел.",
    sectionTitle: "Первая глава",
    empty: "Здесь пока нет проверенных данных.",
  },
} as const satisfies Record<"en" | "ru", Record<string, string>>;
