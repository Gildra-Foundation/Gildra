import { BarChart3, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import type { Lang } from "@/lib/i18n";
import type { PlatformCatalogItem } from "@/lib/platform/catalog/types";
import styles from "./comparePage.module.css";

const text = {
  en: { metrics: "Attributes", empty: "Select at least one item to see its database attributes.", best: "Best", verdict: "Gildra verdict", leads: "leads this comparison", edge: "top attributes" },
  ru: { metrics: "Характеристики", empty: "Выберите хотя бы один предмет, чтобы увидеть характеристики из базы.", best: "Лучшее", verdict: "Вердикт Gildra", leads: "лидирует в сравнении", edge: "лучших характеристик" },
};

function MetricValue({ value }: { value: string | number | undefined }) {
  if (value === undefined || value === "") return <span className={styles.muted}>—</span>;
  return <>{typeof value === "number" ? value.toLocaleString() : value}</>;
}

export function ComparisonMetrics({ items, lang }: { items: PlatformCatalogItem[]; lang: Lang }) {
  const t = text[lang];
  const metrics = Array.from(new Set(items.flatMap((item) => Object.keys(item.attributes))));
  const maximums = new Map<string, number>();
  const wins = items.map(() => 0);

  for (const metric of metrics) {
    const values = items.map((item) => item.attributes[metric]);
    if (values.length > 1 && values.every((value) => typeof value === "number")) {
      const maximum = Math.max(...values as number[]);
      maximums.set(metric, maximum);
      values.forEach((value, index) => { if (value === maximum) wins[index] += 1; });
    }
  }
  const leadingIndex = wins.indexOf(Math.max(...wins));
  const leader = items.length > 1 && Math.max(...wins) > 0 ? items[leadingIndex] : undefined;

  return (
    <div className={styles.metrics}>
      <h3><BarChart3 size={13} />{t.metrics}</h3>
      {!metrics.length ? <div className={styles.noMetrics}>{t.empty}</div> : <div className={styles.metricTable}>
        {metrics.map((metric) => <div className={styles.metricRow} key={metric}>
          <strong>{metric}</strong>
          {Array.from({ length: 3 }, (_, index) => {
            const value = items[index]?.attributes[metric];
            const maximum = maximums.get(metric);
            const isBest = typeof value === "number" && maximum === value;
            const ratio = typeof value === "number" && maximum ? Math.max(8, Math.min(100, Math.abs(value / maximum) * 100)) : 0;
            return <span className={isBest ? styles.best : ""} key={index}>
              {ratio ? <i className={styles.metricBar} style={{ "--metric-width": `${ratio}%` } as CSSProperties} /> : null}
              <em><MetricValue value={value} /></em>{isBest ? <small>{t.best}</small> : null}
            </span>;
          })}
        </div>)}
      </div>}
      {leader ? <aside className={styles.verdict}>
        <span><Trophy /></span><div><small>{t.verdict}</small><strong>{leader.name} {t.leads}</strong><p>{wins[leadingIndex]} {t.edge}</p></div>
      </aside> : null}
    </div>
  );
}
