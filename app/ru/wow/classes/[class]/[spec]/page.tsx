import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";
import { getMidnightClassSpec, midnightSpecializations, TALENT_SNAPSHOT } from "@/data/wow/midnight-specializations";

export const generateStaticParams = () => midnightSpecializations.map((spec) => ({ class: spec.classSlug, spec: spec.slug }));
export async function generateMetadata({ params }: { params: Promise<{ class: string; spec: string }> }): Promise<Metadata> {
  const values = await params; const entry = getMidnightClassSpec(values.class, values.spec);
  if (!entry) return {};
  const path = `/ru/wow/classes/${entry.classSlug}/${entry.slug}`;
  return { title: `${entry.specNameRu} — ${entry.classNameRu} · Midnight | Gildra`, description: `Статус source-tracked snapshot талантов специализации ${entry.specNameRu}.`, alternates: { canonical: path, languages: { en: path.replace("/ru", ""), ru: path, "x-default": path.replace("/ru", "") } }, robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ class: string; spec: string }> }) {
  const values = await params; const entry = getMidnightClassSpec(values.class, values.spec);
  if (!entry) notFound();
  return <IdentityStatusPage locale="ru" eyebrow={`${entry.classNameRu} · ${entry.roleRu}`} title={entry.specNameRu} summary={`Топология талантов загружается из маркированного community snapshot Raidbots для build ${TALENT_SNAPSHOT.build}. Полнота описаний и тактики не заявляется.`} patch="12.1" season="Midnight Season 2" sourceUrl={TALENT_SNAPSHOT.sourceUrl} sourceLabel="Community snapshot Raidbots" lastVerifiedAt={TALENT_SNAPSHOT.observedAt} links={[{ href: `/talents/${entry.slug}`, label: "Открыть калькулятор талантов" }]} />;
}
