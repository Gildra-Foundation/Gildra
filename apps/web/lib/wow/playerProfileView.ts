import { dungeonRoutes, dungeonSlugs, type DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";

/**
 * Public player profile (/wow/players/<region>/<realm>/<name>): the address, its
 * validation and the pure transforms of the Blizzard Profile API answers
 * (Mythic+ season best runs, raid progress). Client-safe; the loader is
 * lib/wow/playerProfile.ts.
 */
export const playerRegions = ["eu", "us", "kr", "tw"] as const;
export type PlayerRegion = (typeof playerRegions)[number];
export const isPlayerRegion = (value: unknown): value is PlayerRegion => playerRegions.includes(value as PlayerRegion);

/** Path of a character's public profile on Gildra. `realm` is the realm slug ("twisting-nether", "гордунни"). */
export function playerProfilePath(region: string, realm: string, name: string, prefix: "" | "/ru" = "") {
  return `${prefix}/wow/players/${region.toLowerCase()}/${encodeURIComponent(realm.toLocaleLowerCase())}/${encodeURIComponent(name.toLocaleLowerCase())}`;
}

export type PlayerKey = { region: PlayerRegion; realm: string; name: string };

const decode = (value: string) => {
  try { return decodeURIComponent(value); } catch { return ""; }
};

/** Route params → a valid key; anything malformed is null (the page answers 404 without calling Blizzard). */
export function parsePlayerKey(params: { region: string; realm: string; name: string }): PlayerKey | null {
  const region = params.region.toLowerCase();
  const realm = decode(params.realm).toLocaleLowerCase();
  const name = decode(params.name).toLocaleLowerCase();
  if (!isPlayerRegion(region)) return null;
  if (!/^[\p{Ll}\p{Lo}0-9'-]{2,64}$/u.test(realm)) return null;
  if (!/^[\p{L}]{2,12}$/u.test(name)) return null;
  return { region, realm, name };
}

export type RatingColor = string;
type RawColor = { r?: number; g?: number; b?: number; a?: number };
/** Blizzard's rating colour as CSS; transparent (no rating yet) is no colour. */
export function ratingColor(color?: RawColor): RatingColor | undefined {
  if (!color || !color.a) return undefined;
  const channel = (value?: number) => Math.max(0, Math.min(255, Math.round(value ?? 0)));
  return `rgb(${channel(color.r)} ${channel(color.g)} ${channel(color.b)})`;
}

export type PlayerBestRun = {
  dungeonId: number;
  /** Season dungeon of the site (art, timer, Russian name), when known. */
  slug?: DungeonSlug;
  name: string;
  level: number;
  durationMs: number;
  timerMs?: number;
  timed: boolean;
  /** 0 when depleted, 1–3 keystone upgrades when timed. */
  upgrades: number;
  rating: number;
  color?: RatingColor;
  completedAt: number;
  /** Our run page id (Raider.IO keystone run id), when the run is known there. */
  runId?: number;
};

type RawRun = {
  completed_timestamp?: number;
  duration?: number;
  keystone_level?: number;
  dungeon?: { id?: number; name?: string };
  is_completed_within_time?: boolean;
  mythic_rating?: { rating?: number; color?: RawColor };
  map_rating?: { rating?: number; color?: RawColor };
};
export type RawSeasonProfile = { best_runs?: RawRun[]; mythic_rating?: { rating?: number; color?: RawColor } };
/** The fields of a Raider.IO best run used to find our run page. */
export type RaiderIoRun = { keystone_run_id?: number; map_challenge_mode_id?: number; clear_time_ms?: number; num_keystone_upgrades?: number; par_time_ms?: number };

const kebab = (value: string) => value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const slugByName = new Map(dungeonSlugs.map((slug) => [kebab(dungeonRoutes[slug].name), slug] as const));
/** Keystone (challenge mode) ids of the season's dungeons in the Blizzard API. */
const slugById: Record<number, DungeonSlug> = {
  399: "ruby-life-pools", 588: "altar-of-fangs", 587: "murder-row", 586: "den-of-nalorakk",
  584: "the-blinding-vale", 585: "voidscar-arena", 249: "kings-rest", 250: "temple-of-sethraliss",
};
/** The site's dungeon of a keystone dungeon: by id, else by its English name. */
export const seasonDungeonSlug = (id: number, name?: string): DungeonSlug | undefined => slugById[id] ?? (name ? slugByName.get(kebab(name)) : undefined);

export function keystoneUpgrades(durationMs: number, timerMs: number | undefined, timed: boolean) {
  if (!timed) return 0;
  if (!timerMs) return 1;
  return durationMs <= timerMs * 0.6 ? 3 : durationMs <= timerMs * 0.8 ? 2 : 1;
}

/** The counted run of every dungeon of the season (the one with the highest rating), best first. */
export function bestRunsByDungeon(season: RawSeasonProfile | null | undefined, raiderIo: RaiderIoRun[] = []): PlayerBestRun[] {
  const best = new Map<number, RawRun>();
  for (const run of season?.best_runs ?? []) {
    const id = run.dungeon?.id;
    if (!id || !run.keystone_level || !run.duration) continue;
    const current = best.get(id);
    const score = (entry: RawRun) => entry.mythic_rating?.rating ?? 0;
    if (!current || score(run) > score(current) || (score(run) === score(current) && (run.keystone_level ?? 0) > (current.keystone_level ?? 0))) best.set(id, run);
  }
  const known = new Map(raiderIo.filter((run) => run.map_challenge_mode_id && run.clear_time_ms).map((run) => [`${run.map_challenge_mode_id}:${run.clear_time_ms}`, run]));
  return [...best.entries()].map(([dungeonId, run]): PlayerBestRun => {
    const name = run.dungeon?.name ?? "";
    const slug = seasonDungeonSlug(dungeonId, name);
    const match = known.get(`${dungeonId}:${run.duration}`);
    const timerMs = match?.par_time_ms ?? (slug ? dungeonRoutes[slug].timerSeconds * 1000 : undefined);
    const timed = Boolean(run.is_completed_within_time);
    const rating = run.mythic_rating?.rating ?? 0;
    return {
      dungeonId, slug, name, level: run.keystone_level ?? 0, durationMs: run.duration ?? 0, timerMs, timed,
      upgrades: timed && match?.num_keystone_upgrades !== undefined ? Math.max(1, Math.min(3, match.num_keystone_upgrades)) : keystoneUpgrades(run.duration ?? 0, timerMs, timed),
      rating, color: ratingColor(run.mythic_rating?.color), completedAt: run.completed_timestamp ?? 0,
      runId: match?.keystone_run_id && match.keystone_run_id > 0 ? match.keystone_run_id : undefined,
    };
  }).sort((a, b) => b.rating - a.rating || b.level - a.level);
}

export type RaidDifficulty = "LFR" | "NORMAL" | "HEROIC" | "MYTHIC";
export const raidDifficulties: RaidDifficulty[] = ["LFR", "NORMAL", "HEROIC", "MYTHIC"];
export type PlayerRaid = {
  id: number;
  name: string;
  /** Our raid page, when there is one. */
  slug?: string;
  total: number;
  modes: Array<{ difficulty: RaidDifficulty; killed: number; total: number }>;
};
type RawRaids = {
  expansions?: Array<{
    expansion?: { id?: number; name?: string };
    instances?: Array<{
      instance?: { id?: number; name?: string };
      modes?: Array<{ difficulty?: { type?: string }; progress?: { completed_count?: number; total_count?: number } }>;
    }>;
  }>;
};

/** Journal instance ids of the raids that have a page on Gildra. */
const raidPages: Record<number, string> = { 1307: "the-voidspire", 1314: "the-dreamrift", 1308: "march-on-queldanas", 1320: "venomous-abyss", 1324: "the-unbinding-of-kithix", 1305: "sporefall" };
/** Blizzard groups this season's raids under a "Current Season" journal expansion. */
const currentSeasonExpansion = 505;

/** Progress in the raids of the current season (or the newest expansion when the season group is missing). */
export function raidProgress(raw: RawRaids | null | undefined): PlayerRaid[] {
  const expansions = raw?.expansions ?? [];
  const chosen = expansions.find((entry) => entry.expansion?.id === currentSeasonExpansion)
    ?? [...expansions].sort((a, b) => (b.expansion?.id ?? 0) - (a.expansion?.id ?? 0))[0];
  return (chosen?.instances ?? []).flatMap((entry): PlayerRaid[] => {
    const id = entry.instance?.id;
    if (!id || !entry.instance?.name) return [];
    const modes = (entry.modes ?? [])
      .map((mode) => ({ difficulty: mode.difficulty?.type as RaidDifficulty, killed: mode.progress?.completed_count ?? 0, total: mode.progress?.total_count ?? 0 }))
      .filter((mode) => raidDifficulties.includes(mode.difficulty) && mode.total > 0)
      .sort((a, b) => raidDifficulties.indexOf(a.difficulty) - raidDifficulties.indexOf(b.difficulty));
    if (!modes.length) return [];
    return [{ id, name: entry.instance.name, slug: raidPages[id], total: Math.max(...modes.map((mode) => mode.total)), modes }];
  });
}
