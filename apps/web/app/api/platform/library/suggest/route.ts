import { NextResponse, type NextRequest } from "next/server";
import { getCatalogPage } from "@/lib/api/client";
import { catalogReadable, catalogSessionPresent } from "@/lib/library/server";
import { libraryRecordView, rankLibrarySuggestions } from "@/components/library/libraryRecordView";

/**
 * Search suggestions of the library search fields: up to eight records whose
 * name matches `q` (in the whole library, or in one `dataset`), one per name
 * and type, closest names first.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const dataset = params.get("dataset") ?? "";
  const product = params.get("product") || "wow";
  const lang = params.get("lang") === "ru" ? "ru" : "en";
  if (q.length < 2 || q.length > 200 || (dataset && !/^[a-z0-9-]{2,64}$/.test(dataset)) || !/^[a-z0-9_]{2,64}$/.test(product)) {
    return NextResponse.json({ message: "Invalid suggestion query" }, { status: 400 });
  }
  if (!(await catalogReadable())) return NextResponse.json({ message: "The library is closed" }, { status: 401 });
  const privateRead = await catalogSessionPresent();
  try {
    // A wider page than shown: same-named spells and duplicates fold away before the cut.
    const page = await getCatalogPage({ locale: lang === "ru" ? "ru_RU" : "en_US", product, dataset, query: q, limit: dataset ? 12 : 30, includeTotal: false, timeoutMs: 6000 });
    const records = rankLibrarySuggestions(page.data.map((entity) => libraryRecordView(entity, lang, product)), q, 8);
    return NextResponse.json({ records }, {
      headers: { "Cache-Control": privateRead ? "private, no-store" : "public, max-age=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("library suggestions unavailable", error);
    return NextResponse.json({ records: [] }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
