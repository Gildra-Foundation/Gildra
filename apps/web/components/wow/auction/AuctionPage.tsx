import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowDown } from "lucide-react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { MaterialLinkButton, MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { AuctionBackdrop } from "./AuctionBackdrop";
import { AuctionBrowser } from "./AuctionBrowser";
import { auctionCopy } from "./auctionCopy";
import { auctionKit } from "./auctionKit";
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
      <AtlasHero align="start" className={styles.heroHeader} title={c.title} lede={c.lede} breadcrumbs={trail(lang, "auction")} breadcrumbsLabel={trailLabel(lang)}
        actions={<MaterialLinkButton kit={auctionKit} fit="stack" href="#auction-search" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{c.findItem}</MaterialLinkButton>} />
    </div>
    <Suspense fallback={<MaterialPlaque kit={auctionKit}><p className={materialStyles.text}>{c.loading}</p></MaterialPlaque>}><AuctionBrowser lang={lang} /></Suspense>
    <noscript><MaterialPlaque kit={auctionKit}><p className={materialStyles.text}>{c.noJS}</p></MaterialPlaque></noscript>
  </AtlasFrame>;
}
