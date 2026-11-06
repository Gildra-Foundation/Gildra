"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { Package } from "lucide-react";
import { materialStyles } from "@/components/wow/shared/materialAtlas";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { AuctionMarketItem } from "@/lib/wow/auctionBrowser";
import { auctionIconFrameStyle } from "./auctionKit";
import { auctionCopy } from "./auctionCopy";
import styles from "./auction.module.css";

export function qualityStyle(qualityId: number | null | undefined): CSSProperties | undefined {
  const palette = itemQualityColors[qualityId as keyof typeof itemQualityColors];
  return palette ? { "--auction-quality": palette.frame, "--auction-quality-text": palette.text } as CSSProperties : undefined;
}

/** Item icon inside the kit's painted frame; a missing icon becomes a quiet crate. */
export function AuctionIcon({ url, size = 40 }: { url: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={materialStyles.iconFrame} style={auctionIconFrameStyle(size)} aria-hidden="true">
    {url && failed !== url ? <Image src={url} alt="" width={size} height={size} unoptimized loading="lazy" onError={() => setFailed(url)} /> : <Package size={Math.round(size / 2)} />}
  </span>;
}

/** Crafting-quality rank as the game draws it: one to three small gems. */
export function AuctionRank({ rank, lang }: { rank: number | null; lang: "ru" | "en" }) {
  if (!rank) return null;
  return <span className={styles.rank} data-rank={rank} role="img" aria-label={`${auctionCopy[lang].rank} ${rank}`}>
    {Array.from({ length: rank }, (_, index) => <svg key={index} viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M5 0 10 5 5 10 0 5Z" /></svg>)}
  </span>;
}

export function AuctionItemLabel({ item, lang, size = 40 }: { item: Pick<AuctionMarketItem, "name" | "iconUrl" | "qualityId" | "rank">; lang: "ru" | "en"; size?: number }) {
  return <span className={styles.itemLabel} style={qualityStyle(item.qualityId)}>
    <AuctionIcon url={item.iconUrl} size={size} />
    <span className={styles.itemLabelText}>
      <span className={styles.itemName}>{item.name ?? auctionCopy[lang].metadata}</span>
      <AuctionRank rank={item.rank} lang={lang} />
    </span>
  </span>;
}
