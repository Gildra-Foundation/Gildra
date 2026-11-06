import { LIBRARY_INTERNAL_NAME } from "@/lib/library/internalName";

/**
 * Pure logic of the related-records part of a library record page: which
 * groups a player sees and in what order, the boss list of an instance, the
 * neighbours of a boss, the loot table of a boss. Server code feeds it the
 * API's relationships (and, for loot, item facts); no fetching here.
 */

/** The part of a related record these helpers read (GameEntitySummary). */
export type RelatedRecord = {
  id: string; type: string; externalId: number; slug?: string; name: string; product?: string;
  iconUrl?: string; quality?: number; itemLevel?: number; highlights?: { key: string; value: string }[];
};
export type Relationship = { direction: "incoming" | "outgoing"; relation: string; attributes: Record<string, unknown>; entity: RelatedRecord };
export type RelationGroup = { key: string; direction: string; relation: string; entries: Relationship[] };

// Groups a player looks for first: where a thing comes from, what a boss drops, what it belongs to.
const GROUP_ORDER = [
  "outgoing:obtained_from", "incoming:obtained_from", "incoming:belongs_to", "outgoing:belongs_to",
  "incoming:creates", "outgoing:creates", "outgoing:uses_reagent", "incoming:uses_reagent",
  "incoming:teaches", "outgoing:teaches", "outgoing:rewards", "incoming:rewards",
];

function groupRank(key: string) {
  const index = GROUP_ORDER.indexOf(key);
  return index < 0 ? GROUP_ORDER.length : index;
}

/**
 * Related records grouped by direction and relation. Client placeholders
 * ("TK34[DNT]") are left out; a record shown in an earlier group is not shown
 * again (an item "obtained from" a recipe that also "creates" it); empty groups go.
 */
export function relationGroups(relationships: Relationship[]): RelationGroup[] {
  const visible = relationships.filter((entry) => !LIBRARY_INTERNAL_NAME.test(entry.entity.name ?? ""));
  const grouped = Array.from(Map.groupBy(visible, (entry) => `${entry.direction}:${entry.relation}`))
    .map(([key, entries]) => ({ key, entries }))
    .sort((left, right) => groupRank(left.key) - groupRank(right.key));
  const seen = new Set<string>();
  const groups: RelationGroup[] = [];
  for (const { key, entries } of grouped) {
    const fresh: Relationship[] = [];
    for (const entry of entries) {
      if (seen.has(entry.entity.id)) continue;
      seen.add(entry.entity.id);
      fresh.push(entry);
    }
    if (!fresh.length) continue;
    const [direction, relation] = key.split(":");
    groups.push({ key, direction, relation, entries: fresh });
  }
  return groups;
}

function order(entry: Relationship) {
  const value = Number(entry.attributes.order_index);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/** Bosses of an instance in the Adventure Guide's order. */
export function instanceBosses(relationships: Relationship[]) {
  return relationships
    .filter((entry) => entry.direction === "incoming" && entry.relation === "belongs_to" && entry.entity.type === "encounter")
    .sort((left, right) => order(left) - order(right) || left.entity.name.localeCompare(right.entity.name));
}

/** The instance a boss belongs to (its outgoing "belongs_to"). */
export function encounterInstance(relationships: Relationship[]) {
  return relationships.find((entry) => entry.direction === "outgoing" && entry.relation === "belongs_to" && entry.entity.type === "instance")?.entity;
}

/** The bosses before and after `encounterId` in its instance (none at the ends). */
export function bossNeighbours(instanceRelationships: Relationship[], encounterId: string) {
  const bosses = instanceBosses(instanceRelationships).map((entry) => entry.entity);
  const index = bosses.findIndex((boss) => boss.id === encounterId);
  if (index < 0) return { previous: undefined, next: undefined };
  return { previous: bosses[index - 1], next: bosses[index + 1] };
}

/** What the loot table knows of one item beyond the relationship: from its summary and, when read, its record. */
export type LootFacts = { quality?: number; itemLevel?: number; slotCode?: number; slot?: string; kind?: string };

export type LootRow = {
  id: string; type: string; externalId: number; slug?: string; product?: string; name: string; iconUrl?: string;
  quality?: number; slot?: string; kind?: string; itemLevels: number[];
};

// Paper-doll order of the equipment slots (inventory type codes), weapons after armour, everything else last.
const SLOT_ORDER = [1, 2, 3, 16, 5, 20, 4, 19, 9, 10, 6, 7, 8, 11, 12, 17, 13, 21, 15, 26, 25, 22, 14, 23];

function slotRank(code?: number) {
  const index = code === undefined ? -1 : SLOT_ORDER.indexOf(code);
  return index < 0 ? SLOT_ORDER.length : index;
}

/**
 * The loot of a boss as a table: one row per item name (a raid ships the same
 * piece per difficulty under several ids — the row keeps their item levels),
 * linked to the highest-level version, in paper-doll order, then by name.
 */
export function lootRows(relationships: Relationship[], facts: Map<string, LootFacts>): LootRow[] {
  const loot = relationships.filter((entry) => entry.direction === "incoming" && entry.relation === "obtained_from" && entry.entity.type === "item"
    && !LIBRARY_INTERNAL_NAME.test(entry.entity.name ?? ""));
  const byName = Map.groupBy(loot, (entry) => entry.entity.name.trim().toLocaleLowerCase());
  const rows = Array.from(byName.values()).map((entries) => {
    const known = entries.map((entry) => ({ entity: entry.entity, fact: facts.get(entry.entity.id) ?? {} }));
    const level = (item: (typeof known)[number]) => item.fact.itemLevel ?? item.entity.itemLevel ?? 0;
    const best = known.reduce((top, item) => (level(item) > level(top) ? item : top), known[0]);
    const pick = <K extends keyof LootFacts>(key: K) => best.fact[key] ?? known.find((item) => item.fact[key] !== undefined)?.fact[key];
    const quality = pick("quality") ?? best.entity.quality;
    const itemLevels = Array.from(new Set(known.map(level).filter((value) => value > 1))).sort((a, b) => a - b);
    return {
      row: {
        id: best.entity.id, type: best.entity.type, externalId: best.entity.externalId, slug: best.entity.slug, product: best.entity.product,
        name: best.entity.name, iconUrl: best.entity.iconUrl ?? known.find((item) => item.entity.iconUrl)?.entity.iconUrl,
        ...(quality !== undefined ? { quality } : {}),
        ...(pick("slot") ? { slot: pick("slot") } : {}),
        ...(pick("kind") ? { kind: pick("kind") } : {}),
        itemLevels,
      } satisfies LootRow,
      rank: slotRank(pick("slotCode")),
    };
  });
  return rows.sort((left, right) => left.rank - right.rank || left.row.name.localeCompare(right.row.name)).map(({ row }) => row);
}

/** Item levels of a loot row as one cell: "197", "37 / 60". */
export function itemLevelCell(levels: number[]) {
  return levels.length ? levels.join(" / ") : undefined;
}

/** Items of the loot that are worth reading in full (one per row): quality, slot or armour/weapon type still unknown. */
export function lootLookups(rows: LootRow[], limit = 40) {
  return rows.filter((row) => row.quality === undefined || row.slot === undefined || row.kind === undefined).slice(0, limit).map((row) => row.id);
}

/** Exact-name match of a creature and boss encounters ("Ragnaros" the NPC ↔ "Ragnaros" the boss). */
export function sameName(left: string, right: string) {
  const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return Boolean(left.trim()) && normal(left) === normal(right);
}

/** Runs `task` over `values` with at most `limit` at once; a failed task yields undefined. */
export async function mapLimit<T, R>(values: T[], limit: number, task: (value: T) => Promise<R>): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next++;
      try { results[index] = await task(values[index]); } catch { results[index] = undefined; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}
