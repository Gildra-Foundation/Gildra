export const raidBossPlannerCopy = {
  ru: {
    arenaHint: "Вид сверху выбранной арены.",
    title: "План боя", description: "Выберите этап боя: слева — арена и схема, справа — противники, механики и задачи вашей роли.",
    phase: "Этап", phases: "Этапы боя", previous: "Предыдущий этап", next: "Следующий этап", command: "Команда рейду", enemies: "Противники этапа",
    difficulty: "Сложность", normal: "Нормальная", heroic: "Героическая", heroicNote: "Героическая сложность",
    grid: "Схема", art: "Атмосфера", schematic: "Условная расстановка: выбирайте свободную позицию по ситуации, обозначения не задают точные координаты.",
    sourceNote: "Тактика нормальной и героической сложности сверена 26.10.2026 по журналу способностей и руководствам Icy Veins. Карты арен — RaidPlan, карты этажей — Wowhead. Схемы показывают принцип расстановки; конкретных игроков и порядок кулдаунов назначает рейд-лидер. Эпохальная сложность в этот план не входит.",
    back: "Пулы и маршрут рейда", group: "Группа", boss: "Босс", add: "Прислужники", objective: "Цель", tank: "Танк", healer: "Лекари", dps: "Бойцы",
    safe: "Свободное место", danger: "Опасность", soak: "Разделить урон", wall: "Преграда", variantMain: "Основной вид", variantAlt: "Другой ракурс",
  },
  en: {
    arenaHint: "Top-down view of the selected arena.",
    title: "Battle plan", description: "Select a stage: the arena and schematic are on the left; enemies, mechanics and your role's tasks are on the right.",
    phase: "Stage", phases: "Encounter stages", previous: "Previous stage", next: "Next stage", command: "Raid call", enemies: "Stage enemies",
    difficulty: "Difficulty", normal: "Normal", heroic: "Heroic", heroicNote: "Heroic difficulty",
    grid: "Schematic", art: "Atmosphere", schematic: "Illustrative positioning: choose clear space as mechanics develop. Markers do not specify exact coordinates.",
    sourceNote: "Normal and Heroic strategy checked on 26 Oct 2026 against spell records and Icy Veins guides. Arena maps: RaidPlan; floor maps: Wowhead. Schematics explain positioning principles; the raid leader assigns players and cooldowns. Mythic is outside this plan's scope.",
    back: "Raid pulls and route", group: "Group", boss: "Boss", add: "Adds", objective: "Objective", tank: "Tank", healer: "Healers", dps: "Damage",
    safe: "Clear space", danger: "Danger", soak: "Shared hit", wall: "Barrier", variantMain: "Main view", variantAlt: "Alternative view",
  },
} as const;
