// Generated from app/(site)/wow/forever/dungeons/ruins-of-lordaeron/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { ForeverDungeonGuide } from "@/components/wow/forever/ForeverDungeonGuide";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const title = "Ruins of Lordaeron — WoW Forever — Gildra";
const alternates = pairedAlternates(lang, "/wow/forever/dungeons/ruins-of-lordaeron");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverDungeonGuide lang={lang} slug="ruins-of-lordaeron" />; }
