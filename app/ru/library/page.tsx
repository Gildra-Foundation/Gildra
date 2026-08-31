import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Icons } from "@/components/Icons";
import { LibraryLanding } from "@/components/library/LibraryLanding";
import { TopNav } from "@/components/TopNav";
import { getLibraryLandingData, requireCatalogSession } from "@/lib/library/server";

export const metadata: Metadata = {
  title: "Библиотека данных World of Warcraft — Gildra",
  description: "Опубликованные датасеты World of Warcraft с проверенными tooltip, изображениями, связями и происхождением данных.",
  alternates: { canonical: "/ru/library", languages: { en: "/library", ru: "/ru/library" } },
};

export default async function LibraryPageRu({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const filters = await searchParams;
  const product = filters.product ?? "wow";
  await requireCatalogSession(`/ru/library${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const data = await getLibraryLandingData("ru_RU", product);
  return <><Icons /><TopNav /><div className="app"><main className="main"><div className="section route-section"><LibraryLanding lang="ru" selectedProduct={product} {...data} /></div></main><Footer lang="ru" /></div></>;
}
