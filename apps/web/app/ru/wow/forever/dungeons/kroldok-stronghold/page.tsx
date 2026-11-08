// Generated from app/(site)/wow/forever/dungeons/kroldok-stronghold/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { ForeverDungeonGuide } from "@/components/wow/forever/ForeverDungeonGuide";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const title = "Krol’dok Stronghold — WoW Forever — Gildra";
const alternates = pairedAlternates(lang, "/wow/forever/dungeons/kroldok-stronghold");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverDungeonGuide lang={lang} slug="kroldok-stronghold" />; }
