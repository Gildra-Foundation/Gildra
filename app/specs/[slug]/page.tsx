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
    title: `${name} — Mythic+ ${p.tier.toUpperCase()}-Tier | Gildra`,
    description: `${name} in ${season.expansion} ${season.season}: score ${p.row.score}, ${p.row.pop} popularity, avg key ${p.row.key}. Builds and guides on Gildra.`,
    alternates: {
      languages: { en: `/specs/${p.slug}`, ru: `/ru/specs/${p.slug}` },
    },
  };
}

export default async function SpecPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = findSpecPage(slug);
  if (!p) notFound();
  return <SpecPageBody p={p} lang="en" />;
}
