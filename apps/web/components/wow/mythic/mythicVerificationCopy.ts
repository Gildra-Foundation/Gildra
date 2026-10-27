export const mythicVerificationCopy = {
  ru: {
    summary: "Источники и даты проверки",
    checked: "Проверено",
    season: "Состав сезона",
    seasonSource: "Blizzard · Midnight, сезон 2",
    timers: "Игровые таймеры",
    timersSource: "Raider.IO · таймеры сезона 2",
    names: "Названия подземелий",
    namesSource: "Blizzard · русские названия",
    patch: "Версия игры",
    patchSource: "Blizzard · обновление 12.1.5",
  },
  en: {
    summary: "Sources and verification dates",
    checked: "Checked",
    season: "Season dungeon pool",
    seasonSource: "Blizzard · Midnight Season 2",
    timers: "In-game time limits",
    timersSource: "Raider.IO · Season 2 timers",
    names: "Dungeon names",
    namesSource: "Blizzard · Russian dungeon names",
    patch: "Game version",
    patchSource: "Blizzard · Patch 12.1.5",
  },
} as const;

export function verificationDate(iso: string, locale: "ru" | "en") {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
