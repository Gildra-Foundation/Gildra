"use client";
import { type AuctionResult, type AuctionQuery } from "@/lib/wow/auctionBrowser";
import { auctionCopy } from "./auctionCopy";
import { AuctionItem } from "./AuctionItem";
import { AuctionButton } from "./AuctionMaterial";
import { AuctionMoney as Money } from "./AuctionMoney";
import styles from "./auction.module.css";

/** Lot rows of one result page: item, quantity, unit price and (realm market) buyout with the current bid; paging below. */
export function AuctionListings({ data, lang, onPage, query }: { data: AuctionResult; lang: "ru" | "en"; onPage: (page: number) => void; query: Pick<AuctionQuery, "region" | "realm"> }) {
  const c = auctionCopy[lang];
  const realm = data.market === "realm";
  return <>
    {data.stale ? <p className={styles.warning} role="status">{c.stale}</p> : null}
    {data.searchTruncated ? <p className={styles.warning} role="status">{c.partial}</p> : null}
    {!data.rows.length ? <p className={styles.empty} role="status">{realm ? c.emptyHint : c.emptyHintRegion}</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${c.title}: ${data.total.toLocaleString(lang)} ${c.results}`}>
      <table className={styles.table} data-market={data.market}>
        <thead><tr><th scope="col">{c.item}</th><th scope="col" data-numeric>{c.quantity}</th><th scope="col" data-numeric>{c.unit}</th>{realm ? <th scope="col" data-numeric>{c.buyout}</th> : null}</tr></thead>
        <tbody>{data.rows.map(row => {
          const meta = [row.petLevel ? `${c.petLevel} ${row.petLevel}` : null, row.timeLeft ? c.times[row.timeLeft as keyof typeof c.times] ?? null : null].filter((part): part is string => Boolean(part));
          return <tr key={row.id} className={styles.lotRow}>
            <th scope="row" className={styles.itemCell}><AuctionItem row={row} lang={lang} region={query.region} realm={query.realm} market={data.market} meta={meta} /></th>
            <td data-label={c.quantity} data-numeric>{row.quantity.toLocaleString(lang)}</td>
            <td data-label={c.unit} data-numeric>{row.unitPrice === null ? <span className={styles.secondary}>{c.noBuyout}</span> : <Money value={row.unitPrice} lang={lang} />}</td>
            {realm ? <td data-label={c.buyout} data-numeric>{row.buyout !== null ? <Money value={row.buyout} lang={lang} /> : <span className={styles.secondary}>{c.noBuyout}</span>}{row.bid !== null ? <span className={styles.bid}>{c.bid} <Money value={row.bid} lang={lang} /></span> : null}</td> : null}
          </tr>;
        })}</tbody>
      </table>
    </div>}
    {data.pages > 1 ? <nav className={styles.pagination} aria-label={c.page}>
      <AuctionButton className={styles.pageButton} disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>{c.prev}</AuctionButton>
      <span className={styles.pageCount}>{c.page} {data.page.toLocaleString(lang)} {c.of} {data.pages.toLocaleString(lang)}</span>
      <AuctionButton className={styles.pageButton} disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>{c.next}</AuctionButton>
    </nav> : null}
  </>;
}
