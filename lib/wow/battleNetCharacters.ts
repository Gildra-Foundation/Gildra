export const BATTLE_NET_REGIONS = ["eu", "us", "kr", "tw"] as const;
export type BattleNetRegion = (typeof BATTLE_NET_REGIONS)[number];

export type BattleNetCharacter = {
  id: number;
  name: string;
  level: number;
  realm: { id: number; name: string; slug: string };
  playableClass: { id: number; name: string };
  playableRace: { id: number; name: string };
  faction: { type: string; name: string };
  gender?: { type: string; name: string };
  region: BattleNetRegion;
  accountId: number;
  armoryUrl: string;
};

type ApiCharacter = {
  id: number;
  name: string;
  level: number;
  realm: { id: number; name: string; slug: string };
  playable_class: { id: number; name: string };
  playable_race: { id: number; name: string };
  faction: { type: string; name: string };
  gender?: { type: string; name: string };
};

type ProfileResponse = {
  wow_accounts?: Array<{ id: number; characters?: ApiCharacter[] }>;
};

const supportedRegions = new Set<string>(BATTLE_NET_REGIONS);

export function isBattleNetRegion(value: string): value is BattleNetRegion {
  return supportedRegions.has(value);
}

export function getBattleNetPreferredRegion(): BattleNetRegion {
  const configuredRegion = (process.env.BATTLENET_REGION ?? "eu").toLowerCase();
  return isBattleNetRegion(configuredRegion) ? configuredRegion : "eu";
}

export class BattleNetProfileError extends Error {
  constructor(public readonly status: number, public readonly attempts: Array<{ region: BattleNetRegion; status: number }>) {
    super(`Battle.net Profile API returned ${status} in every available region`);
  }
}

export async function getBattleNetCharacters(accessToken: string, locale: "en" | "ru", onlyRegion?: BattleNetRegion): Promise<BattleNetCharacter[]> {
  const preferred = getBattleNetPreferredRegion();
  const regions: BattleNetRegion[] = onlyRegion
    ? [onlyRegion]
    : [preferred, ...BATTLE_NET_REGIONS.filter((region) => region !== preferred)];
  const attempts = await Promise.all(regions.map(async (region) => {
    const apiLocale = locale === "ru" && region === "eu" ? "ru_RU" : region === "us" ? "en_US" : region === "kr" ? "ko_KR" : region === "tw" ? "zh_TW" : "en_GB";
    const url = new URL(`https://${region}.api.blizzard.com/profile/user/wow`);
    url.searchParams.set("namespace", `profile-${region}`);
    url.searchParams.set("locale", apiLocale);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) return { region, status: response.status, profile: null };
      return { region, status: response.status, profile: await response.json() as ProfileResponse };
    } catch {
      return { region, status: 503, profile: null };
    }
  }));
  const successful = attempts.filter((attempt) => attempt.profile !== null);
  if (!successful.length) {
    const statuses = attempts.map((attempt) => attempt.status);
    const status = statuses.includes(429) ? 429 : statuses.includes(403) ? 403 : statuses.includes(401) ? 401 : statuses.find((value) => value >= 500) ?? statuses[0] ?? 503;
    throw new BattleNetProfileError(status, attempts.map(({ region, status: attemptStatus }) => ({ region, status: attemptStatus })));
  }

  const characters = successful.flatMap(({ profile, region }) => (profile?.wow_accounts ?? [])
    .flatMap((account) => (account.characters ?? []).map((character) => ({
      id: character.id,
      name: character.name,
      level: character.level,
      realm: character.realm,
      playableClass: character.playable_class,
      playableRace: character.playable_race,
      faction: character.faction,
      gender: character.gender,
      region,
      accountId: account.id,
      armoryUrl: `https://worldofwarcraft.blizzard.com/${region === "us" ? "en-us" : locale === "ru" ? "ru-ru" : "en-gb"}/character/${region}/${character.realm.slug}/${encodeURIComponent(character.name.toLowerCase())}`,
    })))
  );
  if (!characters.length && successful.length < attempts.length) {
    const failed = attempts.filter((attempt) => attempt.profile === null);
    const statuses = failed.map((attempt) => attempt.status);
    const status = statuses.includes(429) ? 429 : statuses.includes(403) ? 403 : statuses.includes(401) ? 401 : statuses.find((value) => value >= 500) ?? statuses[0] ?? 503;
    throw new BattleNetProfileError(status, failed.map(({ region, status: attemptStatus }) => ({ region, status: attemptStatus })));
  }
  return characters.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, locale === "ru" ? "ru-RU" : "en-US"));
}

export async function getBattleNetCharacterBySlug(accessToken: string, locale: "en" | "ru", slug: string): Promise<BattleNetCharacter | undefined> {
  const requested = decodeURIComponent(slug).toLowerCase();
  const requestedRegion = requested.split("--", 1)[0];
  const characters = await getBattleNetCharacters(
    accessToken,
    locale,
    isBattleNetRegion(requestedRegion) ? requestedRegion : undefined,
  );
  return characters.find((character) =>
    `${character.region}--${character.realm.slug}--${character.name.toLowerCase()}` === requested,
  );
}
