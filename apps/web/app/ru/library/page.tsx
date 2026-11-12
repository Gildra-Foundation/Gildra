import { notFound } from "next/navigation";
import { libraryProduct, libraryProductPath } from "@/lib/library/product";
import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { LibraryLanding } from "@/components/library/LibraryLanding";
import { getLibraryLandingData, requireCatalogSession } from "@/lib/library/server";
import { withPageOpenGraph } from "@/lib/seo/metadata";

const baseMetadata: Metadata = {
  title: "Библиотека данных World of Warcraft — WowArcana",
  description: "Предметы, заклинания, маунты, боссы и задания World of Warcraft с игровыми подсказками, иконками и связями.",
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ product?: string }> }): Promise<Metadata> {
  const product = libraryProduct((await searchParams).product);
  if (!product) notFound();
  const en = libraryProductPath("/library", product), ru = libraryProductPath("/ru/library", product);
  return withPageOpenGraph("ru", { ...baseMetadata, alternates: { canonical: ru, languages: { en, ru, "x-default": en } } });
}

export default async function LibraryPageRu({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const filters = await searchParams;
  const product = libraryProduct(filters.product);
  if (!product) notFound();
  await requireCatalogSession(`/ru/library${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const data = await getLibraryLandingData("ru_RU", product);
  return <PageShell lang="ru" frame><LibraryLanding lang="ru" selectedProduct={product} {...data} /></PageShell>;
}
