import { buildReplay, type Kill, type MapNode, type ReplayDeath, type RunReplay } from "./mythicPlusReplayModel";

/**
 * Warcraft Logs → the run replay (pure; the fetch is mythicPlusRunLog.ts). Positions in a log are world
 * coordinates ×100 (x = −worldY, y = worldX) with the uiMap the enemy died on. A uiMap's world rectangle comes from
 * the game's UiMapAssignment table; its place on our planner map (MDT canvas, 3:2) was fitted once against the
 * planner's spawn points from logged kills — only maps whose fit held (median error under 3% of the map) are listed,
 * other kills are placed by enemy type alone.
 */
type Calibration = { region: [number, number, number, number]; offset: [number, number]; scale: number };
const calibration: Record<string, Record<number, Calibration>> = {
  "den-of-nalorakk": { 2514: { region: [4014.58, -5856.25, 4764.58, -4731.25], offset: [-8.834, 6.234], scale: 0.896 } },
  "kings-rest": { 1004: { region: [-1240.31, 2440, -679.68, 3280.94], offset: [-12.721, -8.5], scale: 1.277 } },
  "murder-row": { 2434: { region: [8554.17, -5502.08, 9250, -4458.33], offset: [-39.721, -16.319], scale: 1.296 } },
  "altar-of-fangs": { 2588: { region: [1414.58, 1662.5, 2008.33, 2552.08], offset: [2.968, 28.138], scale: 0.312 } },
  "temple-of-sethraliss": { 1038: { region: [3187.5, 2789.58, 3937.5, 3916.67], offset: [3.372, -16.73], scale: 1.157 } },
};

/** A log position on our dungeon map (% of width/height), when that part of the dungeon is calibrated. */
export function logPositionOnMap(slug: string, uiMap: number | undefined, x: number | undefined, y: number | undefined) {
  const entry = uiMap ? calibration[slug]?.[uiMap] : undefined;
  if (!entry || x === undefined || y === undefined) return undefined;
  const [minX, minY, maxX, maxY] = entry.region;
  const worldX = y / 100, worldY = -x / 100;
  const u = ((maxY - worldY) / (maxY - minY)) * 100, v = ((maxX - worldX) / (maxX - minX)) * 100;
  const point = { x: entry.offset[0] + entry.scale * u, y: entry.offset[1] + entry.scale * v };
  return point.x >= -2 && point.x <= 102 && point.y >= -2 && point.y <= 102 ? point : undefined;
}

/** Spell ids of the "Sated"-family debuffs every Bloodlust-type effect leaves on the group. */
export const satedDebuffs = [57723, 57724, 80354, 95809, 160455, 264689, 390435] as const;

export type WclActor = { id: number; gameID?: number; name: string; type?: string; petOwner?: number | null };
export type WclRunRaw = {
  code: string;
  fightId: number;
  fight: { startTime: number; endTime: number; dungeonPulls?: Array<{ startTime: number; endTime: number; encounterID?: number; kill?: boolean | null; name?: string }> };
  actors: WclActor[];
  summary?: {
    damageDone?: Array<{ id: number; name: string; total: number }>;
    healingDone?: Array<{ id: number; name: string; total: number }>;
    deathEvents?: Array<{ name: string; deathTime: number; ability?: { name?: string; abilityIcon?: string } }>;
  };
  /** Timestamps of Sated-type debuff applications on the group. */
  lust: number[];
  /** Source actor ids of the group's interrupts. */
  interrupts: number[];
  /** Killing blows on enemies: target actor, instance, death position and uiMap. */
  kills: Array<{ timestamp: number; targetID: number; targetInstance?: number; x?: number; y?: number; mapID?: number }>;
};

export const warcraftLogsReportUrl = (code: string, fightId: number) =>
  `https://www.warcraftlogs.com/reports/${encodeURIComponent(code)}#fight=${fightId}`;

export function replayFromWarcraftLogs(raw: WclRunRaw, slug: string, nodes: MapNode[], totalForces: number, players: string[]): RunReplay | null {
  const start = raw.fight.startTime;
  const durationMs = raw.fight.endTime - start;
  if (!(durationMs > 0)) return null;
  const actors = new Map(raw.actors.map((actor) => [actor.id, actor]));
  const forcesOf = new Map<number, number>();
  for (const node of nodes) forcesOf.set(node.npcId, node.forces);

  const seen = new Set<string>();
  const kills: Kill[] = raw.kills.flatMap((event) => {
    const actor = actors.get(event.targetID);
    if (!actor?.gameID || actor.type !== "NPC" || actor.petOwner) return [];
    const key = `${event.targetID}:${event.targetInstance ?? 0}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const at = logPositionOnMap(slug, event.mapID, event.x, event.y);
    return [{ atMs: event.timestamp - start, npcId: actor.gameID, count: 1, forces: forcesOf.get(actor.gameID) ?? 0, ...(at ? { at } : {}) }];
  });
  if (!kills.length) return null;

  const pulls = raw.fight.dungeonPulls ?? [];
  const fights = pulls.filter((pull) => pull.encounterID && pull.name).map((pull) => ({ name: pull.name!, startMs: pull.startTime - start, endMs: pull.endTime - start, kill: pull.kill === true }));
  const combat = pulls.map((pull) => [pull.startTime - start, pull.endTime - start] as [number, number]);

  const lust: number[] = [];
  for (const timestamp of [...raw.lust].sort((a, b) => a - b)) {
    const atMs = timestamp - start;
    if (atMs >= 0 && atMs <= durationMs && !lust.some((moment) => Math.abs(moment - atMs) < 30_000)) lust.push(atMs);
  }

  const deaths: ReplayDeath[] = (raw.summary?.deathEvents ?? []).map((death) => ({
    atMs: death.deathTime,
    player: death.name,
    ...(death.ability?.name ? { ability: { name: death.ability.name, ...(death.ability.abilityIcon && /^[a-z][a-z0-9_]*(\.jpg)?$/.test(death.ability.abilityIcon) ? { icon: death.ability.abilityIcon.replace(/\.jpg$/, "") } : {}) } } : {}),
  }));

  const ownerOf = (id: number) => { const actor = actors.get(id); return actor?.petOwner ? actor.petOwner : id; };
  const interrupts = new Map<string, number>();
  for (const source of raw.interrupts) {
    const name = actors.get(ownerOf(source))?.name;
    if (name) interrupts.set(name, (interrupts.get(name) ?? 0) + 1);
  }
  const perSecond = (total: number) => Math.round(total / (durationMs / 1000));
  const damage = new Map((raw.summary?.damageDone ?? []).map((entry) => [entry.name, perSecond(entry.total)]));
  const healing = new Map((raw.summary?.healingDone ?? []).map((entry) => [entry.name, perSecond(entry.total)]));
  const logPlayers = raw.actors.filter((actor) => actor.type === "Player" && (damage.has(actor.name) || healing.has(actor.name))).map((actor) => actor.name);
  const names = [...new Set([...players.filter((name) => logPlayers.includes(name)), ...logPlayers])];

  return buildReplay({
    source: "warcraftlogs",
    durationMs,
    totalForces,
    kills,
    fights,
    nodes,
    deaths,
    combat,
    lust,
    stats: names.map((player) => ({
      player,
      ...(damage.has(player) ? { dps: damage.get(player) } : {}),
      ...(healing.has(player) ? { hps: healing.get(player) } : {}),
      interrupts: interrupts.get(player) ?? 0,
      deaths: deaths.filter((death) => death.player === player).length,
    })),
    reportUrl: warcraftLogsReportUrl(raw.code, raw.fightId),
  });
}
