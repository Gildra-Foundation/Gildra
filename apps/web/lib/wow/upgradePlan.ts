import type { AuditGearItem } from "./characterAudit";
import type { AuctionGearRecommendationGroup } from "./auctionGearRecommendations";
import type { GearPlannerItemData } from "./gearPlannerPresentation";
import { confirmedFarmActivities } from "./gearFarm/recommendations";
import type { FarmActivity, FarmTarget, GearFarmResult } from "./gearFarm/types";

/**
 * The upgrade plan of a character page: every equipped slot with its item-level gap to the character's
 * equipped average, the fixes that need no new item (an empty socket, a missing enchant) and the best
 * confirmed source of a replacement found by the dungeon/raid search or the Auction House search.
 * Pure: the page computes it from data it already has, no request.
 */

/** Paper-doll order of the game (left column, right column, weapons). */
export const upgradeSlotOrder = [
  "HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET",
  "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "MAIN_HAND", "OFF_HAND",
] as const;
export type UpgradeSlotType = typeof upgradeSlotOrder[number];

/** Fixture items name their slot in Russian only (Battle.net items carry slotType). */
const slotByFixtureName: Record<string, UpgradeSlotType> = {
  "Голова": "HEAD", "Шея": "NECK", "Плечи": "SHOULDER", "Спина": "BACK", "Нагрудник": "CHEST", "Наручи": "WRIST", "Руки": "HANDS",
  "Пояс": "WAIST", "Ноги": "LEGS", "Ступни": "FEET", "Кольцо 1": "FINGER_1", "Кольцо 2": "FINGER_2",
  "Аксессуар 1": "TRINKET_1", "Аксессуар 2": "TRINKET_2", "Основная рука": "MAIN_HAND", "Левая рука": "OFF_HAND",
};

export function upgradeSlotOf(item: Pick<AuditGearItem, "slot" | "slotType">): UpgradeSlotType | null {
  const slot = item.slotType?.toUpperCase() || slotByFixtureName[item.slot] || "";
  return (upgradeSlotOrder as readonly string[]).includes(slot) ? slot as UpgradeSlotType : null;
}

/**
 * Slots that take an enchant in every recent expansion. Slots whose enchant availability changed between
 * expansions are left out, so a "missing enchant" is never a false alarm; an off-hand counts only when it
 * is a weapon (Battle.net snapshots do not say, so only fixture weapons qualify).
 */
const enchantSlots = new Set<UpgradeSlotType>(["CHEST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "MAIN_HAND", "OFF_HAND"]);

export type UpgradeSourceKind = "dungeon" | "raid" | "world" | "auction";
export type UpgradeSource = {
  kind: UpgradeSourceKind;
  /** Dungeon/raid name, or empty for the Auction House. */
  place: string;
  /** Boss of a dungeon/raid reward. */
  encounter?: string;
  item: GearPlannerItemData;
  deltaDps: number;
  deltaPercent: number;
  /** Lot price of an auction source. */
  priceCopper?: number;
};

export type UpgradeSlot = {
  slotType: UpgradeSlotType;
  item: AuditGearItem;
  /** Equipped average minus this item's level (positive: the slot lags behind). */
  gap: number;
  missingEnchant: boolean;
  emptySockets: number;
  /** Best confirmed replacement (largest gain), if a search found one. */
  best: UpgradeSource | null;
  /** All confirmed replacements for this slot, best first. */
  sources: UpgradeSource[];
};

/** attention: a slot behind the average or with a fix; fixes: enchant/gem fixes; sources: a replacement was found. */
export type UpgradeFilter = "attention" | "fixes" | "sources" | "all";

const byGain = (a: UpgradeSource, b: UpgradeSource) => b.deltaPercent - a.deltaPercent || b.deltaDps - a.deltaDps
  || (a.priceCopper ?? 0) - (b.priceCopper ?? 0);

/** Confirmed, reachable dungeon/raid rewards per slot (the same rule the dungeon/raid list shows). */
export function farmUpgradeSources(result: GearFarmResult | null | undefined): Map<string, UpgradeSource[]> {
  const sources = new Map<string, UpgradeSource[]>();
  for (const activity of confirmedFarmActivities(result?.activities ?? [])) {
    const kind: UpgradeSourceKind = activity.difficulty === "world" ? "world" : activity.group === "raid" ? "raid" : "dungeon";
    for (const target of activity.targets) {
      const list = sources.get(target.slotType) ?? [];
      list.push({ kind, place: activity.name, encounter: target.encounterName, item: target, deltaDps: Number(target.deltaDps), deltaPercent: Number(target.deltaPercent) });
      sources.set(target.slotType, list);
    }
  }
  return sources;
}

/** Reachable activities with confirmed rewards, the largest gain first (activities and their rewards alike). */
export function rankedFarmActivities(activities: readonly FarmActivity[]): FarmActivity[] {
  const gain = (target: FarmTarget) => Number(target.deltaPercent) || 0;
  return confirmedFarmActivities([...activities])
    .map((activity) => ({ ...activity, targets: [...activity.targets].sort((a, b) => gain(b) - gain(a) || (Number(b.deltaDps) || 0) - (Number(a.deltaDps) || 0)) }))
    .sort((a, b) => gain(b.targets[0]) - gain(a.targets[0]) || a.name.localeCompare(b.name));
}

/** The best-value auction lot of every slot with a confirmed upgrade. */
export function auctionUpgradeSources(groups: readonly AuctionGearRecommendationGroup[] | null | undefined): Map<string, UpgradeSource[]> {
  const sources = new Map<string, UpgradeSource[]>();
  for (const group of groups ?? []) {
    for (const item of [group.best, ...group.alternatives]) {
      if (!item.comparison) continue;
      const list = sources.get(item.slotType) ?? [];
      list.push({ kind: "auction", place: "", item, deltaDps: item.comparison.deltaDps, deltaPercent: item.comparison.deltaPercent, priceCopper: item.lotCostCopper });
      sources.set(item.slotType, list);
    }
  }
  return sources;
}

/** Every equipped slot, the slots with measured gains first (largest gain), then the weakest by item level and fixes. */
export function buildUpgradePlan({ gear, averageItemLevel, farm, auction }: {
  gear: readonly AuditGearItem[];
  averageItemLevel: number;
  farm?: GearFarmResult | null;
  auction?: readonly AuctionGearRecommendationGroup[] | null;
}): UpgradeSlot[] {
  const farmSources = farmUpgradeSources(farm);
  const auctionSources = auctionUpgradeSources(auction);
  const seen = new Set<UpgradeSlotType>();
  const rows: UpgradeSlot[] = [];
  for (const item of gear) {
    const slotType = upgradeSlotOf(item);
    if (!slotType || seen.has(slotType)) continue;
    seen.add(slotType);
    const { enchant, sockets = [], weapon } = item.details;
    const enchantable = enchantSlots.has(slotType) && (slotType !== "OFF_HAND" || Boolean(weapon));
    const sources = [...farmSources.get(slotType) ?? [], ...auctionSources.get(slotType) ?? []].sort(byGain);
    rows.push({
      slotType, item,
      gap: averageItemLevel > 0 && item.itemLevel > 0 ? Math.round(averageItemLevel - item.itemLevel) : 0,
      missingEnchant: enchantable && (!enchant || !enchant.active),
      emptySockets: sockets.filter((socket) => !socket.filled).length,
      best: sources[0] ?? null,
      sources,
    });
  }
  const fixes = (row: UpgradeSlot) => row.emptySockets + Number(row.missingEnchant);
  return rows.sort((a, b) => (b.best?.deltaPercent ?? -Infinity) - (a.best?.deltaPercent ?? -Infinity)
    || b.gap - a.gap || fixes(b) - fixes(a) || upgradeSlotOrder.indexOf(a.slotType) - upgradeSlotOrder.indexOf(b.slotType));
}

export const upgradeNeedsFix = (row: UpgradeSlot) => row.missingEnchant || row.emptySockets > 0;
export const upgradeIsBehind = (row: UpgradeSlot) => row.gap >= 1;

export function filterUpgradePlan(rows: readonly UpgradeSlot[], filter: UpgradeFilter): UpgradeSlot[] {
  if (filter === "attention") return rows.filter((row) => upgradeIsBehind(row) || upgradeNeedsFix(row) || row.best);
  if (filter === "fixes") return rows.filter(upgradeNeedsFix);
  if (filter === "sources") return rows.filter((row) => row.best);
  return [...rows];
}

export function upgradeFilterCounts(rows: readonly UpgradeSlot[]): Record<UpgradeFilter, number> {
  return {
    all: rows.length,
    attention: rows.filter((row) => upgradeIsBehind(row) || upgradeNeedsFix(row) || row.best).length,
    fixes: rows.filter(upgradeNeedsFix).length,
    sources: rows.filter((row) => row.best).length,
  };
}
