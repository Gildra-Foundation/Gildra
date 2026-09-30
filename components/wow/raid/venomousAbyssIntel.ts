export type LocalizedRaidText = { en: string; ru: string };

export const venomousRaidOverviewSource = "https://www.icy-veins.com/wow/venomous-abyss-raid-guide";
export const venomousRaidLootSource = "https://www.icy-veins.com/wow/news/venomous-abysss-final-two-bosses-drop-gear-10-item-levels-past-max/";
export const venomousRaidLocationSource = "https://www.wowhead.com/guide/midnight/raids/the-venomous-abyss-overview-location-rewards-bosses";
export const venomousRaidVerifiedAt = "2026-09-14";

export const raidFinderWings = [
  { number: 1, dateEn: "August 18", dateRu: "18 августа", name: "The Soulcoilers", bosses: ["Nek'zali the Soulcoiler", "The Twin Fangs"] },
  { number: 2, dateEn: "August 25", dateRu: "25 августа", name: "The Essence of Venom", bosses: ["Entombed Sentinels", "Vashnik the Malignant"] },
  { number: 3, dateEn: "September 1", dateRu: "1 сентября", name: "The Serpent Warren", bosses: ["The Lost Explorers", "Sszorak"] },
  { number: 4, dateEn: "September 8", dateRu: "8 сентября", name: "The Tomb of Ula'tek", bosses: ["The Coiled Altar", "Ula'tek"] },
] as const;

export const raidLootBands = [
  { difficulty: { en: "Raid Finder", ru: "Поиск рейда" }, levels: [279, 282, 285, 289], track: "Veteran" },
  { difficulty: { en: "Normal", ru: "Обычный" }, levels: [292, 295, 298, 302], track: "Champion" },
  { difficulty: { en: "Heroic", ru: "Героический" }, levels: [305, 308, 311, 315], track: "Hero" },
  { difficulty: { en: "Mythic", ru: "Эпохальный" }, levels: [318, 321, 324, 344], track: "Myth" },
] as const;

export const tierRewards: Record<string, LocalizedRaidText> = {
  "entombed-sentinels": { en: "Hands tier token", ru: "Токен комплекта: кисти" },
  "the-lost-explorers": { en: "Shoulders tier token", ru: "Токен комплекта: плечи" },
  "vashnik-the-malignant": { en: "Chest tier token", ru: "Токен комплекта: грудь" },
  sszorak: { en: "Legs tier token", ru: "Токен комплекта: ноги" },
  "the-twin-fangs": { en: "Head tier token", ru: "Токен комплекта: голова" },
  ulatek: { en: "Slumbering Coil Curio", ru: "Slumbering Coil Curio" },
};

export const gloryAchievements: Array<{ name: string; requirement: LocalizedRaidText }> = [
  { name: "Well, Well, Little Sky", requirement: { en: "Defeat Nek'zali after returning Kupamanduka to the Soulcoil Well on Normal or higher.", ru: "Победите Нек'зали после возвращения Купамандуки в Soulcoil Well на обычной сложности или выше." } },
  { name: "Is Venom Stasis A Joke To You?", requirement: { en: "Defeat the Sentinels after each restores more than half of its total health with Vitriolic Stasis.", ru: "Победите стражей после того, как каждый восстановит больше половины здоровья через Vitriolic Stasis." } },
  { name: "Accidental Inclusion", requirement: { en: "Defeat The Lost Explorers including Hoji on Normal or higher.", ru: "Победите Потерявшихся исследователей, включая Ходжи, на обычной сложности или выше." } },
  { name: "Kept You Waiting Huh?", requirement: { en: "Defeat Vashnik after killing the Solidified Snake Venom.", ru: "Победите Вашника после убийства Solidified Snake Venom." } },
  { name: "Jumping Through Hoops", requirement: { en: "Defeat Sszorak after jumping through every ring that appears.", ru: "Победите Ссзорака, прыгнув через каждое появившееся кольцо." } },
  { name: "Taking a Bite out of Slime", requirement: { en: "Defeat The Twin Fangs after feeding Ithraz the required slimes in order during Ravenous Feast.", ru: "Победите Два Клыка, скормив Итразу требуемых слизней по порядку во время Ravenous Feast." } },
  { name: "Watch Out Behind You", requirement: { en: "Defeat The Coiled Altar while every player is affected by Unnerving Fixation.", ru: "Победите Спиральный алтарь, пока все игроки находятся под Unnerving Fixation." } },
  { name: "No Egg Scramble", requirement: { en: "Defeat Ula'tek before the Greasy Hatchling breaks on Normal or higher; also rewards the Ula'took pet.", ru: "Победите Ула'тек до разрушения Greasy Hatchling на обычной сложности или выше; также даёт питомца Ula'took." } },
];

export const headlineRewards: Array<{ name: string; detail: LocalizedRaidText }> = [
  { name: "Crimson Venomfang", detail: { en: "Mount awarded by Glory of the Venomous Raider.", ru: "Средство передвижения за Glory of the Venomous Raider." } },
  { name: "Primeval Skyfriend", detail: { en: "Mythic Ula'tek reward; the guide reports three mounts per kill until the next expansion.", ru: "Награда за эпохальную Ула'тек; по данным гайда, до следующего дополнения за убийство выдаются три маунта." } },
  { name: "The Venom's End", detail: { en: "Title awarded for defeating Ula'tek on Mythic difficulty.", ru: "Титул за победу над Ула'тек на эпохальной сложности." } },
  { name: "Ahead of the Curve / Cutting Edge", detail: { en: "Seasonal Heroic and Mythic Ula'tek achievements.", ru: "Сезонные достижения за героическую и эпохальную Ула'тек." } },
];

export function lootBandIndexForBoss(order: number) {
  if (order === 1) return 0;
  if (order <= 3) return 1;
  if (order <= 6) return 2;
  return 3;
}
