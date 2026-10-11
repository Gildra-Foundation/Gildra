export type AtlasLocale = "ru" | "en";

/** "13 сентября 2026 г." / "13 September 2026" from an ISO date or date-time. */
export function formatAtlasDate(iso: string, locale: AtlasLocale) {
  const date = new Date(/T/.test(iso) ? iso : `${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Russian plural form: pluralRu(5, "босс", "босса", "боссов") → "боссов". */
export function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** "Midnight Season 2" → "Midnight · Сезон 2" on Russian pages. */
export function formatSeason(season: string, locale: AtlasLocale) {
  return locale === "ru" ? season.replace(/\s*Season\s+(\d+)/i, " · Сезон $1") : season.replace(/\s*Season\s+(\d+)/i, " · Season $1");
}
