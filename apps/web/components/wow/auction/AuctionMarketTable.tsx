"use client";
import { memo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import type { AuctionMarketItem } from "@/lib/wow/auctionBrowser";
import type { AuctionSortKey } from "@/lib/wow/auctionMarketSummary";
import { auctionCopy } from "./auctionCopy";
import { AuctionItemLabel, rankedName } from "./AuctionMarketParts";
import { AuctionMoney } from "./AuctionMoney";
import styles from "./auction.module.css";

/**
 * One row per item: the cheapest unit, the median unit (half of all listed units cost less) and the units listed.
 * Column heads sort; the box on the left puts an item on the compare tray; the name opens the item.
 */
export function AuctionMarketTable({ items, lang, sort, dir, onSort, selected, onToggle, onOpen, mixed, label }: {
  items: readonly AuctionMarketItem[]; lang: "ru" | "en"; sort: AuctionSortKey | ""; dir: "asc" | "desc";
  onSort: (key: AuctionSortKey | "", dir?: "asc" | "desc") => void; selected: readonly number[]; onToggle: (item: AuctionMarketItem) => void;
  onOpen: (item: AuctionMarketItem) => void; mixed: boolean; label: string;
}) {
  const c = auctionCopy[lang];
  const head = (key: AuctionSortKey, text: string, numeric = true) => {
    const active = sort === key;
    return <th scope="col" data-numeric={numeric || undefined} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" className={styles.sortButton} data-active={active || undefined} onClick={() => onSort(key)}>
        <span>{text}</span>{active ? dir === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" /> : null}
      </button>
    </th>;
  };
  const options: [AuctionSortKey, "asc" | "desc", string][] = [["min", "asc", `${c.minPrice} ↑`], ["min", "desc", `${c.minPrice} ↓`], ["median", "asc", `${c.median} ↑`], ["median", "desc", `${c.median} ↓`], ["quantity", "desc", `${c.available} ↓`], ["quantity", "asc", `${c.available} ↑`], ["name", "asc", `${c.item} ↑`], ["name", "desc", `${c.item} ↓`]];
  return <>
  {/* Phones show rows as cards without column heads, so sorting moves into one select. */}
  <label className={styles.mobileSort}>
    <span className={styles.fieldLabel}>{c.sortBy}</span>
    <AtlasSelect value={sort ? `${sort}:${dir}` : ""} onChange={event => { const [key, order] = event.target.value.split(":") as [AuctionSortKey | "", "asc" | "desc"]; onSort(key, order); }}>
      <option value="">{c.newestFirst}</option>
      {options.map(([key, order, text]) => <option key={`${key}:${order}`} value={`${key}:${order}`}>{text}</option>)}
    </AtlasSelect>
  </label>
  <div className={styles.marketScroll} role="region" aria-label={label} tabIndex={0}>
    <table className={styles.marketTable}>
      <thead><tr>
        <th scope="col" className={styles.pickCell}><span className={styles.srOnly}>{c.select}</span></th>
        {head("name", c.item, false)}{head("min", c.minPrice)}{head("median", c.median)}{head("quantity", c.available)}
      </tr></thead>
      <tbody>{items.map(item => <MarketRow key={`${item.market}:${item.itemId}`} item={item} lang={lang} picked={selected.includes(item.itemId)} mixed={mixed} onToggle={onToggle} onOpen={onOpen} />)}</tbody>
    </table>
  </div>
  </>;
}

/** One market row. Memoised: picking an item for the comparison re-renders its own row only
 *  (the browser passes handlers with a stable identity). */
const MarketRow = memo(function MarketRow({ item, lang, picked, mixed, onToggle, onOpen }: {
  item: AuctionMarketItem; lang: "ru" | "en"; picked: boolean; mixed: boolean;
  onToggle: (item: AuctionMarketItem) => void; onOpen: (item: AuctionMarketItem) => void;
}) {
  const c = auctionCopy[lang], name = rankedName(item, lang);
  return <tr className={styles.marketRow} data-selected={picked || undefined}>
    <td className={styles.pickCell}>
      <label className={styles.pickHit}><input type="checkbox" className={styles.pick} checked={picked} onChange={() => onToggle(item)} aria-label={`${c.select}: ${name}`} /></label>
    </td>
    <th scope="row" className={styles.marketItem}>
      <button type="button" className={styles.itemOpen} onClick={() => onOpen(item)} aria-haspopup="dialog">
        <AuctionItemLabel item={item} lang={lang} size={36} />
        {mixed && item.market === "realm" ? <span className={styles.marketTag}>{c.realmLots}</span> : null}
      </button>
    </th>
    <td data-numeric data-label={c.minPrice}><AuctionMoney value={item.minPrice} lang={lang} /></td>
    <td data-numeric data-label={c.median}><AuctionMoney value={item.medianPrice} lang={lang} /></td>
    <td data-numeric data-label={c.available} className={styles.quantity}>{item.quantity.toLocaleString(lang)}</td>
  </tr>;
});
