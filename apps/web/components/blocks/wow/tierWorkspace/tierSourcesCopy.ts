/** Interface copy of the tier-list source tabs (Gildra, mythicstats.com, u.gg).
 *  Source names stay as the sites write them in both languages. */
import type { Lang } from "@/lib/i18n-paths";

export const tierSourcesCopy = {
  ru: {
    source: "Источник",
    compare: "Сравнение",
    sourceBy: "Источник",
    allDifficulties: "Все",
    loadError: "Не удалось загрузить тир-лист источника. Попробуйте ещё раз позже.",
    compareTitle: "Тир по источникам",
    spec: "Специализация",
    agreement: "Согласие",
    agreeAll: "все согласны",
    agreeSome: (a: number, b: number) => `${a} из ${b}`,
    noTier: "нет данных",
    group: { melee: "ближний бой", ranged: "дальний бой" } as Record<string, string>,
  },
  en: {
    source: "Source",
    compare: "Compare",
    sourceBy: "Source",
    allDifficulties: "All",
    loadError: "Could not load this source's tier list. Try again later.",
    compareTitle: "Tier by source",
    spec: "Specialization",
    agreement: "Agreement",
    agreeAll: "all agree",
    agreeSome: (a: number, b: number) => `${a} of ${b}`,
    noTier: "no data",
    group: { melee: "melee", ranged: "ranged" } as Record<string, string>,
  },
} satisfies Record<Lang, unknown>;

export type TierSourcesCopy = (typeof tierSourcesCopy)["en"];
