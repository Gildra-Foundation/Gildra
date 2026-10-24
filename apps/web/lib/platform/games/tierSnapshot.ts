import type { TierActivity, TierRole, TierSnapshot } from "./intelligence";

export const currentWowSeason = "midnight-season-2";

/** A public rating must identify its season and the freshness of its own slice. */
export function normalizeTierSnapshot(value: unknown, activity: TierActivity, role: TierRole): TierSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as TierSnapshot;
  if (raw.game !== "wow" || raw.activity !== activity || raw.role !== role || !Array.isArray(raw.entries) || !Array.isArray(raw.sources)) return null;
  if (raw.seasonId !== currentWowSeason) return null;
  const entries = raw.entries.filter(entry => entry.role === role && typeof entry.classSlug === "string" && typeof entry.specSlug === "string" && /^[A-FS]\+?$/.test(entry.tier));
  if (!entries.length) return null;
  const primarySlug = raw.context ? "tierlist-wowgg" : "tierlist-wowhead";
  const primary = raw.sources.find(source => source.slug === primarySlug);
  if (!primary || primary.seasonId !== currentWowSeason || !primary.updatedAt) return null;
  const primaryTime = Date.parse(primary.updatedAt);
  if (!Number.isFinite(primaryTime) || primaryTime > Date.now() + 5 * 60_000) return null;
  const sources = raw.seasonId === currentWowSeason ? raw.sources.filter(source => source.slug === primarySlug || source.slug === "tierlist-wowgg" && source.seasonId === raw.seasonId) : [primary];
  const mayShowMetrics = raw.seasonId === currentWowSeason && sources.some(source => source.slug === "tierlist-wowgg");
  return {
    ...raw, entries: entries.map(entry => mayShowMetrics ? entry : {
      ...entry, score: undefined, averageDps: undefined, averageHps: undefined,
      popularity: undefined, maxKey: undefined, rankChange: undefined,
    }), sources, updatedAt: primary.updatedAt ?? raw.updatedAt,
    status: sources.every(source => source.status === "live") && raw.status === "live" && Date.now() - primaryTime <= 36 * 60 * 60_000 ? "live" : "stale", recordCount: entries.length,
  };
}
