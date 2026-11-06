"use client";
import { useState } from "react";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasSkeleton } from "@gildra/atlas-ui/AtlasState";
import { X } from "lucide-react";
import type { AuctionMarketItem, AuctionMarketView, AuctionRegion, AuctionResult } from "@/lib/wow/auctionBrowser";
import { ladderCost, type AuctionLadderStep } from "@/lib/wow/auctionMarketSummary";
import { auctionCopy } from "./auctionCopy";
import { AuctionDepthChart } from "./AuctionDepthChart";
import { AuctionListings } from "./AuctionListings";
import { AuctionButton } from "./AuctionMaterial";
import { AuctionItemLabel, qualityStyle } from "./AuctionMarketParts";
import { AuctionMoney } from "./AuctionMoney";
import { auctionErrorMessage } from "./auctionErrors";
import { useAuctionData } from "./useAuctionData";
import styles from "./auction.module.css";

/** Units field shared by the item and the comparison: what N units cost from the cheapest lots. */
export function BuyQuantity({ id, value, onChange, lang }: { id: string; value: number; onChange: (value: number) => void; lang: "ru" | "en" }) {
  return <label className={styles.buyField} htmlFor={id}>
    <span className={styles.fieldLabel}>{auctionCopy[lang].buyQuantity}</span>
    <input id={id} className={styles.buyInput} type="number" inputMode="numeric" min={1} max={1000000} step={1} value={value || ""}
      onChange={event => onChange(Math.max(0, Math.min(1000000, Math.floor(Number(event.target.value) || 0))))} />
  </label>;
}

export function BuyCost({ ladder, quantity, lang }: { ladder: readonly AuctionLadderStep[]; quantity: number; lang: "ru" | "en" }) {
  const c = auctionCopy[lang], cost = ladderCost(ladder, quantity);
  if (!quantity || !cost.bought) return null;
  return <dl className={styles.buyCost} aria-live="polite">
    <div><dt>{c.total}</dt><dd><AuctionMoney value={cost.total} lang={lang} /></dd></div>
    <div><dt>{c.average}</dt><dd><AuctionMoney value={cost.average} lang={lang} /></dd></div>
    {cost.bought < quantity ? <div><dt>{c.shortfall}</dt><dd>{cost.bought.toLocaleString(lang)} {c.units}</dd></div>
      : <div><dt>{c.upTo}</dt><dd><AuctionMoney value={cost.highest} lang={lang} /></dd></div>}
  </dl>;
}

function Ladder({ ladder, lang }: { ladder: readonly AuctionLadderStep[]; lang: "ru" | "en" }) {
  const c = auctionCopy[lang];
  const rows = ladder.slice(0, 12).map(([price, qty], index, all) => ({ price, qty, total: all.slice(0, index + 1).reduce((sum, [, n]) => sum + n, 0) }));
  return <table className={styles.ladder}>
    <caption className={styles.ladderTitle}>{c.priceLevels}</caption>
    <thead><tr><th scope="col" data-numeric>{c.unit}</th><th scope="col" data-numeric>{c.quantity}</th><th scope="col" data-numeric>{c.cumulative}</th></tr></thead>
    <tbody>{rows.map(({ price, qty, total }) => <tr key={price}><td data-numeric><AuctionMoney value={price} lang={lang} /></td><td data-numeric>{qty.toLocaleString(lang)}</td><td data-numeric>{total.toLocaleString(lang)}</td></tr>)}</tbody>
  </table>;
}

function RealmLots({ itemId, region, realm, lang }: { itemId: number; region: AuctionRegion; realm: string; lang: "ru" | "en" }) {
  const c = auctionCopy[lang], [page, setPage] = useState(1);
  const url = `/api/wow/auction?${new URLSearchParams({ region, realm, market: "realm", q: String(itemId), lang, sort: "price", page: String(page) })}`;
  const lots = useAuctionData<AuctionResult>(url);
  return <section className={styles.detailLots} aria-label={c.listings}>
    <h3 className={styles.ladderTitle}>{c.listings}</h3>
    {lots.data ? <AuctionListings data={lots.data} lang={lang} query={{ region, realm }} onPage={setPage} />
      : lots.error ? <div className={styles.stateBox} role="alert"><p className={styles.stateText}>{auctionErrorMessage(lots.error, lang)}</p><AuctionButton onClick={lots.retry}>{c.retry}</AuctionButton></div>
      : <AtlasSkeleton variant="rows" count={3} label={c.loading} />}
  </section>;
}

/** The item's own view: price summary, what a quantity costs, the depth of the market and its cheapest levels. */
export function AuctionItemDetail({ itemId, market, region, realm, lang, preview, picked, onToggle, onClose }: {
  itemId: number; market: "commodities" | "realm"; region: AuctionRegion; realm: string; lang: "ru" | "en";
  preview?: AuctionMarketItem; picked: boolean; onToggle: (item: AuctionMarketItem) => void; onClose: () => void;
}) {
  const c = auctionCopy[lang], [quantity, setQuantity] = useState(20);
  const url = `/api/wow/auction?${new URLSearchParams({ action: "market", region, lang, items: String(itemId), ...(market === "realm" && realm ? { realm } : {}) })}`;
  const result = useAuctionData<AuctionMarketView>(url);
  const item = result.data?.items.find(row => row.market === market) ?? result.data?.items[0];
  const shown = item ?? preview;
  const name = shown?.name ?? c.metadata;
  const reference = `https://www.wowhead.com/${lang === "ru" ? "ru/" : ""}item=${itemId}`;
  return <AtlasDialog open onClose={onClose} label={name} className={styles.detailDialog}>
    <div className={styles.detail} style={qualityStyle(shown?.qualityId)}>
      <header className={styles.detailHead}>
        {shown ? <AuctionItemLabel item={shown} lang={lang} size={52} /> : <span className={styles.detailName}>{name}</span>}
        <button type="button" className={styles.detailClose} onClick={onClose} aria-label={c.closeItem}><X size={18} aria-hidden="true" /></button>
      </header>
      {shown ? <dl className={styles.detailStats}>
        <div><dt>{c.minPrice}</dt><dd><AuctionMoney value={shown.minPrice} lang={lang} /></dd></div>
        <div><dt>{c.median}</dt><dd><AuctionMoney value={shown.medianPrice} lang={lang} /></dd></div>
        <div><dt>{c.available}</dt><dd className={styles.quantity}>{shown.quantity.toLocaleString(lang)}</dd></div>
      </dl> : null}
      {result.error ? <div className={styles.stateBox} role="alert"><p className={styles.stateText}>{auctionErrorMessage(result.error, lang)}</p><AuctionButton onClick={result.retry}>{c.retry}</AuctionButton></div>
        : !item?.ladder ? (market === "commodities" ? <AtlasSkeleton variant="lines" count={4} label={c.loading} /> : null)
        : <>
          {/* Gear lots differ from each other, so only the region's commodities get the quantity tools. */}
          {market === "commodities" ? <>
            <div className={styles.buyRow}><BuyQuantity id={`auction-buy-${itemId}`} value={quantity} onChange={setQuantity} lang={lang} /><BuyCost ladder={item.ladder} quantity={quantity} lang={lang} /></div>
            <AuctionDepthChart ladder={item.ladder} median={item.medianPrice} lang={lang} marker={quantity} />
            <Ladder ladder={item.ladder} lang={lang} />
          </> : null}
        </>}
      {market === "realm" && realm ? <RealmLots itemId={itemId} region={region} realm={realm} lang={lang} /> : null}
      <footer className={styles.detailActions}>
        <a href={reference} target="_blank" rel="noreferrer">{c.wowhead}</a>
        {shown ? <AuctionButton onClick={() => onToggle(shown)}>{picked ? c.removeCompare : c.addCompare}</AuctionButton> : null}
      </footer>
    </div>
  </AtlasDialog>;
}
