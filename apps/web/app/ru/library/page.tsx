import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { LibraryLanding } from "@/components/library/LibraryLanding";
import { getLibraryLandingData, requireCatalogSession } from "@/lib/library/server";
import { withPageOpenGraph } from "@/lib/seo/metadata";

export const metadata: Metadata = withPageOpenGraph("ru", {
  title: "Библиотека данных World of Warcraft — Gildra",
  description: "Предметы, заклинания, маунты, боссы и задания World of Warcraft с игровыми подсказками, иконками и связями.",
  alternates: { canonical: "/ru/library", languages: { en: "/library", ru: "/ru/library", "x-default": "/library" } },
});

export default async function LibraryPageRu({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const filters = await searchParams;
  const product = filters.product || "wow";
  await requireCatalogSession(`/ru/library${product === "wow" ? "" : `?product=${encodeURIComponent(product)}`}`);
  const data = await getLibraryLandingData("ru_RU", product);
  return <PageShell lang="ru"><LibraryLanding lang="ru" selectedProduct={product} {...data} /></PageShell>;
}
