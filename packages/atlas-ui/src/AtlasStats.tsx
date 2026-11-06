import type { ReactNode } from "react";
import clsx from "clsx";
import { AtlasStatsCard, AtlasStatsCountUp } from "./AtlasStatsParts";
import styles from "./AtlasStats.module.css";

export type AtlasStat = { value: ReactNode; label: ReactNode };

/** Compact Valyro metrics. No trends or percentages are inferred from the supplied values. */
export function AtlasStats({ items, className, label }: { items: AtlasStat[]; className?: string; label?: string }) {
  if (!items.length) return null;
  return (
    <div className={clsx(styles.stats, className)} role="list" aria-label={label}>
      {items.map((item, index) => (
        <AtlasStatsCard
          key={index} role="listitem" className={styles.stat}
          label={item.label}
          value={typeof item.value === "number" ? <AtlasStatsCountUp value={item.value} /> : item.value}
        />
      ))}
    </div>
  );
}
