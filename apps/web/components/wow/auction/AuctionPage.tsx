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
import { Hammer } from "lucide-react";
import { RelatedLinks } from "@/components/wow/shared/RelatedLinks";
import { relatedCopy } from "@/components/wow/shared/relatedLinksCopy";
import { seoDescriptions, seoTitles } from "@/lib/seo/titles";

export function auctionMetadata(lang: "ru" | "en"): Metadata {
  const title = seoTitles.auction[lang];
  const description = seoDescriptions.auction[lang];
  return { title, description, alternates: pairedAlternates(lang, "/wow/auction"),
    openGraph: pageOpenGraph(lang, { title, description, path: `${lang === "ru" ? "/ru" : ""}/wow/auction` }) };
}

/** /wow/auction: a tool page (design.md §3.6) — scene hero, search and categories on the kit's plaque, the market list on a second plaque. */
export function AuctionPage({ lang }: { lang: "ru" | "en" }) {
  const c = auctionCopy[lang];
  return <AtlasFrame lang={lang} className={styles.page} still foot={false} dataAttributes={{ "data-auction-hub": true }}>
    <AuctionBackdrop />
    <div className={styles.hero}>
      <AtlasHero align="start" className={styles.heroHeader} title={c.title} lede={c.lede} breadcrumbs={trail(lang, "auction")} breadcrumbsLabel={trailLabel(lang)} />
    </div>
    <Suspense fallback={<div className={styles.browser}>
      <AuctionPlaque className={`${styles.searchPlaque} ${styles.searchHold}`}><AtlasSkeleton variant="rows" count={4} label={c.loading} /></AuctionPlaque>
      <AuctionPlaque className={styles.resultsPlaque} aria-hidden="true"><AtlasSkeleton variant="rows" count={8} label={c.loading} className={styles.skeleton} /></AuctionPlaque>
    </div>}><AuctionBrowser lang={lang} /></Suspense>
    <noscript><AuctionPlaque><p className={materialStyles.text}>{c.noJS}</p></AuctionPlaque></noscript>
    <RelatedLinks label={relatedCopy[lang].label} links={[{ href: `${lang === "ru" ? "/ru" : ""}/wow/professions`, label: relatedCopy[lang].professions, icon: <Hammer aria-hidden="true" /> }]} />
  </AtlasFrame>;
}
