/**
 * One Mythic+ run as the run page shows it: the facts we keep from Raider.IO's public
 * run-details answer (GET https://raider.io/api/v1/mythic-plus/run-details?season=&id=).
 * Client-safe types and the pure transform; the fetch lives in mythicPlusRun.ts.
 */
export type RunRole = "tank" | "healer" | "dps";

export type RunPlayer = {
  name: string;
  realm: string;
  /** Realm slug (profile links, Warcraft Logs lookup). */
  realmSlug: string;
  region: string;
  classSlug: string;
  specId: number;
  role: RunRole;
  heroId?: number;
  loadout?: string;
  itemLevel?: number;
  rating?: number;
  deaths: number;
};

export type RunEncounter = { name: string; startMs: number; endMs: number; success: boolean };
/** Raider.IO's own log of a run: every enemy kill ([ms from the key start, npc id, how many, forces]) and every death. */
export type RunLog = { totalForces: number; kills: Array<[number, number, number, number]>; deaths: Array<{ atMs: number; player: string }> };
export type RunAffix = { name: string; slug: string; icon: string };
export type RunVideo = { kind: "youtube" | "twitch"; url: string; player: string };

export type RunDetail = {
  id: number;
  season: string;
  dungeon: { slug: string; name: string; bosses: number };
  level: number;
  chests: number;
  clearMs: number;
  timerMs: number;
  completedAt: string;
  score?: number;
  affixes: RunAffix[];
  players: RunPlayer[];
  encounters: RunEncounter[];
  deaths: number | null;
  /** Present when Raider.IO has the run's log (enemy kills over time). */
  log?: RunLog;
  videos: RunVideo[];
  url: string;
};

export type RunLoad = { state: "ready"; run: RunDetail } | { state: "missing" } | { state: "unavailable" };

/** Raider.IO's page of a run: the attribution link of the run page. */
export const raiderIoRunUrl = (season: string, id: number, level: number, dungeon: string) =>
  `https://raider.io/mythic-plus-runs/${encodeURIComponent(season)}/${id}-${level}-${encodeURIComponent(dungeon)}`;

/** Our run page. */
export const runHref = (prefix: string, id: number) => `${prefix}/wow/mythic-plus/routes/${id}`;

/** Share of the timer a run may use for two and three upgrades (the game's 80% and 60% marks). */
export const upgradeMarks = [{ chests: 2, share: 0.8 }, { chests: 3, share: 0.6 }] as const;

/** A run id from the URL: digits only, within Raider.IO's id range; anything else is not a run. */
export function parseRunId(value: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const roles: RunRole[] = ["tank", "healer", "dps"];
const roleOf = (value: unknown) => roles.find((role) => role === value);
const roleOrder: Record<RunRole, number> = { tank: 0, healer: 1, dps: 2 };

/** Raider.IO run-details JSON → the run page's facts; null when the answer is not a finished run. */
export function toRunDetail(raw: unknown): RunDetail | null {
  const data = obj(raw);
  const id = num(data.keystone_run_id);
  const dungeon = obj(data.dungeon);
  const level = num(data.mythic_level);
  const clearMs = num(data.clear_time_ms);
  const timerMs = num(data.keystone_time_ms) ?? num(dungeon.keystone_timer_ms);
  const season = str(data.season);
  if (!id || !level || !clearMs || !timerMs || !str(dungeon.slug) || !season || data.deleted_at) return null;

  const logged = data.logged_details ? obj(data.logged_details) : null;
  const deathsBy = new Map<number, number>();
  for (const death of list(logged?.deaths)) {
    const character = num(obj(death).character_id);
    if (character) deathsBy.set(character, (deathsBy.get(character) ?? 0) + 1);
  }

  const players: RunPlayer[] = list(data.roster).flatMap((entry) => {
    const member = obj(entry);
    const character = obj(member.character);
    const spec = obj(character.spec);
    const specId = num(spec.id);
    const name = str(character.name);
    const role = roleOf(member.role) ?? roleOf(spec.role) ?? "dps";
    if (!specId || !name) return [];
    const talents = obj(character.talentLoadout);
    const loadout = str(talents.exportLoadoutText) || str(talents.loadoutText);
    const itemLevel = num(obj(member.items).item_level_equipped);
    return [{
      name,
      realm: str(obj(character.realm).name),
      realmSlug: str(obj(character.realm).slug),
      region: str(obj(character.region).slug),
      classSlug: str(obj(character.class).slug),
      specId,
      role,
      ...(num(talents.heroSubTreeId) ? { heroId: num(talents.heroSubTreeId) } : {}),
      ...(loadout && /^[A-Za-z0-9+/=]{20,}$/.test(loadout) ? { loadout } : {}),
      ...(itemLevel ? { itemLevel } : {}),
      deaths: deathsBy.get(num(character.id) ?? -1) ?? 0,
    }];
  }).sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  const encounters: RunEncounter[] = list(logged?.encounters).flatMap((entry) => {
    const encounter = obj(entry);
    const startMs = num(encounter.approximate_relative_started_at);
    const endMs = num(encounter.approximate_relative_ended_at);
    const name = str(obj(encounter.boss).name);
    if (startMs === undefined || endMs === undefined || !name || endMs < startMs) return [];
    return [{ name, startMs, endMs, success: encounter.is_success === true }];
  }).sort((a, b) => a.startMs - b.startMs);

  const videos: RunVideo[] = list(data.videos).flatMap((entry): RunVideo[] => {
    const video = obj(entry);
    const videoId = str(video.videoId);
    const player = str(obj(video.character).name);
    if (!/^[\w-]{4,40}$/.test(videoId)) return [];
    if (video.videoType === "youtube") return [{ kind: "youtube" as const, url: `https://www.youtube.com/watch?v=${videoId}`, player }];
    if (video.videoType === "twitch") {
      const start = num(video.startVideoTimeSeconds);
      return [{ kind: "twitch" as const, url: `https://www.twitch.tv/videos/${videoId}${start ? `?t=${Math.floor(start)}s` : ""}`, player }];
    }
    return [];
  });

  const affixes: RunAffix[] = list(data.weekly_modifiers).flatMap((entry) => {
    const affix = obj(entry);
    return str(affix.name) ? [{ name: str(affix.name), slug: str(affix.slug), icon: str(affix.icon) }] : [];
  });

  const names = new Map<number, string>();
  for (const entry of list(data.roster)) {
    const character = obj(obj(entry).character);
    const characterId = num(character.id);
    if (characterId && str(character.name)) names.set(characterId, str(character.name));
  }
  const kills: RunLog["kills"] = list(logged?.enemies).flatMap((entry) => {
    const enemy = obj(entry);
    const atMs = num(enemy.approximate_relative_ended_at);
    const npcId = num(enemy.npc_id);
    const count = num(enemy.count) ?? 1;
    if (atMs === undefined || !npcId || count < 1) return [];
    return [[Math.round(atMs), npcId, count, num(enemy.enemy_forces_value) ?? 0] as [number, number, number, number]];
  }).sort((a, b) => a[0] - b[0]);
  const logDeaths = list(logged?.deaths).flatMap((entry) => {
    const death = obj(entry);
    const atMs = num(death.approximate_died_at);
    const player = names.get(num(death.character_id) ?? -1);
    return atMs !== undefined && player ? [{ atMs: Math.round(atMs), player }] : [];
  }).sort((a, b) => a.atMs - b.atMs);
  const totalForces = num(logged?.total_enemy_forces) ?? 0;

  const slug = str(dungeon.slug);
  return {
    id,
    season,
    dungeon: { slug, name: str(dungeon.name) || slug, bosses: num(dungeon.num_bosses) ?? 0 },
    level,
    chests: Math.max(0, Math.min(3, num(data.num_chests) ?? 0)),
    clearMs,
    timerMs,
    completedAt: str(data.completed_at),
    ...(num(data.score) ? { score: num(data.score) } : {}),
    affixes,
    players,
    encounters,
    deaths: logged ? list(logged.deaths).length : null,
    ...(kills.length && totalForces > 0 ? { log: { totalForces, kills, deaths: logDeaths } } : {}),
    videos,
    url: raiderIoRunUrl(season, id, level, slug),
  };
}
