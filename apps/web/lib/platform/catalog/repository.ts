import { catalogLocaleView } from "@/lib/catalogLocale";
import { entityTypeLabel } from "./entityTypeLabel";
import "server-only";
import { getCatalogPage, type CatalogPage } from "@/lib/api/client";
import { catalogIconUrl } from "@/lib/games/wow/assets";
import { libraryRecordPath } from "@/lib/library/recordPath";
import { libraryRecordViews } from "@/components/library/libraryRecordView";
import type { ApiLocale } from "@/lib/games/registry";
import {
  catalogGames,
  type CatalogGameId,
  type CatalogQueryResult,
  type ComparisonKind,
  type PlatformCatalogItem,
  type SearchKind,
} from "./types";
import { internalApiJson } from "@/lib/api/internal";

type RemotePage<T> = { data: T[]; pagination?: { hasMore?: boolean; nextCursor?: string } };
/** One page of a game's search: the records, and for WoW the catalog's total and the cursor of the next page. */
type SearchResultPage = Pick<CatalogQueryResult, "items" | "total" | "next">;
type WowPaging = { cursor?: string; includeTotal?: boolean };
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

// Unfiltered catalog text search ranks every locale and alias and takes
// 6–20 s on production (2026-10-12); a 3 s cut-off showed "temporarily
// unavailable" for most queries. Stopgap until the API query is indexed.
const catalogLookupTimeoutMs = 10_000;

function request<T>(path: string): Promise<T> {
  const query = new URLSearchParams(path.split("?", 2)[1] ?? "");
  const cacheOptions = query.has("q") && query.get("q") === ""
    ? { cache: "force-cache" as const, next: { revalidate: 60 } }
    : { cache: "no-store" as const };
  return internalApiJson<T>(path, { label: "catalog", timeoutMs: catalogLookupTimeoutMs, ...cacheOptions });
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

/** What a search page needs of the catalog's paging: the total it counted and the cursor after this page. */
function wowPaging(page: CatalogPage): Pick<CatalogQueryResult, "total" | "next"> {
  return {
    ...(typeof page.pagination.total === "number" ? { total: page.pagination.total } : {}),
    ...(page.pagination.hasMore && page.pagination.nextCursor ? { next: page.pagination.nextCursor } : {}),
  };
}

/** Search rows leave out the records the library lists hide (the library's own rule, not a copy of it). */
function withoutInternalRecords(page: CatalogPage, locale: ApiLocale): CatalogPage {
  const shown = new Set(libraryRecordViews(page.data, locale === "ru_RU" ? "ru" : "en").map((view) => view.id));
  return { ...page, data: page.data.filter((item) => shown.has(item.id)) };
}

async function wowItems(query: string, locale: ApiLocale, limit: number): Promise<PlatformCatalogItem[]> {
  const page = await getCatalogPage({ locale, product: "wow", type: "item", query, limit, includeTotal: false, timeoutMs: catalogLookupTimeoutMs });
  return wowItemRows(page, locale);
}

function wowItemRows(page: CatalogPage, locale: ApiLocale): PlatformCatalogItem[] {
  // An English-only record keeps its English name (game names stay English) instead of "Spell #id".
  page.data = page.data.map((item) => { const view = catalogLocaleView(item, locale === "ru_RU" ? "ru" : "en"); return { ...view, name: view.name || item.name }; });
  return page.data.map((item) => {
    const attributes: Record<string, string | number> = {};
    if (item.itemLevel !== undefined) attributes["Item Level"] = item.itemLevel;
    if (item.quality !== undefined) attributes.Quality = item.quality;
    if (item.buildId !== undefined) attributes["Build ID"] = item.buildId;
    for (const highlight of item.highlights ?? []) attributes[highlight.key] = highlight.value;
    return {
      id: `wow:${item.id}`, gameId: "wow", kind: "items", entityType: item.type,
      name: item.name || `${locale === "ru_RU" ? "Предмет" : "Item"} #${item.externalId}`,
      // No synthetic English filler: the search UI labels the record type itself.
      description: compactText(item.description, ""),
      iconUrl: catalogIconUrl(item, "wow"), href: libraryRecordPath(locale === "ru_RU" ? "ru" : "en", item.type, item.id, item.slug || item.externalId, item.product),
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

async function searchOneGame(gameId: CatalogGameId, kind: SearchKind, query: string, locale: ApiLocale, limit: number, paging: WowPaging = {}): Promise<PlatformCatalogItem[] | SearchResultPage> {
  if (gameId === "diablo") throw new Error("Diablo catalog is not available");
  if (gameId === "wow") {
    if (kind === "characters") return [];
    const found = await getCatalogPage({
      locale, product: "wow", ...(kind === "items" ? { type: "item" } : {}), query, limit,
      cursor: paging.cursor, includeTotal: paging.includeTotal ?? false, timeoutMs: catalogLookupTimeoutMs,
    });
    const page = withoutInternalRecords(found, locale);
    if (kind === "items") return { items: wowItemRows(page, locale), ...wowPaging(found) };
    // An English-only record keeps its English name (game names stay English) instead of "Spell #id".
    page.data = page.data.map((item) => { const view = catalogLocaleView(item, locale === "ru_RU" ? "ru" : "en"); return { ...view, name: view.name || item.name }; });
    return {
      items: page.data.map((item): PlatformCatalogItem => ({
        id: `wow:${item.id}`, gameId: "wow", kind: item.type === "item" ? "items" : "entities", entityType: item.type,
        name: item.name || `${entityTypeLabel(item.type, locale === "ru_RU" ? "ru" : "en")} #${item.externalId}`, description: compactText(item.description, ""),
        iconUrl: catalogIconUrl(item, "wow"), href: libraryRecordPath(locale === "ru_RU" ? "ru" : "en", item.type, item.id, item.slug || item.externalId, item.product),
        meta: ["World of Warcraft"],
        attributes: {
          ...(item.quality !== undefined ? { Quality: item.quality } : {}), ...(item.itemLevel ? { "Item Level": item.itemLevel } : {}),
          // The facts the summary carries (slot, required level, spell school, cast time), under the catalog's own keys like the item rows above.
          ...Object.fromEntries((item.highlights ?? []).map((highlight) => [highlight.key, highlight.value])),
        },
      })),
      ...wowPaging(found),
    };
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

/**
 * One game's search results. For WoW `cursor` asks for a later page and
 * `includeTotal` for the catalog's count of every match; the answer then
 * carries `total` and, while there are more records, `next`.
 */
export async function searchCatalogGame(input: {
  gameId: CatalogGameId; kind: SearchKind; query: string; locale: ApiLocale; limitPerGame?: number; cursor?: string; includeTotal?: boolean;
}): Promise<CatalogQueryResult> {
  try {
    const found = await searchOneGame(input.gameId, input.kind, input.query, input.locale, input.limitPerGame ?? 12, { cursor: input.cursor, includeTotal: input.includeTotal });
    return Array.isArray(found) ? { items: found, unavailableGames: [] } : { ...found, unavailableGames: [] };
  } catch {
    return { items: [], unavailableGames: [input.gameId] };
  }
}
