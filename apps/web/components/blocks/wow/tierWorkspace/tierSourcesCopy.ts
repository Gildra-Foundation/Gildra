/** Interface copy of the tier-list source tabs (Gildra, mythicstats.com, u.gg).
 *  Source names stay as the sites write them in both languages. */
import type { Lang } from "@/lib/i18n-paths";

const ruHours = (n: number) => {
  const rule = new Intl.PluralRules("ru-RU").select(n);
  return rule === "one" ? "час" : rule === "few" ? "часа" : "часов";
};

export const tierSourcesCopy = {
  ru: {
    tabsLabel: "Источник тир-листа",
    source: "Источник",
    compare: "Сравнение",
    mythicPlusOnly: "Только Эпохальный+",
    sourceBy: "Источник",
    aboutTitle: "О данных",
    openOn: (site: string) => `Открыть на ${site}`,
    justNow: "обновлено только что",
    hoursAgo: (n: number) => `обновлено ${n} ${ruHours(n)} назад`,
    daysAgo: (n: number) => `обновлено ${n} дн. назад`,
    allDifficulties: "Все",
    noRaid: "mythicstats.com публикует только Эпохальный+.",
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
    tabsLabel: "Tier list source",
    source: "Source",
    compare: "Compare",
    mythicPlusOnly: "Mythic+ only",
    sourceBy: "Source",
    aboutTitle: "About the data",
    openOn: (site: string) => `Open on ${site}`,
    justNow: "updated just now",
    hoursAgo: (n: number) => `updated ${n}h ago`,
    daysAgo: (n: number) => `updated ${n}d ago`,
    allDifficulties: "All",
    noRaid: "mythicstats.com publishes Mythic+ only.",
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
