import "server-only";
import { getCatalogEntityTypes } from "@/lib/api/client";

/**
 * Catalog totals for the search hero: the real number of WoW records and of
 * record types that have at least one record. The entity-type list is cached
 * by the API client; if it does not answer quickly the hero simply shows no
 * counters instead of holding the page.
 */
export async function getSearchCatalogStats(locale: "en_US" | "ru_RU", timeoutMs = 1500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs); });
  const stats = getCatalogEntityTypes(locale, "wow")
    .then((types) => ({ records: types.reduce((sum, entry) => sum + entry.count, 0), types: types.filter((entry) => entry.count > 0).length }))
    .catch(() => undefined);
  const result = await Promise.race([stats, timeout]);
  clearTimeout(timer);
  return result && result.records > 0 ? result : undefined;
}
