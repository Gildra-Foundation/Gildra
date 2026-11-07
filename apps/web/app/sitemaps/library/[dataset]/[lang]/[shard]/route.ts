import { getCatalogSitemapEntries, getLibraryDatasets } from "@/lib/api/client";
import { runtimeFlags } from "@/lib/flags";
import { URLSET_CLOSE, URLSET_OPEN, entriesHaveLocales, homeDatasetType, isRecordShard, recordSitemapUrls, requestShards, type RecordSitemapEntry } from "@/lib/library/recordSitemap";

/** Reads the API shards of one file, four at a time, in id order. */
async function readShards(type: string, shards: string[]) {
  const parts: RecordSitemapEntry[][] = new Array(shards.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, shards.length) }, async () => {
    while (next < shards.length) {
      const index = next++;
      parts[index] = await getCatalogSitemapEntries(type, shards[index], "wow", 30_000) as RecordSitemapEntry[];
    }
  }));
  return parts.flat();
}

export const dynamic = "force-dynamic";

const xml = (body: string, cache = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400, stale-if-error=604800") =>
  new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": cache } });

/**
 * One file of library records: /sitemaps/library/<dataset>/<en|ru>/<all|shard>
 * (listed by /sitemap.xml). Only records the library serves, in English and,
 * for records with a Russian name of their own, in Russian.
 */
export async function GET(_request: Request, context: { params: Promise<{ dataset: string; lang: string; shard: string }> }) {
  const { dataset, lang, shard } = await context.params;
  const type = homeDatasetType(dataset);
  if (!runtimeFlags().catalogPublic || !type || (lang !== "en" && lang !== "ru") || !isRecordShard(shard)) {
    return new Response("Not found", { status: 404 });
  }
  let entries: RecordSitemapEntry[];
  try {
    const count = (await getLibraryDatasets("en_US")).find((item) => item.slug === dataset)?.entityCount ?? 0;
    entries = await readShards(type, requestShards(shard, count));
  } catch (error) {
    console.error("library record sitemap unavailable", dataset, shard, error);
    // A temporary failure: crawlers keep the last good copy and retry.
    return new Response("Library sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "3600" } });
  }
  // An API without Russian slugs also lists records the library does not serve: nothing until it is deployed.
  if (!entriesHaveLocales(entries)) return xml(`${URLSET_OPEN}${URLSET_CLOSE}`, "public, max-age=0, s-maxage=300");
  return xml(`${URLSET_OPEN}${recordSitemapUrls(entries, lang).join("")}${URLSET_CLOSE}`);
}
