// Generated from app/(site)/wow/forever/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { ForeverHome } from "@/components/wow/forever/ForeverHome";
import { foreverCopy } from "@/components/wow/forever/foreverCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const copy = foreverCopy[lang];
export const metadata: Metadata = {
  title: `${copy.title} — WowArcana`, description: copy.lede,
  alternates: pairedAlternates(lang, "/wow/forever"),
  openGraph: pageOpenGraph(lang, { title: copy.title, description: copy.lede, path: String(pairedAlternates(lang, "/wow/forever").canonical) }),
};
export default function Page() { return <ForeverHome lang={lang} />; }
