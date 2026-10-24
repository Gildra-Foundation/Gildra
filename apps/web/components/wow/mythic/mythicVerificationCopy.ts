export const mythicVerificationCopy = {
  ru: {
    summary: "Источники и даты проверки",
    checked: "Проверено по источнику",
    season: "Состав сезона",
    seasonSource: "Blizzard · Midnight, сезон 2",
    timers: "Игровые таймеры",
    timersSource: "Raider.IO · таймеры сезона 2",
    names: "Названия подземелий",
    namesSource: "Blizzard · русские названия",
    patch: "Версия игры на дату сверки",
    patchSource: "Blizzard · обновление 12.1.5",
    route: "Тактика маршрута",
    reviewed: "Порядок прохождения и состав групп сверены с руководствами и маршрутами MDT. Ссылки на конкретный маршрут приведены в каждом гайде.",
    scope: "Проверка выполнена по источникам. Маршруты не проходили отдельное тестирование нашей группой в игре; расчётное время прохождения не публикуется.",
  },
  en: {
    summary: "Sources and verification dates",
    checked: "Checked against source",
    season: "Season dungeon pool",
    seasonSource: "Blizzard · Midnight Season 2",
    timers: "In-game time limits",
    timersSource: "Raider.IO · Season 2 timers",
    names: "Dungeon names",
    namesSource: "Blizzard · Russian dungeon names",
    patch: "Game version at the time of the check",
    patchSource: "Blizzard · Patch 12.1.5",
    route: "Route tactics",
    reviewed: "Progression and enemy groups were reviewed against guides and MDT routes. Each dungeon guide links to its route sources.",
    scope: "This is a source review. Our team has not separately tested these routes in game; estimated completion times are not published.",
  },
} as const;

export function verificationDate(iso: string, locale: "ru" | "en") {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
