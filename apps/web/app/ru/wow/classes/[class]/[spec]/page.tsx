import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityStatusPage } from "@/components/wow/shared/IdentityStatusPage";
import { getMidnightClassSpec, midnightSpecializations, TALENT_SNAPSHOT } from "@/lib/data/wow";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

export const generateStaticParams = () => midnightSpecializations.map((spec) => ({ class: spec.classSlug, spec: spec.slug }));
export async function generateMetadata({ params }: { params: Promise<{ class: string; spec: string }> }): Promise<Metadata> {
  const values = await params; const entry = getMidnightClassSpec(values.class, values.spec);
  if (!entry) return {};
  const path = `/ru/wow/classes/${entry.classSlug}/${entry.slug}`;
  return { title: `${entry.specNameRu} — ${entry.classNameRu} · Midnight — Gildra`, description: `Статус source-tracked snapshot талантов специализации ${entry.specNameRu}.`, alternates: { canonical: path, languages: { en: path.replace("/ru", ""), ru: path, "x-default": path.replace("/ru", "") } }, robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ class: string; spec: string }> }) {
  const values = await params; const entry = getMidnightClassSpec(values.class, values.spec);
  if (!entry) notFound();
  return <IdentityStatusPage art="/assets/wow/loading/talents-wow.webp" artPosition="center 40%" emblem={entry.iconUrl} tint={`rgba(${entry.accentRgb}, .2)`} locale="ru" eyebrow={`${entry.classNameRu} · ${entry.roleRu}`} title={entry.specNameRu} summary={`Дерево талантов взято из снимка данных Raidbots для сборки ${TALENT_SNAPSHOT.build}. Гайд по специализации появится позже.`} parent={{ href: `/wow/classes/${entry.classSlug}`, label: entry.classNameRu }} patch="12.1" season="Midnight Season 2" sourceUrl={TALENT_SNAPSHOT.sourceUrl} sourceLabel="Снимок данных Raidbots" lastVerifiedAt={TALENT_SNAPSHOT.observedAt} links={[{ href: `/talents/${entry.slug}`, label: "Открыть калькулятор талантов" }]} />;
}
