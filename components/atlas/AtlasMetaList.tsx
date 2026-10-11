import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./AtlasMetaList.module.css";

export type AtlasMetaItem = { label: ReactNode; value: ReactNode; icon?: ReactNode };

/** Labelled facts in a grid: zone, group size, lockout, reward. */
export function AtlasMetaList({ items, columns = 3, className }: { items: AtlasMetaItem[]; columns?: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <dl className={clsx(styles.list, styles[`cols-${columns}`], className)}>
      {items.map((item, index) => (
        <div key={index} className={styles.item}>
          {item.icon ? <span className={styles.icon} aria-hidden="true">{item.icon}</span> : null}
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
