// Generated from app/(site)/wow/forever/dungeons/blackfathom-deeps/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { ForeverDungeonGuide } from "@/components/wow/forever/ForeverDungeonGuide";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const title = "Blackfathom Deeps — WoW Forever — Gildra";
const alternates = pairedAlternates(lang, "/wow/forever/dungeons/blackfathom-deeps");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverDungeonGuide lang={lang} slug="blackfathom-deeps" />; }
