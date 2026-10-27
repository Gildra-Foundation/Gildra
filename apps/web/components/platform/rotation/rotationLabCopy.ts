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
    lede: "Simulate your build in SimulationCraft, tune the priority and drill the rotation on your keyboard.",
    loading: "Loading the rotation lab…",
    specMenu: { label: "Choose specialization", title: "Choose a specialization", text: "Abilities, resource and drills change with the spec." },
    modeLabel: "Lab mode",
    modeSimulation: "Simulation",
    modeTraining: "Training",
    itemLevelUnit: "ilvl",
    buildTitle: "Build and encounter",
    buildText: "Pick talents and a fight type, then start the simulation.",
    panelTitle: "Rotation panel and DPS",
    panelText: "Order matters: abilities at the top are checked first.",
    trainingTitle: "Training",
    currentDrill: "Current drill",
    practiceRotation: (spec: string) => `${spec} practice rotation`,
    trainingHint: "Check your keybinds, then press “Start training”.",
  },
  ru: {
    breadcrumbsLabel: "Навигационная цепочка",
    wow: "World of Warcraft",
    crumb: "Лаборатория ротации",
    title: (spec: string) => `Тренер ротации «${spec}»`,
    lede: "Рассчитайте билд в SimulationCraft, настройте приоритет и отработайте ротацию на клавиатуре.",
    loading: "Загружаем лабораторию ротации…",
    specMenu: { label: "Выбрать специализацию", title: "Выберите специализацию", text: "Способности, ресурс и тренировки сменятся вместе со спеком." },
    modeLabel: "Режим лаборатории",
    modeSimulation: "Расчёт",
    modeTraining: "Тренировка",
    itemLevelUnit: "ур. предметов",
    buildTitle: "Билд и условия боя",
    buildText: "Выберите таланты и тип боя, затем запустите расчёт.",
    panelTitle: "Панель ротации и DPS",
    panelText: "Порядок важен: верхние умения проверяются первыми.",
    trainingTitle: "Тренировка",
    currentDrill: "Сейчас тренируем",
    practiceRotation: (spec: string) => `Учебная ротация: ${spec}`,
    trainingHint: "Проверьте клавиши, затем нажмите «Начать тренировку».",
  },
} satisfies Record<RotationLabLocale, Record<string, unknown>>;
