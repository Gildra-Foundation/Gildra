import { siteSearchIndex } from "@/lib/search/siteIndex";

// The quick-search index (⌘K) is static: built once at build time, cached by browsers for an hour.
export const dynamic = "force-static";

export function GET() {
  return Response.json(siteSearchIndex(), { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
