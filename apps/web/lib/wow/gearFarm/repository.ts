import "server-only";
import { getCatalogPage, getCatalogEntity, type CatalogRelationship } from "@/lib/api/client";
import { apiInternalUrl } from "@/lib/env";
import type { CatalogGearEntity } from "../gearCandidates";
import type { FarmRule } from "./rules";
export type FarmLoot = {
  entity: CatalogGearEntity;
  encounterId: number;
  encounterName: string;
  difficultyMask: unknown;
};
async function relationships(id: string, relation: string, signal: AbortSignal, locale = "en_US") {
  const all: CatalogRelationship[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    signal.throwIfAborted();
    const query = new URLSearchParams({
      locale,
      direction: "incoming",
      relation,
      limit: "100",
      ...(cursor ? {
        cursor
      } : {})
    });
    const response = await fetch(`${apiInternalUrl()}/v1/game/entities/${encodeURIComponent(id)}/relationships?${query}`, {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)])
    });
    if (!response.ok) throw new Error("farm_sources_unavailable");
    const result = (await response.json()) as {
      data: CatalogRelationship[];
      pagination: {
        hasMore: boolean;
        nextCursor?: string;
      };
    };
    if (!Array.isArray(result.data)) throw new Error("invalid_farm_sources");
    all.push(...result.data);
    if (!result.pagination.hasMore) return all;
    if (!result.pagination.nextCursor || result.pagination.nextCursor === cursor) throw new Error("invalid_catalog_cursor");
    cursor = result.pagination.nextCursor;
  }
  throw new Error("farm_source_limit_exceeded");
}
export async function getFarmLoot(rule: FarmRule, locale: "ru" | "en", signal: AbortSignal) {
  const instances = await getCatalogPage({
    locale: "en_US",
    type: "instance",
    query: rule.name,
    limit: 20,
    fresh: true
  });
  signal.throwIfAborted();
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const instance = instances.data.find(e => normalize(e.name) === normalize(rule.name));
  if (!instance) return {
    instance: null,
    loot: [] as FarmLoot[]
  };
  const localized = locale === "ru" ? await getCatalogEntity(instance.id, "ru_RU", "", true) : instance;
  const encounters = (await relationships(instance.id, "belongs_to", signal, locale === "ru" ? "ru_RU" : "en_US")).filter(r => r.entity.type === "encounter");
  const sources: Array<{
    id: string;
    encounterId: number;
    encounterName: string;
    difficultyMask: unknown;
    buildId: number;
  }> = [];
  for (const encounter of encounters) {
    for (const row of await relationships(encounter.entity.id, "obtained_from", signal, locale === "ru" ? "ru_RU" : "en_US")) {
      if (row.entity.type !== "item" || row.attributes?.source_type !== "encounter" || row.attributes?.source_id !== encounter.entity.externalId || row.buildId !== encounter.buildId) continue;
      sources.push({
        id: row.entity.id,
        encounterId: encounter.entity.externalId,
        encounterName: encounter.entity.name,
        difficultyMask: row.attributes?.difficulty_mask,
        buildId: row.buildId
      });
    }
  }
  // A published relationship is the acquisition proof. Do not infer source
  // from a similarly named item or an ATT creature association.
  const ids = [...new Set(sources.map(s => s.id))];
  if (ids.length > 120) throw new Error("farm_source_limit_exceeded");
  const records = [];
  for (let offset = 0; offset < ids.length; offset += 8) {
    const batch = await Promise.all(ids.slice(offset, offset + 8).map(id => getCatalogEntity(id, locale === "ru" ? "ru_RU" : "en_US", "", true)));
    signal.throwIfAborted();
    records.push(...batch.filter((e): e is NonNullable<typeof e> => Boolean(e)));
  }
  const entities = new Map(records.map(e => [e.id, e as CatalogGearEntity]));
  return {
    instance: localized ?? instance,
    loot: sources.flatMap(s => {
      const entity = entities.get(s.id);
      return entity && entity.buildId === s.buildId ? [{
        entity,
        encounterId: s.encounterId,
        encounterName: s.encounterName,
        difficultyMask: s.difficultyMask
      }] : [];
    })
  };
}
