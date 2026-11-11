// Localized twin of the English Forever class route.
import type { Metadata } from 'next';
import { pairedAlternates, pageOpenGraph } from '@/lib/seo/metadata';
const lang = 'ru';
import { notFound } from 'next/navigation';
import { ForeverClassPage } from '@/components/wow/forever/classes/ForeverClassesPage';
import { foreverClass, foreverClasses } from '@/lib/data/wow/foreverClasses';
import { readChangeQuery } from '@/components/wow/forever/classes/query';
type Props = { params: Promise<{ classSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export function generateStaticParams() { return foreverClasses.map(c => ({ classSlug: c.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = foreverClass((await params).classSlug);
  if (!c) notFound();
  const title = `${c.name[lang]} — WoW Forever — WowArcana`;
  const alternates = pairedAlternates(lang, `/wow/forever/classes/${c.slug}`);
  return { title, description: c.description[lang], alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
}
export default async function Page({ params, searchParams }: Props) {
  const c = foreverClass((await params).classSlug);
  if (!c) notFound();
  return <ForeverClassPage lang={lang} c={c} query={readChangeQuery(await searchParams)} />;
}
