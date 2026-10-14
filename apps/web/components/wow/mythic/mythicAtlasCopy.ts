import { pluralRu } from "@gildra/atlas-ui/format";

/** Interface copy of the Mythic+ hub. Dungeon, boss and zone names are game terms. */
export const mythicAtlasCopy = {
  ru: {
    eyebrow: "Midnight · Сезон 2",
    title: "Атлас Эпохальный+",
    breadcrumbsLabel: "Навигация",
    lede: "Выберите подземелье и откройте маршрут: пулы, боссы, таймер, состав группы и тактические назначения.",
    statsLabel: "Сводка сезона",
    dungeons: "подземелий",
    bosses: "боссов",
    season: "сезон",
    listTitle: "Подземелья сезона",
    timersTitle: "Таймеры ключей",
    timersText: "Сколько времени даёт ключ на каждое подземелье, от самого короткого.",
    stops: (count: number) => `${count} ${pluralRu(count, "шаг", "шага", "шагов")}`,
    bossCount: (count: number) => `${count} ${pluralRu(count, "босс", "босса", "боссов")}`,
    open: "Открыть маршрут",
    timer: "Таймер",
  },
  en: {
    eyebrow: "Midnight · Season 2",
    title: "Mythic+ atlas",
    breadcrumbsLabel: "Breadcrumbs",
    lede: "Choose a dungeon and open its route: pulls, bosses, timer, party composition and tactical assignments.",
    statsLabel: "Season summary",
    dungeons: "dungeons",
    bosses: "bosses",
    season: "season",
    listTitle: "Dungeons of the season",
    timersTitle: "Key timers",
    timersText: "How long a key gives you in each dungeon, shortest first.",
    stops: (count: number) => `${count} ${count === 1 ? "stop" : "stops"}`,
    bossCount: (count: number) => `${count} ${count === 1 ? "boss" : "bosses"}`,
    open: "Open route",
    timer: "Timer",
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
