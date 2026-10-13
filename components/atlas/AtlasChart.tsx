import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasChart.module.css";

export type AtlasChartDatum = { key: string; label: ReactNode; value: number; display?: ReactNode; href?: string };

/**
 * Horizontal bar chart of the atlas (roadmap item 19): one row per datum, bars
 * scaled to the largest value (or `max`), values printed at the end. Plain HTML,
 * rendered on the server, so it reads as a list for screen readers (with the
 * `label` as its name) and needs no chart library. Optional `href` links a row.
 */
export function AtlasChart({ data, label, max, unit, className }: { data: AtlasChartDatum[]; label: string; max?: number; unit?: string; className?: string }) {
  const top = max ?? Math.max(...data.map((datum) => datum.value), 0);
  return (
    <ol className={clsx(styles.chart, className)} aria-label={label}>
      {data.map((datum) => {
        const share = top > 0 ? Math.max(0, Math.min(1, datum.value / top)) : 0;
        const value = <b className={styles.value}>{datum.display ?? `${datum.value}${unit ? ` ${unit}` : ""}`}</b>;
        const body = <>
          <span className={styles.label}>{datum.label}</span>
          <span className={styles.track} aria-hidden="true"><span className={styles.bar} style={{ inlineSize: `${(share * 100).toFixed(1)}%` }} /></span>
          {value}
        </>;
        return <li key={datum.key} className={styles.row}>{datum.href ? <a className={styles.link} href={datum.href}>{body}</a> : <span className={styles.link}>{body}</span>}</li>;
      })}
    </ol>
  );
}
