import type { Metadata } from "next";
import { LibraryDatasetPage, type LibraryDatasetFilters } from "@/components/library/LibraryDatasetPage";
import { libraryDatasetName } from "@/lib/library/server";

export async function generateMetadata({ params }: { params: Promise<{ dataset: string }> }): Promise<Metadata> {
  const { dataset } = await params;
  return { title: `${await libraryDatasetName(dataset, "ru_RU")} — Библиотека Gildra`, alternates: { languages: { en: `/library/${dataset}`, ru: `/ru/library/${dataset}` } } };
}

export default async function Page({ params, searchParams }: { params: Promise<{ dataset: string }>; searchParams: Promise<LibraryDatasetFilters> }) {
  const [{ dataset }, filters] = await Promise.all([params, searchParams]);
  return <LibraryDatasetPage lang="ru" slug={dataset} filters={filters} />;
}
