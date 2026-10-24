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
    gildraHint: "Сводный",
    mythicPlusOnly: "Только Эпохальный+",
    sourceBy: "Источник",
    openOn: (site: string) => `Открыть на ${site}`,
    justNow: "обновлено только что",
    hoursAgo: (n: number) => `обновлено ${n} ${ruHours(n)} назад`,
    daysAgo: (n: number) => `обновлено ${n} дн. назад`,
    allDifficulties: "Все",
    attribution: {
      mythicstats: "Тиры и порядок — с mythicstats.com (раздел /spec). Мы храним только тир и позицию спека; описание и методика — на сайте источника.",
      ugg: "Тиры и порядок — с u.gg (WoW tier list). Позиция спека — по его лучшему героическому таланту; описание и методика — на сайте источника.",
    } as Record<string, string>,
    noRaid: "mythicstats.com публикует только Эпохальный+.",
    loadError: "Не удалось загрузить тир-лист источника. Попробуйте ещё раз позже.",
    compareTitle: "Тир по источникам",
    spec: "Специализация",
    compareLede: "Один спек — три тира. Строки отсортированы по среднему месту; «Согласие» показывает, сколько источников ставят спек в один тир.",
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
    gildraHint: "Blended",
    mythicPlusOnly: "Mythic+ only",
    sourceBy: "Source",
    openOn: (site: string) => `Open on ${site}`,
    justNow: "updated just now",
    hoursAgo: (n: number) => `updated ${n}h ago`,
    daysAgo: (n: number) => `updated ${n}d ago`,
    allDifficulties: "All",
    attribution: {
      mythicstats: "Tiers and order from mythicstats.com (/spec). We keep only each spec's tier and position; the write-up and method live on the source site.",
      ugg: "Tiers and order from u.gg (WoW tier list). A spec's position follows its best hero talent; the write-up and method live on the source site.",
    } as Record<string, string>,
    noRaid: "mythicstats.com publishes Mythic+ only.",
    loadError: "Could not load this source's tier list. Try again later.",
    compareTitle: "Tier by source",
    spec: "Specialization",
    compareLede: "One spec, three tiers. Rows follow the average position; Agreement counts the sources that put the spec in the same tier.",
    agreement: "Agreement",
    agreeAll: "all agree",
    agreeSome: (a: number, b: number) => `${a} of ${b}`,
    noTier: "no data",
    group: { melee: "melee", ranged: "ranged" } as Record<string, string>,
  },
} satisfies Record<Lang, unknown>;

export type TierSourcesCopy = (typeof tierSourcesCopy)["en"];
