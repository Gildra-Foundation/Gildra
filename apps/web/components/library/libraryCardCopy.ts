import type { Lang } from "@/lib/i18n-paths";

/** Interface copy of library record cards and their hover preview (no lib/i18n: used by client code too). */
export const libraryCardCopy = {
  ru: {
    itemLevelShort: "ур. предм.",
    levelShort: (level: number) => `ур. ${level}`,
    requiredLevel: (level: string) => `Треб. ур. ${level}`,
    preview: "Подсказка",
    quality: { 0: "Низкое", 1: "Обычное", 2: "Необычное", 3: "Редкое", 4: "Эпическое", 5: "Легендарное", 6: "Артефакт", 7: "Фамильная ценность" },
    qualityLegend: "Качество предметов",
    hoverLoading: "Загружаем подсказку…",
  },
  en: {
    itemLevelShort: "item level",
    levelShort: (level: number) => `ilvl ${level}`,
    requiredLevel: (level: string) => `Req. level ${level}`,
    preview: "Tooltip",
    quality: { 0: "Poor", 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary", 6: "Artifact", 7: "Heirloom" },
    qualityLegend: "Item quality",
    hoverLoading: "Loading the tooltip…",
  },
} satisfies Record<Lang, Record<string, unknown>>;
