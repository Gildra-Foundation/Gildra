import { Suspense } from "react";
import type { Metadata } from "next";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { AtlasSkeleton } from "@gildra/atlas-ui/AtlasState";
import { materialStyles } from "@/components/wow/shared/materialAtlas";
import { pairedAlternates, pageOpenGraph } from "@/lib/seo/metadata";
import { trail, trailLabel } from "@/lib/routes/registry";
import { AuctionBackdrop } from "./AuctionBackdrop";
import { AuctionBrowser } from "./AuctionBrowser";
import { auctionCopy } from "./auctionCopy";
import { AuctionPlaque } from "./AuctionMaterial";
import styles from "./auction.module.css";

export function auctionMetadata(lang: "ru" | "en"): Metadata {
  const c = auctionCopy[lang];
  return { title: c.title, description: c.lede, alternates: pairedAlternates(lang, "/wow/auction"),
    openGraph: pageOpenGraph(lang, { title: c.title, description: c.lede, path: `${lang === "ru" ? "/ru" : ""}/wow/auction` }) };
}

/** /wow/auction: a tool page (design.md §3.6) — scene hero, search and categories on the kit's plaque, the market list on a second plaque. */
export function AuctionPage({ lang }: { lang: "ru" | "en" }) {
  const c = auctionCopy[lang];
  return <AtlasFrame lang={lang} className={styles.page} still foot={false} dataAttributes={{ "data-auction-hub": true }}>
    <AuctionBackdrop />
    <div className={styles.hero}>
      <AtlasHero align="start" className={styles.heroHeader} title={c.title} lede={c.lede} breadcrumbs={trail(lang, "auction")} breadcrumbsLabel={trailLabel(lang)} />
    </div>
    <Suspense fallback={<AuctionPlaque className={styles.searchPlaque}><AtlasSkeleton variant="rows" count={4} label={c.loading} /></AuctionPlaque>}><AuctionBrowser lang={lang} /></Suspense>
    <noscript><AuctionPlaque><p className={materialStyles.text}>{c.noJS}</p></AuctionPlaque></noscript>
  </AtlasFrame>;
}
