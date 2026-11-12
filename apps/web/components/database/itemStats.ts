import type { Lang } from "@/lib/i18n";
import { tooltipContentCopy } from "./tooltipContentCopy";

/** Names of the stats an item's variants carry, primary first, each once; unknown stat types are left out. */
export function itemStatNames(entries: Record<string, unknown>[], lang: Lang) {
	const types = new Set<number>();
	for (const variant of entries) {
		for (const stat of Array.isArray(variant.stats) ? variant.stats as Record<string, unknown>[] : []) {
			const type = Number(stat.type ?? stat.id ?? stat.stat_type);
			if (Number.isInteger(type) && type >= 0 && STAT_ORDER.includes(type)) types.add(type);
		}
	}
	return Array.from(types).sort((a, b) => STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b)).map((type) => statName(type, lang));
}

// Primary stats, stamina, then the secondaries in the order the game lists them.
const STAT_ORDER = [71, 72, 73, 74, 3, 4, 5, 7, 32, 36, 49, 40, 35, 13, 14, 31, 37, 12, 0, 1];

/** A stat's name in the page language ("Critical Strike", "Искусность"). */
export function statName(id: number, lang: Lang) {
  const names: Record<number, [string, string]> = {
    0: ["Mana", "Мана"], 1: ["Health", "Здоровье"], 3: ["Agility", "Ловкость"], 4: ["Strength", "Сила"],
    5: ["Intellect", "Интеллект"], 7: ["Stamina", "Выносливость"], 12: ["Defense", "Защита"],
    13: ["Dodge", "Уклонение"], 14: ["Parry", "Парирование"], 31: ["Hit", "Меткость"],
    32: ["Critical Strike", "Критический удар"], 35: ["Resilience", "Устойчивость"], 36: ["Haste", "Скорость"],
    37: ["Expertise", "Мастерство"], 40: ["Versatility", "Универсальность"], 49: ["Mastery", "Искусность"],
    61: ["Speed", "Скорость передвижения"], 62: ["Leech", "Самоисцеление"], 63: ["Avoidance", "Избежание"],
    64: ["Indestructible", "Неразрушимость"],
    71: ["Agility / Strength / Intellect", "Ловкость / сила / интеллект"],
    72: ["Agility / Strength", "Ловкость / сила"], 73: ["Agility / Intellect", "Ловкость / интеллект"],
    74: ["Strength / Intellect", "Сила / интеллект"],
  };
  return names[id]?.[lang === "ru" ? 1 : 0] ?? `${tooltipContentCopy[lang].stat} #${id}`;
}
