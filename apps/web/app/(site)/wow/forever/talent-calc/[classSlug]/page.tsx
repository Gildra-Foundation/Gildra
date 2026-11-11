// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForeverTalentsClass } from "@/components/wow/forever/talents/ForeverTalentsPage";
import { talentCopy } from "@/components/wow/forever/talents/talentCopy";
import { foreverTalents, talentClass } from "@/lib/forever/talents/data";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "en";
export const dynamicParams = false;
export function generateStaticParams() { return foreverTalents.classes.map(cls => ({ classSlug: cls.slug })); }
type Props = { params: Promise<{ classSlug: string }>; searchParams: Promise<{ build?: string | string[] }> };
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { classSlug } = await params, cls = talentClass(classSlug);
  if (!cls) notFound();
  const title = `${cls.name[lang]} — ${talentCopy[lang].title} — WoW Forever`;
  const alternates = pairedAlternates(lang, `/wow/forever/talent-calc/${classSlug}`);
  const query = await searchParams;
  return { title, alternates, ...(query.build !== undefined ? { robots: { index: false, follow: true } } : {}), openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
}
export default async function Page({ params, searchParams }: Props) {
  const [{ classSlug }, { build }] = await Promise.all([params, searchParams]);
  return <ForeverTalentsClass lang={lang} slug={classSlug} token={build} />;
}
