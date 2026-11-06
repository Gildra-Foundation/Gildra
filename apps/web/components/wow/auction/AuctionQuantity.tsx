"use client";
import { useState } from "react";
import clsx from "clsx";
import { clampQuantity, COMPARE_QUANTITY_PRESETS } from "@/lib/wow/auctionMarketCompare";
import { auctionCopy } from "./auctionCopy";
import styles from "./auction.module.css";

/** Units to buy: common amounts in one tap, any other amount typed. Shared by the comparison and the item. */
export function AuctionQuantity({ id, value, onChange, lang, showLabel, className }: {
  id: string; value: number; onChange: (value: number) => void; lang: "ru" | "en"; showLabel?: boolean; className?: string;
}) {
  const c = auctionCopy[lang], [text, setText] = useState<string | null>(null);
  return <div className={clsx(styles.qty, className)} role="group" aria-labelledby={`${id}-label`}>
    <span id={`${id}-label`} className={showLabel ? styles.fieldLabel : styles.srOnly}>{c.buyQuantity}</span>
    <div className={styles.qtyRow}>
      {COMPARE_QUANTITY_PRESETS.map(preset => <button key={preset} type="button" className={styles.qtyPreset} aria-pressed={value === preset}
        onClick={() => { setText(null); onChange(preset); }}>{preset.toLocaleString(lang)}</button>)}
      <input id={id} className={styles.qtyInput} type="number" inputMode="numeric" min={1} max={1000000} step={1} aria-labelledby={`${id}-label`}
        value={text ?? String(value)}
        onChange={event => { const raw = event.target.value, number = Number(raw); setText(raw); if (raw !== "" && number >= 1) onChange(clampQuantity(number)); }}
        onBlur={() => setText(null)} />
    </div>
  </div>;
}
