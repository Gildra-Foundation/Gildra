import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import mdt from "@/data/wow/mythic-reviews/mdt.json";
import combat from "@/data/wow/mythic-reviews/combat.json";
import { sourceNpcNames } from "@/lib/wow/sourceNpcNames";
import { replayFromRaiderIo, type MapNode, type RunReplay } from "./mythicPlusReplayModel";
import { replayFromWarcraftLogs, satedDebuffs, type WclRunRaw } from "./mythicPlusReplayWcl";
import type { RunDetail } from "./mythicPlusRunTypes";

/**
 * The combat log behind a run page: Warcraft Logs first (positions, deaths with the killing ability, Bloodlust,
 * output per player), Raider.IO's own log otherwise (kill times only). Warcraft Logs is read with the app's client
 * credentials (WARCRAFT_LOGS_CLIENT_ID/SECRET, server only). A report is found through the players' rankings
 * for the dungeon: the ranked run with the same clear time and end; its fight data never changes, so it is kept
 * for 30 days, the "no report" answer for 6 hours (players upload late). Every answer carries the hourly points
 * budget; past WARCRAFT_LOGS_HOURLY_POINTS of it no new lookups start until the hour resets.
 */
const tokenUrl = "https://www.warcraftlogs.com/oauth/token";
const apiUrl = "https://www.warcraftlogs.com/api/v2/client";
const timeoutMs = 8_000;
const newLookupsPerMinute = 12;

/** Warcraft Logs encounter ids of the season's dungeons (zone "Mythic+ Season 2"). */
const encounterIds: Record<string, number> = {
  "altar-of-fangs": 12993, "den-of-nalorakk": 12825, "kings-rest": 61762, "murder-row": 12813,
  "ruby-life-pools": 112521, "temple-of-sethraliss": 61877, "the-blinding-vale": 12859, "voidscar-arena": 12923,
};

type MdtFile = Record<string, { image: string; total: number; nodes: MapNode[] }>;
type CombatFile = Record<string, { enemies: Array<{ npcId: number; name: { en: string; ru?: string }; portraitUrl?: string }> }>;
const maps = mdt as unknown as MdtFile;
const enemiesBySlug = combat as unknown as CombatFile;

let token: { value: string; expires: number } | null = null;
let budget = { spent: 0, limit: 3600, resetAt: 0 };
/** Points per hour the run pages may spend: WARCRAFT_LOGS_HOURLY_POINTS (default 1000), never more than the client's hourly limit. */
const hourlyPointsCap = () => Math.min(budget.limit, Number(process.env.WARCRAFT_LOGS_HOURLY_POINTS) || 1000);
let windowStart = 0, windowCalls = 0;

class Skip extends Error {}

export const warcraftLogsConfigured = () => Boolean(process.env.WARCRAFT_LOGS_CLIENT_ID && process.env.WARCRAFT_LOGS_CLIENT_SECRET);

async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${process.env.WARCRAFT_LOGS_CLIENT_ID}:${process.env.WARCRAFT_LOGS_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Warcraft Logs token failed (${response.status})`);
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Warcraft Logs token missing");
  token = { value: data.access_token, expires: Date.now() + Math.min(data.expires_in ?? 3600, 30 * 86400) * 1000 };
  return token.value;
}

const rateLimit = "rateLimitData{limitPerHour pointsSpentThisHour pointsResetIn}";

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (Date.now() < budget.resetAt && budget.spent > hourlyPointsCap()) throw new Skip("Warcraft Logs points budget spent");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 401) token = null;
  if (response.status === 429) { budget = { ...budget, spent: budget.limit, resetAt: Date.now() + 10 * 60_000 }; throw new Skip("Warcraft Logs rate limit"); }
  if (!response.ok) throw new Error(`Warcraft Logs answered ${response.status}`);
  const payload = await response.json() as { data?: T & { rateLimitData?: { limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number } }; errors?: Array<{ message?: string }> };
  const limits = payload.data?.rateLimitData;
  if (limits) budget = { spent: limits.pointsSpentThisHour, limit: limits.limitPerHour, resetAt: Date.now() + limits.pointsResetIn * 1000 };
  if (!payload.data || payload.errors?.length) throw new Error(`Warcraft Logs query failed: ${payload.errors?.[0]?.message ?? "no data"}`);
  return payload.data;
}

type Ranking = { duration?: number; startTime?: number; report?: { code?: string; fightID?: number } };
type Lookup = { code: string; fightId: number } | null;

/** The ranked Warcraft Logs fight of this run, if any of the five uploaded it. */
const findReport = unstable_cache(async (runId: number, encounterId: number, clearMs: number, endMs: number, players: Array<[string, string, string]>): Promise<Lookup> => {
  void runId;
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; windowCalls = 0; }
  if (++windowCalls > newLookupsPerMinute) throw new Skip("Warcraft Logs lookup budget spent");
  const fields = players.map(([name, realm, region], index) =>
    `p${index}:character(name:${JSON.stringify(name)},serverSlug:${JSON.stringify(realm)},serverRegion:${JSON.stringify(region)}){encounterRankings(encounterID:${encounterId})}`);
  const data = await graphql<{ characterData: Record<string, { encounterRankings?: { ranks?: Ranking[] } } | null> }>(`{characterData{${fields.join(" ")}} ${rateLimit}}`);
  for (const character of Object.values(data.characterData ?? {})) {
    for (const rank of character?.encounterRankings?.ranks ?? []) {
      if (!rank.report?.code || !rank.report.fightID || rank.duration === undefined || rank.startTime === undefined) continue;
      if (Math.abs(rank.duration - clearMs) <= 1_000 && Math.abs(rank.startTime + rank.duration - endMs) <= 180_000) return { code: rank.report.code, fightId: rank.report.fightID };
    }
  }
  return null;
}, ["mythic-plus-run-wcl-lookup", "v1"], { revalidate: 6 * 60 * 60, tags: ["mythic-plus-run-log"] });

const fightQuery = `query($c:String!,$f:[Int]!){reportData{report(code:$c){
  fights(fightIDs:$f){startTime endTime dungeonPulls{startTime endTime encounterID kill name}}
  masterData(translate:true){actors{id gameID name type petOwner}}
  summary:table(dataType:Summary,fightIDs:$f)
  lust:events(dataType:Debuffs,fightIDs:$f,hostilityType:Friendlies,limit:500,filterExpression:"ability.id in (${satedDebuffs.join(",")}) and type = \\"applydebuff\\""){data}
  interrupts:events(dataType:Interrupts,fightIDs:$f,limit:2000){data}
}} ${rateLimit}}`;
const killsQuery = `query($c:String!,$f:[Int]!,$s:Float){reportData{report(code:$c){
  kills:events(dataType:DamageDone,fightIDs:$f,includeResources:true,startTime:$s,limit:2000,filterExpression:"overkill > 0 and target.type = \\"NPC\\""){data nextPageTimestamp}
}} ${rateLimit}}`;

type Event = Record<string, unknown>;
const numberOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/** The fight's trimmed log: only what the replay reads, so the cached entry stays small. */
const fetchFight = unstable_cache(async (code: string, fightId: number): Promise<WclRunRaw | null> => {
  type Report = {
    fights?: WclRunRaw["fight"][];
    masterData?: { actors?: WclRunRaw["actors"] };
    summary?: { data?: { damageDone?: unknown[]; healingDone?: unknown[]; deathEvents?: unknown[] } };
    lust?: { data?: Event[] };
    interrupts?: { data?: Event[] };
  };
  const data = await graphql<{ reportData: { report: Report | null } }>(fightQuery, { c: code, f: [fightId] });
  const report = data.reportData.report;
  const fight = report?.fights?.[0];
  if (!report || !fight) return null;
  const kills: WclRunRaw["kills"] = [];
  let start: number | null = null;
  for (let page = 0; page < 4; page += 1) {
    type KillsPage = { reportData: { report: { kills?: { data?: Event[]; nextPageTimestamp?: number | null } } } };
    const result: KillsPage = await graphql<KillsPage>(killsQuery, { c: code, f: [fightId], s: start });
    for (const event of result.reportData.report.kills?.data ?? []) {
      const timestamp = numberOf(event.timestamp), targetID = numberOf(event.targetID);
      if (timestamp === undefined || targetID === undefined) continue;
      kills.push({ timestamp, targetID, targetInstance: numberOf(event.targetInstance), x: numberOf(event.x), y: numberOf(event.y), mapID: numberOf(event.mapID) });
    }
    start = result.reportData.report.kills?.nextPageTimestamp ?? null;
    if (!start) break;
  }
  const interrupts = (report.interrupts?.data ?? []).flatMap((event) => (numberOf(event.sourceID) !== undefined ? [numberOf(event.sourceID)!] : []));
  const lust = (report.lust?.data ?? []).flatMap((event) => (numberOf(event.timestamp) !== undefined ? [numberOf(event.timestamp)!] : []));
  const killed = new Set(kills.map((kill) => kill.targetID));
  const actors = (report.masterData?.actors ?? []).filter((actor) => actor.type === "Player" || killed.has(actor.id) || interrupts.includes(actor.id))
    .map((actor) => ({ id: actor.id, gameID: actor.gameID, name: actor.name, type: actor.type, petOwner: actor.petOwner ?? null }));
  const summary = report.summary?.data ?? {};
  const totals = (list?: unknown[]) => (list ?? []).flatMap((entry) => {
    const row = entry as { id?: number; name?: string; total?: number };
    return row.name && typeof row.total === "number" ? [{ id: row.id ?? 0, name: row.name, total: row.total }] : [];
  });
  const deathEvents = (summary.deathEvents ?? []).flatMap((entry) => {
    const row = entry as { name?: string; deathTime?: number; ability?: { name?: string; abilityIcon?: string } };
    return row.name && typeof row.deathTime === "number" ? [{ name: row.name, deathTime: row.deathTime, ...(row.ability ? { ability: { name: row.ability.name, abilityIcon: row.ability.abilityIcon } } : {}) }] : [];
  });
  return {
    code,
    fightId,
    fight: { startTime: fight.startTime, endTime: fight.endTime, dungeonPulls: (fight.dungeonPulls ?? []).map((pull) => ({ startTime: pull.startTime, endTime: pull.endTime, encounterID: pull.encounterID, kill: pull.kill, name: pull.name })) },
    actors,
    summary: { damageDone: totals(summary.damageDone), healingDone: totals(summary.healingDone), deathEvents },
    lust,
    interrupts,
    kills,
  };
}, ["mythic-plus-run-wcl-fight", "v1"], { revalidate: 30 * 24 * 60 * 60, tags: ["mythic-plus-run-log"] });

export type ReplayEnemyInfo = { en: string; ru?: string; portrait?: string };
export type ReplayView = { replay: RunReplay; map?: string; enemies: Record<number, ReplayEnemyInfo> };

function enemyInfo(slug: string, replay: RunReplay, mapNodes: MapNode[]): Record<number, ReplayEnemyInfo> {
  const catalogue = new Map((enemiesBySlug[slug]?.enemies ?? []).map((enemy) => [enemy.npcId, enemy]));
  const mdtNames = new Map(mapNodes.map((node) => [node.npcId, (node as MapNode & { name?: string }).name]));
  const info: Record<number, ReplayEnemyInfo> = {};
  for (const pull of replay.pulls) {
    for (const enemy of pull.enemies) {
      if (info[enemy.npcId]) continue;
      const known = catalogue.get(enemy.npcId), names = sourceNpcNames[enemy.npcId];
      const en = known?.name.en ?? names?.en ?? mdtNames.get(enemy.npcId);
      if (!en) continue;
      const portrait = known?.portraitUrl?.startsWith("/assets/") ? known.portraitUrl : undefined;
      info[enemy.npcId] = { en, ...(known?.name.ru ?? names?.ru ? { ru: known?.name.ru ?? names?.ru } : {}), ...(portrait ? { portrait } : {}) };
    }
  }
  return info;
}

/** The run's replay for the page, or null when no log of it exists anywhere we can read. */
export const loadRunReplay = cache(async (run: RunDetail): Promise<ReplayView | null> => {
  const slug = run.dungeon.slug;
  const map = maps[slug];
  const nodes = map?.nodes ?? [];
  let replay: RunReplay | null = null;
  const encounterId = encounterIds[slug];
  if (encounterId && map && warcraftLogsConfigured() && run.completedAt) {
    try {
      const players = run.players.filter((player) => player.realmSlug && player.region).map((player) => [player.name, player.realmSlug, player.region] as [string, string, string]);
      const found = players.length ? await findReport(run.id, encounterId, run.clearMs, Date.parse(run.completedAt), players) : null;
      const raw = found ? await fetchFight(found.code, found.fightId) : null;
      if (raw) replay = replayFromWarcraftLogs(raw, slug, nodes, map.total, run.players.map((player) => player.name));
    } catch (error) {
      if (!(error instanceof Skip)) console.error("Warcraft Logs run log unavailable", error);
    }
  }
  replay ??= replayFromRaiderIo(run, nodes);
  if (!replay) return null;
  return { replay, ...(map?.image ? { map: map.image } : {}), enemies: enemyInfo(slug, replay, nodes) };
});

export type LoggedRunLink = { id: number; level: number; clearMs: number };

/** The best logged run of the dungeon at the nearest key level: the action of the "no log" state. */
const loggedRuns = unstable_cache(async (season: string, slug: string): Promise<LoggedRunLink[]> => {
  const response = await fetch(`https://raider.io/api/v1/mythic-plus/runs?season=${encodeURIComponent(season)}&region=world&dungeon=${encodeURIComponent(slug)}&page=0`, {
    cache: "no-store",
    headers: { accept: "application/json", "user-agent": "Gildra (+https://gildra.net)" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Raider.IO runs ${slug} failed (${response.status})`);
  const data = await response.json() as { rankings?: Array<{ run?: { keystone_run_id?: number; mythic_level?: number; clear_time_ms?: number; logged_run_id?: number | null; num_chests?: number } }> };
  return (data.rankings ?? []).flatMap(({ run }) => run?.keystone_run_id && run.logged_run_id && run.mythic_level && run.clear_time_ms && run.num_chests
    ? [{ id: run.keystone_run_id, level: run.mythic_level, clearMs: run.clear_time_ms }] : []);
}, ["mythic-plus-logged-runs", "v1"], { revalidate: 60 * 60, tags: ["mythic-plus-run-log"] });

export async function similarLoggedRun(run: RunDetail): Promise<LoggedRunLink | null> {
  if (!maps[run.dungeon.slug]) return null;
  try {
    const runs = (await loggedRuns(run.season, run.dungeon.slug)).filter((entry) => entry.id !== run.id);
    return runs.sort((a, b) => Math.abs(a.level - run.level) - Math.abs(b.level - run.level) || a.clearMs - b.clearMs)[0] ?? null;
  } catch {
    return null;
  }
}
