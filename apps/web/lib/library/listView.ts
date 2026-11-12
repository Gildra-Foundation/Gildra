import type { Metadata } from "next";

/**
 * A search, a filter or a later page of a dataset's list is a view of the list, not a page of
 * its own: like /search it stays out of the index (its records are in the record sitemaps),
 * and its links are still followed. `product` picks an edition, which is a page of its own.
 */
export function listViewMetadata(metadata: Metadata, filters: Record<string, string | string[] | undefined>): Metadata {
  const view = Object.entries(filters).some(([key, value]) => key !== "product" && value !== undefined && value !== "");
  return view ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}
