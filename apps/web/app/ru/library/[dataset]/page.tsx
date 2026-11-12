import type { Metadata } from "next";
import { listViewMetadata } from "@/lib/library/listView";
import { LibraryDatasetPage, libraryDatasetMetadata, type LibraryDatasetFilters } from "@/components/library/LibraryDatasetPage";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ dataset: string }>; searchParams: Promise<LibraryDatasetFilters> }): Promise<Metadata> {
  const filters = await searchParams;
  return listViewMetadata(await libraryDatasetMetadata("ru", (await params).dataset, filters.product), filters);
}

export default async function Page({ params, searchParams }: { params: Promise<{ dataset: string }>; searchParams: Promise<LibraryDatasetFilters> }) {
  const [{ dataset }, filters] = await Promise.all([params, searchParams]);
  return <LibraryDatasetPage lang="ru" slug={dataset} filters={filters} />;
}
