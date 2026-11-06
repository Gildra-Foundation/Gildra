"use client";
import type { AuctionLadderStep } from "@/lib/wow/auctionMarketSummary";
import { auctionCopy } from "./auctionCopy";
import { AuctionMoney } from "./AuctionMoney";
import styles from "./auction.module.css";

/** Keep the part of the ladder a buyer meets: up to 95 % of the units or three times the median, whichever comes first. */
export function depthWindow(ladder: readonly AuctionLadderStep[], median: number) {
  const total = ladder.reduce((sum, [, qty]) => sum + qty, 0);
  const steps: AuctionLadderStep[] = [];
  let seen = 0;
  for (const step of ladder) {
    if (steps.length && (seen >= total * .95 || step[0] > median * 3)) break;
    steps.push(step); seen += step[1];
  }
  return { steps, units: seen };
}

/**
 * Market depth: how many units can be bought up to a unit price. A step line, cheapest at the left;
 * `marker` draws where the chosen quantity lands.
 */
export function AuctionDepthChart({ ladder, median, lang, marker }: { ladder: readonly AuctionLadderStep[]; median: number; lang: "ru" | "en"; marker?: number }) {
  const c = auctionCopy[lang], { steps, units } = depthWindow(ladder, median);
  if (steps.length < 2 || units <= 0) return null;
  const low = steps[0][0], high = steps[steps.length - 1][0], span = Math.max(1, high - low);
  const x = (value: number) => (value / units) * 100, y = (price: number) => 36 - ((price - low) / span) * 32;
  let seen = 0, path = `M0 ${y(low).toFixed(2)}`;
  for (const [price, qty] of steps) { path += ` H${x(seen).toFixed(2)} V${y(price).toFixed(2)}`; seen += qty; path += ` H${x(seen).toFixed(2)}`; }
  const area = `${path} V40 H0 Z`;
  const markX = marker && marker > 0 ? Math.min(100, x(marker)) : null;
  return <figure className={styles.depth}>
    <figcaption className={styles.depthTitle}>{c.depth}</figcaption>
    <div className={styles.depthPlot}>
      <span className={styles.depthHigh}><AuctionMoney value={high} lang={lang} /></span>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${c.depth}: ${units.toLocaleString(lang)} ${c.units}`}>
        <path d={area} className={styles.depthArea} />
        <path d={path} className={styles.depthLine} vectorEffect="non-scaling-stroke" />
        {markX !== null ? <line x1={markX} x2={markX} y1="0" y2="40" className={styles.depthMarker} vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <span className={styles.depthLow}><AuctionMoney value={low} lang={lang} /></span>
    </div>
    <div className={styles.depthAxis}><span>0</span><span>{units.toLocaleString(lang)} {c.units}</span></div>
  </figure>;
}
