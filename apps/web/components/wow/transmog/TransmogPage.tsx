import type { Metadata } from "next";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { TransmogStudio } from "./TransmogStudio";
import { transmogCopy } from "./transmogCopy";
import styles from "./transmog.module.css";
import { seoDescriptions, seoTitles } from "@/lib/seo/titles";

export function transmogMetadata(lang: "ru" | "en"): Metadata {
  const title = seoTitles.transmog[lang];
  const description = seoDescriptions.transmog[lang];
  return { title, description, alternates: pairedAlternates(lang, "/wow/transmog"),
    openGraph: pageOpenGraph(lang, { title, description, path: `${lang === "ru" ? "/ru" : ""}/wow/transmog` }) };
}

export function TransmogPage({ lang }: { lang: "ru" | "en" }) {
  const c = transmogCopy[lang];
  return <AtlasFrame scene="transmog" lang={lang}>
    <TransmogStudio lang={lang}
      hero={<AtlasHero className={styles.hero} title={c.title} lede={c.lede} breadcrumbs={trail(lang, "transmog")} breadcrumbsLabel={trailLabel(lang)} />} />
    <noscript>{c.noJS}</noscript>
  </AtlasFrame>;
}
