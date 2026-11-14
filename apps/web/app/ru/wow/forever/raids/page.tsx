// Generated from app/(site)/wow/forever/raids/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { ForeverInstances } from "@/components/wow/forever/ForeverInstances";
import { instanceCopy } from "@/components/wow/forever/instanceCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { versionDescription } from "@/lib/seo/versionDescriptions";
const lang = "ru";
const title = `${instanceCopy[lang].raids} — WoW Forever — WowArcana`;
const alternates = pairedAlternates(lang, "/wow/forever/raids");
const description = versionDescription("foreverRaids", lang);
export const metadata: Metadata = { title, description, alternates, openGraph: pageOpenGraph(lang, { title, description, path: String(alternates.canonical) }) };
export default function Page() { return <ForeverInstances lang={lang} kind="raids" />; }
