import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { LibraryLanding } from "@/components/library/LibraryLanding";
import { getLibraryLandingData, requireCatalogSession } from "@/lib/library/server";

export const metadata: Metadata = {
  title: "World of Warcraft Data Library — Gildra",
  description: "Published World of Warcraft datasets with verified tooltips, images, relationships and provenance.",
  alternates: { canonical: "/library", languages: { en: "/library", ru: "/ru/library" } },
};

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const filters = await searchParams;
  const product = filters.product ?? "wow";
  await requireCatalogSession(`/library${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const data = await getLibraryLandingData("en_US", product);
  return <PageShell lang="en" variant="route"><LibraryLanding lang="en" selectedProduct={product} {...data} /></PageShell>;
}
