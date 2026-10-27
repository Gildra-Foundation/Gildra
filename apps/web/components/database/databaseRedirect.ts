import "server-only";
import { notFound, permanentRedirect } from "next/navigation";
import { catalogLocaleView } from "@/lib/catalogLocale";
import { getCatalogEntity } from "@/lib/api/client";
import { LIBRARY_TYPE_DATASET, libraryRecordPath } from "@/lib/library/recordPath";
import type { Lang } from "@/lib/i18n-paths";

/**
 * /database moved into the library (owner decision 2026-10-27): every old
 * address answers 308 to the same thing in the library. A record keeps its
 * id; a list keeps its record type (as the dataset), search text and
 * filters; a search over every type goes to /search.
 */
export type DatabaseSearchParams = {
  q?: string; product?: string; type?: string; category?: string; facet?: string | string[]; cursor?: string;
  minLevel?: string; maxLevel?: string; minRequiredLevel?: string; maxRequiredLevel?: string;
};

// Record ids are UUIDs; anything else is an unknown address.
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEPT = ["product", "q", "facet", "minLevel", "maxLevel", "minRequiredLevel", "maxRequiredLevel"] as const;

export async function redirectDatabaseHub(lang: Lang, searchParams: Promise<DatabaseSearchParams>): Promise<never> {
  const filters = await searchParams;
  const prefix = lang === "ru" ? "/ru" : "";
  const query = new URLSearchParams();
  const dataset = filters.type ? LIBRARY_TYPE_DATASET[filters.type] : undefined;
  for (const key of KEPT) {
    const value = filters[key];
    for (const entry of Array.isArray(value) ? value : value ? [value] : []) {
      if (entry && !(key === "product" && entry === "wow")) query.append(key, entry);
    }
  }
  if (dataset) permanentRedirect(`${prefix}/library/${dataset}${query.size ? `?${query}` : ""}`);
  const text = filters.q?.trim();
  if (text) permanentRedirect(`${prefix}/search?q=${encodeURIComponent(text)}`);
  permanentRedirect(`${prefix}/library${filters.product && filters.product !== "wow" ? `?product=${encodeURIComponent(filters.product)}` : ""}`);
}

export async function redirectDatabaseRecord(lang: Lang, params: Promise<{ type: string; id: string; slug: string }>): Promise<never> {
  const { id, type } = await params;
  if (!RECORD_ID.test(id)) notFound();
  const entity = await getCatalogEntity(id, lang === "ru" ? "ru_RU" : "en_US").then((record) => record ? catalogLocaleView(record, lang) : null);
  if (!entity || entity.type !== type) notFound();
  permanentRedirect(libraryRecordPath(lang, entity.type, entity.id, entity.slug || entity.externalId, entity.product));
}
