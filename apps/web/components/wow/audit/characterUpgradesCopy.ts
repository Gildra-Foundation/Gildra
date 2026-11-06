import type { UpgradeFilter, UpgradeSourceKind } from "@/lib/wow/upgradePlan";

/** Slot names of the Upgrades tab (Battle.net slot types), shared by the overview, dungeon/raid and auction lists. */
export const upgradeSlotNames: Record<string, [ru: string, en: string]> = {
  HEAD: ["Голова", "Head"], NECK: ["Шея", "Neck"], SHOULDER: ["Плечи", "Shoulders"], CHEST: ["Грудь", "Chest"],
  WAIST: ["Пояс", "Waist"], LEGS: ["Ноги", "Legs"], FEET: ["Ступни", "Feet"], WRIST: ["Запястья", "Wrists"],
  HANDS: ["Кисти рук", "Hands"], BACK: ["Спина", "Back"], FINGER_1: ["Кольцо 1", "Ring 1"], FINGER_2: ["Кольцо 2", "Ring 2"],
  TRINKET_1: ["Аксессуар 1", "Trinket 1"], TRINKET_2: ["Аксессуар 2", "Trinket 2"], MAIN_HAND: ["Правая рука", "Main hand"], OFF_HAND: ["Левая рука", "Off hand"],
};
export const upgradeSlotName = (slot: string, ru: boolean) => upgradeSlotNames[slot]?.[ru ? 0 : 1] ?? slot;

const copy = {
  ru: {
    title: "Что улучшить",
    filters: "Показать слоты",
    filter: { attention: "Слабые места", fixes: "Чары и камни", sources: "Есть замена", all: "Все слоты" } satisfies Record<UpgradeFilter, string>,
    behind: (gap: number) => `на ${gap} ниже среднего`,
    ahead: (gap: number) => `на ${gap} выше среднего`,
    noEnchant: "Нет чар",
    emptySocket: "Пустое гнездо",
    emptySockets: (count: number) => `Пустые гнёзда: ${count}`,
    source: { dungeon: "Подземелье", raid: "Рейд", world: "Мировое логово", auction: "Аукцион" } satisfies Record<UpgradeSourceKind, string>,
    more: (count: number) => `ещё ${count}`,
    gain: "Прирост",
  },
  en: {
    title: "What to upgrade",
    filters: "Show slots",
    filter: { attention: "Weak spots", fixes: "Enchants and gems", sources: "Has a replacement", all: "All slots" } satisfies Record<UpgradeFilter, string>,
    behind: (gap: number) => `${gap} below average`,
    ahead: (gap: number) => `${gap} above average`,
    noEnchant: "No enchant",
    emptySocket: "Empty socket",
    emptySockets: (count: number) => `Empty sockets: ${count}`,
    source: { dungeon: "Dungeon", raid: "Raid", world: "World lair", auction: "Auction House" } satisfies Record<UpgradeSourceKind, string>,
    more: (count: number) => `${count} more`,
    gain: "Gain",
  },
};
export type CharacterUpgradesCopy = typeof copy.en;
export const characterUpgradesCopy = (ru: boolean): CharacterUpgradesCopy => copy[ru ? "ru" : "en"];
