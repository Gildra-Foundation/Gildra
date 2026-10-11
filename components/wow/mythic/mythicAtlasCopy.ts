/** Interface copy of the Mythic+ hub. Dungeon, boss and zone names are game terms. */
export const mythicAtlasCopy = {
  ru: {
    eyebrow: "World of Warcraft · Midnight · Сезон 2",
    title: "Атлас Mythic+",
    lede: "Выберите подземелье и откройте маршрут: пулы, боссы, таймер, состав группы и тактические назначения.",
    statsLabel: "Сводка сезона",
    dungeons: "подземелий",
    bosses: "боссов",
    season: "сезон",
    listTitle: "Подземелья сезона",
    listText: "Восемь маршрутов текущего сезона ключей.",
    stops: (count: number) => `${count} шагов`,
    open: "Открыть маршрут",
    timer: "Таймер",
    progressNote: "Отмеченный прогресс маршрута сохраняется только в вашем браузере.",
  },
  en: {
    eyebrow: "World of Warcraft · Midnight · Season 2",
    title: "Mythic+ atlas",
    lede: "Choose a dungeon and open its route: pulls, bosses, timer, party composition and tactical assignments.",
    statsLabel: "Season summary",
    dungeons: "dungeons",
    bosses: "bosses",
    season: "season",
    listTitle: "Dungeons of the season",
    listText: "Eight routes for the current keystone season.",
    stops: (count: number) => `${count} stops`,
    open: "Open route",
    timer: "Timer",
    progressNote: "Route progress you mark is saved only in your browser.",
  },
} as const;

/** English names of the zones stored in Russian in dungeonRoutes.ts. */
export const dungeonLocationEn: Record<string, string> = {
  "Драконьи острова": "Dragon Isles",
  "Луносвет": "Silvermoon City",
  "Зул'Аман": "Zul'Aman",
  "Харандар": "Harandar",
  "Буря Бездны": "Voidstorm",
  "Зулдазар": "Zuldazar",
  "Вол'дун": "Vol'dun",
};
