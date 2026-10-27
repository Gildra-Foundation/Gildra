import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowDown } from "lucide-react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { MythicHubLinkButton as AtlasLinkButton } from "@/components/wow/shared/materialAtlas";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { AuctionBackdrop } from "./AuctionBackdrop";
import { AuctionBrowser } from "./AuctionBrowser";
import { auctionCopy } from "./auctionCopy";
import { auctionButtonStyle, auctionPlaqueStyle } from "./auctionKit";
import styles from "./auction.module.css";
export function auctionMetadata(lang: "ru" | "en"): Metadata {
  const c = auctionCopy[lang];
  return { title: c.title, description: c.lede, alternates: pairedAlternates(lang, "/wow/auction"),
    openGraph: pageOpenGraph(lang, { title: c.title, description: c.lede, path: `${lang === "ru" ? "/ru" : ""}/wow/auction` }) };
}
export function AuctionPage({ lang }: { lang: "ru" | "en" }) {
  const c = auctionCopy[lang];
  return <AtlasFrame lang={lang} className={styles.page} still foot={false} dataAttributes={{ "data-auction-hub": true }}>
    <AuctionBackdrop />
    <div className={styles.hero}>
      <AtlasHero align="start" className={styles.heroHeader} title={c.title} eyebrow={c.eyebrow} lede={c.lede} breadcrumbs={trail(lang, "auction")} breadcrumbsLabel={trailLabel(lang)}
        actions={<span className={styles.actionSlot} style={auctionButtonStyle()}><AtlasLinkButton className={styles.assetButton} href="#auction-search" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{c.findItem}</AtlasLinkButton></span>} />
    </div>
    <Suspense fallback={<div className={styles.plaque} style={auctionPlaqueStyle()}>{c.loading}</div>}><AuctionBrowser lang={lang} /></Suspense>
    <noscript><div className={styles.plaque} style={auctionPlaqueStyle()}>{c.noJS}</div></noscript>
  </AtlasFrame>;
}
