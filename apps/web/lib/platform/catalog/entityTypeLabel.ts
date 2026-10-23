import type { Lang } from "@/lib/i18n-paths";

/** Singular, player-facing name of one catalog record type (the API labels are plural section names). */
const ENTITY_TYPE_LABELS: Record<string, [en: string, ru: string]> = {
  item: ["Item", "Предмет"], gem: ["Gem", "Камень"], enchantment: ["Enchantment", "Чары"], item_set: ["Item set", "Комплект"],
  food: ["Food", "Еда"], flask: ["Flask", "Настой"], potion: ["Potion", "Зелье"], spell: ["Spell", "Заклинание"],
  class: ["Class", "Класс"], specialization: ["Specialization", "Специализация"], talent: ["Talent", "Талант"],
  pvp_talent: ["PvP talent", "PvP-талант"], talent_tree: ["Talent tree", "Дерево талантов"],
  instance: ["Dungeon or raid", "Подземелье или рейд"], encounter: ["Boss encounter", "Сражение с боссом"],
  profession: ["Profession", "Профессия"], recipe: ["Recipe", "Рецепт"], creature: ["Creature", "Существо"],
  quest_reward_package: ["Quest reward set", "Набор наград за задание"], quest: ["Quest", "Задание"],
  map: ["Map", "Карта"], ui_map: ["Interface map", "Карта интерфейса"], area: ["Zone", "Зона"], faction: ["Faction", "Фракция"],
  currency: ["Currency", "Валюта"], mount: ["Mount", "Транспорт"], battle_pet: ["Battle pet", "Боевой питомец"],
  toy: ["Toy", "Игрушка"], transmog_set: ["Transmog set", "Комплект трансмогрификации"], achievement: ["Achievement", "Достижение"],
  season: ["Season", "Сезон"],
};

export function entityTypeLabel(type: string, lang: Lang, fallback?: string) {
  const label = ENTITY_TYPE_LABELS[type];
  if (label) return label[lang === "ru" ? 1 : 0];
  if (fallback) return fallback;
  const words = type.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
