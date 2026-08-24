import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpecPageBody } from "@/components/SpecPageBody";
import { season } from "@/data/site";
import { findSpecPage, specPages } from "@/lib/specs";

export function generateStaticParams() {
  return specPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = findSpecPage(slug);
  if (!p) return {};
  const name = p.row.spec.name;
  return {
    title: `${name} — ${p.tier.toUpperCase()}-тир Mythic+ | Gildra`,
    description: `${name} в ${season.expansion} Сезон 1: очки ${p.row.score}, популярность ${p.row.pop}, средний ключ ${p.row.key}. Билды и гайды на Gildra.`,
    alternates: {
      languages: { en: `/specs/${p.slug}`, ru: `/ru/specs/${p.slug}` },
    },
  };
}

export default async function SpecPageRu({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = findSpecPage(slug);
  if (!p) notFound();
  return <SpecPageBody p={p} lang="ru" />;
}
