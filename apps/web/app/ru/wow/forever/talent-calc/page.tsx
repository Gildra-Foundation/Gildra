// Generated from app/(site)/wow/forever/talent-calc/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { ForeverTalentsIndex } from "@/components/wow/forever/talents/ForeverTalentsPage";
import { talentCopy } from "@/components/wow/forever/talents/talentCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const title = `${talentCopy[lang].title} — WoW Forever — WowArcana`;
const alternates = pairedAlternates(lang, "/wow/forever/talent-calc");
export const metadata: Metadata = { title, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverTalentsIndex lang={lang} />; }
