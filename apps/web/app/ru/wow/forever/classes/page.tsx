// Localized twin of the English Forever class route.
import type { Metadata } from 'next';
import { pairedAlternates, pageOpenGraph } from '@/lib/seo/metadata';
import { classesCopy } from '@/components/wow/forever/classes/classesCopy';
const lang = 'ru';
const t = classesCopy[lang];
import { ForeverClassesPage } from '@/components/wow/forever/classes/ForeverClassesPage';
const title = `${t.classes} — WoW Forever — WowArcana`;
const alternates = pairedAlternates(lang, '/wow/forever/classes');
export const metadata: Metadata = { title, description: t.classLede, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverClassesPage lang={lang} />; }
