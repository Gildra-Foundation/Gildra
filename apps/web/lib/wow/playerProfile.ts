import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getMidnightTalentData, type TalentCalculatorData } from "@/lib/talentCalculatorData";
import { getTalentSpecThemeById } from "@/lib/talentSpecThemes";
import type { CharacterAuditSnapshot } from "./characterAudit";
import { BattleNetCharacterDataError, getBattleNetCharacterDetails, getBattleNetCharacterModelItems } from "./battleNetCharacterDetails";
import type { BattleNetCharacter } from "./battleNetCharacters";
import { toCharacterAuditSnapshot } from "./battleNetAuditSnapshot";
import { bestRunsByDungeon, raidProgress, ratingColor, type PlayerBestRun, type PlayerKey, type PlayerRaid, type RaiderIoRun, type RawSeasonProfile } from "./playerProfileView";

/**
 * Public profile of any character (/wow/players/<region>/<realm>/<name>) from the
 * official Blizzard Profile API with the site's client credentials: only what the
 * player made public. The trimmed profile is cached 45 minutes per character and
 * language (served stale while a fresh copy is built); an unknown or hidden
 * character is cached as "missing" too, so random names cannot hammer Blizzard.
 * Fresh builds are capped per minute per process; past the cap (or when Blizzard
 * is down) the page shows a short "unavailable" state. Raider.IO only adds our
 * run-page ids to the best runs, and its failure costs nothing but the links.
 */
const revalidate = 45 * 60;
const buildsPerMinute = 12;
const raiderIoPerMinute = 20;
const timeoutMs = 8_000;

export type PlayerProfile = {
  key: PlayerKey;
  snapshot: CharacterAuditSnapshot;
  specId: number;
  heroTreeId?: number;
  guild?: string;
  realmName: string;
  rating?: { value: number; color?: string };
  runs: PlayerBestRun[];
  raids: PlayerRaid[];
  armoryUrl: string;
};
export type PlayerProfileLoad = { state: "ready"; profile: PlayerProfile } | { state: "missing" } | { state: "unavailable" };

class Busy extends Error {}

function budget(perMinute: number) {
  let start = 0, calls = 0;
  return () => {
    const now = Date.now();
    if (now - start > 60_000) { start = now; calls = 0; }
    calls += 1;
    return calls <= perMinute;
  };
}
const takeBuild = budget(buildsPerMinute);
const takeRaiderIo = budget(raiderIoPerMinute);

let appToken: { value: string; expires: number } | null = null;
let pendingToken: Promise<string> | null = null;
/** Client-credentials token of the site (Blizzard issues it for a day; renewed an hour early). */
export async function battleNetAppToken(): Promise<string> {
  if (appToken && appToken.expires > Date.now()) return appToken.value;
  pendingToken ??= (async () => {
    const id = process.env.BATTLENET_CLIENT_ID, secret = process.env.BATTLENET_CLIENT_SECRET;
    if (!id || !secret) throw new Error("Battle.net client credentials are not configured");
    const response = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Battle.net token request failed (${response.status})`);
    const result = await response.json() as { access_token?: string; expires_in?: number };
    if (!result.access_token || !result.expires_in) throw new Error("Battle.net token response is incomplete");
    appToken = { value: result.access_token, expires: Date.now() + Math.max(60, result.expires_in - 3600) * 1000 };
    return result.access_token;
  })().finally(() => { pendingToken = null; });
  return pendingToken;
}

const apiLocale = (region: string, locale: "en" | "ru") => locale === "ru" && region === "eu" ? "ru_RU" : region === "us" ? "en_US" : "en_GB";
const characterRoot = (key: PlayerKey) => `https://${key.region}.api.blizzard.com/profile/wow/character/${encodeURIComponent(key.realm)}/${encodeURIComponent(key.name)}`;

async function blizzard<T>(url: string, token: string, region: string, locale: "en" | "ru", namespace = `profile-${region}`): Promise<{ status: number; body: T | null }> {
  const target = new URL(url);
  target.searchParams.set("namespace", namespace);
  target.searchParams.set("locale", apiLocale(region, locale));
  const response = await fetch(target, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) { await response.body?.cancel(); return { status: response.status, body: null }; }
  return { status: response.status, body: await response.json() as T };
}

/** Id of the current Mythic+ season of a region (the season list changes a few times a year). */
const currentSeasonId = unstable_cache(async (region: string): Promise<number | null> => {
  const token = await battleNetAppToken();
  const { body } = await blizzard<{ current_season?: { id?: number } }>(`https://${region}.api.blizzard.com/data/wow/mythic-keystone/season/index`, token, region, "en", `dynamic-${region}`);
  const id = body?.current_season?.id;
  if (!id) throw new Error("Mythic+ season index is incomplete");
  return id;
}, ["player-profile-season", "v1"], { revalidate: 6 * 60 * 60 });

async function raiderIoBestRuns(key: PlayerKey): Promise<RaiderIoRun[]> {
  if (!takeRaiderIo()) return [];
  try {
    const params = new URLSearchParams({ region: key.region, realm: key.realm, name: key.name, fields: "mythic_plus_best_runs" });
    const response = await fetch(`https://raider.io/api/v1/characters/profile?${params}`, {
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": "Gildra (+https://wowarcana.com)" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) { await response.body?.cancel(); return []; }
    const data = await response.json() as { mythic_plus_best_runs?: RaiderIoRun[] };
    return Array.isArray(data.mythic_plus_best_runs) ? data.mythic_plus_best_runs : [];
  } catch {
    return [];
  }
}

type RawProfile = {
  id?: number;
  name?: string;
  level?: number;
  realm?: { id?: number; name?: string; slug?: string };
  character_class?: { id?: number; name?: string };
  race?: { id?: number; name?: string };
  faction?: { type?: string; name?: string };
  gender?: { type?: string; name?: string };
  guild?: { name?: string };
  active_spec?: { id?: number; name?: string };
};
type RawKeystoneProfile = { current_mythic_rating?: { rating?: number; color?: { r?: number; g?: number; b?: number; a?: number } }; seasons?: Array<{ id?: number }> };

const armoryLocale = { en: { eu: "en-gb", us: "en-us", kr: "ko-kr", tw: "zh-tw" }, ru: { eu: "ru-ru", us: "en-us", kr: "ko-kr", tw: "zh-tw" } } as const;
export const armoryUrl = (key: PlayerKey, locale: "en" | "ru") =>
  `https://worldofwarcraft.blizzard.com/${armoryLocale[locale][key.region]}/character/${key.region}/${encodeURIComponent(key.realm)}/${encodeURIComponent(key.name)}`;

function toCharacter(key: PlayerKey, raw: RawProfile, locale: "en" | "ru"): BattleNetCharacter | null {
  if (!raw.id || !raw.name || !raw.realm?.slug || !raw.character_class?.id || !raw.race?.id) return null;
  return {
    id: raw.id, name: raw.name, level: raw.level ?? 0,
    realm: { id: raw.realm.id ?? 0, name: raw.realm.name ?? raw.realm.slug, slug: raw.realm.slug },
    playableClass: { id: raw.character_class.id, name: raw.character_class.name ?? "" },
    playableRace: { id: raw.race.id, name: raw.race.name ?? "" },
    faction: { type: raw.faction?.type ?? "", name: raw.faction?.name ?? "" },
    gender: raw.gender?.type ? { type: raw.gender.type, name: raw.gender.name ?? "" } : undefined,
    region: key.region, accountId: 0, armoryUrl: armoryUrl(key, locale),
  };
}

/** Someone else's gear is shown as it is: the audit marks of the owner's page (weak slot, empty socket) stay off. */
const plainGear = (snapshot: CharacterAuditSnapshot): CharacterAuditSnapshot => ({
  ...snapshot,
  gear: snapshot.gear.map((item) => item.state === "issue" || item.state === "missing" ? { ...item, state: "good" as const } : item),
});

async function build(region: PlayerKey["region"], realm: string, name: string, locale: "en" | "ru"): Promise<PlayerProfileLoad> {
  if (!takeBuild()) throw new Busy("player profile budget spent");
  const key: PlayerKey = { region, realm, name };
  const token = await battleNetAppToken();
  const root = characterRoot(key);
  const profile = await blizzard<RawProfile>(root, token, region, locale);
  if (profile.status === 404 || profile.status === 403) return { state: "missing" };
  if (profile.status === 429) throw new Busy("Blizzard rate limit");
  if (!profile.body) throw new Error(`Blizzard profile failed (${profile.status})`);
  const character = toCharacter(key, profile.body, locale);
  if (!character) return { state: "missing" };

  const [details, keystone, raids, seasonId, raiderIo] = await Promise.all([
    getBattleNetCharacterDetails(token, character, locale).catch((error: unknown) => {
      if (error instanceof BattleNetCharacterDataError && (error.code === "not_found" || error.code === "incomplete" || error.code === "forbidden")) return null;
      throw error;
    }),
    blizzard<RawKeystoneProfile>(`${root}/mythic-keystone-profile`, token, region, locale),
    blizzard<Parameters<typeof raidProgress>[0]>(`${root}/encounters/raids`, token, region, locale),
    currentSeasonId(region).catch(() => null),
    raiderIoBestRuns(key),
  ]);
  if (!details) return { state: "missing" };
  const played = Boolean(seasonId && keystone.body?.seasons?.some((season) => season.id === seasonId));
  const season = played ? (await blizzard<RawSeasonProfile>(`${root}/mythic-keystone-profile/season/${seasonId}`, token, region, locale)).body : null;
  const ratingValue = season?.mythic_rating?.rating ?? keystone.body?.current_mythic_rating?.rating ?? 0;
  const snapshot = plainGear(toCharacterAuditSnapshot(details, locale));
  const specId = profile.body.active_spec?.id ?? 0;
  return {
    state: "ready",
    profile: {
      key, snapshot, specId,
      heroTreeId: details.activeHeroTalentTreeId,
      guild: profile.body.guild?.name,
      realmName: character.realm.name,
      rating: ratingValue > 0 ? { value: ratingValue, color: ratingColor(season?.mythic_rating?.color ?? keystone.body?.current_mythic_rating?.color) } : undefined,
      runs: bestRunsByDungeon(season, raiderIo),
      raids: raidProgress(raids.body),
      armoryUrl: character.armoryUrl,
    },
  };
}

const cachedBuild = unstable_cache(build, ["player-profile", "v1"], { revalidate, tags: ["player-profile"] });

/** The profile, "missing" (no such public character) or "unavailable" (Blizzard slow, down or busy). Shared by metadata and page. */
export const loadPlayerProfile = cache(async (key: PlayerKey, locale: "en" | "ru"): Promise<PlayerProfileLoad> => {
  try {
    return await cachedBuild(key.region, key.realm, key.name, locale);
  } catch (error) {
    if (!(error instanceof Busy)) console.error("Player profile unavailable", error);
    return { state: "unavailable" };
  }
});

/** Talent tree of the profile's specialization and hero tree, for the read-only calculator. */
export async function loadPlayerTalentData(profile: PlayerProfile, locale: "en" | "ru"): Promise<TalentCalculatorData | null> {
  const theme = getTalentSpecThemeById(profile.specId);
  if (!theme || !profile.snapshot.activeTalentLoadout) return null;
  return getMidnightTalentData(theme.slug, profile.heroTreeId, locale).catch(() => null);
}

/** Equipment of the 3D model (display ids), asked for only when the reader opens the model. Cached a day. */
export const loadPlayerModelItems = unstable_cache(async (region: PlayerKey["region"], realm: string, name: string): Promise<Array<[number, number]>> => {
  const token = await battleNetAppToken();
  const character = { region, realm: { id: 0, name: realm, slug: realm }, name } as BattleNetCharacter;
  const items = await getBattleNetCharacterModelItems(token, character, "en");
  // An empty answer is a failed read (every character wears something): not kept for a day.
  if (!items.length) throw new Error("Character model items unavailable");
  return items;
}, ["player-profile-model", "v1"], { revalidate: 24 * 60 * 60 });
