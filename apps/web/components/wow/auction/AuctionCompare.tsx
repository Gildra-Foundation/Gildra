"use client";
import { useState } from "react";
import { AtlasSkeleton } from "@gildra/atlas-ui/AtlasState";
import { X } from "lucide-react";
import type { AuctionMarketItem, AuctionMarketView, AuctionRegion } from "@/lib/wow/auctionBrowser";
import { ladderCost } from "@/lib/wow/auctionMarketSummary";
import { auctionCopy } from "./auctionCopy";
import { AuctionButton } from "./AuctionMaterial";
import { AuctionIcon, AuctionItemLabel } from "./AuctionMarketParts";
import { AuctionMoney } from "./AuctionMoney";
import { BuyQuantity } from "./AuctionItemDetail";
import { auctionErrorMessage } from "./auctionErrors";
import { useAuctionData } from "./useAuctionData";
import styles from "./auction.module.css";

/** One entry per compared item: the region market when the item trades there, otherwise the realm. */
export function compareEntries(items: readonly AuctionMarketItem[], order: readonly number[]) {
  return order.map(id => items.find(item => item.itemId === id && item.market === "commodities") ?? items.find(item => item.itemId === id))
    .filter((item): item is AuctionMarketItem => Boolean(item));
}

function Bar({ value, max, label }: { value: number; max: number; label: React.ReactNode }) {
  return <div className={styles.compareBar}>
    <span className={styles.compareTrack} aria-hidden="true"><span style={{ inlineSize: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} /></span>
    <span className={styles.compareValue}>{label}</span>
  </div>;
}

/** Selected items side by side: min and median unit price as bars on one scale, units listed, and what N units cost. */
export function AuctionCompare({ ids, region, realm, lang, onOpen, onRemove, onBack }: {
  ids: readonly number[]; region: AuctionRegion; realm: string; lang: "ru" | "en";
  onOpen: (item: AuctionMarketItem) => void; onRemove: (itemId: number) => void; onBack: () => void;
}) {
  const c = auctionCopy[lang], [quantity, setQuantity] = useState(100);
  const url = ids.length ? `/api/wow/auction?${new URLSearchParams({ action: "market", region, lang, items: ids.join(","), ...(realm ? { realm } : {}) })}` : null;
  const result = useAuctionData<AuctionMarketView>(url);
  const entries = result.data ? compareEntries(result.data.items, ids) : [];
  const maxPrice = Math.max(0, ...entries.map(item => item.medianPrice), ...entries.map(item => item.minPrice));
  const costs = entries.map(item => ladderCost(item.ladder ?? [], quantity));
  const maxCost = Math.max(0, ...costs.map(cost => cost.total));
  const maxQuantity = Math.max(0, ...entries.map(item => item.quantity));
  return <div className={styles.compare}>
    <div className={styles.compareTools}>
      <BuyQuantity id="auction-compare-quantity" value={quantity} onChange={setQuantity} lang={lang} />
      <AuctionButton onClick={onBack}>{c.backToList}</AuctionButton>
    </div>
    {result.error ? <div className={styles.stateBox} role="alert"><p className={styles.stateText}>{auctionErrorMessage(result.error, lang)}</p><AuctionButton onClick={result.retry}>{c.retry}</AuctionButton></div>
      : !result.data ? <AtlasSkeleton variant="cards" count={Math.max(2, ids.length)} label={c.loading} />
      : <ul className={styles.compareGrid}>{entries.map((item, index) => <li key={item.itemId} className={styles.compareCard}>
        <div className={styles.compareHead}>
          <button type="button" className={styles.itemOpen} onClick={() => onOpen(item)} aria-haspopup="dialog"><AuctionItemLabel item={item} lang={lang} size={40} /></button>
          <button type="button" className={styles.compareRemove} onClick={() => onRemove(item.itemId)} aria-label={`${c.removeCompare}: ${item.name ?? c.metadata}`}><X size={16} aria-hidden="true" /></button>
        </div>
        <dl className={styles.compareStats}>
          <div><dt>{c.minPrice}</dt><dd><Bar value={item.minPrice} max={maxPrice} label={<AuctionMoney value={item.minPrice} lang={lang} />} /></dd></div>
          <div><dt>{c.median}</dt><dd><Bar value={item.medianPrice} max={maxPrice} label={<AuctionMoney value={item.medianPrice} lang={lang} />} /></dd></div>
          <div><dt>{c.available}</dt><dd><Bar value={item.quantity} max={maxQuantity} label={<span className={styles.quantity}>{item.quantity.toLocaleString(lang)}</span>} /></dd></div>
          {quantity > 0 ? <div><dt>{quantity.toLocaleString(lang)} {c.units}</dt><dd>
            <Bar value={costs[index].total} max={maxCost} label={<AuctionMoney value={costs[index].total} lang={lang} />} />
            {costs[index].bought < quantity ? <span className={styles.compareNote}>{c.shortfall} {costs[index].bought.toLocaleString(lang)} {c.units}</span> : null}
          </dd></div> : null}
        </dl>
      </li>)}</ul>}
  </div>;
}

/** The tray under the list: icons of the picked items, Compare and Clear. */
export function AuctionCompareTray({ ids, known, lang, onCompare, onClear, onRemove }: {
  ids: readonly number[]; known: ReadonlyMap<number, AuctionMarketItem>; lang: "ru" | "en";
  onCompare: () => void; onClear: () => void; onRemove: (itemId: number) => void;
}) {
  const c = auctionCopy[lang];
  if (!ids.length) return null;
  return <div className={styles.tray} role="region" aria-label={c.compareTitle}>
    <ul className={styles.trayItems}>{ids.map(id => {
      const item = known.get(id), name = item?.name ?? c.metadata;
      return <li key={id}><button type="button" className={styles.trayItem} onClick={() => onRemove(id)} aria-label={`${c.removeCompare}: ${name}`} title={name}>
        <AuctionIcon url={item?.iconUrl ?? null} size={32} />
      </button></li>;
    })}</ul>
    <div className={styles.trayActions}>
      <button type="button" className={styles.trayClear} onClick={onClear}>{c.clear}</button>
      <AuctionButton variant="primary" onClick={onCompare} disabled={ids.length < 2}>{c.compare} · {ids.length}</AuctionButton>
    </div>
  </div>;
}
