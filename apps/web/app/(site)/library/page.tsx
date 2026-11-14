import { notFound } from "next/navigation";
import { libraryProduct, libraryProductPath } from "@/lib/library/product";
import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { LibraryLanding } from "@/components/library/LibraryLanding";
import { getLibraryLandingData, requireCatalogSession } from "@/lib/library/server";
import { withPageOpenGraph } from "@/lib/seo/metadata";

const baseMetadata: Metadata = {
  title: "World of Warcraft Data Library — WowArcana",
  description: "World of Warcraft items, spells, mounts, bosses and quests with in-game tooltips, icons and links between them.",
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ product?: string }> }): Promise<Metadata> {
  const product = libraryProduct((await searchParams).product);
  if (!product) notFound();
  const en = libraryProductPath("/library", product), ru = libraryProductPath("/ru/library", product);
  return withPageOpenGraph("en", { ...baseMetadata, alternates: { canonical: en, languages: { en, ru, "x-default": en } } });
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const filters = await searchParams;
  const product = libraryProduct(filters.product);
  if (!product) notFound();
  await requireCatalogSession(`/library${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const data = await getLibraryLandingData("en_US", product);
  return <PageShell lang="en" frame><LibraryLanding lang="en" selectedProduct={product} {...data} /></PageShell>;
}
