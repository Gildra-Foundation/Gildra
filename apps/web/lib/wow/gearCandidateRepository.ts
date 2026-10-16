import "server-only";
import { contentManifest } from "@gildra/game-data";
import { getCatalogEntity, getCatalogPage, type CatalogRecord } from "@/lib/api/client";
import { buildGearCandidatePool, gearCandidateCatalogQuery, type CatalogGearEntity, type GearCandidateContext } from "./gearCandidates";

type ManifestEntry = { season?: string | null; status?: string; activity?: string; names?: { en?: string | null; ru?: string | null }; build?: string | null };

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

export async function gearEntityDetails(records: CatalogRecord[], locale: "en_US" | "ru_RU", includeSources = true, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const output: CatalogGearEntity[] = [];
  for (let offset = 0; offset < records.length; offset += 8) {
    signal?.throwIfAborted();
    const group = await Promise.all(records.slice(offset, offset + 8).map(async (record) => {
      const localized = await getCatalogEntity(record.id, locale, "", true, signal);
      signal?.throwIfAborted();
      const english = locale === "en_US" || !includeSources ? localized : await getCatalogEntity(record.id, "en_US", "", true, signal);
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

export async function lookupGearRecords(ids: number[], locale: "en_US" | "ru_RU", classId?: number, maxRequiredLevel?: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const unique = [...new Set(ids)];
  const result: CatalogRecord[] = [];
  for (let offset = 0; offset < unique.length; offset += 400) {
    signal?.throwIfAborted();
    const pages = await Promise.all(Array.from({length: Math.min(4, Math.ceil((unique.length-offset)/100))}, (_, group) =>
      getCatalogPage({ externalIds: unique.slice(offset+group*100, offset+(group+1)*100), locale, type: "item", limit: 100, includeTotal: false, itemClassId: classId, maxRequiredLevel, fresh: true, signal })));
    for (const page of pages) result.push(...page.data);
  }
  return result;
}
export async function lookupGearEntities(ids: number[], locale: "en_US" | "ru_RU", signal?: AbortSignal) {
  return gearEntityDetails(await lookupGearRecords(ids, locale, undefined, undefined, signal), locale, true, signal);
}
