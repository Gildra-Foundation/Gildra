import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasStats.module.css";

export type AtlasStat = { value: ReactNode; label: ReactNode };

/** Row of headline counters ("5 raids · 18 bosses · S2"). Only real, current numbers. */
export function AtlasStats({ items, className, label }: { items: AtlasStat[]; className?: string; label?: string }) {
  if (!items.length) return null;
  return (
    <dl className={clsx(styles.stats, className)} aria-label={label}>
      {items.map((item, index) => (
        <div key={index} className={styles.stat}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
