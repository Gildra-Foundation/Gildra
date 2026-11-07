// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { HallGuide } from "@/components/wow/forever/HallGuide";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "en";
const title = "Hall of Thanes — WoW Forever — Gildra";
const alternates = pairedAlternates(lang, "/wow/forever/dungeons/hall-of-thanes");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <HallGuide lang={lang} />; }
