// Generated from app/(site)/wow/mists/talents/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { MistsTalentIndex } from "@/components/wow/mists/MistsTalentsPage";
import { mistsCopy } from "@/components/wow/mists/mistsCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { versionDescription } from "@/lib/seo/versionDescriptions";
const lang = "ru";
const title = `${mistsCopy[lang].calculator} — ${mistsCopy[lang].title}`;
const alternates = pairedAlternates(lang, "/wow/mists/talents");
const description = versionDescription("mistsTalents", lang);
export const metadata: Metadata = { title: `${title} — WowArcana`, description, alternates, openGraph: pageOpenGraph(lang, { title, description, path: String(alternates.canonical) }) };
export default function Page() { return <MistsTalentIndex lang={lang} />; }
