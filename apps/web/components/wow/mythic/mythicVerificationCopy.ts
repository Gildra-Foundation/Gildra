export const mythicVerificationCopy = {
  ru: {
    catalogTitle: "Маршруты — черновики",
    routeTitle: "Маршрут — черновик",
    draft: "Порядок боёв, проценты сил противника, длительность этапов и назначения ещё не проверены в игре.",
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
    unverified: "В игре не проверена. Даты проверки тактики пока нет.",
    scope: "Ссылки подтверждают только указанные сведения. Они не подтверждают авторский маршрут или его расчётное время.",
  },
  en: {
    catalogTitle: "These routes are drafts",
    routeTitle: "This route is a draft",
    draft: "Fight order, enemy forces, estimated step durations and assignments have not yet been verified in game.",
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
    unverified: "Not verified in game. No tactical verification date is available yet.",
    scope: "These links support only the stated facts. They do not verify the authored route or its estimated duration.",
  },
} as const;

export function verificationDate(iso: string, locale: "ru" | "en") {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
