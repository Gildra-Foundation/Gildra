import Image from "next/image";
import { copperParts } from "@/lib/wow/auctionBrowser";
import { auctionCopy } from "./auctionCopy";
import styles from "./auction.module.css";
export function AuctionMoney({ value, lang }: { value: number | null; lang: "ru" | "en" }) {
  if (value === null) return <span>—</span>;
  const c = auctionCopy[lang], parts = copperParts(value);
  const coins = [["gold", parts.gold, c.goldFull], ["silver", parts.silver, c.silverFull], ["copper", parts.copper, c.copperFull]] as const;
  return <span className={styles.money} aria-label={`${!Number.isInteger(value) ? c.approximately : ""} ${parts.gold} ${c.goldFull}, ${parts.silver} ${c.silverFull}, ${parts.copper} ${c.copperFull}`}>
    {!Number.isInteger(value) ? "≈ " : ""}{coins.map(([coin, count, label]) => <span key={coin} className={styles.coin} aria-hidden="true">{count.toLocaleString(lang)}<Image src={`/assets/wow/ui-textures/auction/${coin}.png`} width={13} height={13} alt="" title={label} unoptimized /></span>)}
  </span>;
}
