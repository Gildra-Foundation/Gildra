import { siteOrigin, xmlEscape, xmlResponse } from "@/lib/sitemap";
import { getLibraryDatasets } from "@/lib/api/client";
import { runtimeFlags } from "@/lib/flags";
import { LIBRARY_HIDDEN_DATASETS } from "@/lib/library/recordPath";

export const dynamic = "force-dynamic";

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"></urlset>';

/**
 * Library dataset pages (/library/<dataset> and the /ru twin) with hreflang
 * alternates; one cached catalog read (lib/api/client.ts, revalidate 300 s).
 * Records have their own files (/sitemaps/library/<dataset>/<lang>/<shard>).
 */
export async function GET() {
  if (!runtimeFlags().catalogPublic) return xmlResponse(EMPTY);
  let slugs: string[];
  try {
    slugs = (await getLibraryDatasets("en_US")).filter((dataset) => dataset.entityCount > 0 && !LIBRARY_HIDDEN_DATASETS.has(dataset.slug)).map((dataset) => dataset.slug);
  } catch (error) {
    console.error("library sitemap unavailable", error);
    // A temporary failure: crawlers keep the last good copy and retry.
    return new Response("Library sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "3600" } });
  }
  const urls = slugs.flatMap((slug) => {
    const en = `${siteOrigin}/library/${encodeURIComponent(slug)}`;
    const ru = `${siteOrigin}/ru/library/${encodeURIComponent(slug)}`;
    const alternates = `<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/><xhtml:link rel="alternate" hreflang="ru" href="${xmlEscape(ru)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(en)}"/>`;
    return [en, ru].map((location) => `<url><loc>${xmlEscape(location)}</loc>${alternates}</url>`);
  });
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`);
}
