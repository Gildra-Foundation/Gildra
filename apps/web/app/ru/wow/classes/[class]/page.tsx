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
  const path = `/ru/wow/classes/${entry.slug}`;
  return { title: `${entry.nameRu} — Midnight — Gildra`, description: `${entry.nameRu}: инвентаризация специализаций из маркированного community snapshot талантов.`, alternates: { canonical: path, languages: { en: path.replace("/ru", ""), ru: path, "x-default": path.replace("/ru", "") } }, robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ class: string }> }) {
  const entry = getMidnightClass((await params).class);
  if (!entry) notFound();
  return <IdentityStatusPage art="/assets/wow/loading/talents-wow.webp" artPosition="center 40%" emblem={getMidnightClassSpecs(entry.slug)[0]?.classIconUrl} locale="ru" eyebrow="Midnight · Класс" title={entry.nameRu} summary="Специализации класса. Деревья талантов взяты из снимка данных Raidbots; гайды по тактике появятся позже." parent={{ href: "/wow/classes", label: "Классы" }} patch="12.1" season="Midnight · Сезон 2" sourceUrl={TALENT_SNAPSHOT.sourceUrl} sourceLabel="Снимок данных сообщества Raidbots" lastVerifiedAt={TALENT_SNAPSHOT.observedAt} links={getMidnightClassSpecs(entry.slug).map((spec) => ({ href: `/wow/classes/${entry.slug}/${spec.slug}`, label: spec.specNameRu }))} />;
}
