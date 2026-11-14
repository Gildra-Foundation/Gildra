import type { Lang } from "@/lib/i18n";

/** Interface copy of a library record page (/library/<dataset>/<id>/<slug>). */
export const entityDetailCopy = {
  ru: {
    breadcrumbsLabel: "Навигация",
    library: "Библиотека",
    qualityNames: { 0: "Низкое", 1: "Обычное", 2: "Необычное", 3: "Редкое", 4: "Эпическое", 5: "Легендарное", 6: "Артефакт", 7: "Фамильная ценность" } as Record<number, string>,
    modelLabel: (name: string) => `${name} — модель`,
    artLabel: (name: string) => `${name} — изображение`,
    unresolved: "Числа в этом описании зависят от характеристик персонажа и пока не подставлены.",
    factsLabel: "Характеристики",
    relationsTitle: "Связанные записи",
    loot: "Добыча",
    bosses: "Боссы",
    bossesOf: (name: string) => `Боссы: ${name}`,
    bossNav: "Боссы подземелья",
    previousBoss: "Предыдущий босс",
    nextBoss: "Следующий босс",
    columns: { item: "Предмет", slot: "Ячейка", kind: "Тип", itemLevel: "Уровень" },
    allRecipes: (name: string) => `Все рецепты: ${name}`,
    bossEncounter: "Босс",
    yes: "да",
    no: "нет",
  },
  en: {
    breadcrumbsLabel: "Breadcrumbs",
    library: "Library",
    qualityNames: { 0: "Poor", 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary", 6: "Artifact", 7: "Heirloom" } as Record<number, string>,
    modelLabel: (name: string) => `${name} — model`,
    artLabel: (name: string) => `${name} — picture`,
    unresolved: "The numbers in this description depend on character stats and are not filled in yet.",
    factsLabel: "Facts",
    relationsTitle: "Related records",
    loot: "Loot",
    bosses: "Bosses",
    bossesOf: (name: string) => `Bosses of ${name}`,
    bossNav: "Bosses of the instance",
    previousBoss: "Previous boss",
    nextBoss: "Next boss",
    columns: { item: "Item", slot: "Slot", kind: "Type", itemLevel: "Item level" },
    allRecipes: (name: string) => `All ${name} recipes`,
    bossEncounter: "Boss",
    yes: "yes",
    no: "no",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export type EntityDetailCopy = (typeof entityDetailCopy)[Lang];

export const relationLabels: Record<string, { en: string; ru: string }> = {
  achievement_criteria: { en: "Criteria", ru: "Критерии" },
  achievement_reward: { en: "Rewards", ru: "Награды" },
  achievement_supersedes: { en: "Previous achievement", ru: "Предыдущее достижение" },
  obtained_from: { en: "Obtained from", ru: "Где добыть" }, drops: { en: "Drops", ru: "Добыча" }, rewards: { en: "Rewards", ru: "Награда" },
  sold_by: { en: "Sold by", ru: "Продаётся у" }, teaches: { en: "Teaches", ru: "Обучает" }, crafted_by: { en: "Crafted by", ru: "Создаётся" },
  requires: { en: "Requires", ru: "Требует" }, reagent_for: { en: "Used in", ru: "Используется" }, owned_by: { en: "Belongs to", ru: "Принадлежит" },
  belongs_to: { en: "Part of", ru: "Входит в" },
  grants: { en: "Grants", ru: "Даёт" }, modifies: { en: "Modifies", ru: "Изменяет" },
  mentions: { en: "Mentions", ru: "Упоминает" },
  creates: { en: "Creates", ru: "Создаёт" }, uses_reagent: { en: "Reagents", ru: "Реагенты" },
};

/**
 * The same relation read from the other record ("Rajh" ← items "obtained from" him = his loot).
 * A relation without a reverse name here keeps its own name.
 */
export const incomingRelationLabels: Record<string, { en: string; ru: string }> = {
  achievement_criteria: { en: "Part of achievement", ru: "Требуется для достижения" },
  achievement_reward: { en: "Achievement reward", ru: "Награда за достижение" },
  achievement_supersedes: { en: "Next achievement", ru: "Следующее достижение" },
  obtained_from: { en: "Loot", ru: "Добыча" }, drops: { en: "Dropped by", ru: "Выпадает из" }, rewards: { en: "Reward from", ru: "Награда за" },
  sold_by: { en: "Sells", ru: "Продаёт" }, teaches: { en: "Taught by", ru: "Изучается у" }, crafted_by: { en: "Crafts", ru: "Создаёт" },
  requires: { en: "Required by", ru: "Требуется для" }, reagent_for: { en: "Reagents", ru: "Реагенты" }, owned_by: { en: "Owns", ru: "Владеет" },
  belongs_to: { en: "Includes", ru: "Включает" }, grants: { en: "Granted by", ru: "Даётся" }, modifies: { en: "Modified by", ru: "Изменяется" },
  mentions: { en: "Mentioned in", ru: "Упоминается в" },
  creates: { en: "Created by", ru: "Создаётся" }, uses_reagent: { en: "Used in", ru: "Используется в" },
};

/** Heading of one group of related records, by direction; an unknown relation gets a tidy sentence-case name. */
export function relationTitle(direction: string, relation: string, lang: "en" | "ru") {
  const label = (direction === "incoming" ? incomingRelationLabels[relation] : undefined) ?? relationLabels[relation];
  if (label) return label[lang];
  const words = relation.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const relationAttributeLabels: Record<string, [string, string]> = {
  chance_percent: ["Drop chance", "Шанс добычи"], quantity: ["Quantity", "Количество"],
  difficulty: ["Difficulty", "Сложность"], rank: ["Rank", "Ранг"], source: ["Source", "Источник"],
  reward_type: ["Reward type", "Тип награды"], amount: ["Amount", "Количество"], is_choice: ["Choice reward", "Награда на выбор"],
};

export const rewardTypeLabels: Record<string, [string, string]> = {
  item: ["Item", "Предмет"], currency: ["Currency", "Валюта"], reputation: ["Reputation", "Репутация"],
  spell: ["Spell", "Заклинание"], title: ["Title", "Звание"], experience: ["Experience", "Опыт"], money: ["Money", "Деньги"],
};

/**
 * Facts of a relation a player reads (drop chance, quantity, reward type…). Internal keys of the
 * import (difficulty masks, source ids and types, order indexes) and empty values are left out.
 */
export function relationshipAttributes(attributes: Record<string, unknown>, lang: "en" | "ru", copy: { yes: string; no: string }) {
  const index = lang === "ru" ? 1 : 0;
  return Object.entries(attributes)
    .filter(([key, value]) => key in relationAttributeLabels && key !== "source" && value !== null && value !== "" && typeof value !== "object"
      && !(typeof value === "number" && value < 0) && !(key === "is_choice" && value === false))
    .slice(0, 3)
    .map(([key, value]) => {
      const rendered = key === "reward_type" && typeof value === "string"
        ? rewardTypeLabels[value]?.[index] ?? value
        : typeof value === "boolean" ? (value ? copy.yes : copy.no) : value;
      return `${relationAttributeLabels[key][index]}: ${rendered}${key === "chance_percent" ? "%" : ""}`;
    });
}
