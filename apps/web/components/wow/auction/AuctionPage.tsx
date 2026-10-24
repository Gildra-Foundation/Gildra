import { Suspense } from "react";
import type { Metadata } from "next";
import { AtlasFrame, AtlasHero, AtlasPanel } from "@/components/atlas";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { AuctionBrowser } from "./AuctionBrowser";
import { auctionCopy } from "./auctionCopy";
export function auctionMetadata(lang: "ru" | "en"): Metadata {
  const c = auctionCopy[lang];
  return { title: c.title, description: c.lede, alternates: pairedAlternates(lang, "/wow/auction"),
    openGraph: pageOpenGraph(lang, { title: c.title, description: c.lede, path: `${lang === "ru" ? "/ru" : ""}/wow/auction` }) };
}
export function AuctionPage({ lang }: { lang: "ru" | "en" }) {
  const c = auctionCopy[lang];
  return <AtlasFrame scene="articles" lang={lang}>
    <AtlasHero title={c.title} eyebrow={c.eyebrow} lede={c.lede} breadcrumbs={trail(lang, "auction")} breadcrumbsLabel={trailLabel(lang)} />
    <Suspense fallback={<AtlasPanel>{c.loading}</AtlasPanel>}><AuctionBrowser lang={lang} /></Suspense>
    <noscript>{c.noJS}</noscript>
  </AtlasFrame>;
}
