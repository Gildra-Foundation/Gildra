import { ladderCost, type AuctionLadderStep } from "./auctionMarketSummary";

/**
 * The comparison table: one row per picked item, the best value of every column marked, and how much more each
 * item costs than the cheapest when buying the same number of units from the cheapest lots.
 */
export type CompareSortKey = "name" | "min" | "median" | "quantity" | "cost";
export const compareSortKeys: readonly CompareSortKey[] = ["name", "min", "median", "quantity", "cost"];
export const COMPARE_QUANTITY_DEFAULT = 100;
export const COMPARE_QUANTITY_PRESETS = [20, 100, 200, 1000] as const;
export const COMPARE_QUANTITY_MAX = 1_000_000;

type Comparable = {
  itemId: number; name: string | null; rank?: number | null;
  minPrice: number; medianPrice: number; quantity: number; ladder?: readonly AuctionLadderStep[];
};
export type CompareCost = ReturnType<typeof ladderCost>;
export type CompareRow<T extends Comparable> = {
  item: T;
  /** Null until the item's price levels have arrived. */
  cost: CompareCost | null;
  /** The market has fewer units than asked for. */
  short: boolean;
  /** Average unit price of the purchase divided by the cheapest one (1 = the cheapest); null without price levels. */
  ratio: number | null;
  best: { min: boolean; median: boolean; quantity: boolean; cost: boolean };
  /** Neighbouring rows of the same item in different reagent ranks. */
  group: { start: boolean; end: boolean; size: number };
};

export function clampQuantity(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(COMPARE_QUANTITY_MAX, Math.floor(value))) : COMPARE_QUANTITY_DEFAULT;
}

const nameKey = (item: Comparable) => (item.name ?? `#${item.itemId}`).toLocaleLowerCase();

/** Marks the extreme value only when it stands out: ties share the mark, a column where all values are equal has none. */
function extreme(values: readonly (number | null)[], pick: "low" | "high") {
  const present = values.filter((value): value is number => value !== null && value > 0);
  if (present.length < 2) return values.map(() => false);
  const target = pick === "low" ? Math.min(...present) : Math.max(...present);
  if (present.every(value => value === target)) return values.map(() => false);
  return values.map(value => value === target);
}

/**
 * Default order: the order of picking, with the ranks of one item pulled together next to its first pick
 * (lowest rank first), so «Ore ◆» and «Ore ◆◆» read as one group.
 */
export function groupedOrder<T extends Comparable>(items: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = nameKey(item), list = groups.get(key);
    if (list) list.push(item); else groups.set(key, [item]);
  }
  return [...groups.values()].flatMap(list => [...list].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.itemId - b.itemId));
}

export function sortCompare<T extends Comparable>(rows: readonly CompareRow<T>[], key: CompareSortKey | "", dir: "asc" | "desc", lang: "ru" | "en"): CompareRow<T>[] {
  if (!key) return [...rows];
  const sign = dir === "asc" ? 1 : -1;
  const value = (row: CompareRow<T>) => key === "min" ? row.item.minPrice : key === "median" ? row.item.medianPrice : key === "quantity" ? row.item.quantity
    : row.cost && row.cost.bought ? row.cost.average : Number.POSITIVE_INFINITY;
  return [...rows].sort((a, b) => {
    // A purchase the market cannot fill always sorts after the ones it can.
    if (key === "cost" && a.short !== b.short) return a.short ? 1 : -1;
    const primary = key === "name" ? (a.item.name ?? "").localeCompare(b.item.name ?? "", lang) : value(a) - value(b);
    return (Number.isNaN(primary) ? 0 : sign * primary) || (a.item.name ?? "").localeCompare(b.item.name ?? "", lang) || (a.item.rank ?? 0) - (b.item.rank ?? 0) || a.item.itemId - b.item.itemId;
  });
}

/** Rows in display order with costs, best marks, ratios to the cheapest and rank groups. */
export function compareTable<T extends Comparable>(items: readonly T[], quantity: number, sort: CompareSortKey | "" = "", dir: "asc" | "desc" = "asc", lang: "ru" | "en" = "en"): CompareRow<T>[] {
  const wanted = clampQuantity(quantity);
  const base = items.map(item => {
    const cost = item.ladder ? ladderCost(item.ladder, wanted) : null;
    return { item, cost, short: Boolean(cost && cost.bought < wanted) };
  });
  // The cheapest purchase is judged among the items the market can fully supply; if none can, among all.
  const full = base.filter(row => row.cost && row.cost.bought > 0 && !row.short);
  const pool = full.length ? full : base.filter(row => row.cost && row.cost.bought > 0);
  const cheapest = pool.length ? Math.min(...pool.map(row => row.cost!.average)) : 0;
  const bestMin = extreme(base.map(row => row.item.minPrice), "low");
  const bestMedian = extreme(base.map(row => row.item.medianPrice), "low");
  const bestQuantity = extreme(base.map(row => row.item.quantity), "high");
  // The cheapest purchase is marked when there is something to compare it with and not every purchase costs the same.
  const priced = base.filter(row => row.cost && row.cost.bought > 0);
  const allEqual = pool.length === priced.length && pool.every(row => row.cost!.average === cheapest);
  const bestCost = base.map(row => priced.length > 1 && !allEqual && pool.includes(row) && row.cost!.average === cheapest);
  const rows: CompareRow<T>[] = base.map((row, index) => ({
    ...row,
    ratio: cheapest > 0 && row.cost && row.cost.bought > 0 ? row.cost.average / cheapest : null,
    best: { min: bestMin[index], median: bestMedian[index], quantity: bestQuantity[index], cost: bestCost[index] },
    group: { start: true, end: true, size: 1 },
  }));
  const ordered = sort ? sortCompare(rows, sort, dir, lang) : groupedOrder(rows.map(row => ({ ...row.item, row }))).map(entry => entry.row);
  // Consecutive rows of one name form a group.
  for (let index = 0; index < ordered.length;) {
    let end = index;
    while (end + 1 < ordered.length && nameKey(ordered[end + 1].item) === nameKey(ordered[index].item)) end += 1;
    const size = end - index + 1;
    for (let at = index; at <= end; at += 1) ordered[at] = { ...ordered[at], group: { start: at === index, end: at === end, size } };
    index = end + 1;
  }
  return ordered;
}

/** «+38 %» up to double the cheapest price, «×2.4» beyond; null for the cheapest itself. */
export function formatRatio(ratio: number | null, lang: "ru" | "en") {
  if (ratio === null || ratio < 1.005) return null;
  if (ratio >= 2) return `×${ratio.toLocaleString(lang, { maximumFractionDigits: ratio >= 10 ? 0 : 1 })}`;
  const percent = Math.max(1, Math.round((ratio - 1) * 100));
  return lang === "ru" ? `+${percent} %` : `+${percent}%`;
}
