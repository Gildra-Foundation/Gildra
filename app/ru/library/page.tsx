import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { LibraryLanding } from "@/components/library/LibraryLanding";
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
  return <PageShell lang="ru" variant="route"><LibraryLanding lang="ru" selectedProduct={product} {...data} /></PageShell>;
}
