import type { RenderContext } from "@/lib/blocks/types";
import type { TableRow, TierGroup } from "@/data/site";
import type { MetaPulseData } from "./schema";

/** Движения меты из реального датасета (trend-поля тир-таблицы). */
export function deriveMovers(tierTable: readonly TierGroup[]): MetaPulseData {
  const movers: TableRow[] = tierTable
    .flatMap((g) => g.rows)
    .filter((r) => r.trend.dir !== "flat")
    .sort((a, b) => (b.trend.val ?? 0) - (a.trend.val ?? 0));
  const top = [
    ...movers.filter((m) => m.trend.dir === "up").slice(0, 2),
    ...movers.filter((m) => m.trend.dir === "down").slice(0, 1),
  ];
  return { top, changes: movers.length };
}

export async function load(ctx: RenderContext): Promise<MetaPulseData> {
  return deriveMovers(await ctx.source.tierTable());
}
