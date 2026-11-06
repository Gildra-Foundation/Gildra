/**
 * The run itself, rebuilt from a combat log: the packs the group killed in order, where they stood on the
 * dungeon map, the boss fights, every death, Bloodlust and the enemy-forces curve. Client-safe types and pure
 * builders; the Warcraft Logs fetch lives in mythicPlusRunLog.ts.
 *
 * Kills come either from Warcraft Logs (each enemy's death position) or from Raider.IO's log (kill times only).
 * Kills less than `gapMs` apart are one pull; boss fights are their own pull. Each pull is drawn on the map at the
 * spawn points of the dungeon planner (MDT) for the enemies it killed: with a position from the log the nearest
 * spawn of that enemy is taken, without one the pack is chosen near the previous pull.
 */

export type MapNode = { id: string; npcId: number; x: number; y: number; forces: number; boss: boolean };
export type Kill = { atMs: number; npcId: number; count: number; forces: number; at?: { x: number; y: number } };
export type ReplayFight = { name: string; startMs: number; endMs: number; kill: boolean };
export type ReplayEnemy = { npcId: number; count: number; forces: number };
export type ReplayPull = {
  n: number;
  /** First and last kill of the pull, ms from the key start. */
  fromMs: number;
  toMs: number;
  /** Combat start (Warcraft Logs only: the first pull of every combat stretch). */
  startMs?: number;
  /** Position on the dungeon map, % of its width and height. */
  x?: number;
  y?: number;
  enemies: ReplayEnemy[];
  forces: number;
  boss?: string;
  deaths: number;
};
export type ReplayDeath = { atMs: number; player: string; ability?: { name: string; icon?: string; lang?: string }; pull?: number };
export type ReplayStat = { player: string; dps?: number; hps?: number; interrupts?: number; deaths: number };
export type RunReplay = {
  source: "warcraftlogs" | "raiderio";
  durationMs: number;
  totalForces: number;
  pulls: ReplayPull[];
  fights: ReplayFight[];
  /** In-combat stretches (Warcraft Logs). */
  combat: Array<[number, number]>;
  deaths: ReplayDeath[];
  /** Bloodlust / Heroism moments. */
  lust: number[];
  /** Cumulative enemy forces: [ms, forces so far]. */
  curve: Array<[number, number]>;
  stats: ReplayStat[];
  /** Warcraft Logs report of the run (link-out). */
  reportUrl?: string;
};

export const pullGapMs = 12_000;
const bossPadMs = 3_000;

const inFight = (ms: number, fights: ReplayFight[]) => fights.findIndex((fight) => ms >= fight.startMs - 1_000 && ms <= fight.endMs + bossPadMs);

/**
 * Kills → pulls: a new pull after a quiet gap and at every boss fight's edge; a whole boss fight is one pull.
 * Kills worth no forces outside a boss fight (adds, summons) join the pull they were fought in.
 */
export function clusterKills(kills: Kill[], fights: ReplayFight[], gapMs = pullGapMs): Kill[][] {
  const sorted = [...kills].sort((a, b) => a.atMs - b.atMs);
  const won = fights.filter((fight) => fight.kill);
  const groups: Array<{ kills: Kill[]; fight: number }> = [];
  let lastMs = -Infinity;
  for (const kill of sorted) {
    const fight = inFight(kill.atMs, won);
    const current = groups[groups.length - 1];
    if (!current || fight !== current.fight || (fight < 0 && kill.atMs - lastMs > gapMs)) groups.push({ kills: [], fight });
    groups[groups.length - 1].kills.push(kill);
    lastMs = kill.atMs;
  }
  const merged: Array<{ kills: Kill[]; fight: number }> = [];
  let carry: Kill[] = [];
  for (const group of groups) {
    const empty = group.fight < 0 && group.kills.every((kill) => !kill.forces);
    if (empty) { carry.push(...group.kills); continue; }
    merged.push({ ...group, kills: [...carry, ...group.kills].sort((a, b) => a.atMs - b.atMs) });
    carry = [];
  }
  if (carry.length) {
    if (merged.length) merged[merged.length - 1].kills.push(...carry);
    else merged.push({ kills: carry, fight: -1 });
  }
  return merged.map((group) => group.kills);
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Pulls → map positions on the planner's spawn points; each spawn is used once. Kills with a log position take the
 * nearest spawn of their enemy. The others are chosen as the pack of those enemies that lies closest to the route:
 * first walking forward from the previous pull, then once more between the previous and the next pull.
 */
export function placePulls(groups: Kill[][], nodes: MapNode[]): Array<{ x: number; y: number } | undefined> {
  const owner = new Map<string, number>();
  const byNpc = new Map<number, MapNode[]>();
  for (const node of nodes) byNpc.set(node.npcId, [...(byNpc.get(node.npcId) ?? []), node]);
  const free = (npcId: number, self: number) => (byNpc.get(npcId) ?? []).filter((node) => { const by = owner.get(node.id); return by === undefined || by === self; });
  const nearest = (npcId: number, from: { x: number; y: number }, count: number, self: number) =>
    free(npcId, self).sort((a, b) => distance(a, from) - distance(b, from)).slice(0, count);
  const centre = (points: Array<{ x: number; y: number }>) => ({ x: median(points.map((point) => point.x)), y: median(points.map((point) => point.y)) });
  const places: Array<{ x: number; y: number } | undefined> = groups.map(() => undefined);
  const fixed = groups.map((group) => group.some((kill) => kill.at && byNpc.has(kill.npcId)));

  const choose = (index: number, anchors: Array<{ x: number; y: number }>) => {
    const known = groups[index].filter((kill) => byNpc.has(kill.npcId));
    for (const [id, by] of owner) if (by === index) owner.delete(id);
    if (!known.length) return;
    let picked: MapNode[] = [];
    const hinted = known.filter((kill) => kill.at);
    for (const kill of hinted) picked.push(...nearest(kill.npcId, kill.at!, kill.count, index).filter((node) => !picked.includes(node)));
    const rest = known.filter((kill) => !kill.at);
    if (rest.length) {
      const need = new Map<number, number>();
      for (const kill of rest) need.set(kill.npcId, (need.get(kill.npcId) ?? 0) + kill.count);
      const targets = hinted.length ? [centre(hinted.map((kill) => kill.at!))] : anchors;
      const rare = [...need.keys()].sort((a, b) => (free(a, index).length || 999) - (free(b, index).length || 999))[0];
      const candidates = free(rare, index).length ? free(rare, index) : byNpc.get(rare) ?? [];
      let best = Infinity, choice: MapNode[] = [];
      for (const candidate of candidates) {
        const option: MapNode[] = [];
        let cost = 0;
        for (const [npcId, count] of need) for (const node of nearest(npcId, candidate, count, index)) { option.push(node); cost += distance(node, candidate); }
        for (const target of targets) cost += (hinted.length ? 1 : 0.3) * distance(candidate, target) * Math.max(1, option.length);
        if (cost < best) { best = cost; choice = option; }
      }
      picked = [...picked, ...choice.filter((node) => !picked.includes(node))];
    }
    for (const node of picked) owner.set(node.id, index);
    if (picked.length) places[index] = centre(picked);
  };

  // Positioned pulls first: they pin the route.
  groups.forEach((_, index) => { if (fixed[index]) choose(index, []); });
  const around = (index: number, step: number) => { for (let at = index + step; at >= 0 && at < groups.length; at += step) if (places[at]) return places[at]; return undefined; };
  groups.forEach((_, index) => { if (!fixed[index]) { const previous = around(index, -1); choose(index, previous ? [previous] : []); } });
  groups.forEach((_, index) => { if (!fixed[index]) choose(index, [around(index, -1), around(index, 1)].filter((point): point is { x: number; y: number } => Boolean(point))); });
  // A pull with no planner enemy stays where the group stood.
  return places.map((place, index) => place ?? around(index, -1) ?? around(index, 1));
}

type BuildInput = {
  source: RunReplay["source"];
  durationMs: number;
  totalForces: number;
  kills: Kill[];
  fights: ReplayFight[];
  nodes: MapNode[];
  deaths: ReplayDeath[];
  combat?: Array<[number, number]>;
  lust?: number[];
  stats?: ReplayStat[];
  reportUrl?: string;
};

export function buildReplay(input: BuildInput): RunReplay {
  const fights = [...input.fights].sort((a, b) => a.startMs - b.startMs);
  const groups = clusterKills(input.kills, fights);
  const places = placePulls(groups, input.nodes);
  const bossFights = fights.filter((fight) => fight.kill);
  const combat = input.combat ?? [];
  const pulls: ReplayPull[] = groups.map((group, index) => {
    const enemies = new Map<number, ReplayEnemy>();
    for (const kill of group) {
      const entry = enemies.get(kill.npcId) ?? { npcId: kill.npcId, count: 0, forces: 0 };
      entry.count += kill.count;
      entry.forces += kill.forces;
      enemies.set(kill.npcId, entry);
    }
    const fromMs = group[0].atMs, toMs = group[group.length - 1].atMs;
    const fight = bossFights[inFight(fromMs, bossFights)];
    const stretch = combat.find(([start, end]) => fromMs >= start && fromMs <= end + bossPadMs);
    const previousEnd = index ? groups[index - 1][groups[index - 1].length - 1].atMs : -Infinity;
    const startMs = fight ? fight.startMs : stretch && stretch[0] > previousEnd ? stretch[0] : undefined;
    const place = places[index];
    return {
      n: index + 1,
      fromMs,
      toMs,
      ...(startMs !== undefined ? { startMs } : {}),
      ...(place ? { x: Math.round(place.x * 100) / 100, y: Math.round(place.y * 100) / 100 } : {}),
      enemies: [...enemies.values()].sort((a, b) => b.forces - a.forces || b.count - a.count),
      forces: [...enemies.values()].reduce((sum, enemy) => sum + enemy.forces, 0),
      ...(fight ? { boss: fight.name } : {}),
      deaths: 0,
    };
  });

  // A death belongs to the pull being fought: the first pull that ends at or after it.
  const deaths = [...input.deaths].sort((a, b) => a.atMs - b.atMs).map((death) => {
    const pull = pulls.find((entry) => entry.toMs >= death.atMs - 2_000);
    if (pull) pull.deaths += 1;
    return pull ? { ...death, pull: pull.n } : death;
  });

  let forces = 0;
  const curve: Array<[number, number]> = [[0, 0]];
  for (const kill of [...input.kills].sort((a, b) => a.atMs - b.atMs)) {
    if (!kill.forces) continue;
    forces += kill.forces;
    curve.push([kill.atMs, forces]);
  }

  return {
    source: input.source,
    durationMs: input.durationMs,
    totalForces: input.totalForces,
    pulls,
    fights,
    combat,
    deaths,
    lust: input.lust ?? [],
    curve,
    stats: input.stats ?? [],
    ...(input.reportUrl ? { reportUrl: input.reportUrl } : {}),
  };
}

/** Raider.IO's log: kill times and forces, deaths by player, the boss fights. No positions. */
export function replayFromRaiderIo(run: {
  clearMs: number;
  encounters: Array<{ name: string; startMs: number; endMs: number; success: boolean }>;
  players: Array<{ name: string; deaths: number }>;
  log?: { totalForces: number; kills: Array<[number, number, number, number]>; deaths: Array<{ atMs: number; player: string }> };
}, nodes: MapNode[]): RunReplay | null {
  if (!run.log?.kills.length) return null;
  const replay = buildReplay({
    source: "raiderio",
    durationMs: run.clearMs,
    totalForces: run.log.totalForces,
    kills: run.log.kills.map(([atMs, npcId, count, forces]) => ({ atMs, npcId, count, forces })),
    fights: run.encounters.map((encounter) => ({ name: encounter.name, startMs: encounter.startMs, endMs: encounter.endMs, kill: encounter.success })),
    nodes,
    deaths: run.log.deaths,
  });
  replay.stats = run.players.map((player) => ({ player: player.name, deaths: player.deaths }));
  return replay;
}

/** Share of the dungeon's forces, as the game shows it. */
export const forcesShare = (forces: number, total: number) => (total > 0 ? Math.min(100, (forces / total) * 100) : 0);
