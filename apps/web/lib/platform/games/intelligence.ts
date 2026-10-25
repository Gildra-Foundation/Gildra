import "server-only";
import type { Lang } from "@/lib/i18n";
import type { PlatformGameId } from "@/lib/platform/home/types";
import { getCatalogEntityTypes, getLibraryDatasets } from "@/lib/api/client";
import { internalApiJson } from "@/lib/api/internal";
import { runtimeFlags } from "@/lib/flags";
import { intelligenceCopy } from "./intelligenceCopy";

export type IntelligenceStatus = "live" | "degraded" | "unavailable";
export type TierRole = "dps" | "healer" | "tank";

export type IntelligenceMetric = {
  label: string;
  value: number;
  href?: string;
};

export type IntelligenceEntity = {
  id: string;
  name: string;
  subtitle: string;
  imageUrl?: string;
  href: string;
};

export type IntelligenceSource = {
  slug: string;
  name: string;
  provider: string;
  status: "live" | "stale" | "empty";
  recordCount: number;
  updatedAt?: string;
};

export type TierEntry = {
  rank: number;
  tier: string;
  role: TierRole;
  className: string;
  classSlug: string;
  specName: string;
  specSlug: string;
  score?: number;
  averageDps?: number;
  averageHps?: number;
  popularity?: number;
  maxKey?: number;
  rankChange?: number;
  guideUrl?: string;
  sourceUrl: string;
  /** Source-specific sub-group, e.g. mythicstats.com's melee / ranged DPS lists. */
  group?: string;
};

export type TierActivity = "mythic_plus" | "raid";

export type TierContext = {
  activity: TierActivity;
  selectionType: "all" | "dungeon" | "raid" | "boss";
  selectionId: string;
  selectionName: string;
  keyType?: "all" | "high" | "middle" | "low" | "";
  difficulty?: "raid_myth" | "raid_hero" | "raid_normal" | "raid_n10" | "raid_n25" | "raid_h10" | "raid_h25" | "";
  addonKey: string;
  addonName: string;
  recordCount: number;
};

export type TierActivityData = {
  roles: Record<TierRole, TierEntry[]>;
};

export type GameIntelligence = {
  gameId: PlatformGameId;
  status: IntelligenceStatus;
  mode: "tier-list" | "catalog" | "pending";
  version: string;
  updatedAt: string;
  providerLabel: string;
  metrics: IntelligenceMetric[];
  entities: IntelligenceEntity[];
  roles?: Record<TierRole, TierEntry[]>;
  tierLists?: Record<TierActivity, TierActivityData>;
  tierContexts?: TierContext[];
  sources: IntelligenceSource[];
  message?: string;
};

type GenshinStatus = {
  ready: boolean;
  gameVersion?: string;
  publishedAt?: string;
  characters: number;
  weapons: number;
  artifactSets: number;
  talents: number;
  contentEntries: number;
  mediaAssets: number;
};

type GenshinCharacter = {
  id: number;
  slug: string;
  name: string;
  title?: string;
  rarity: number;
  element: string;
  weaponType: string;
  iconUrl?: string;
};

type LeagueStatus = {
  ready: boolean;
  ddragonVersion?: string;
  publishedAt?: string;
  champions: number;
  abilities: number;
  skins: number;
  contentEntries: number;
  mediaAssets: number;
  contentByCategory: Record<string, number>;
};

type LeagueChampion = {
  id: number;
  slug: string;
  name: string;
  title?: string;
  tags?: string[];
  assets?: { icon?: string };
};

type TierSnapshot = {
  game: "wow";
  status: "live";
  activity: string;
  role: TierRole;
  updatedAt: string;
  recordCount: number;
  sources: IntelligenceSource[];
  entries: TierEntry[];
  context?: TierContext;
};

type TierContextsResponse = { contexts: TierContext[] };

type RemotePage<T> = { data: T[] };

const gameIntelligenceTimeoutMs = 3_000;

function apiRequest<T>(path: string, revalidate = 300): Promise<T> {
  return internalApiJson<T>(path, { label: "game intelligence", timeoutMs: gameIntelligenceTimeoutMs, next: { revalidate, tags: ["game-intelligence"] } });
}

function unavailable(gameId: PlatformGameId, lang: Lang, message?: string): GameIntelligence {
  return {
    gameId,
    status: "unavailable",
    mode: "pending",
    version: "—",
    updatedAt: new Date(0).toISOString(),
    providerLabel: intelligenceCopy[lang].providerNotConnected,
    metrics: [],
    entities: [],
    sources: [],
    message: message ?? intelligenceCopy[lang].theLiveDataProvider,
  };
}

/** The tier list covers the current expansion only; the API also keeps Classic raids. */
const CURRENT_WOW_ADDON = "midnight";

async function wowIntelligence(lang: Lang): Promise<GameIntelligence> {
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  const [dps, healer, tank, raidDps, raidHealer, raidTank, mythicContexts, raidContexts, entityTypes, datasets] = await Promise.all([
    apiRequest<TierSnapshot>("/v1/meta/wow/tier-list?activity=mythic_plus&role=dps&limit=40"),
    apiRequest<TierSnapshot>("/v1/meta/wow/tier-list?activity=mythic_plus&role=healer&limit=20"),
    apiRequest<TierSnapshot>("/v1/meta/wow/tier-list?activity=mythic_plus&role=tank&limit=20"),
    apiRequest<TierSnapshot>("/v1/meta/wow/tier-list?activity=raid&role=dps&limit=40"),
    apiRequest<TierSnapshot>("/v1/meta/wow/tier-list?activity=raid&role=healer&limit=20"),
    apiRequest<TierSnapshot>("/v1/meta/wow/tier-list?activity=raid&role=tank&limit=20"),
    apiRequest<TierContextsResponse>("/v1/meta/wow/tier-list/contexts?activity=mythic_plus").then((value) => value.contexts).catch(() => []),
    apiRequest<TierContextsResponse>("/v1/meta/wow/tier-list/contexts?activity=raid").then((value) => value.contexts).catch(() => []),
    getCatalogEntityTypes(locale, "wow").catch(() => []),
    getLibraryDatasets(locale, "wow").catch(() => []),
  ]);
  const totalEntities = entityTypes.reduce((sum, type) => sum + (type.count ?? 0), 0);
  const liveSources = dps.sources.filter((source) => source.status === "live").length;
  return {
    gameId: "wow",
    status: "live",
    mode: "tier-list",
    version: datasets.find((item) => item.buildVersion)?.buildVersion ?? "live",
    updatedAt: dps.updatedAt,
    providerLabel: "Wowhead + wow.gg",
    metrics: [
      { label: intelligenceCopy[lang].specializations, value: entityTypes.find((type) => type.type === "specialization")?.count ?? dps.entries.length, href: `${lang === "ru" ? "/ru" : ""}/tier-lists` },
      { label: intelligenceCopy[lang].libraryRecords, value: totalEntities, href: `${lang === "ru" ? "/ru" : ""}/library` },
      { label: intelligenceCopy[lang].activeSources, value: liveSources },
    ],
    entities: datasets.filter((item) => item.entityCount > 0).slice(0, 5).map((item) => ({
      id: item.slug,
      name: item.name,
      subtitle: `${item.entityCount.toLocaleString(intelligenceCopy[lang].numberLocale)} · ${item.freshness}`,
      imageUrl: item.previewImageUrl,
      href: `${lang === "ru" ? "/ru" : ""}/library/${item.slug}`,
    })),
    roles: { dps: dps.entries, healer: healer.entries, tank: tank.entries },
    tierLists: {
      mythic_plus: { roles: { dps: dps.entries, healer: healer.entries, tank: tank.entries } },
      raid: { roles: { dps: raidDps.entries, healer: raidHealer.entries, tank: raidTank.entries } },
    },
    tierContexts: [...mythicContexts, ...raidContexts].filter((context) => context.addonKey === CURRENT_WOW_ADDON),
    sources: dps.sources,
  };
}

async function genshinIntelligence(lang: Lang): Promise<GameIntelligence> {
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  const [status, characters] = await Promise.all([
    apiRequest<GenshinStatus>("/genshin-impact/v1/status"),
    apiRequest<RemotePage<GenshinCharacter>>(`/genshin-impact/v1/characters?locale=${locale}&limit=6`, 1800),
  ]);
  return {
    gameId: "genshin",
    status: status.ready ? "live" : "degraded",
    mode: "catalog",
    version: status.gameVersion ?? "—",
    updatedAt: status.publishedAt ?? new Date(0).toISOString(),
    providerLabel: "Genshin DB · Gildra API",
    metrics: [
      { label: intelligenceCopy[lang].characters, value: status.characters, href: `${lang === "ru" ? "/ru" : ""}/search?game=genshin&type=characters` },
      { label: intelligenceCopy[lang].weapons, value: status.weapons, href: `${lang === "ru" ? "/ru" : ""}/search?game=genshin&type=items` },
      { label: intelligenceCopy[lang].artifactSets, value: status.artifactSets, href: `${lang === "ru" ? "/ru" : ""}/compare?game=genshin&kind=artifact-sets` },
      { label: intelligenceCopy[lang].worldRecords, value: status.contentEntries },
    ],
    entities: characters.data.map((item) => ({
      id: String(item.id), name: item.name,
      subtitle: `${item.rarity}★ · ${item.element} · ${item.weaponType}`,
      imageUrl: item.iconUrl,
      href: `${lang === "ru" ? "/ru" : ""}/genshin/characters/${item.slug}`,
    })),
    sources: [{ slug: "genshin-db", name: "Genshin DB", provider: "Gildra API", status: status.ready ? "live" : "stale", recordCount: status.contentEntries, updatedAt: status.publishedAt }],
  };
}

async function leagueIntelligence(lang: Lang): Promise<GameIntelligence> {
  const locale = lang === "ru" ? "ru_RU" : "en_US";
  const [status, champions] = await Promise.all([
    apiRequest<LeagueStatus>("/league-of-legends/v1/status"),
    apiRequest<RemotePage<LeagueChampion>>(`/league-of-legends/v1/champions?locale=${locale}&limit=6`, 1800),
  ]);
  return {
    gameId: "league",
    status: status.ready ? "live" : "degraded",
    mode: "catalog",
    version: status.ddragonVersion ?? "—",
    updatedAt: status.publishedAt ?? new Date(0).toISOString(),
    providerLabel: "Riot Data Dragon · Gildra API",
    metrics: [
      { label: intelligenceCopy[lang].champions, value: status.champions, href: `${lang === "ru" ? "/ru" : ""}/search?game=league&type=characters` },
      { label: intelligenceCopy[lang].abilities, value: status.abilities },
      { label: intelligenceCopy[lang].items, value: status.contentByCategory.items ?? 0, href: `${lang === "ru" ? "/ru" : ""}/compare?game=league&kind=items` },
      { label: intelligenceCopy[lang].runes, value: status.contentByCategory.runes ?? 0, href: `${lang === "ru" ? "/ru" : ""}/compare?game=league&kind=runes` },
    ],
    entities: champions.data.map((item) => ({
      id: String(item.id), name: item.name,
      subtitle: [item.title, ...(item.tags ?? [])].filter(Boolean).join(" · "),
      imageUrl: item.assets?.icon,
      href: `${lang === "ru" ? "/ru" : ""}/search?game=league&q=${encodeURIComponent(item.name)}`,
    })),
    sources: [{ slug: "riot-data-dragon", name: "Data Dragon", provider: "Riot Games", status: status.ready ? "live" : "stale", recordCount: status.contentEntries, updatedAt: status.publishedAt }],
  };
}

export async function getGameIntelligence(gameId: PlatformGameId, lang: Lang): Promise<GameIntelligence> {
  try {
    // /v1/meta/wow is not in the currently deployed OpenAPI contract. Do not
    // generate six known 404 requests and then present an ambiguous fallback.
    if (gameId === "wow" && !runtimeFlags().wowMetaApi) {
      return unavailable("wow", lang, intelligenceCopy[lang].theWowMetaApi);
    }
    if (gameId === "wow") return await wowIntelligence(lang);
    if (gameId === "genshin") return await genshinIntelligence(lang);
    if (gameId === "league") return await leagueIntelligence(lang);
    return unavailable("diablo", lang, intelligenceCopy[lang].theDiabloIvMeta);
  } catch (error) {
    console.error(`game intelligence unavailable for ${gameId}`, error);
    return unavailable(gameId, lang);
  }
}
