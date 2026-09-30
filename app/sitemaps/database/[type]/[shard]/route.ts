export const revalidate = 3600;
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ type: string; shard: string }> },
) {
  const { type, shard } = await context.params;
  const prefix = shard === "all" ? "" : shard;
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(type) || !/^[0-9a-f]{0,2}$/.test(prefix)) {
    return new Response("Not found", { status: 404 });
  }
  // The current catalog sitemap API exposes only the EN slug and does not
  // prove equivalent EN/RU body content. Publishing paired URLs here would
  // create canonical and hreflang mismatches. Keep the endpoint stable and
  // empty until the API returns locale-specific slugs plus parity evidence.
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"></urlset>',
    {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-if-error=86400",
        "X-Gildra-Sitemap-Degraded": "language-parity-unverified",
      },
    },
  );
}
