import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RaidOverview } from "@/components/wow/raid/RaidOverview";
import { getMidnightRaid, raidRouteSlugs } from "@/lib/data/wow/raid/midnightRaidData";
import { withPageOpenGraph } from "@/lib/seo/metadata";

// Every valid slug is prerendered; anything else is a real 404, not a 200 page that says 404.
export const dynamicParams = false;

type PageProps = { params: Promise<{ raid: string }> };

export function generateStaticParams() {
  return raidRouteSlugs.map((raid) => ({ raid }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const raid = getMidnightRaid((await params).raid);
  if (!raid) return {};
  return withPageOpenGraph("ru", {
    title: raid.slug === "march-on-queldanas" ? "Марш на Кель’Данас: тактики боссов — Gildra" : raid.slug === "the-dreamrift" ? "Провал снов: гайд по Химерию — Gildra" : `${raid.nameRu}: рейдовый журнал — Gildra`,
    description: raid.slug === "march-on-queldanas" ? "Бело’рен и Торжество Полуночи на обычной и героической сложности: порядок боя, позиционирование, прислужники и способности вашей специализации." : raid.slug === "the-dreamrift" ? "Химерий на обычной и героической сложности: смена миров и групп, позиционирование, прислужники и способности вашей специализации." : `${raid.nameRu}, рейд Midnight · Сезон 1: пулы на карте, боссы (${raid.bosses.length}) и что важно знать.`,
    alternates: {
      canonical: `/ru/wow/raids/${raid.slug}`,
      languages: { en: `/wow/raids/${raid.slug}`, ru: `/ru/wow/raids/${raid.slug}`, "x-default": `/wow/raids/${raid.slug}` },
    },
  });
}

export default async function RaidPage({ params }: PageProps) {
  const raid = getMidnightRaid((await params).raid);
  if (!raid || !raidRouteSlugs.includes(raid.slug)) notFound();
  return <RaidOverview raid={raid} locale="ru" />;
}
