/**
 * Page-level copy of the Rotation Lab (/wow/rotation/[spec]). Widget copy that
 * predates this file still lives next to each widget. Game terms (class,
 * spec, ability names) stay English on both locales by project convention,
 * except the localized spec names that come from lib/talentSpecThemes.
 */
export type RotationLabLocale = "en" | "ru";

export const rotationLabCopy = {
  en: {
    breadcrumbsLabel: "Breadcrumbs",
    wow: "World of Warcraft",
    crumb: "Rotation lab",
    title: (spec: string) => `${spec} Rotation Lab`,
    loading: "Loading the rotation lab…",
    specMenu: { label: "Choose specialization", title: "Choose a specialization" },
    modeLabel: "Lab mode",
    modeSimulation: "Simulation",
    modeTraining: "Training",
    itemLevelUnit: "ilvl",
    buildTitle: "Build and encounter",
    panelTitle: "Rotation panel and DPS",
    trainingTitle: "Training",
    currentDrill: "Current drill",
    practiceRotation: (spec: string) => `${spec} practice rotation`,
  },
  ru: {
    breadcrumbsLabel: "Навигационная цепочка",
    wow: "World of Warcraft",
    crumb: "Лаборатория ротации",
    title: (spec: string) => `Тренер ротации «${spec}»`,
    loading: "Загружаем лабораторию ротации…",
    specMenu: { label: "Выбрать специализацию", title: "Выберите специализацию" },
    modeLabel: "Режим лаборатории",
    modeSimulation: "Расчёт",
    modeTraining: "Тренировка",
    itemLevelUnit: "ур. предметов",
    buildTitle: "Билд и условия боя",
    panelTitle: "Панель ротации и DPS",
    trainingTitle: "Тренировка",
    currentDrill: "Сейчас тренируем",
    practiceRotation: (spec: string) => `Учебная ротация: ${spec}`,
  },
} satisfies Record<RotationLabLocale, Record<string, unknown>>;
