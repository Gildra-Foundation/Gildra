import type { Lang } from "@/lib/i18n";

/** Interface copy of a library record page (/library/<dataset>/<type>/<id>/<slug>). */
export const entityDetailCopy = {
  ru: {
    breadcrumbsLabel: "Навигация",
    library: "Библиотека",
    itemLevel: "Уровень предмета",
    requiredLevel: "Требуется уровень",
    quality: "Качество",
    qualityNames: { 0: "Низкое", 1: "Обычное", 2: "Необычное", 3: "Редкое", 4: "Эпическое", 5: "Легендарное", 6: "Артефакт", 7: "Фамильная ценность" } as Record<number, string>,
    modelTitle: "Модель",
    modelLabel: (name: string) => `${name} — модель`,
    unresolved: "Числа в этом описании зависят от характеристик персонажа и пока не подставлены.",
    tooltipTitle: "Игровая подсказка",
    relationsTitle: "Связанные записи",
    yes: "да",
    no: "нет",
  },
  en: {
    breadcrumbsLabel: "Breadcrumbs",
    library: "Library",
    itemLevel: "Item level",
    requiredLevel: "Required level",
    quality: "Quality",
    qualityNames: { 0: "Poor", 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary", 6: "Artifact", 7: "Heirloom" } as Record<number, string>,
    modelTitle: "Model",
    modelLabel: (name: string) => `${name} — model`,
    unresolved: "The numbers in this description depend on character stats and are not filled in yet.",
    tooltipTitle: "In-game tooltip",
    relationsTitle: "Related records",
    yes: "yes",
    no: "no",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type EntityDetailCopy = (typeof entityDetailCopy)[Lang];

export const relationLabels: Record<string, { en: string; ru: string }> = {
  obtained_from: { en: "Obtained from", ru: "Добывается" }, drops: { en: "Drops", ru: "Добыча" }, rewards: { en: "Rewards", ru: "Награда" },
  sold_by: { en: "Sold by", ru: "Продаёт" }, teaches: { en: "Teaches", ru: "Обучает" }, crafted_by: { en: "Crafted by", ru: "Создаётся" },
  requires: { en: "Requires", ru: "Требует" }, reagent_for: { en: "Used in", ru: "Используется" }, owned_by: { en: "Belongs to", ru: "Принадлежит" },
  grants: { en: "Grants", ru: "Даёт" }, modifies: { en: "Modifies", ru: "Изменяет" },
  mentions: { en: "Mentions", ru: "Упоминает" },
};

export const relationAttributeLabels: Record<string, [string, string]> = {
  chance_percent: ["Drop chance", "Шанс добычи"], quantity: ["Quantity", "Количество"],
  difficulty: ["Difficulty", "Сложность"], rank: ["Rank", "Ранг"], source: ["Source", "Источник"],
  reward_type: ["Reward type", "Тип награды"], amount: ["Amount", "Количество"], is_choice: ["Choice reward", "Награда на выбор"],
};

export const rewardTypeLabels: Record<string, [string, string]> = {
  item: ["Item", "Предмет"], currency: ["Currency", "Валюта"], reputation: ["Reputation", "Репутация"],
  spell: ["Spell", "Заклинание"], title: ["Title", "Звание"], experience: ["Experience", "Опыт"], money: ["Money", "Деньги"],
};
