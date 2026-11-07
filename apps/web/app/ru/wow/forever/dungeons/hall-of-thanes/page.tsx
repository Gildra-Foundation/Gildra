// Generated from app/(site)/wow/forever/dungeons/hall-of-thanes/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { HallGuide } from "@/components/wow/forever/HallGuide";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const title = "Hall of Thanes — WoW Forever — Gildra";
const alternates = pairedAlternates(lang, "/wow/forever/dungeons/hall-of-thanes");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <HallGuide lang={lang} />; }
