"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, ChevronUp, Trash2, X } from "lucide-react";
import { AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import type { AuctionMarketItem, AuctionMarketView, AuctionRegion } from "@/lib/wow/auctionBrowser";
import { compareTable, formatRatio, type CompareSortKey } from "@/lib/wow/auctionMarketCompare";
import { auctionCopy } from "./auctionCopy";
import { AuctionButton } from "./AuctionMaterial";
import { AuctionIcon, AuctionItemLabel, AuctionItemName, qualityStyle, rankedName } from "./AuctionMarketParts";
import { AuctionMoney } from "./AuctionMoney";
import { AuctionQuantity } from "./AuctionQuantity";
import { auctionErrorMessage } from "./auctionErrors";
import { useAuctionData } from "./useAuctionData";
import styles from "./auction.module.css";

type Lang = "ru" | "en";
type CompareItem = AuctionMarketItem & { absent?: boolean };

/** One entry per compared item: the region market when the item trades there, otherwise the realm. */
export function compareEntries(items: readonly AuctionMarketItem[], order: readonly number[]) {
  return order.map(id => items.find(item => item.itemId === id && item.market === "commodities") ?? items.find(item => item.itemId === id))
    .filter((item): item is AuctionMarketItem => Boolean(item));
}

const absentItem = (itemId: number, known?: AuctionMarketItem): CompareItem => ({
  itemId, market: known?.market ?? "commodities", name: known?.name ?? null, iconUrl: known?.iconUrl ?? null, qualityId: known?.qualityId ?? null,
  classId: known?.classId ?? null, subclassId: known?.subclassId ?? null, level: known?.level ?? null, rank: known?.rank ?? null,
  minPrice: 0, medianPrice: 0, quantity: 0, lots: 0, ladder: [], absent: true,
});

/** A value with a thin bar under it; every row of a column shares one scale. */
function Metric({ value, max, best, lang, children }: { value: number; max: number; best: boolean; lang: Lang; children: ReactNode }) {
  return <span className={styles.metric}>
    <span className={styles.metricValue}>
      {best ? <Check className={styles.bestMark} size={13} aria-hidden="true" /> : null}
      {children}{best ? <span className={styles.srOnly}> ({auctionCopy[lang].best})</span> : null}
    </span>
    <span className={styles.metricTrack} aria-hidden="true"><span style={{ inlineSize: `${max > 0 && value > 0 ? Math.max(3, (value / max) * 100) : 0}%` }} /></span>
  </span>;
}

/**
 * The comparison: one table, a row per item, the best value of each column marked, the cost of N units with how much
 * more it is than the cheapest. Rows known from the list show at once; price levels fill the cost column when they arrive.
 */
export function AuctionCompare({ ids, region, realm, lang, known, quantity, onQuantity, sort, dir, onSort, onOpen, onRemove }: {
  ids: readonly number[]; region: AuctionRegion; realm: string; lang: Lang;
  /** Rows already seen in a list: a reagent's rank is only known next to its other ranks. */
  known?: ReadonlyMap<number, AuctionMarketItem>;
  quantity: number; onQuantity: (value: number) => void;
  sort: CompareSortKey | ""; dir: "asc" | "desc"; onSort: (key: CompareSortKey | "", dir?: "asc" | "desc") => void;
  onOpen: (item: AuctionMarketItem) => void; onRemove: (itemId: number) => void;
}) {
  const c = auctionCopy[lang];
  const url = ids.length ? `/api/wow/auction?${new URLSearchParams({ action: "market", region, lang, items: ids.join(","), ...(realm ? { realm } : {}) })}` : null;
  const result = useAuctionData<AuctionMarketView>(url);
  /* The last answer keeps rows in place while a changed selection reloads. */
  const [kept, setKept] = useState<AuctionMarketView | null>(null);
  if (result.data && result.data !== kept) setKept(result.data);
  const withRank = (item: AuctionMarketItem): CompareItem => item.rank || !known?.get(item.itemId)?.rank ? item : { ...item, rank: known.get(item.itemId)?.rank ?? null };
  const loaded = result.data ? compareEntries(result.data.items, ids).map(withRank) : null;
  const items: CompareItem[] = loaded
    ? ids.map(id => loaded.find(item => item.itemId === id) ?? absentItem(id, known?.get(id)))
    : ids.flatMap(id => { const item = kept?.items.find(row => row.itemId === id && row.market === "commodities") ?? kept?.items.find(row => row.itemId === id) ?? known?.get(id); return item ? [withRank(item)] : []; });
  const waiting = loaded ? 0 : ids.length - items.length;
  const rows = compareTable(items, quantity, sort, dir, lang);
  const maxPrice = Math.max(0, ...items.map(item => Math.max(item.minPrice, item.medianPrice)));
  const maxQuantity = Math.max(0, ...items.map(item => item.quantity));
  const maxCost = Math.max(0, ...rows.map(row => row.cost?.total ?? 0));
  const costLabel = `${c.costOf} ${quantity.toLocaleString(lang)} ${c.units}`;

  /* A newly added row is briefly marked so the eye finds it. */
  const seen = useRef<readonly number[]>(ids), [fresh, setFresh] = useState<number | null>(null);
  useEffect(() => {
    const added = ids.find(id => !seen.current.includes(id));
    seen.current = ids;
    if (added === undefined) return;
    setFresh(added);
    const timer = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(timer);
  }, [ids]);

  const head = (key: CompareSortKey, text: string, numeric = true) => {
    const active = sort === key;
    return <th scope="col" data-numeric={numeric || undefined} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" className={styles.sortButton} data-active={active || undefined} onClick={() => onSort(key)}>
        <span>{text}</span>{active ? dir === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" /> : null}
      </button>
    </th>;
  };
  const sortOptions: [CompareSortKey, "asc" | "desc", string][] = [["cost", "asc", `${c.cost} ↑`], ["cost", "desc", `${c.cost} ↓`], ["min", "asc", `${c.minPrice} ↑`], ["min", "desc", `${c.minPrice} ↓`],
    ["median", "asc", `${c.median} ↑`], ["median", "desc", `${c.median} ↓`], ["quantity", "desc", `${c.available} ↓`], ["quantity", "asc", `${c.available} ↑`], ["name", "asc", `${c.item} ↑`], ["name", "desc", `${c.item} ↓`]];
  const sortValue = sort ? `${sort}:${dir}` : "";

  if (result.error) return <div className={styles.stateBox} role="alert"><p className={styles.stateText}>{auctionErrorMessage(result.error, lang)}</p><AuctionButton onClick={result.retry}>{c.retry}</AuctionButton></div>;
  return <div className={styles.compare}>
    {/* Narrow screens stack the rows, so sorting and the units move above the table. */}
    <div className={styles.compareToolbar}>
      <label className={styles.compareSort}>
        <span className={styles.fieldLabel}>{c.sortBy}</span>
        <AtlasSelect value={sortValue} onChange={event => { const [key, order] = event.target.value.split(":") as [CompareSortKey | "", "asc" | "desc"]; onSort(key, order); }}>
          <option value="">{c.asPicked}</option>
          {sortOptions.map(([key, order, text]) => <option key={`${key}:${order}`} value={`${key}:${order}`}>{text}</option>)}
        </AtlasSelect>
      </label>
      <AuctionQuantity id="auction-compare-qty-narrow" value={quantity} onChange={onQuantity} lang={lang} showLabel />
    </div>
    <div className={styles.compareScroll} role="region" aria-label={c.compareTitle} tabIndex={0} aria-busy={!loaded}>
      <table className={styles.compareTable}>
        <thead><tr>
          {head("name", c.item, false)}{head("min", c.minPrice)}{head("median", c.median)}{head("quantity", c.available)}
          <th scope="col" data-numeric className={styles.costHead} aria-sort={sort === "cost" ? (dir === "asc" ? "ascending" : "descending") : undefined}>
            <button type="button" className={styles.sortButton} data-active={sort === "cost" || undefined} onClick={() => onSort("cost")}>
              <span>{costLabel}</span>{sort === "cost" ? dir === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" /> : null}
            </button>
            <AuctionQuantity id="auction-compare-qty" value={quantity} onChange={onQuantity} lang={lang} />
          </th>
          <th scope="col" data-numeric><span className={styles.headText}>{c.difference}</span></th>
          <th scope="col" className={styles.removeCell}><span className={styles.srOnly}>{c.removeColumn}</span></th>
        </tr></thead>
        <tbody>
          {rows.map(row => {
            const { item, cost } = row, name = rankedName(item, lang), ratio = formatRatio(row.ratio, lang);
            return <tr key={item.itemId} className={styles.compareRow} data-absent={item.absent || undefined} data-fresh={fresh === item.itemId || undefined}
              data-grouped={row.group.size > 1 || undefined} data-group-start={row.group.size > 1 && row.group.start || undefined} data-group-end={row.group.size > 1 && row.group.end || undefined}>
              <th scope="row" className={styles.compareItem}>
                {item.absent ? <span className={styles.itemLabel} style={qualityStyle(item.qualityId)}><AuctionIcon url={item.iconUrl} size={36} /><AuctionItemName item={item} lang={lang} /></span>
                  : <button type="button" className={styles.itemOpen} onClick={() => onOpen(item)} aria-haspopup="dialog"><AuctionItemLabel item={item} lang={lang} size={36} /></button>}
              </th>
              {item.absent ? <td className={styles.absentCell} colSpan={5} data-label={c.minPrice}>{c.emptyMarket}</td> : <>
                <td data-numeric data-label={c.minPrice} data-best={row.best.min || undefined}><Metric value={item.minPrice} max={maxPrice} best={row.best.min} lang={lang}><AuctionMoney value={item.minPrice} lang={lang} /></Metric></td>
                <td data-numeric data-label={c.median} data-best={row.best.median || undefined}><Metric value={item.medianPrice} max={maxPrice} best={row.best.median} lang={lang}><AuctionMoney value={item.medianPrice} lang={lang} /></Metric></td>
                <td data-numeric data-label={c.available} data-best={row.best.quantity || undefined}><Metric value={item.quantity} max={maxQuantity} best={row.best.quantity} lang={lang}><span className={styles.quantity}>{item.quantity.toLocaleString(lang)}</span></Metric></td>
                <td data-numeric data-label={costLabel} data-best={row.best.cost || undefined} className={styles.costCell}>
                  {cost ? <>
                    <Metric value={cost.total} max={maxCost} best={row.best.cost} lang={lang}><AuctionMoney value={cost.total} lang={lang} /></Metric>
                    {row.short ? <span className={styles.compareNote}>{c.shortfall} {cost.bought.toLocaleString(lang)} {c.units}</span> : null}
                  </> : <span className={styles.cellSkeleton} aria-hidden="true" />}
                </td>
                <td data-numeric data-label={c.difference} className={styles.diffCell}>
                  {row.best.cost ? <span className={styles.cheapestTag}>{c.cheapest}</span>
                    : ratio ? <span className={styles.ratio} data-high={row.ratio !== null && row.ratio >= 2 || undefined}>{ratio}</span>
                    : cost ? <span className={styles.muted}>—</span> : <span className={styles.cellSkeleton} aria-hidden="true" />}
                </td>
              </>}
              <td className={styles.removeCell}>
                <button type="button" className={styles.compareRemove} onClick={() => onRemove(item.itemId)} aria-label={`${c.removeCompare}: ${name}`}><X size={16} aria-hidden="true" /></button>
              </td>
            </tr>;
          })}
          {Array.from({ length: waiting }, (_, index) => <tr key={`wait-${index}`} className={styles.compareRow} aria-hidden="true">
            <th scope="row" className={styles.compareItem}><span className={styles.rowSkeleton}><span /><span /></span></th>
            {Array.from({ length: 5 }, (_, cell) => <td key={cell} data-numeric><span className={styles.cellSkeleton} /></td>)}
            <td className={styles.removeCell} />
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

/**
 * The tray under the list: what is picked (icon, name, remove), Clear and Compare. On phones the names fold away
 * behind one toggle so the tray stays a single row over the list.
 */
export function AuctionCompareTray({ ids, known, lang, onCompare, onClear, onRemove }: {
  ids: readonly number[]; known: ReadonlyMap<number, AuctionMarketItem>; lang: Lang;
  onCompare: () => void; onClear: () => void; onRemove: (itemId: number) => void;
}) {
  const c = auctionCopy[lang], [open, setOpen] = useState(false), tray = useRef<HTMLDivElement>(null), shown = ids.length > 0;
  /* Keyboard focus and in-page jumps never land under the tray. */
  useEffect(() => {
    const node = tray.current, root = document.documentElement;
    if (!node) return;
    const sync = () => root.style.setProperty("scroll-padding-bottom", `${Math.ceil(node.getBoundingClientRect().height) + 16}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => { observer.disconnect(); root.style.removeProperty("scroll-padding-bottom"); };
  }, [shown]);
  if (!shown) return null;
  return <div ref={tray} className={styles.tray} role="region" aria-label={c.picked} data-open={open || undefined}>
    <button type="button" className={styles.trayToggle} aria-expanded={open} aria-controls="auction-tray-items" onClick={() => setOpen(value => !value)}>
      <span className={styles.trayStack} aria-hidden="true">{ids.slice(0, 3).map(id => <AuctionIcon key={id} url={known.get(id)?.iconUrl ?? null} size={22} />)}</span>
      <span className={styles.srOnly}>{c.showPicked}</span>
      <ChevronUp size={16} aria-hidden="true" className={styles.trayChevron} />
    </button>
    <ul id="auction-tray-items" className={styles.trayItems}>{ids.map(id => {
      const item = known.get(id), name = item ? rankedName(item, lang) : c.metadata;
      return <li key={id} className={styles.trayChip} style={qualityStyle(item?.qualityId)} title={name}>
        <AuctionIcon url={item?.iconUrl ?? null} size={24} />
        {item ? <AuctionItemName item={item} lang={lang} className={styles.trayName} /> : <span className={styles.trayName}>{name}</span>}
        <button type="button" className={styles.trayRemove} onClick={() => onRemove(id)} aria-label={`${c.removeCompare}: ${name}`}><X size={14} aria-hidden="true" /></button>
      </li>;
    })}</ul>
    <div className={styles.trayActions}>
      <button type="button" className={`${styles.trayClear} ${styles.trayClearCompact}`} onClick={onClear}><Trash2 size={18} aria-hidden="true" /><span>{c.clear}</span></button>
      <AuctionButton variant="primary" onClick={onCompare} disabled={ids.length < 2}>{c.compare} · {ids.length}</AuctionButton>
    </div>
  </div>;
}
