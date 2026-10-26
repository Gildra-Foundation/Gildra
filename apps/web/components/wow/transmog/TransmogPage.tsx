import type { Metadata } from "next";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { TransmogStudio } from "./TransmogStudio";
import { transmogCopy } from "./transmogCopy";

export function transmogMetadata(lang: "ru" | "en"): Metadata {
  const c = transmogCopy[lang];
  return { title: c.title, description: c.lede, alternates: pairedAlternates(lang, "/wow/transmog"),
    openGraph: pageOpenGraph(lang, { title: c.title, description: c.lede, path: `${lang === "ru" ? "/ru" : ""}/wow/transmog` }) };
}

export function TransmogPage({ lang }: { lang: "ru" | "en" }) {
  const c = transmogCopy[lang];
  return <AtlasFrame scene="articles" lang={lang}>
    <AtlasHero title={c.title} eyebrow={c.eyebrow} lede={c.lede} breadcrumbs={trail(lang, "transmog")} breadcrumbsLabel={trailLabel(lang)} />
    <TransmogStudio lang={lang} />
    <noscript>{c.noJS}</noscript>
  </AtlasFrame>;
}
