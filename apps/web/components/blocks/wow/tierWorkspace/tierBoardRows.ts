/** Pure helpers of the tier board and list on /tier-lists (shared by the client views and their tests).
 *  Every source — WowArcana's blend, an external site, the sims — is brought to one entry shape here; each
 *  keeps its own ranking and tiers, nothing is mixed between sources. */
import type { TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import type { SimRow } from "./simTierRows";

/** One spec as the board and the list draw it. Metrics are present only when the source publishes them. */
export type BoardEntry = {
  key: string;
  /** Position in the source's own ranking (1 = best). */
  rank: number;
  tier: string;
  role: TierRole;
  classSlug: string;
  specSlug: string;
  specName: string;
  className: string;
  group?: string;
  score?: number;
  /** DPS or HPS by role (u.gg, the blend). */
  rate?: number;
  maxKey?: number;
  rankChange?: number;
  popularity?: number;
  /** Mean player rating, players behind the row, PvP win share (0..1). */
  rating?: number;
  players?: number;
  winRate?: number;
  /** The source's latest move of the spec. */
  change?: "up" | "down";
  /** Gildra's consensus: how many sources rank the spec. */
  sources?: number;
  /** Sim tab: simulated damage of the chosen gear set and the gap to #1 in percent (≤ 0). */
  simDps?: number;
  behind?: number;
};

/** Localized names, hero talent trees and the talents page slug of a spec, by the talent theme slug. */
export type TierSpecInfo = { specName: string; className: string; heroes?: [string, string]; talents?: string };
export type TierSpecNames = Record<string, TierSpecInfo>;

export function specInfo(names: TierSpecNames, classSlug: string, specSlug: string): TierSpecInfo | undefined {
  return names[`${specSlug}-${classSlug}`] ?? (specSlug.endsWith(`-${classSlug}`) ? names[specSlug] : undefined);
}

const TIER_LETTERS = ["S", "A", "B", "C", "D", "F"];

/** Sort weight of a tier: S+ < S < S- < A+ < … ; unknown labels last. */
export function tierWeight(tier: string) {
  const letter = TIER_LETTERS.indexOf(tier.charAt(0).toUpperCase());
  if (letter < 0) return 1_000;
  const suffix = tier.slice(1).trim();
  return letter * 3 + (suffix === "+" ? 0 : suffix === "-" || suffix === "−" ? 2 : 1);
}

/** Rows of the board: one per tier label the source uses, best first; each row keeps the source's order. */
export function groupByTier<T extends { tier: string; rank: number }>(entries: T[]) {
  const rows = new Map<string, T[]>();
  for (const entry of entries) {
    const label = entry.tier.trim().toUpperCase() || "?";
    const row = rows.get(label);
    if (row) row.push(entry); else rows.set(label, [entry]);
  }
  return [...rows].map(([tier, items]) => ({ tier, entries: [...items].sort((a, b) => a.rank - b.rank) }))
    .sort((a, b) => tierWeight(a.tier) - tierWeight(b.tier));
}

/** A published list row (Gildra or any source tab). Popularity 0 means "not published", not "nobody plays it". */
export function fromTierEntry(entry: TierEntry, names: TierSpecNames): BoardEntry {
  const info = specInfo(names, entry.classSlug, entry.specSlug);
  const rate = entry.role === "healer" ? entry.averageHps ?? entry.averageDps : entry.averageDps;
  return {
    key: `${entry.classSlug}:${entry.specSlug}`,
    rank: entry.rank,
    tier: entry.tier,
    role: entry.role,
    classSlug: entry.classSlug,
    specSlug: entry.specSlug,
    specName: info?.specName ?? entry.specName,
    className: info?.className ?? entry.className,
    group: entry.group,
    score: entry.score,
    rate,
    maxKey: entry.maxKey || undefined,
    rankChange: entry.rankChange,
    popularity: entry.popularity ? entry.popularity : undefined,
    rating: entry.rating || undefined,
    players: entry.players ?? undefined,
    winRate: entry.winRate ?? undefined,
    change: entry.change === "up" || entry.change === "down" ? entry.change : undefined,
    sources: entry.sources || undefined,
  };
}

/** A sim row: its position under the chosen gear set is the rank; the tier is the source's own for that target count. */
export function fromSimRow(row: SimRow): BoardEntry {
  return {
    key: row.key,
    rank: row.position,
    tier: row.tier,
    role: row.role === "tank" ? "tank" : "dps",
    classSlug: row.class_slug,
    specSlug: row.spec_slug,
    specName: row.specName,
    className: row.className,
    simDps: row.value,
    behind: row.behind,
  };
}

/** Which optional columns the list view shows: only what at least one row really has. */
export function listColumns(entries: BoardEntry[]) {
  return {
    score: entries.some((entry) => entry.score !== undefined),
    rate: entries.some((entry) => entry.rate !== undefined),
    maxKey: entries.some((entry) => entry.maxKey !== undefined),
    trend: entries.some((entry) => Boolean(entry.rankChange)),
    popularity: entries.some((entry) => entry.popularity !== undefined),
    sim: entries.some((entry) => entry.simDps !== undefined),
    rating: entries.some((entry) => entry.rating !== undefined),
    players: entries.some((entry) => entry.players !== undefined),
    winRate: entries.some((entry) => entry.winRate !== undefined),
    change: entries.some((entry) => Boolean(entry.change)),
  };
}
