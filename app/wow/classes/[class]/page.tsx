import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityStatusPage } from "@/components/wow/shared/IdentityStatusPage";
import { getMidnightClass, getMidnightClassSpecs, midnightClasses, TALENT_SNAPSHOT } from "@/lib/data/wow";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

export const generateStaticParams = () => midnightClasses.map(({ slug }) => ({ class: slug }));
export async function generateMetadata({ params }: { params: Promise<{ class: string }> }): Promise<Metadata> {
  const entry = getMidnightClass((await params).class);
  if (!entry) return {};
  const path = `/wow/classes/${entry.slug}`;
  return { title: `${entry.nameEn} — Midnight | Gildra`, description: `${entry.nameEn} specialization inventory from a source-tracked community talent snapshot.`, alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } }, robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ class: string }> }) {
  const entry = getMidnightClass((await params).class);
  if (!entry) notFound();
  return <IdentityStatusPage art="/assets/wow/loading/talents-wow.webp" artPosition="center 40%" emblem={getMidnightClassSpecs(entry.slug)[0]?.classIconUrl} locale="en" eyebrow="Midnight · Class" title={entry.nameEn} summary="Specializations of the class. Talent trees come from the Raidbots data snapshot; strategy guides will follow." parent={{ href: "/wow/classes", label: "Classes" }} patch="12.1" season="Midnight Season 2" sourceUrl={TALENT_SNAPSHOT.sourceUrl} sourceLabel="Raidbots talent snapshot" lastVerifiedAt={TALENT_SNAPSHOT.observedAt} links={getMidnightClassSpecs(entry.slug).map((spec) => ({ href: `/wow/classes/${entry.slug}/${spec.slug}`, label: spec.specName }))} />;
}
