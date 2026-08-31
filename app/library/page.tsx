import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Icons } from "@/components/Icons";
import { LibraryLanding } from "@/components/library/LibraryLanding";
import { TopNav } from "@/components/TopNav";
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
  return <><Icons /><TopNav /><div className="app"><main className="main"><div className="section route-section"><LibraryLanding lang="en" selectedProduct={product} {...data} /></div></main><Footer /></div></>;
}
