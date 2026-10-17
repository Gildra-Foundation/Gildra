import "server-only";
import { contentManifest } from "@gildra/game-data";
import { getCatalogEntity, getCatalogPage, type CatalogRecord } from "@/lib/api/client";
import { apiInternalUrl } from "@/lib/env";
import { buildGearCandidatePool, gearCandidateCatalogQuery, type CatalogGearEntity, type GearCandidateContext } from "./gearCandidates";

type ManifestEntry = { season?: string | null; status?: string; activity?: string; names?: { en?: string | null; ru?: string | null }; build?: string | null };

// Auction-only public catalog facts. Prices, ownership, native variants and
// eligibility decisions are never cached here. Match discovery's repair retry.
const auctionFactLifetime = 60_000;
type Fact<T> = { value: T | null; expiresAt: number };
const auctionRecords = new Map<string, Fact<CatalogRecord>>();
const auctionEntities = new Map<string, Fact<NonNullable<Awaited<ReturnType<typeof getCatalogEntity>>>>>();
function cachedFact<T>(cache: Map<string, Fact<T>>, key: string): T | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  cache.delete(key);
  if (entry.expiresAt <= Date.now()) return undefined;
  cache.set(key, entry);
  return structuredClone(entry.value);
}
function rememberFact<T>(cache: Map<string, Fact<T>>, key: string, value: T | null, capacity: number) {
  cache.delete(key);
  cache.set(key, { value: structuredClone(value), expiresAt: Date.now() + auctionFactLifetime });
  while (cache.size > capacity) cache.delete(cache.keys().next().value!);
}
async function catalogDetail(id: string, locale: "en_US" | "ru_RU", signal: AbortSignal | undefined, auctionCache: boolean) {
  signal?.throwIfAborted();
  const key = `${apiInternalUrl()}|${locale}|${id}`;
  const hit = auctionCache ? cachedFact(auctionEntities, key) : undefined;
  if (hit !== undefined) return hit;
  const entity = await getCatalogEntity(id, locale, "", true, signal);
  signal?.throwIfAborted();
  if (auctionCache) rememberFact(auctionEntities, key, entity, 512);
  return entity;
}

export function currentGearSeason() {
  const manifest = contentManifest as unknown as { editions: Array<ManifestEntry & { id?: string; patch?: string; sourceUrl?: string; verificationStatus?: string }>; instances: ManifestEntry[] };
  const retail = manifest.editions.find((entry) => entry.id === "wow:edition:retail" && entry.status === "live");
  if (!retail?.season || !retail.patch || !retail.sourceUrl || retail.verificationStatus !== "official") throw new Error("current_season_unverified");
  const activities = manifest.instances.filter((entry) => entry.season === retail.season && entry.status === "live");
  return {
    id: retail.season, patch: retail.patch, expansionId: 11, build: activities.find((entry) => entry.build)?.build ?? undefined,
    sourceUrl: retail.sourceUrl,
    activityNames: activities.flatMap((entry) => [entry.names?.en, entry.names?.ru].filter((value): value is string => Boolean(value))),
  };
}

export async function gearEntityDetails(records: CatalogRecord[], locale: "en_US" | "ru_RU", includeSources = true, signal?: AbortSignal, auctionCache = false) {
  signal?.throwIfAborted();
  const output: CatalogGearEntity[] = [];
  for (let offset = 0; offset < records.length; offset += 8) {
    signal?.throwIfAborted();
    const group = await Promise.all(records.slice(offset, offset + 8).map(async (record) => {
      const localized = await catalogDetail(record.id, locale, signal, auctionCache);
      signal?.throwIfAborted();
      const english = locale === "en_US" || !includeSources ? localized : await catalogDetail(record.id, "en_US", signal, auctionCache);
      if (!localized) return null;
      const localizedBlocks = localized.tooltip?.blocks ?? [];
      const englishAcquisition = english?.tooltip?.blocks?.filter((entry) => entry.type === "acquisition") ?? [];
      return { ...localized, tooltip: { ...localized.tooltip, blocks: [...localizedBlocks.filter((entry) => entry.type !== "acquisition"), ...englishAcquisition] } } as CatalogGearEntity;
    }));
    output.push(...group.filter((entity): entity is CatalogGearEntity => Boolean(entity)));
  }
  return output;
}

export async function getGearCandidatesForEquippedItem(input: {
  itemId: number; itemName: string; itemLevel: number; slotType: string; classId: number; specId: number; characterLevel: number; raceId?: number; faction?: string; locale?: "en" | "ru";
}) {
  const locale = input.locale === "en" ? "en_US" : "ru_RU";
  const context: GearCandidateContext = {
    classId: input.classId, specId: input.specId, characterLevel: input.characterLevel, raceId: input.raceId, faction: input.faction, slotType: input.slotType,
    currentItemLevel: input.itemLevel, anchorItemClassId: -1, anchorItemSubclassId: -1,
    season: currentGearSeason(),
  };
  const records: CatalogRecord[] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
    const page = await getCatalogPage({ ...gearCandidateCatalogQuery(input.slotType, input.itemLevel), locale, cursor });
    records.push(...page.data);
    if (!page.pagination.hasMore) break;
    cursor = page.pagination.nextCursor;
    if (!cursor) throw new Error("invalid_catalog_cursor");
  }
  const pool = buildGearCandidatePool(await gearEntityDetails(records, locale), context);
  return { ...pool, context, anchor: { itemId: input.itemId, name: input.itemName, itemLevel: input.itemLevel }, catalogCount: records.length };

}

export async function lookupGearRecords(ids: number[], locale: "en_US" | "ru_RU", classId?: number, maxRequiredLevel?: number, signal?: AbortSignal, auctionCache = false) {
  signal?.throwIfAborted();
  const unique = [...new Set(ids)];
  if (auctionCache) {
    const prefix = `${apiInternalUrl()}|${locale}|${classId ?? ""}|${maxRequiredLevel ?? ""}|`;
    const known = new Map<number, CatalogRecord | null>();
    const missing = unique.filter(id => {
      const hit = cachedFact(auctionRecords, prefix + id);
      if (hit === undefined) return true;
      known.set(id, hit); return false;
    });
    if (missing.length) {
      const loaded = await lookupGearRecords(missing, locale, classId, maxRequiredLevel, signal);
      signal?.throwIfAborted();
      const found = new Map(loaded.map(record => [record.externalId, record]));
      for (const id of missing) {
        const value = found.get(id) ?? null;
        rememberFact(auctionRecords, prefix + id, value, 12_000); known.set(id, value);
      }
    }
    return unique.flatMap(id => known.get(id) ? [known.get(id)!] : []);
  }
  const result: CatalogRecord[] = [];
  for (let offset = 0; offset < unique.length; offset += 400) {
    signal?.throwIfAborted();
    const pages = await Promise.all(Array.from({length: Math.min(4, Math.ceil((unique.length-offset)/100))}, (_, group) =>
      getCatalogPage({ externalIds: unique.slice(offset+group*100, offset+(group+1)*100), locale, type: "item", limit: 100, includeTotal: false, itemClassId: classId, maxRequiredLevel, fresh: true, signal })));
    for (const page of pages) result.push(...page.data);
  }
  return result;
}
export async function lookupGearEntities(ids: number[], locale: "en_US" | "ru_RU", signal?: AbortSignal,
  { includeSources = true, auctionCache = false }: { includeSources?: boolean; auctionCache?: boolean } = {}) {
  return gearEntityDetails(await lookupGearRecords(ids, locale, undefined, undefined, signal, auctionCache), locale, includeSources, signal, auctionCache);
}
