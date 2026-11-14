// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { ForeverInstances } from "@/components/wow/forever/ForeverInstances";
import { instanceCopy } from "@/components/wow/forever/instanceCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { versionDescription } from "@/lib/seo/versionDescriptions";
const lang = "en";
const title = `${instanceCopy[lang].dungeons} — WoW Forever — WowArcana`;
const alternates = pairedAlternates(lang, "/wow/forever/dungeons");
const description = versionDescription("foreverDungeons", lang);
export const metadata: Metadata = { title, description, alternates, openGraph: pageOpenGraph(lang, { title, description, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverInstances lang={lang} kind="dungeons" />; }
