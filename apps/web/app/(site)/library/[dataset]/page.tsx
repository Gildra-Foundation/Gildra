import type { Metadata } from "next";
import { LibraryDatasetPage, type LibraryDatasetFilters } from "@/components/library/LibraryDatasetPage";

export async function generateMetadata({ params }: { params: Promise<{ dataset: string }> }): Promise<Metadata> {
  const { dataset } = await params;
  return { title: `${dataset.replaceAll("-", " ")} — Gildra Library`, alternates: { languages: { en: `/library/${dataset}`, ru: `/ru/library/${dataset}` } } };
}

export default async function Page({ params, searchParams }: { params: Promise<{ dataset: string }>; searchParams: Promise<LibraryDatasetFilters> }) {
  const [{ dataset }, filters] = await Promise.all([params, searchParams]);
  return <LibraryDatasetPage lang="en" slug={dataset} filters={filters} />;
}
