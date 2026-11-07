// Generated from app/(site)/wow/mists/page.tsx by npm run routes:mirror — edit the English page.
import type { Metadata } from "next";
import { MistsHome } from "@/components/wow/mists/MistsHome";
import { mistsCopy } from "@/components/wow/mists/mistsCopy";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "ru";
const title = `${mistsCopy[lang].title} — ${mistsCopy[lang].classes}`;
const description = mistsCopy[lang].description;
const alternates = pairedAlternates(lang, "/wow/mists");
export const metadata: Metadata = { title: `${title} — Gildra`, description, alternates, openGraph: pageOpenGraph(lang, { title, description, path: String(alternates.canonical) }) };
export default function Page() { return <MistsHome lang={lang} />; }
