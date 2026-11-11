// routes:mirror — localized twin follows the same scoped contract.
import type { Metadata } from 'next';
import { pairedAlternates, pageOpenGraph } from '@/lib/seo/metadata';
import { classesCopy } from '@/components/wow/forever/classes/classesCopy';
const lang = 'en';
const t = classesCopy[lang];
import { ForeverChangesPage } from '@/components/wow/forever/classes/ForeverClassesPage';
import { foreverClass, foreverClasses } from '@/lib/data/wow/foreverClasses';
import { readChangeQuery } from '@/components/wow/forever/classes/query';
const title = `${t.changes} — WoW Forever — WowArcana`;
const alternates = pairedAlternates(lang, '/wow/forever/changes');
export const metadata: Metadata = { title, description: t.lede, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = foreverClass(typeof params.class === 'string' ? params.class : '') ?? foreverClasses[0];
  return <ForeverChangesPage lang={lang} c={c} query={readChangeQuery(params)} />;
}
