import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LIBRARY_FEATURED } from "@/lib/library/featured";
import { getCatalogPage, getCatalogProducts, getLibraryDatasets, type CatalogRecord } from "@/lib/api/client";
import { runtimeFlags } from "@/lib/flags";

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

/** Display name of a library dataset ("pvp-talents" → "PvP-таланты"), or a tidy slug when the catalog is closed or unavailable. */
export async function libraryDatasetName(slug: string, locale: "en_US" | "ru_RU") {
  const fallback = slug.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase());
  if (!(await catalogReadable())) return fallback;
  try {
    return (await getLibraryDatasets(locale)).find((dataset) => dataset.slug === slug)?.name ?? fallback;
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
    .then((page) => page.data.filter((record) => record.iconUrl).slice(0, 5)).catch(() => [] as CatalogRecord[])));
  return Object.fromEntries(slugs.map((slug, index) => [slug, pages[index]])) as Record<string, CatalogRecord[]>;
}

export async function getLibraryLandingData(locale: "en_US" | "ru_RU", product: string) {
  try {
    const [datasets, products] = await Promise.all([getLibraryDatasets(locale, product), getCatalogProducts()]);
    const featured = LIBRARY_FEATURED.filter((slug) => datasets.some((dataset) => dataset.slug === slug && dataset.entityCount > 0));
    return { datasets, products, samples: await featuredSamples(locale, product, featured), unavailable: false as const };
  } catch (error) {
    // A blocked publication policy or a temporary upstream failure must not
    // turn the server-rendered library into a generic 500 page. The detailed
    // error stays in server logs; the browser receives a stable, actionable
    // state without exposing internal URLs or policy internals.
    console.error("library landing data unavailable", error);
    return { datasets: [], products: [], samples: {} as Record<string, CatalogRecord[]>, unavailable: true as const };
  }
}
