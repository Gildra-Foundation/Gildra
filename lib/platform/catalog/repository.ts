import "server-only";
import { getCatalogPage } from "@/lib/api/client";
import type { ApiLocale } from "@/lib/games/registry";
import {
  catalogGames,
  type CatalogGameId,
  type CatalogQueryResult,
  type ComparisonKind,
  type PlatformCatalogItem,
  type SearchKind,
} from "./types";

type RemotePage<T> = { data: T[]; pagination?: { hasMore?: boolean; nextCursor?: string } };
type GenshinWeapon = {
  id: number; slug: string; name: string; rarity: number; weaponType: string;
  baseAttack?: number; secondaryStat?: string; secondaryStatValue?: number;
  iconUrl?: string; description?: string; passiveName?: string;
};
type GenshinArtifact = {
  id: number; slug: string; name: string; minRarity: number; maxRarity: number;
  twoPieceBonus?: string; fourPieceBonus?: string; iconUrl?: string; pieceCount?: number;
};
type GenshinCharacter = {
  id: number; slug: string; name: string; title?: string; rarity: number;
  element: string; weaponType: string; iconUrl?: string;
};
type LeagueEntry = {
  id: number; category: string; externalKey: string; slug: string; name: string;
  description?: string; tags?: string[]; iconUrl?: string; sourcePayload?: Record<string, unknown>;
};
type LeagueChampion = {
  id: number; slug: string; name: string; title?: string; tags?: string[];
  assets?: { icon?: string };
};

const apiURL = () => (process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");
const catalogLookupTimeoutMs = 3_000;

async function request<T>(path: string): Promise<T> {
  const query = new URLSearchParams(path.split("?", 2)[1] ?? "");
  const cacheOptions = query.has("q") && query.get("q") === ""
    ? { cache: "force-cache" as const, next: { revalidate: 60 } }
    : { cache: "no-store" as const };
  const response = await fetch(`${apiURL()}${path}`, {
    ...cacheOptions,
    signal: AbortSignal.timeout(catalogLookupTimeoutMs),
  });
  if (!response.ok) throw new Error(`catalog request failed (${response.status})`);
  return await response.json() as T;
}

function compactText(value: string | undefined, fallback: string) {
  const text = (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function leagueAttributes(payload: Record<string, unknown> | undefined) {
  const attributes: Record<string, string | number> = {};
  const gold = payload?.gold as { total?: number; sell?: number } | undefined;
  if (typeof gold?.total === "number") attributes["Gold Cost"] = gold.total;
  if (typeof gold?.sell === "number") attributes["Sell Value"] = gold.sell;
  const stats = payload?.stats && typeof payload.stats === "object" ? payload.stats as Record<string, unknown> : {};
  const labels: Record<string, string> = {
    FlatHPPoolMod: "Health", FlatMPPoolMod: "Mana", FlatPhysicalDamageMod: "Attack Damage",
    FlatMagicDamageMod: "Ability Power", FlatArmorMod: "Armor", FlatSpellBlockMod: "Magic Resist",
    PercentAttackSpeedMod: "Attack Speed", PercentMovementSpeedMod: "Movement Speed",
    PercentLifeStealMod: "Life Steal", PercentCritChanceMod: "Critical Chance",
  };
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === "number" && labels[key]) attributes[labels[key]] = value;
  }
  return attributes;
}

async function wowItems(query: string, locale: ApiLocale, limit: number): Promise<PlatformCatalogItem[]> {
  const prefix = locale === "ru_RU" ? "/ru" : "";
  const page = await getCatalogPage({ locale, product: "wow", type: "item", query, limit, includeTotal: false, timeoutMs: catalogLookupTimeoutMs });
  return page.data.map((item) => {
    const attributes: Record<string, string | number> = {};
    if (item.itemLevel !== undefined) attributes["Item Level"] = item.itemLevel;
    if (item.quality !== undefined) attributes.Quality = item.quality;
    if (item.buildId !== undefined) attributes["Build ID"] = item.buildId;
    for (const highlight of item.highlights ?? []) attributes[highlight.key] = highlight.value;
    return {
      id: `wow:${item.id}`, gameId: "wow", kind: "items", entityType: item.type,
      name: item.name || `Item #${item.externalId}`,
      description: compactText(item.description, `World of Warcraft item · ID ${item.externalId}`),
      iconUrl: item.iconUrl, href: `${prefix}/database/${item.type}/${item.id}/${item.slug || item.externalId}`,
      meta: ["World of Warcraft", item.itemLevel ? `Item level ${item.itemLevel}` : `ID ${item.externalId}`],
      attributes,
    };
  });
}

async function genshinItems(kind: ComparisonKind, query: string, locale: ApiLocale, limit: number): Promise<PlatformCatalogItem[]> {
  const prefix = locale === "ru_RU" ? "/ru" : "";
  const params = new URLSearchParams({ locale, q: query, limit: String(limit) });
  if (kind === "weapons") {
    const page = await request<RemotePage<GenshinWeapon>>(`/genshin-impact/v1/weapons?${params}`);
    return page.data.map((item) => ({
      id: `genshin:weapon:${item.id}`, gameId: "genshin", kind: "weapons", entityType: "weapon",
      name: item.name, description: compactText(item.description, item.passiveName || "Genshin Impact weapon"),
      iconUrl: item.iconUrl, href: `${prefix}/genshin/weapons/${item.slug}`,
      meta: ["Genshin Impact", `${item.rarity}★ ${item.weaponType}`],
      attributes: {
        Rarity: item.rarity,
        ...(item.baseAttack !== undefined ? { "Base Attack": item.baseAttack } : {}),
        ...(item.secondaryStat ? { "Secondary Stat": item.secondaryStat } : {}),
        ...(item.secondaryStatValue !== undefined ? { "Secondary Value": item.secondaryStatValue } : {}),
      },
    }));
  }
  const page = await request<RemotePage<GenshinArtifact>>(`/genshin-impact/v1/artifact-sets?${params}`);
  return page.data.map((item) => ({
    id: `genshin:artifact:${item.id}`, gameId: "genshin", kind: "artifact-sets", entityType: "artifact-set",
    name: item.name, description: compactText(item.fourPieceBonus, item.twoPieceBonus || "Genshin Impact artifact set"),
    iconUrl: item.iconUrl, href: `${prefix}/genshin/artifacts/${item.slug}`,
    meta: ["Genshin Impact", `${item.minRarity}–${item.maxRarity}★ Artifact Set`],
    attributes: { "Minimum Rarity": item.minRarity, "Maximum Rarity": item.maxRarity, "Piece Count": item.pieceCount ?? 0 },
  }));
}

async function leagueItems(kind: ComparisonKind, query: string, locale: ApiLocale, limit: number): Promise<PlatformCatalogItem[]> {
  const prefix = locale === "ru_RU" ? "/ru" : "";
  const category = kind === "runes" ? "runes" : "items";
  const params = new URLSearchParams({ locale, q: query, limit: String(limit) });
  const page = await request<RemotePage<LeagueEntry>>(`/league-of-legends/v1/content/${category}?${params}`);
  return page.data.map((item) => ({
    id: `league:${category}:${item.id}`, gameId: "league", kind, entityType: category === "items" ? "item" : "rune",
    name: item.name, description: compactText(item.description, `League of Legends ${category.slice(0, -1)}`),
    iconUrl: item.iconUrl, href: `${prefix}/league-of-legends/content/${category}`,
    meta: ["League of Legends", ...(item.tags?.slice(0, 2) ?? [category === "items" ? "Item" : "Rune"])],
    attributes: { "Catalog ID": item.externalKey, ...leagueAttributes(item.sourcePayload) },
  }));
}

export async function searchComparisonItems(input: {
  gameId: CatalogGameId; kind: ComparisonKind; query: string; locale: ApiLocale; limit?: number;
}): Promise<CatalogQueryResult> {
  const game = catalogGames.find((candidate) => candidate.id === input.gameId);
  if (!game?.available || !game.kinds.some((kind) => kind.id === input.kind)) {
    return { items: [], unavailableGames: [input.gameId] };
  }
  try {
    const limit = Math.min(Math.max(input.limit ?? 18, 1), 30);
    const items = input.gameId === "wow"
      ? await wowItems(input.query, input.locale, limit)
      : input.gameId === "genshin"
        ? await genshinItems(input.kind, input.query, input.locale, limit)
        : await leagueItems(input.kind, input.query, input.locale, limit);
    return { items, unavailableGames: [] };
  } catch (error) {
    console.error(`database catalog unavailable for ${input.gameId}/${input.kind}`, error);
    return { items: [], unavailableGames: [input.gameId] };
  }
}

async function genshinCharacters(query: string, locale: ApiLocale, limit: number): Promise<PlatformCatalogItem[]> {
  const prefix = locale === "ru_RU" ? "/ru" : "";
  const params = new URLSearchParams({ locale, q: query, limit: String(limit) });
  const page = await request<RemotePage<GenshinCharacter>>(`/genshin-impact/v1/characters?${params}`);
  return page.data.map((item) => ({
    id: `genshin:character:${item.id}`, gameId: "genshin", kind: "characters", entityType: "character",
    name: item.name, description: compactText(item.title, "Genshin Impact character"), iconUrl: item.iconUrl,
    href: `${prefix}/genshin/characters/${item.slug}`, meta: ["Genshin Impact", `${item.rarity}★ ${item.element} · ${item.weaponType}`],
    attributes: { Rarity: item.rarity, Element: item.element, "Weapon Type": item.weaponType },
  }));
}

async function leagueChampions(query: string, locale: ApiLocale, limit: number): Promise<PlatformCatalogItem[]> {
  const prefix = locale === "ru_RU" ? "/ru" : "";
  const params = new URLSearchParams({ locale, q: query, limit: String(limit) });
  const page = await request<RemotePage<LeagueChampion>>(`/league-of-legends/v1/champions?${params}`);
  return page.data.map((item) => ({
    id: `league:champion:${item.id}`, gameId: "league", kind: "characters", entityType: "champion",
    name: item.name, description: compactText(item.title, "League of Legends champion"), iconUrl: item.assets?.icon,
    href: `${prefix}/league-of-legends/champions/${item.slug}`, meta: ["League of Legends", ...(item.tags ?? ["Champion"])],
    attributes: { Roles: (item.tags ?? []).join(", ") },
  }));
}

async function searchOneGame(gameId: CatalogGameId, kind: SearchKind, query: string, locale: ApiLocale, limit: number) {
  if (gameId === "diablo") throw new Error("Diablo catalog is not available");
  if (gameId === "wow") {
    const prefix = locale === "ru_RU" ? "/ru" : "";
    if (kind === "characters") return [];
    if (kind === "items") return wowItems(query, locale, limit);
    const page = await getCatalogPage({ locale, product: "wow", query, limit, includeTotal: false, timeoutMs: catalogLookupTimeoutMs });
    return page.data.map((item): PlatformCatalogItem => ({
      id: `wow:${item.id}`, gameId: "wow", kind: item.type === "item" ? "items" : "entities", entityType: item.type,
      name: item.name || `${item.type} #${item.externalId}`, description: compactText(item.description, `World of Warcraft ${item.type}`),
      iconUrl: item.iconUrl, href: `${prefix}/database/${item.type}/${item.id}/${item.slug || item.externalId}`,
      meta: ["World of Warcraft", item.type.replaceAll("_", " ")], attributes: {},
    }));
  }
  if (gameId === "genshin") {
    if (kind === "characters") return genshinCharacters(query, locale, limit);
    if (kind === "items") {
      const [weapons, artifacts] = await Promise.all([genshinItems("weapons", query, locale, limit), genshinItems("artifact-sets", query, locale, limit)]);
      return [...weapons, ...artifacts].slice(0, limit);
    }
    const [characters, weapons, artifacts] = await Promise.all([
      genshinCharacters(query, locale, limit), genshinItems("weapons", query, locale, limit), genshinItems("artifact-sets", query, locale, limit),
    ]);
    return [...characters, ...weapons, ...artifacts].slice(0, limit);
  }
  if (kind === "characters") return leagueChampions(query, locale, limit);
  if (kind === "items") return leagueItems("items", query, locale, limit);
  const [champions, items, runes] = await Promise.all([
    leagueChampions(query, locale, limit), leagueItems("items", query, locale, limit), leagueItems("runes", query, locale, limit),
  ]);
  return [...champions, ...items, ...runes].slice(0, limit);
}

export async function searchGlobalCatalog(input: {
  games: CatalogGameId[]; kind: SearchKind; query: string; locale: ApiLocale; limitPerGame?: number;
}): Promise<CatalogQueryResult> {
  const requested = input.games.length ? input.games : catalogGames.filter((game) => game.available).map((game) => game.id);
  const results = await Promise.all(requested.map((gameId) => searchCatalogGame({ ...input, gameId })));
  return {
    items: results.flatMap((result) => result.items),
    unavailableGames: results.flatMap((result) => result.unavailableGames),
  };
}

export async function searchCatalogGame(input: {
  gameId: CatalogGameId; kind: SearchKind; query: string; locale: ApiLocale; limitPerGame?: number;
}): Promise<CatalogQueryResult> {
  try {
    const items = await searchOneGame(input.gameId, input.kind, input.query, input.locale, input.limitPerGame ?? 12);
    return { items, unavailableGames: [] };
  } catch {
    return { items: [], unavailableGames: [input.gameId] };
  }
}
