import type { ReactNode } from "react";
import clsx from "clsx";
import { AtlasStatsCard, AtlasStatsCountUp } from "./AtlasStatsParts";
// The styles the card and the count-up import, kept in their original cascade
// position: their code loads on demand (AtlasStatsParts), their CSS does not move.
import "./AtlasCountUp.module.css";
import "./valyro-ui/basic/Skeleton.css";
import "./valyro-ui/data-display/StatsCard.css";
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
