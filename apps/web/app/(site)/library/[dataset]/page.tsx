import type { Metadata } from "next";
import { LibraryDatasetPage, libraryDatasetMetadata, type LibraryDatasetFilters } from "@/components/library/LibraryDatasetPage";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ dataset: string }>; searchParams: Promise<LibraryDatasetFilters> }): Promise<Metadata> {
  return libraryDatasetMetadata("en", (await params).dataset, (await searchParams).product);
}

export default async function Page({ params, searchParams }: { params: Promise<{ dataset: string }>; searchParams: Promise<LibraryDatasetFilters> }) {
  const [{ dataset }, filters] = await Promise.all([params, searchParams]);
  return <LibraryDatasetPage lang="en" slug={dataset} filters={filters} />;
}
