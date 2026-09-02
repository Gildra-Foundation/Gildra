import "server-only";

export type LeagueAssets = { icon: string | null; splash: string | null; loading: string | null; tile: string | null };
export type LeagueChampion = {
  id: number; slug: string; internalName: string; name: string; title: string;
  resourceType: string; tags: string[]; assets: LeagueAssets; locale: "en_US" | "ru_RU"; localeFallback: boolean;
};
export type LeagueAbility = {
  key: string; kind: "passive" | "spell"; slot: string; displayOrder: number; name: string;
  description: string; tooltip: string; iconUrl: string | null; cooldowns: unknown; costs: unknown; ranges: unknown;
  variables: unknown; effects: unknown;
};
export type LeagueSkin = { id: number; number: number; name: string; hasChromas: boolean; assets: LeagueAssets };
export type LeagueChampionDetail = LeagueChampion & {
  blurb: string; lore: string; allyTips: string[]; enemyTips: string[]; info: Record<string, number>;
  stats: Record<string, number>; abilities: LeagueAbility[]; skins: LeagueSkin[]; sourcePayload: Record<string, unknown>;
};
export type LeagueStatus = {
  ready: boolean; releaseId?: string; ddragonVersion?: string; publishedAt?: string; champions: number;
  abilities: number; skins: number; contentEntries: number; contentByCategory: Record<string, number>;
  mediaAssets: number; locales: string[];
};
export type LeagueContentEntry = {
  id: number; category: string; externalKey: string; slug: string; name: string; description: string;
  tags: string[]; iconUrl: string | null; sourcePayload: Record<string, unknown>;
  localizedPayload: Record<string, unknown>; locale: string; localeFallback: boolean;
};

const apiURL = () => process.env.API_INTERNAL_URL ?? "http://api:8080";

async function leagueRequest<T>(path: string, revalidate = 3600): Promise<T> {
  const response = await fetch(`${apiURL()}${path}`, {
    next: { revalidate, tags: ["league-catalog"] },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`League catalog request failed (${response.status})`);
  return await response.json() as T;
}

export async function getLeagueStatus(): Promise<LeagueStatus | null> {
  try { return await leagueRequest<LeagueStatus>("/league-of-legends/v1/status", 300); }
  catch (error) { console.error("League status unavailable", error); return null; }
}

export async function getLeagueChampions(locale: "en_US" | "ru_RU"): Promise<LeagueChampion[]> {
  try {
    const champions: LeagueChampion[] = [];
    let cursor = "";
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const page = await leagueRequest<{ data: LeagueChampion[]; pagination: { hasMore: boolean; nextCursor?: string } }>(
        `/league-of-legends/v1/champions?locale=${locale}&limit=100${suffix}`,
      );
      champions.push(...page.data);
      if (!page.pagination.hasMore || !page.pagination.nextCursor) break;
      cursor = page.pagination.nextCursor;
    }
    return champions;
  } catch (error) {
    console.error("League champions unavailable", error);
    return [];
  }
}

export async function getLeagueChampion(slug: string, locale: "en_US" | "ru_RU") {
  try {
    return await leagueRequest<LeagueChampionDetail>(
      `/league-of-legends/v1/champions/${encodeURIComponent(slug)}?locale=${locale}`,
    );
  } catch (error) {
    console.error("League champion unavailable", error);
    return null;
  }
}

export async function getLeagueContent(category: string, locale: "en_US" | "ru_RU", cursor = "") {
  try {
    const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    return await leagueRequest<{ data: LeagueContentEntry[]; pagination: { hasMore: boolean; nextCursor?: string; limit: number } }>(
      `/league-of-legends/v1/content/${encodeURIComponent(category)}?locale=${locale}&limit=100${suffix}`,
    );
  } catch (error) {
    console.error("League content unavailable", error);
    return { data: [], pagination: { hasMore: false, limit: 100 } };
  }
}
