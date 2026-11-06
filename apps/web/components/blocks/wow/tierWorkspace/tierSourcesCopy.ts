/** Interface copy of the tier-list source tabs, the arena mode and the comparison.
 *  Source names stay as the sites write them in both languages; bracket names are game terms. */
import type { Lang } from "@/lib/i18n-paths";
import type { PvpBracket, PvpRegion } from "./tierSourceKeys";

const brackets: Record<PvpBracket, string> = { "3v3": "3v3", "2v2": "2v2", shuffle: "Solo Shuffle", blitz: "Blitz", rbg: "RBG" };

export const tierSourcesCopy = {
  ru: {
    source: "Источник",
    sourceBy: "Источник",
    allDifficulties: "Все",
    loadError: "Не удалось загрузить тир-лист источника. Попробуйте ещё раз позже.",
    compareTitle: "Тир по источникам",
    spec: "Специализация",
    consensus: "Итог",
    agreement: "Согласие",
    agreeSome: (a: number, b: number) => `${a} из ${b} согласны с итогом`,
    noTier: "нет в списке",
    group: { melee: "ближний бой", ranged: "дальний бой" } as Record<string, string>,
    bracket: "Формат",
    brackets,
    region: "Регион",
    regions: { all: "Все", eu: "EU", us: "US" } satisfies Record<PvpRegion, string>,
    sources: "Источников",
    rating: "Рейтинг",
    players: "Игроков",
    winRate: "Побед",
    share: "Доля",
    ladder: "Рейтинговые таблицы",
  },
  en: {
    source: "Source",
    sourceBy: "Source",
    allDifficulties: "All",
    loadError: "Could not load this source's tier list. Try again later.",
    compareTitle: "Tier by source",
    spec: "Specialization",
    consensus: "Overall",
    agreement: "Agreement",
    agreeSome: (a: number, b: number) => `${a} of ${b} agree with the overall tier`,
    noTier: "not listed",
    group: { melee: "melee", ranged: "ranged" } as Record<string, string>,
    bracket: "Bracket",
    brackets,
    region: "Region",
    regions: { all: "All", eu: "EU", us: "US" } satisfies Record<PvpRegion, string>,
    sources: "Sources",
    rating: "Rating",
    players: "Players",
    winRate: "Win rate",
    share: "Share",
    ladder: "PvP leaderboards",
  },
} satisfies Record<Lang, unknown>;

export type TierSourcesCopy = (typeof tierSourcesCopy)["en"];
