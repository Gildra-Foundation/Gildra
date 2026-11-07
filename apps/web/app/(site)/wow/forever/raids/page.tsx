// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { ForeverInstances } from "@/components/wow/forever/ForeverInstances";
import { instanceCopy } from "@/components/wow/forever/instanceCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "en";
const title = `${instanceCopy[lang].raids} — WoW Forever — Gildra`;
const alternates = pairedAlternates(lang, "/wow/forever/raids");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverInstances lang={lang} kind="raids" />; }
