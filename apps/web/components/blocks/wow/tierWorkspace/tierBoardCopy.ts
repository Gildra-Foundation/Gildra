import type { TierRole } from "@/lib/platform/games/intelligence";

export const tierBoardCopy = {
  ru: {
    title: "Доска тиров Mythic+",
    live: "Те же данные, что в таблице выше. «Свой порядок» — перетащите спеки и скопируйте или скачайте свой тир-лист; на сайте он не сохраняется.",
    sample: "Образец из таблицы выше, не текущая статистика. «Свой порядок» — перетащите спеки и скопируйте или скачайте свой тир-лист.",
    roles: { dps: "Бойцы", healer: "Лекари", tank: "Танки" } satisfies Record<TierRole, string>,
    short: { dps: "DPS", healer: "Хил", tank: "Танк" } satisfies Record<TierRole, string>,
  },
  en: {
    title: "Mythic+ tier board",
    live: "The same data as the table above. “Your order” lets you drag specs and copy or download your own tier list; the site does not store it.",
    sample: "A sample from the table above, not current statistics. “Your order” lets you drag specs and copy or download your own tier list.",
    roles: { dps: "DPS", healer: "Healers", tank: "Tanks" } satisfies Record<TierRole, string>,
    short: { dps: "DPS", healer: "Heal", tank: "Tank" } satisfies Record<TierRole, string>,
  },
} as const;
