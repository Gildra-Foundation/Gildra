import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";
import { getMidnightClass, getMidnightClassSpecs, midnightClasses, TALENT_SNAPSHOT } from "@/data/wow/midnight-specializations";

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
  return <IdentityStatusPage locale="en" eyebrow="Midnight · Class" title={entry.nameEn} summary="Class and specialization identity is source-tracked. Talent topology comes from the labeled Raidbots community snapshot and is not represented as official Blizzard strategy." patch="12.1" season="Midnight Season 2" sourceUrl={TALENT_SNAPSHOT.sourceUrl} sourceLabel="Raidbots talent snapshot" lastVerifiedAt={TALENT_SNAPSHOT.observedAt} links={getMidnightClassSpecs(entry.slug).map((spec) => ({ href: `/wow/classes/${entry.slug}/${spec.slug}`, label: spec.specName }))} />;
}
