// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { ForeverTalentsIndex } from "@/components/wow/forever/talents/ForeverTalentsPage";
import { talentCopy } from "@/components/wow/forever/talents/talentCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { versionDescription } from "@/lib/seo/versionDescriptions";
const lang = "en";
const title = `${talentCopy[lang].title} — WoW Forever — WowArcana`;
const alternates = pairedAlternates(lang, "/wow/forever/talent-calc");
const description = versionDescription("foreverTalents", lang);
export const metadata: Metadata = { title, description, alternates, openGraph: pageOpenGraph(lang, { title, description, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverTalentsIndex lang={lang} />; }
