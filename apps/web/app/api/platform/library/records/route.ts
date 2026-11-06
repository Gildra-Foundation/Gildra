import { NextResponse, type NextRequest } from "next/server";
import { getCatalogPage } from "@/lib/api/client";
import { catalogReadable, catalogSessionPresent } from "@/lib/library/server";
import { libraryRecordViews, parseLibraryListQuery } from "@/components/library/libraryRecordView";

/**
 * The next page of a library dataset list ("Show more"): the same query as the
 * dataset page URL plus `cursor`, answered as ready rows (`LibraryRecordView`)
 * and the cursor after them. Read-only, through the cached catalog client.
 */
export async function GET(request: NextRequest) {
  const query = parseLibraryListQuery(request.nextUrl.searchParams);
  if (!query || !query.cursor) return NextResponse.json({ message: "Invalid list query" }, { status: 400 });
  if (!(await catalogReadable())) return NextResponse.json({ message: "The library is closed" }, { status: 401 });
  const privateRead = await catalogSessionPresent();
  try {
    const page = await getCatalogPage({
      locale: query.lang === "ru" ? "ru_RU" : "en_US", product: query.product, dataset: query.dataset, query: query.q,
      facets: query.facets, cursor: query.cursor, minItemLevel: query.minLevel, maxItemLevel: query.maxLevel,
      minRequiredLevel: query.minRequiredLevel, maxRequiredLevel: query.maxRequiredLevel, includeTotal: false, timeoutMs: 12_000,
    });
    const next = page.pagination.hasMore && page.pagination.nextCursor ? page.pagination.nextCursor : undefined;
    return NextResponse.json({ rows: libraryRecordViews(page.data, query.lang, query.product), next }, {
      headers: { "Cache-Control": privateRead ? "private, no-store" : "public, max-age=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("library list page unavailable", error);
    return NextResponse.json({ message: "Catalog service is temporarily unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
