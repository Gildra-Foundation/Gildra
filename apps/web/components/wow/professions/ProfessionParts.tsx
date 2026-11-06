"use client";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { Package } from "lucide-react";
import { materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { copperParts } from "@/lib/wow/auctionBrowser";
import { PROFESSION_KIT } from "./professionKit";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";


const qualityStyle = (quality: number | null | undefined) => {
  const palette = itemQualityColors[quality as keyof typeof itemQualityColors];
  return palette ? { "--profession-quality": palette.frame, "--profession-quality-text": palette.text } as CSSProperties : undefined;
};

/** Item icon inside the kit's painted frame; a missing icon becomes a quiet crate. */
export function ProfessionIcon({ url, size = 40 }: { url: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={materialStyles.iconFrame} style={materialIconFrameStyle(PROFESSION_KIT, size)} aria-hidden="true">
    {url && failed !== url ? <Image src={url} alt="" width={size} height={size} unoptimized loading="lazy" onError={() => setFailed(url)} /> : <Package size={Math.round(size / 2)} />}
  </span>;
}

/** Crafting-quality rank as the game draws it: small gems. */
export function ProfessionRank({ rank, lang }: { rank: number | null; lang: "ru" | "en" }) {
  if (!rank) return null;
  return <span className={styles.rank} data-rank={rank} role="img" aria-label={`${professionsCopy[lang].rank} ${rank}`}>
    {Array.from({ length: rank }, (_, index) => <svg key={index} viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M5 0 10 5 5 10 0 5Z" /></svg>)}
  </span>;
}

export function ProfessionItemLabel({ name, icon, quality, rank, lang, size = 32 }: { name: string | null; icon: string | null; quality: number | null; rank: number | null; lang: "ru" | "en"; size?: number }) {
  return <span className={styles.itemLabel} style={qualityStyle(quality)}>
    <ProfessionIcon url={icon} size={size} />
    <span className={styles.itemLabelText}>
      <span>{name ?? "—"}</span>
      <ProfessionRank rank={rank} lang={lang} />
    </span>
  </span>;
}

/** Gold, silver and copper with the game's coin icons. */
export function ProfessionMoney({ value, lang }: { value: number | null; lang: "ru" | "en" }) {
  if (value === null) return <span>—</span>;
  const c = professionsCopy[lang], parts = copperParts(value);
  const coins = [["gold", parts.gold, c.coins.gold], ["silver", parts.silver, c.coins.silver], ["copper", parts.copper, c.coins.copper]] as const;
  return <span className={styles.money} aria-label={`${parts.gold} ${c.coins.gold}, ${parts.silver} ${c.coins.silver}, ${parts.copper} ${c.coins.copper}`}>
    {coins.filter(([coin, count]) => count > 0 || (coin === "copper" && value < 1)).map(([coin, count]) => <span key={coin} className={styles.coin} aria-hidden="true">
      {count.toLocaleString(lang)}<Image src={`/assets/wow/ui-textures/auction/${coin}.png`} width={13} height={13} alt="" unoptimized />
    </span>)}
  </span>;
}
