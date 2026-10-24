"use client";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { type AuctionResult, type AuctionQuery } from "@/lib/wow/auctionBrowser";
import { auctionCopy } from "./auctionCopy";
import { AuctionItem } from "./AuctionItem";
import { AuctionMoney as Money } from "./AuctionMoney";
import styles from "./auction.module.css";
export function AuctionListings({ data, lang, onPage, query }: { data: AuctionResult; lang: "ru" | "en"; onPage: (page: number) => void; query: Pick<AuctionQuery, "region" | "realm"> }) {
  const c = auctionCopy[lang];
  const date = (value: string) => new Date(value).toLocaleString(c.dateLocale, { timeZoneName: "short" });
  return <section className={styles.results} aria-label={c.title}>
    <div className={styles.summary} role="status">
      <strong>{c.results}: {data.total.toLocaleString(lang)}</strong>
      <span>{data.sourceUpdatedAt ? `${c.updated} ${date(data.sourceUpdatedAt)}` : c.unknownDate}</span>
      <span>{c.fetched}: {date(data.fetchedAt)}</span>
    </div>
    {data.stale ? <p className={styles.warning} role="status">{c.stale}</p> : null}
    {data.searchTruncated ? <p className={styles.warning} role="status">{c.partial}</p> : null}
    {!data.rows.length ? <div className={styles.empty} role="status"><h2>{c.empty}</h2><p>{c.emptyHint}</p></div> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={c.results}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>{c.title} — {c.results}: {data.total}</caption>
        <thead><tr><th scope="col">{c.item}</th><th scope="col">{c.quantity}</th><th scope="col">{c.unit}</th><th scope="col">{data.market === "realm" ? c.buyout : c.terms}</th></tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.id} className={styles.lotRow}>
          <td><AuctionItem row={row} lang={lang} region={query.region} realm={query.realm} market={data.market} />
            {!row.name ? <span className={styles.secondary}>{c.metadata}</span> : null}
            <span className={styles.secondary}>ID {row.itemId}{row.petSpeciesId ? ` · ${c.pet} ${row.petSpeciesId}` : ""}</span>
            <details className={styles.details}><summary>{c.details}</summary><div>
              <span>#{row.id}</span>
              {row.timeLeft ? <span>{c.time}: {c.times[row.timeLeft as keyof typeof c.times] ?? row.timeLeft}</span> : null}
              {row.petLevel ? <span>{c.petLevel}: {row.petLevel}</span> : null}
              {row.bonusIds.length ? <span>{c.bonusIds}: {row.bonusIds.join(", ")}</span> : null}
              {row.context ? <span>{c.context}: {row.context}</span> : null}
              {row.modifiers.length ? <span>{c.modifiers}: {row.modifiers.map(m => `${m.type}:${m.value}`).join(", ")}</span> : null}
            </div></details>
          </td>
          <td>{row.quantity.toLocaleString(lang)}</td>
          <td>{row.unitPrice === null ? c.noBuyout : <Money value={row.unitPrice} lang={lang} />}</td>
          <td>{data.market === "commodities" ? c.regionPrice : <><Money value={row.buyout} lang={lang} />{row.bid !== null ? <span className={styles.secondary}>{c.bid}: <Money value={row.bid} lang={lang} /></span> : null}</>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {data.pages > 1 ? <nav className={styles.pagination} aria-label={c.page}>
      <AtlasButton disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>{c.prev}</AtlasButton>
      <span>{c.page} {data.page} {c.of} {data.pages}</span>
      <AtlasButton disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>{c.next}</AtlasButton>
    </nav> : null}
  </section>;
}
