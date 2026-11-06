/**
 * Popular talent builds of a specialization's top players: in-game loadout
 * strings grouped so that builds differing by a talent swap or two count as
 * one. Works on the strings alone (no talent tree needed): strings of one
 * specialization list the same nodes in the same order, so two strings are
 * compared node by node. Client-safe.
 */

export type BuildPlayer = { name: string; realm: string; realmRu?: string; region: string; score: number };
export type BuildEntry = BuildPlayer & { loadout: string; heroId?: number };
export type PopularBuild = {
  /** The most common exact string of the group: what "copy" and "open" give. */
  loadout: string;
  heroId?: number;
  count: number;
  share: number;
  /** Highest-rated players of the group, best first. */
  players: BuildPlayer[];
};

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Node-by-node records of an in-game loadout string (version 2): "" not taken, "f" free, "r<rank>c<choice>" bought.
 * The string also carries points a player once spent in the other hero tree; pass `records` to
 * `popularBuilds` to compare only the nodes of the trees on screen.
 */
export function loadoutNodeRecords(value: string | BuildEntry): string[] | null {
  if (typeof value !== "string") return loadoutNodeRecords(value.loadout);
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!normalized || /[^A-Za-z0-9+/]/.test(normalized)) return null;
  const bits: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    for (let bit = 0; bit < 6; bit += 1) bits.push((index >> bit) & 1);
  }
  let offset = 0;
  const read = (width: number) => {
    let result = 0;
    for (let index = 0; index < width; index += 1) result |= (bits[offset++] ?? 0) << index;
    return result;
  };
  if (bits.length < 152 || read(8) !== 2) return null;
  offset = 8 + 16 + 128;
  const records: string[] = [];
  while (offset < bits.length) {
    if (!read(1)) { records.push(""); continue; }
    if (!read(1)) { records.push("f"); continue; }
    const rank = read(1) ? read(6) : 0;
    const choice = read(1) ? read(2) : 0;
    records.push(`r${rank}c${choice}`);
  }
  while (records.length && records[records.length - 1] === "") records.pop();
  return records;
}

/** How many nodes two builds pick differently. */
export function loadoutDistance(left: string[], right: string[]) {
  let distance = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) if ((left[index] ?? "") !== (right[index] ?? "")) distance += 1;
  return distance;
}

/** Specialization id of an in-game loadout string (null when it is not one). */
export function loadoutSpecId(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  if (normalized.length < 4) return null;
  let bits = 0;
  let result = 0;
  for (let position = 0; position < 24; position += 1) {
    const character = alphabet.indexOf(normalized[Math.floor(position / 6)] ?? "");
    if (character < 0) return null;
    const bit = (character >> (position % 6)) & 1;
    if (position >= 8) result |= bit << (position - 8);
    else bits |= bit << position;
  }
  return bits === 2 ? result : null;
}

/**
 * Groups the players' strings: exact strings first (most used first), then a
 * string joins the first group of the same hero tree whose leading string is
 * at most `tolerance` nodes away. Groups are ranked by size, then by the best
 * player's rating; every hero tree in use keeps its best group.
 */
export function popularBuilds(
  entries: BuildEntry[],
  { tolerance = 6, limit = 4, records = loadoutNodeRecords }: { tolerance?: number; limit?: number; records?: (entry: BuildEntry) => string[] | null } = {},
): PopularBuild[] {
  const valid = entries.filter((entry) => entry.loadout);
  if (!valid.length) return [];
  const exact = new Map<string, BuildEntry[]>();
  for (const entry of valid) exact.set(entry.loadout, [...(exact.get(entry.loadout) ?? []), entry]);
  const best = (players: BuildEntry[]) => Math.max(...players.map((player) => player.score));
  const ordered = [...exact.entries()].sort((left, right) => right[1].length - left[1].length || best(right[1]) - best(left[1]));
  const groups: Array<{ loadout: string; heroId?: number; records: string[] | null; players: BuildEntry[] }> = [];
  for (const [loadout, players] of ordered) {
    const nodes = records(players[0]);
    const heroId = players[0].heroId;
    const home = nodes ? groups.find((group) => group.heroId === heroId && group.records && loadoutDistance(group.records, nodes) <= tolerance) : undefined;
    if (home) home.players.push(...players);
    else groups.push({ loadout, heroId, records: nodes, players: [...players] });
  }
  groups.sort((left, right) => right.players.length - left.players.length || best(right.players) - best(left.players));
  const chosen = groups.slice(0, limit);
  // Every hero tree the top players use keeps its best build in the list.
  for (const group of groups) {
    if (chosen.some((item) => item.heroId === group.heroId)) continue;
    const spare = chosen.findLastIndex((item) => chosen.filter((other) => other.heroId === item.heroId).length > 1);
    if (spare < 0) break;
    chosen.splice(spare, 1);
    chosen.push(group);
  }
  return chosen
    .map((group) => ({
      loadout: group.loadout,
      heroId: group.heroId,
      count: group.players.length,
      share: group.players.length / valid.length,
      players: [...group.players].sort((left, right) => right.score - left.score).slice(0, 3).map(({ name, realm, realmRu, region, score }) => ({ name, realm, ...(realmRu ? { realmRu } : {}), region, score })),
    }));
}
