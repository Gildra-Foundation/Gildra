import { notFound, permanentRedirect } from "next/navigation";
import { getMidnightRaid } from "@/lib/data/wow/raid/midnightRaidData";

// Every boss of this raid is a section of the raid page.
export const dynamicParams = false;

type PageProps = { params: Promise<{ boss: string }> };

export function generateStaticParams() {
  return getMidnightRaid("the-dreamrift")?.bosses.map((boss) => ({ boss: boss.slug })) ?? [];
}

export default async function Page({ params }: PageProps) {
  const { boss: bossSlug } = await params;
  const boss = getMidnightRaid("the-dreamrift")?.bosses.find((entry) => entry.slug === bossSlug);
  if (!boss) notFound();
  permanentRedirect(`/wow/raids/the-dreamrift#boss=${boss.slug}`);
}
