import "server-only";
import contentManifest from "@/data/wow/content-manifest.json";
import { getCatalogEntity, getCatalogPage, type CatalogRecord } from "@/lib/api/client";
import { buildGearCandidatePool, gearCandidateCatalogQuery, type CatalogGearEntity, type GearCandidateContext } from "./gearCandidates";

type ManifestEntry = { season?: string | null; status?: string; activity?: string; names?: { en?: string | null; ru?: string | null }; build?: string | null };

function currentSeason() {
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

async function details(records: CatalogRecord[], locale: "en_US" | "ru_RU") {
  const output: CatalogGearEntity[] = [];
  for (let offset = 0; offset < records.length; offset += 8) {
    const group = await Promise.all(records.slice(offset, offset + 8).map(async (record) => {
      const [localized, english] = await Promise.all([getCatalogEntity(record.id, locale, "", true), getCatalogEntity(record.id, "en_US", "", true)]);
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
  itemId: number; itemName: string; itemLevel: number; slotType: string; classId: number; specId: number; characterLevel: number; locale?: "en" | "ru";
}) {
  const locale = input.locale === "en" ? "en_US" : "ru_RU";
  const anchorPage = await getCatalogPage({ locale, product: "wow", type: "item", query: input.itemName, limit: 24, includeTotal: false, fresh: true });
  const anchorRecord = anchorPage.data.find((record) => record.externalId === input.itemId);
  if (!anchorRecord) throw new Error("equipped_item_not_in_catalog");
  const anchor = await getCatalogEntity(anchorRecord.id, locale, "", true) as CatalogGearEntity | null;
  if (!anchor) throw new Error("equipped_item_details_missing");
  const anchorRegistry = anchor.tooltip?.blocks?.find((entry) => entry.type === "item_registry") ?? {};
  const context: GearCandidateContext = {
    classId: input.classId, specId: input.specId, characterLevel: input.characterLevel, slotType: input.slotType,
    currentItemLevel: input.itemLevel, anchorItemClassId: Number(anchorRegistry.class_id ?? -1), anchorItemSubclassId: Number(anchorRegistry.subclass_id ?? -1),
    season: currentSeason(),
  };
  const page = await getCatalogPage({ ...gearCandidateCatalogQuery(input.slotType, input.itemLevel), locale });
  const pool = buildGearCandidatePool(await details(page.data, locale), context);
  return { ...pool, context, anchor: { itemId: input.itemId, entityId: anchor.id, name: anchor.name, itemLevel: input.itemLevel }, catalogCount: page.data.length };
}
