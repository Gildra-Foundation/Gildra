// Generated from app/(site)/wow/forever/dungeons/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { ForeverInstances } from "@/components/wow/forever/ForeverInstances";
import { instanceCopy } from "@/components/wow/forever/instanceCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const title = `${instanceCopy[lang].dungeons} — WoW Forever — Gildra`;
const alternates = pairedAlternates(lang, "/wow/forever/dungeons");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverInstances lang={lang} kind="dungeons" />; }
