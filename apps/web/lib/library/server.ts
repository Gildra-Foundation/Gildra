import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LIBRARY_FEATURED } from "@/lib/library/featured";
import { getCatalogPage, getCatalogProducts, getLibraryDatasets, type CatalogRecord } from "@/lib/api/client";
import { withCatalogIcon } from "@/lib/games/wow/assets";
import { runtimeFlags } from "@/lib/flags";
import { isInternalRecord } from "@/lib/library/internalName";

/**
 * Catalog reads are private in the current owner-approved deployment. Keep the
 * authorization decision at the page boundary so a missing session becomes a
 * login redirect instead of an opaque server-side 500 from the internal API.
 */
export async function catalogSessionPresent() {
  return Boolean((await cookies()).get("gildra_admin_session")?.value);
}

/** The catalog can be read on this request: public mode or an administrator session. */
export async function catalogReadable() {
  return runtimeFlags().catalogPublic || (await catalogSessionPresent());
}

/** Name and API description of a dataset for its page metadata (a tidy slug when the catalog is closed or unavailable). */
export async function libraryDatasetHead(slug: string, locale: "en_US" | "ru_RU", product = "wow"): Promise<{ name: string; description?: string; entityCount?: number }> {
  const fallback = { name: slug.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase()) };
  if (!(await catalogReadable())) return fallback;
  try {
    const dataset = (await getLibraryDatasets(locale, product)).find((entry) => entry.slug === slug);
    return dataset ? { name: dataset.name, description: dataset.description, entityCount: dataset.entityCount } : fallback;
  } catch {
    return fallback;
  }
}

export async function requireCatalogSession(path: string) {
  if (runtimeFlags().catalogPublic) return;
  if (await catalogSessionPresent()) return;
  const next = path.startsWith("/") ? path : "/library";
  redirect(`/api-console?next=${encodeURIComponent(next)}`);
}


/** A few records with icons per featured dataset (cached like any catalog page); a failed read leaves the strip out. */
async function featuredSamples(locale: "en_US" | "ru_RU", product: string, slugs: string[]) {
  const pages = await Promise.all(slugs.map((dataset) => getCatalogPage({ locale, product, dataset, limit: 12, timeoutMs: 4000 })
    .then((page) => page.data.map((record) => withCatalogIcon(record, product)).filter((record) => record.iconUrl).slice(0, 5)).catch(() => [] as CatalogRecord[])));
  return Object.fromEntries(slugs.map((slug, index) => [slug, pages[index]])) as Record<string, CatalogRecord[]>;
}

/**
 * Datasets whose catalog count is visibly off: it includes the client's bookkeeping records
 * (two follower classes, twenty non-player specializations, hundreds of hidden counters among
 * the currencies) that the lists leave out. They are small enough to count what a list shows.
 */
export const LIBRARY_COUNTED_DATASETS = ["classes", "specializations", "currencies"];

async function countListedRecords(locale: "en_US" | "ru_RU", product: string, dataset: string) {
  let count = 0;
  let cursor = "";
  for (let page = 0; page < 40; page += 1) {
    const result = await getCatalogPage({ locale, product, dataset, limit: 100, cursor, timeoutMs: 8000 });
    count += result.data.filter((record) => !isInternalRecord(record.name, record.type, record.externalId)).length;
    if (!result.pagination.hasMore) return count;
    if (!result.pagination.nextCursor || result.pagination.nextCursor === cursor) throw new Error("Incomplete library listed count");
    cursor = result.pagination.nextCursor;
  }
  throw new Error("Library listed count page limit exceeded");
}

/** Finished counts of this server process: a count is a few catalog pages (cached like any list page), kept for six hours. */
const listedCounts = new Map<string, { count: number; at: number }>();
const listedCounting = new Map<string, Promise<number | undefined>>();
const LISTED_COUNT_TTL = 6 * 3600_000;

/** The number of records a dataset's list shows; undefined while a long first count is still running (the catalog's own count stands in) or when it fails. */
async function listedCount(locale: "en_US" | "ru_RU", product: string, dataset: string): Promise<number | undefined> {
  const key = `${locale}|${product}|${dataset}`;
  const known = listedCounts.get(key);
  if (known && Date.now() - known.at < LISTED_COUNT_TTL) return known.count;
  let counting = listedCounting.get(key);
  if (!counting) {
    counting = countListedRecords(locale, product, dataset)
      .then((count) => { listedCounts.set(key, { count, at: Date.now() }); return count; })
      .catch((error: unknown) => { console.error("library listed count unavailable", dataset, error); return known?.count; })
      .finally(() => listedCounting.delete(key));
    listedCounting.set(key, counting);
  }
  return Promise.race([counting, new Promise<number | undefined>((resolve) => setTimeout(() => resolve(known?.count), 2500))]);
}

/** The datasets with the counted ones showing what their lists show. */
export async function withListedCounts<T extends { slug: string; entityCount: number }>(datasets: T[], locale: "en_US" | "ru_RU", product: string): Promise<T[]> {
  const counted = datasets.filter((dataset) => LIBRARY_COUNTED_DATASETS.includes(dataset.slug) && dataset.entityCount > 0);
  const counts = await Promise.all(counted.map((dataset) => listedCount(locale, product, dataset.slug)));
  const bySlug = new Map(counted.map((dataset, index) => [dataset.slug, counts[index]]));
  return datasets.map((dataset) => { const count = bySlug.get(dataset.slug); return count ? { ...dataset, entityCount: count } : dataset; });
}

export async function getLibraryLandingData(locale: "en_US" | "ru_RU", product: string) {
  try {
    const [datasets, products] = await Promise.all([getLibraryDatasets(locale, product), getCatalogProducts()]);
    const featured = LIBRARY_FEATURED.filter((slug) => datasets.some((dataset) => dataset.slug === slug && dataset.entityCount > 0));
    const [samples, counted] = await Promise.all([featuredSamples(locale, product, featured), withListedCounts(datasets, locale, product)]);
    return { datasets: counted, products, samples, unavailable: false as const };
  } catch (error) {
    // A blocked publication policy or a temporary upstream failure must not
    // turn the server-rendered library into a generic 500 page. The detailed
    // error stays in server logs; the browser receives a stable, actionable
    // state without exposing internal URLs or policy internals.
    console.error("library landing data unavailable", error);
    return { datasets: [], products: [], samples: {} as Record<string, CatalogRecord[]>, unavailable: true as const };
  }
}
