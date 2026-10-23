import { BookOpen, Gem, Sparkles, Swords } from "lucide-react";
import type { Locale, Section } from "./types";

export const sectionOptions: { id: Section; icon: typeof Swords }[] = [
  { id: "characters", icon: Swords },
  { id: "talents", icon: BookOpen },
  { id: "weapons", icon: Sparkles },
  { id: "artifact-sets", icon: Gem },
];

export function localizedElementOptions(locale: Locale) {
  const en = locale === "en_US";
  return [["", en ? "All elements" : "Все элементы"], ["none", en ? "No element" : "Без элемента"], ["anemo", "Anemo"], ["geo", "Geo"], ["electro", "Electro"], ["dendro", "Dendro"], ["hydro", "Hydro"], ["pyro", "Pyro"], ["cryo", "Cryo"]];
}

export function localizedWeaponOptions(locale: Locale) {
  const en = locale === "en_US";
  return [["", en ? "All weapon types" : "Все типы оружия"], ["sword", en ? "Sword" : "Одноручное"], ["claymore", en ? "Claymore" : "Двуручное"], ["polearm", en ? "Polearm" : "Копьё"], ["bow", en ? "Bow" : "Лук"], ["catalyst", en ? "Catalyst" : "Катализатор"]];
}

export function sectionLabel(section: Section, locale: Locale) {
  const labels = locale === "en_US" ? { characters: "Characters", talents: "Talents", weapons: "Weapons", "artifact-sets": "Artifacts", content: "Content" } : { characters: "Персонажи", talents: "Таланты", weapons: "Оружие", "artifact-sets": "Артефакты", content: "Данные" };
  return labels[section];
}

export const elementColors: Record<string, string> = {
  anemo: "border-[#5bbcac] text-[#84ded0] bg-[#10201f]",
  geo: "border-[#b98b35] text-[#e5bd61] bg-[#211a0e]",
  electro: "border-[#8e6bc5] text-[#c4a2f1] bg-[#1b1426]",
  dendro: "border-[#7a9d38] text-[#b1d766] bg-[#17200f]",
  hydro: "border-[#4f89c7] text-[#86b9ed] bg-[#101a27]",
  pyro: "border-[#b65d43] text-[#ed9277] bg-[#25130f]",
  cryo: "border-[#75aeba] text-[#a9dde4] bg-[#112024]",
};

export function elementLabel(value: string) {
  return ({ none: "Без элемента", anemo: "Анемо", geo: "Гео", electro: "Электро", dendro: "Дендро", hydro: "Гидро", pyro: "Пиро", cryo: "Крио" } as Record<string, string>)[value] ?? value;
}

export function talentKindLabel(value: string) {
  return ({ normal_attack: "Обычная атака", elemental_skill: "Элементальный навык", elemental_burst: "Взрыв стихии", alternate_sprint: "Особое движение", passive: "Пассивный" } as Record<string, string>)[value] ?? value;
}

export function weaponLabel(value: string) {
  return ({ sword: "Одноручное", claymore: "Двуручное", polearm: "Копьё", bow: "Лук", catalyst: "Катализатор" } as Record<string, string>)[value] ?? value;
}

export function artifactSlotLabel(value: string) {
  return ({ flower: "Цветок жизни", plume: "Перо смерти", sands: "Пески времени", goblet: "Кубок пространства", circlet: "Корона разума" } as Record<string, string>)[value] ?? value;
}

export function formatStat(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("ru-RU") : value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

export function formatWeaponSpecialized(value: number) {
  if (!value) return "—";
  return value <= 1 ? formatPercent(value) : formatStat(value);
}

export function formatEffectDescription(description: string | undefined, values: string[] | undefined) {
  if (!description) return "";
  return description.replace(/\{(\d+)\}/g, (_, index: string) => values?.[Number(index)] ?? "…");
}

export function contentCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    achievementgroups: "Группы достижений", achievements: "Достижения", adventureranks: "Ранги приключений",
    animals: "Животные", artifacts: "Артефакты", characters: "Персонажи (полные данные)", constellations: "Созвездия",
    crafts: "Рецепты создания", domains: "Подземелья", elements: "Элементы", emojis: "Эмодзи", enemies: "Противники",
    foods: "Еда", geographies: "Локации", materials: "Материалы", namecards: "Именные карты", outfits: "Костюмы",
    rarity: "Редкость", talentmaterialtypes: "Материалы талантов", talents: "Данные талантов", tcgactioncards: "Карты действий TCG",
    tcgcardbacks: "Рубашки карт TCG", tcgcardboxes: "Столы TCG", tcgcharactercards: "Карты персонажей TCG",
    tcgdetailedrules: "Правила TCG", tcgenemycards: "Карты противников TCG", tcgkeywords: "Ключевые слова TCG",
    tcglevelrewards: "Награды уровней TCG", tcgstatuseffects: "Эффекты состояний TCG", tcgsummons: "Призываемые сущности TCG",
    voiceovers: "Озвучка", weaponmaterialtypes: "Материалы оружия", weapons: "Оружие (полные данные)", windgliders: "Планеры",
    events: "События и баннеры", quests: "Задания и диалоги", maps: "Карты", maplabels: "Категории карт", mappoints: "Точки карт",
    stats: "Статы и прогрессия", curves: "Кривые роста",
  };
  return labels[value] ?? value;
}
