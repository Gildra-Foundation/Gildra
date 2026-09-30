import { getCatalogTotal, type CatalogPageParams } from "@/lib/api/client";

export async function CatalogTotal({ params }: { params: CatalogPageParams }) {
  // Exact text-search totals scan every matching localization/alias row. The
  // catalog page already has a cursor and `hasMore`, so don't hold its streamed
  // response open for a count that can take several seconds on common terms.
  if (params.query?.trim()) return <>—</>;

  try {
    const total = await getCatalogTotal(params);
    if (total === undefined) return <>—</>;
    return <>{total.toLocaleString(params.locale === "ru_RU" ? "ru-RU" : "en-US")}</>;
  } catch {
    return <>—</>;
  }
}
