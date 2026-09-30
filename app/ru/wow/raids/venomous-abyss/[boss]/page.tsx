import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VenomousBossPage } from "@/components/wow/raid/VenomousBossPage";
import { bossBySlug, lt, venomousAbyss } from "@/data/venomousAbyss";
import { preloadSharedWowBackdrop } from "@/lib/wow/sharedBackdropPreload";

export function generateStaticParams() {
  return venomousAbyss.map((boss) => ({ boss: boss.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ boss: string }> }): Promise<Metadata> {
  const { boss: slug } = await params;
  const boss = bossBySlug(slug);
  if (!boss) return {};
  const bossName = lt(boss.name, "ru");
  return {
    title: `${bossName} — гайд по боссу Gildra`,
    description: `${bossName}: проверенная идентичность Journal и явно неподтверждённый сторонний черновик тактики. Проверка abilities, портрета NPC и canonical loot продолжается.`,
    alternates: {
      canonical: `/ru/wow/raids/venomous-abyss/${slug}`,
      languages: { en: `/wow/raids/venomous-abyss/${slug}`, ru: `/ru/wow/raids/venomous-abyss/${slug}`, "x-default": `/wow/raids/venomous-abyss/${slug}` },
    },
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  const { boss: slug } = await params;
  const boss = bossBySlug(slug);
  if (!boss) notFound();
  preloadSharedWowBackdrop();
  const index = venomousAbyss.indexOf(boss);
  return <VenomousBossPage boss={boss} locale="ru" previous={venomousAbyss[index - 1]} next={venomousAbyss[index + 1]} />;
}
