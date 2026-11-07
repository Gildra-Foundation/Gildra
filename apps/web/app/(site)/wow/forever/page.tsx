// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { ForeverHome } from "@/components/wow/forever/ForeverHome";
import { foreverCopy } from "@/components/wow/forever/foreverCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "en";
const copy = foreverCopy[lang];
export const metadata: Metadata = {
  title: `${copy.title} — Gildra`, description: copy.lede,
  alternates: pairedAlternates(lang, "/wow/forever"),
  openGraph: pageOpenGraph(lang, { title: copy.title, description: copy.lede, path: String(pairedAlternates(lang, "/wow/forever").canonical) }),
};
export default function Page() { return <ForeverHome lang={lang} />; }
