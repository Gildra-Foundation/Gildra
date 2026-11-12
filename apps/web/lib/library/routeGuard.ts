import { apiInternalUrl } from "../env.ts";
import { LIBRARY_LOOSE_RECORDS } from "./recordPath.ts";
import { libraryProduct } from "./product.ts";

type Slugs = ReadonlySet<string>;
const known = new Map<string, { slugs: Slugs; at: number }>();
const pending = new Map<string, Promise<Slugs | null>>();
const TTL = 10 * 60_000;

/** The dataset slugs of an edition, as the catalog lists them; null when it cannot be asked (closed or down). */
async function datasetSlugs(product: string): Promise<Slugs | null> {
  const cached = known.get(product);
  if (cached && Date.now() - cached.at < TTL) return cached.slugs;
  let refresh = pending.get(product);
  if (!refresh) {
    refresh = (async () => {
      try {
        const response = await fetch(`${apiInternalUrl()}/v1/library/datasets?${new URLSearchParams({ locale: "en_US", product })}`, { signal: AbortSignal.timeout(2500), cache: "no-store" });
        if (!response.ok) return cached?.slugs ?? null;
        const slugs = new Set(((await response.json()) as { data?: { slug?: string }[] }).data?.map((entry) => entry.slug ?? "").filter(Boolean));
        // An empty list is an answer the guard cannot use: every dataset would look unknown.
        if (!slugs.size) return cached?.slugs ?? null;
        known.set(product, { slugs, at: Date.now() });
        return slugs;
      } catch {
        return cached?.slugs ?? null;
      }
    })().finally(() => pending.delete(product));
    pending.set(product, refresh);
  }
  return cached?.slugs ?? refresh;
}

/**
 * /library/<dataset>… of a dataset the catalog does not have: a real HTTP 404 before the loading
 * shell streams (the page's own notFound() comes after the 200 is sent, and the address used to
 * answer 200 with the title "Nosuch — WowArcana Library"). When the catalog cannot be asked, the
 * page decides, as before.
 */
export async function unknownLibraryDataset(pathname: string, product: string | null = null, load: (product: string) => Promise<Slugs | null> = datasetSlugs): Promise<boolean> {
  const match = /^(?:\/ru)?\/library\/([^/]+)(?:\/.*)?$/.exec(pathname);
  if (!match) return false;
  let dataset: string;
  try { dataset = decodeURIComponent(match[1]); } catch { return true; }
  // The showcase's own link-preview card (/library/opengraph-image-<hash>) is not a dataset.
  if (dataset === LIBRARY_LOOSE_RECORDS || /^opengraph-image(?:-[a-z0-9]+)?$/.test(dataset)) return false;
  if (!/^[a-z0-9-]{2,64}$/.test(dataset)) return true;
  const edition = libraryProduct(product ?? undefined);
  if (!edition) return false;
  const slugs = await load(edition);
  return slugs ? !slugs.has(dataset) : false;
}
