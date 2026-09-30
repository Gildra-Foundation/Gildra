import "server-only";
import { cookies } from "next/headers";
import type { components } from "./schema";

export type AnalyticsOverview = components["schemas"]["AnalyticsOverview"];
export type GameEntity = components["schemas"]["GameEntity"];
export type CatalogRecord = components["schemas"]["GameEntitySummary"] & {
  tooltip?: components["schemas"]["GameTooltip"];
};
export type CatalogCategory = components["schemas"]["GameCategory"];
export type CatalogEntityType = components["schemas"]["GameEntityTypeSummary"];
/**
 * Product rows are intentionally small in the public API.  The library can
 * optionally decorate them with a freshness state when the publication
 * monitor has checked that edition; older servers simply omit these fields.
 */
export type CatalogProduct = components["schemas"]["GameProduct"] & {
  freshness?: "fresh" | "stale" | "empty" | "refreshing" | "failed" | "unknown";
  freshnessReason?: string;
};
export type LibraryDataset = components["schemas"]["LibraryDataset"];
export type CatalogCoverage = components["schemas"]["GameFieldCoverage"];
export type CatalogRelationship = components["schemas"]["GameEntityRelationship"];
export type CatalogEntityQuality = components["schemas"]["GameEntityQuality"];
export type CatalogEntityVersion = components["schemas"]["GameEntityVersion"];
export type CatalogEntityComparison = components["schemas"]["GameEntityComparison"];
export type CatalogSitemapEntry = components["schemas"]["GameSitemapEntry"];
export type CatalogPage = {
  data: CatalogRecord[];
  pagination: { hasMore: boolean; nextCursor?: string; total?: number };
};

const emptyOverview = (hours: number): AnalyticsOverview => ({
  hours,
  events: 0,
  uniqueUsers: 0,
  activeSubscriptions: 0,
  series: [],
});

function apiURL() {
  return process.env.API_INTERNAL_URL ?? "http://api:8080";
}

async function catalogFetchOptions(revalidate: number, tags: string[] = []) {
  const session = (await cookies()).get("gildra_admin_session")?.value;
  if (session) {
    return {
      cache: "no-store" as const,
      headers: { Cookie: `gildra_admin_session=${encodeURIComponent(session)}` },
    };
  }
  return { cache: "force-cache" as const, next: { revalidate, tags } };
}

type DevelopmentCatalogCacheEntry = { expiresAt: number; bytes: number; value: unknown };
type DevelopmentCatalogCacheState = { entries: Map<string, DevelopmentCatalogCacheEntry>; bytes: number };
type CatalogGlobal = typeof globalThis & { __gildraDevelopmentCatalogCache?: DevelopmentCatalogCacheState };
const catalogGlobal = globalThis as CatalogGlobal;
const developmentCatalogCache = catalogGlobal.__gildraDevelopmentCatalogCache ??= { entries: new Map(), bytes: 0 };
const developmentCatalogCacheMaxEntries = 32;
const developmentCatalogCacheMaxBytes = 4 * 1024 * 1024;

function readDevelopmentCatalogCache<T>(key: string): T | undefined {
  const entry = developmentCatalogCache.entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    developmentCatalogCache.entries.delete(key);
    developmentCatalogCache.bytes -= entry.bytes;
    return undefined;
  }
  // Refresh insertion order so the least recently used response is evicted first.
  developmentCatalogCache.entries.delete(key);
  developmentCatalogCache.entries.set(key, entry);
  return entry.value as T;
}

function writeDevelopmentCatalogCache(key: string, value: unknown, ttlSeconds: number) {
  if (ttlSeconds <= 0) return;
  const encoded = JSON.stringify(value);
  if (!encoded) return;
  const bytes = encoded.length * 2;
  if (bytes > developmentCatalogCacheMaxBytes) return;

  const previous = developmentCatalogCache.entries.get(key);
  if (previous) {
    developmentCatalogCache.entries.delete(key);
    developmentCatalogCache.bytes -= previous.bytes;
  }
  while (developmentCatalogCache.entries.size >= developmentCatalogCacheMaxEntries
    || developmentCatalogCache.bytes + bytes > developmentCatalogCacheMaxBytes) {
    const oldestKey = developmentCatalogCache.entries.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    const oldest = developmentCatalogCache.entries.get(oldestKey);
    if (oldest) developmentCatalogCache.bytes -= oldest.bytes;
    developmentCatalogCache.entries.delete(oldestKey);
  }
  developmentCatalogCache.entries.set(key, { value, bytes, expiresAt: Date.now() + ttlSeconds * 1000 });
  developmentCatalogCache.bytes += bytes;
}

async function catalogRequest<T>(path: string, revalidate = 300, cache: RequestCache = "force-cache", timeoutMs = 15_000): Promise<T> {
  const cacheOptions = cache === "no-store"
    ? { cache: "no-store" as const }
    : await catalogFetchOptions(revalidate, ["catalog"]);
  const useDevelopmentCache = process.env.NODE_ENV === "development"
    && cache === "force-cache"
    && cacheOptions.cache === "force-cache"
    && path.startsWith("/v1/game/");
  const cacheKey = `${apiURL()}${path}`;
  if (useDevelopmentCache) {
    const cached = readDevelopmentCatalogCache<T>(cacheKey);
    if (cached !== undefined) return cached;
  }

  const response = await fetch(`${apiURL()}${path}`, {
    ...cacheOptions,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    let message = `Catalog request failed (${response.status})`;
    try {
      const problem = await response.json() as { message?: string; detail?: string };
      message = problem.detail ?? problem.message ?? message;
    } catch {
      // Keep the status-based recovery message when the upstream body is not JSON.
    }
    throw new Error(message);
  }
  const value = await response.json() as T;
  if (useDevelopmentCache && response.status === 200
    && /(?:^|,)\s*public(?:\s|,|$)/i.test(response.headers.get("cache-control") ?? "")) {
    writeDevelopmentCatalogCache(cacheKey, value, Math.min(revalidate, 60));
  }
  return value;
}

export async function getAnalyticsOverview(hours = 24): Promise<AnalyticsOverview> {
  try {
    const response = await fetch(`${apiURL()}/v1/analytics/overview?hours=${hours}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return emptyOverview(hours);
    return await response.json() as AnalyticsOverview;
  } catch {
    return emptyOverview(hours);
  }
}

export async function getCatalogPreview(locale: "en_US" | "ru_RU"): Promise<CatalogRecord[]> {
  const requests = ["item", "spell"].map(async (type) => {
    const query = new URLSearchParams({ product: "wow", type, locale, limit: "6", includeTotal: "false" });
    const page = await catalogRequest<components["schemas"]["GameEntitySummaryPage"]>(`/v1/game/entity-summaries?${query}`);
    return page.data;
  });
  return (await Promise.all(requests)).flat();
}

export type CatalogPageParams = {
  locale: "en_US" | "ru_RU";
  product?: string;
  dataset?: string;
  type?: string;
  query?: string;
  cursor?: string;
  category?: string;
  facets?: string[];
  minItemLevel?: number;
  maxItemLevel?: number;
  minRequiredLevel?: number;
  maxRequiredLevel?: number;
  limit?: number;
  includeTotal?: boolean;
  itemClassId?: number;
  fresh?: boolean;
  timeoutMs?: number;
};

export async function getCatalogPage({
  locale,
  product = "wow",
  dataset = "",
  type = "",
  query = "",
  cursor = "",
  category = "",
  facets = [],
  minItemLevel,
  maxItemLevel,
  minRequiredLevel,
  maxRequiredLevel,
  limit = 24,
  // Full counts can require scanning the localization catalog. Keep paged
  // reads fast by default; callers that display an exact total opt in.
  includeTotal = false,
  itemClassId,
  fresh = false,
  timeoutMs = 15_000,
}: CatalogPageParams): Promise<CatalogPage> {
  const params = new URLSearchParams({ product, locale, limit: String(limit), includeTotal: String(includeTotal) });
  if (dataset) params.set("dataset", dataset);
  if (type) params.set("type", type);
  if (query) params.set("q", query);
  if (cursor) params.set("cursor", cursor);
  if (category) params.set("category", category);
  for (const facet of facets) {
    if (facet) params.append("facet", facet);
  }
  if (minItemLevel !== undefined) params.set("minItemLevel", String(minItemLevel));
  if (maxItemLevel !== undefined) params.set("maxItemLevel", String(maxItemLevel));
  if (minRequiredLevel !== undefined) params.set("minRequiredLevel", String(minRequiredLevel));
  if (maxRequiredLevel !== undefined) params.set("maxRequiredLevel", String(maxRequiredLevel));
  if (itemClassId !== undefined) params.set("itemClassId", String(itemClassId));
  const page = await catalogRequest<components["schemas"]["GameEntitySummaryPage"]>(`/v1/game/entity-summaries?${params}`, fresh ? 0 : 300, fresh ? "no-store" : "force-cache", timeoutMs);
  return { data: page.data, pagination: page.pagination };
}

export async function getCatalogTotal(params: CatalogPageParams): Promise<number | undefined> {
  const page = await getCatalogPage({ ...params, limit: 1, includeTotal: true });
  return page.pagination.total;
}

export async function getCatalogCategories(
  locale: "en_US" | "ru_RU",
  type: string,
  product = "wow",
): Promise<CatalogCategory[]> {
  if (!type) return [];
  const params = new URLSearchParams({ product, locale, type });
  const page = await catalogRequest<{ data: CatalogCategory[] }>(`/v1/game/categories?${params}`);
  return page.data;
}

export async function getCatalogEntityTypes(
  locale: "en_US" | "ru_RU",
  product = "wow",
): Promise<CatalogEntityType[]> {
  const params = new URLSearchParams({ product, locale });
  const page = await catalogRequest<{ data: CatalogEntityType[] }>(`/v1/game/entity-types?${params}`);
  return page.data;
}

export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  const page = await catalogRequest<{ data: CatalogProduct[] }>("/v1/game/products");
  return page.data;
}

export async function getLibraryDatasets(
  locale: "en_US" | "ru_RU",
  product = "wow",
): Promise<LibraryDataset[]> {
  const params = new URLSearchParams({ product, locale });
  const page = await catalogRequest<{ data: LibraryDataset[] }>(`/v1/library/datasets?${params}`);
  return page.data;
}

/** `fresh` bypasses the ISR cache (talent calculator reads live catalog data). */
export async function getCatalogEntity(id: string, locale: "en_US" | "ru_RU", dataset = "", fresh = false): Promise<GameEntity | null> {
  const params = new URLSearchParams({ locale });
  if (dataset) params.set("dataset", dataset);
  const response = await fetch(
    `${apiURL()}/v1/game/entities/${encodeURIComponent(id)}?${params}`,
    {
      ...(fresh ? { cache: "no-store" as const } : await catalogFetchOptions(300, [`catalog-entity-${id}`])),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Catalog entity request failed (${response.status})`);
  return await response.json() as GameEntity;
}


export async function getCatalogCoverage(
  locale: "en_US" | "ru_RU",
  product = "wow",
  type = "",
): Promise<CatalogCoverage[]> {
  const params = new URLSearchParams({ product, locale });
  if (type) params.set("type", type);
  const page = await catalogRequest<{ data: CatalogCoverage[] }>(`/v1/game/coverage?${params}`);
  return page.data;
}

export async function getCatalogRelationships(
  id: string,
  locale: "en_US" | "ru_RU",
  limit = 50,
): Promise<CatalogRelationship[]> {
  const params = new URLSearchParams({ locale, direction: "both", limit: String(limit) });
  const page = await catalogRequest<components["schemas"]["GameEntityRelationshipPage"]>(
    `/v1/game/entities/${encodeURIComponent(id)}/relationships?${params}`,
  );
  return page.data;
}

export async function getCatalogEntityQuality(id: string, locale: "en_US" | "ru_RU"): Promise<CatalogEntityQuality | null> {
  const params = new URLSearchParams({ locale });
  try {
    return await catalogRequest<CatalogEntityQuality>(`/v1/game/entities/${encodeURIComponent(id)}/quality?${params}`);
  } catch {
    return null;
  }
}

export async function getCatalogEntityVersions(id: string, locale: "en_US" | "ru_RU"): Promise<CatalogEntityVersion[]> {
  const params = new URLSearchParams({ locale, limit: "20" });
  try {
    const page = await catalogRequest<{ data: CatalogEntityVersion[] }>(`/v1/game/entities/${encodeURIComponent(id)}/versions?${params}`);
    return page.data;
  } catch {
    return [];
  }
}

export async function getCatalogEntityComparison(
  id: string,
  locale: "en_US" | "ru_RU",
  fromBuildId?: number,
  toBuildId?: number,
): Promise<CatalogEntityComparison | null> {
  const params = new URLSearchParams({ locale });
  if (fromBuildId !== undefined && toBuildId !== undefined) {
    params.set("fromBuildId", String(fromBuildId));
    params.set("toBuildId", String(toBuildId));
  }
  try {
    return await catalogRequest<CatalogEntityComparison>(`/v1/game/entities/${encodeURIComponent(id)}/comparison?${params}`);
  } catch {
    return null;
  }
}

export async function getCatalogSitemapEntries(
  type: string,
  shard = "",
  product = "wow",
): Promise<CatalogSitemapEntry[]> {
  const params = new URLSearchParams({ product, type });
  if (shard) params.set("shard", shard);
  // Shards can exceed Next's 2 MB Data Cache item limit. The XML response is
  // cached at the route/CDN layer, so avoid a second oversized JSON cache.
  const page = await catalogRequest<{ data: CatalogSitemapEntry[] }>(`/v1/game/sitemap-entries?${params}`, 3600, "no-store");
  return page.data;
}
