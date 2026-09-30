import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";
import { getMidnightClassSpec, midnightSpecializations, TALENT_SNAPSHOT } from "@/data/wow/midnight-specializations";

export const generateStaticParams = () => midnightSpecializations.map((spec) => ({ class: spec.classSlug, spec: spec.slug }));
export async function generateMetadata({ params }: { params: Promise<{ class: string; spec: string }> }): Promise<Metadata> {
  const values = await params; const entry = getMidnightClassSpec(values.class, values.spec);
  if (!entry) return {};
  const path = `/wow/classes/${entry.classSlug}/${entry.slug}`;
  return { title: `${entry.specName} ${entry.className} — Midnight | Gildra`, description: `Source-tracked ${entry.specName} talent snapshot status.`, alternates: { canonical: path, languages: { en: path, ru: `/ru${path}`, "x-default": path } }, robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ class: string; spec: string }> }) {
  const values = await params; const entry = getMidnightClassSpec(values.class, values.spec);
  if (!entry) notFound();
  return <IdentityStatusPage locale="en" eyebrow={`${entry.className} · ${entry.role}`} title={entry.specName} summary={`Talent topology is loaded from the labeled Raidbots community snapshot for build ${TALENT_SNAPSHOT.build}. Descriptions and strategy are not declared complete.`} patch="12.1" season="Midnight Season 2" sourceUrl={TALENT_SNAPSHOT.sourceUrl} sourceLabel="Raidbots talent snapshot" lastVerifiedAt={TALENT_SNAPSHOT.observedAt} links={[{ href: `/talents/${entry.slug}`, label: "Open talent calculator" }]} />;
}
