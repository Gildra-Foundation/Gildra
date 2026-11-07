// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MistsClassTalentsPage } from "@/components/wow/mists/MistsTalentsPage";
import { mistsCopy } from "@/components/wow/mists/mistsCopy";
import { mistsClass, mistsClasses } from "@/lib/wow/mists/data";
import { parseMistsBuild } from "@/lib/wow/mists/types";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
const lang = "en";
type Props = { params: Promise<{ class: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export const dynamicParams = false;
export const generateStaticParams = () => mistsClasses.map(cls => ({ class: cls.slug }));
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cls = mistsClass((await params).class);
  if (!cls) return {};
  const title = `${mistsCopy[lang].classTalents(cls.name[lang])} — ${mistsCopy[lang].title}`;
  const alternates = pairedAlternates(lang, `/wow/mists/talents/${cls.slug}`);
  return { title: `${title} — Gildra`, alternates, openGraph: pageOpenGraph(lang, { title, path: String(alternates.canonical) }) };
}
export default async function Page({ params, searchParams }: Props) {
  const cls = mistsClass((await params).class);
  if (!cls) notFound();
  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return <MistsClassTalentsPage lang={lang} cls={cls} build={parseMistsBuild(cls, one(query.spec), one(query.talents))} />;
}
