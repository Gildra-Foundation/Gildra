"use client";

import type { ReactNode } from "react";
import { listColumns, type BoardEntry } from "./tierBoardRows";
import { SpecIcon } from "./TierBoard";
import { classStyle, tierStyle } from "./tierVisuals";
import styles from "./tierWorkspace.module.css";

export type TierListLabels = {
  caption: string; rank: string; spec: string; tier: string; score: string; rate: string; maxKey: string;
  trend: string; popularity: string; popularityShort: string; dps: string; behind: string;
  rating: string; players: string; winRate: string;
};

/** The compact list for readers who want numbers: rank, spec, tier, then only the metrics this source publishes. */
export function TierList({ entries, labels, href, format, trend, busy, empty }: {
  entries: BoardEntry[];
  labels: TierListLabels;
  href: (entry: BoardEntry) => string | undefined;
  format: { compact: (value?: number) => string; number: (value: number) => string; percent: (value: number) => string; behind: (entry: BoardEntry) => string };
  trend: (value?: number, change?: "up" | "down") => ReactNode;
  busy: boolean;
  empty: ReactNode;
}) {
  if (!entries.length) return busy ? <div className={styles.boardEmpty} aria-busy="true" /> : <p className={styles.empty}>{empty}</p>;
  const columns = listColumns(entries);
  const maxScore = Math.max(...entries.map((entry) => entry.score ?? 0), 1);
  const top = Math.max(...entries.map((entry) => entry.simDps ?? 0), 1);
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);

  return (
    <div className={styles.tableBox} aria-busy={busy} data-loading={busy || undefined} data-scrollbox>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{labels.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.colRank}>{labels.rank}</th>
            <th scope="col">{labels.spec}</th>
            <th scope="col" className={styles.colTier}>{labels.tier}</th>
            {columns.score ? <th scope="col" className={styles.colScore}>{labels.score}</th> : null}
            {columns.sim ? <th scope="col" className={styles.colScore}>{labels.dps}</th> : null}
            {columns.sim ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{labels.behind}</th> : null}
            {columns.rate ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{labels.rate}</th> : null}
            {columns.rating ? <th scope="col" className={styles.num}>{labels.rating}</th> : null}
            {columns.players ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{labels.players}</th> : null}
            {columns.winRate ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{labels.winRate}</th> : null}
            {columns.maxKey ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{labels.maxKey}</th> : null}
            {columns.popularity ? <th scope="col" className={styles.num}><span className={styles.wideOnly}>{labels.popularity}</span><abbr className={styles.narrowOnly} title={labels.popularity}>{labels.popularityShort}</abbr></th> : null}
            {columns.trend || columns.change ? <th scope="col" className={styles.num}>{labels.trend}</th> : null}
          </tr>
        </thead>
        <tbody>
          {ordered.map((entry) => {
            const link = href(entry);
            const name = <><span className={styles.specName}>{entry.specName}</span><span className={styles.className}>{entry.className}</span></>;
            return (
              <tr key={entry.key} style={tierStyle(entry.tier)}>
                <td className={styles.colRank}>{entry.rank}</td>
                <th scope="row" className={styles.specCell}>
                  <span className={styles.specInner}>
                    <SpecIcon entry={entry} size={36} />
                    {link ? <a className={styles.specLink} href={link} style={classStyle(entry.classSlug)}>{name}</a> : <span className={styles.specLink} style={classStyle(entry.classSlug)}>{name}</span>}
                  </span>
                </th>
                <td className={styles.colTier}><span className={styles.tierChip}><span className={styles.srOnly}>{labels.tier} </span>{entry.tier}</span></td>
                {columns.score ? (
                  <td className={styles.scoreCell}>
                    <span className={styles.scoreInner}>
                      <span className={styles.bar} aria-hidden="true"><span style={{ inlineSize: `${entry.score ? Math.max(4, entry.score / maxScore * 100).toFixed(1) : 0}%` }} /></span>
                      <b>{format.compact(entry.score)}</b>
                    </span>
                  </td>
                ) : null}
                {columns.sim ? (
                  <td className={styles.scoreCell}>
                    <span className={styles.scoreInner}>
                      <span className={`${styles.bar} ${styles.classBar}`} style={classStyle(entry.classSlug)} aria-hidden="true"><span style={{ inlineSize: `${entry.simDps ? Math.max(2, entry.simDps / top * 100).toFixed(1) : 0}%` }} /></span>
                      <b>{entry.simDps ? format.compact(entry.simDps) : "—"}</b>
                    </span>
                  </td>
                ) : null}
                {columns.sim ? <td className={`${styles.num} ${styles.secondary}`}>{format.behind(entry)}</td> : null}
                {columns.rate ? <td className={`${styles.num} ${styles.secondary}`}>{format.compact(entry.rate)}</td> : null}
                {columns.rating ? <td className={styles.num}>{entry.rating !== undefined ? format.number(Math.round(entry.rating)) : "—"}</td> : null}
                {columns.players ? <td className={`${styles.num} ${styles.secondary}`}>{entry.players !== undefined ? format.number(entry.players) : "—"}</td> : null}
                {columns.winRate ? <td className={`${styles.num} ${styles.secondary}`}>{entry.winRate !== undefined ? format.percent(entry.winRate) : "—"}</td> : null}
                {columns.maxKey ? <td className={`${styles.num} ${styles.secondary}`}>{entry.maxKey ? `+${format.number(entry.maxKey)}` : "—"}</td> : null}
                {columns.popularity ? <td className={styles.num}>{entry.popularity !== undefined ? format.percent(entry.popularity) : "—"}</td> : null}
                {columns.trend || columns.change ? <td className={styles.num}>{trend(entry.rankChange, entry.change)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
