/** Pure helpers of the sim source tab (shared by the board and its tests). */
import type { SimGear, SimRole } from "./simTierCopy";

export type GearSet = Exclude<SimGear, "best">;
export type SimEntry = {
  rank: number; tier: string; role: SimRole; spec_id: number;
  class_name: string; class_slug: string; spec_name: string; spec_slug: string;
  dps: Partial<Record<GearSet, number>>; best: number; behind_pct: number;
};
export type SimTable = { role: SimRole; targets: number; specs_total: number; entries: SimEntry[] };
export type SimTierResponse = { status: string; fetchedAt: string; checkedAt?: string; data: { simmed_on: string | null; tables: SimTable[] } };
export type SimRow = SimEntry & { key: string; value: number; position: number; behind: number; specName: string; className: string };

const valueOf = (entry: SimEntry, gear: SimGear) => gear === "best" ? entry.best : entry.dps[gear];

/** A table's rows for one gear set, highest damage first; the gap is measured against that set's leader. */
export function simRows(table: SimTable | undefined, gear: SimGear, names: Record<string, { specName: string; className: string }>): SimRow[] {
  if (!table) return [];
  const rows = table.entries
    .map((entry) => ({ entry, value: valueOf(entry, gear) }))
    .filter((item): item is { entry: SimEntry; value: number } => typeof item.value === "number")
    .sort((a, b) => b.value - a.value || a.entry.rank - b.entry.rank);
  const top = rows[0]?.value ?? 1;
  return rows.map(({ entry, value }, index) => {
    const localized = names[`${entry.spec_slug}-${entry.class_slug}`] ?? names[entry.spec_slug];
    return {
      ...entry, value, position: index + 1, key: `${entry.class_slug}:${entry.spec_slug}`,
      behind: (value / top - 1) * 100,
      specName: localized?.specName ?? entry.spec_name, className: localized?.className ?? entry.class_name,
    };
  });
}

