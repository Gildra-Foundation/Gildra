// routes:mirror — localized twin follows the same scoped contract.
import type { Metadata } from 'next';
import { pairedAlternates, pageOpenGraph } from '@/lib/seo/metadata';
import { classesCopy } from '@/components/wow/forever/classes/classesCopy';
const lang = 'en';
const t = classesCopy[lang];
import { ForeverClassesPage } from '@/components/wow/forever/classes/ForeverClassesPage';
const title = `${t.classes} — WoW Forever — WowArcana`;
const alternates = pairedAlternates(lang, '/wow/forever/classes');
export const metadata: Metadata = { title, description: t.classLede, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverClassesPage lang={lang} />; }
