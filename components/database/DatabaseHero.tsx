import { Library } from "lucide-react";
import { AtlasHero } from "@/components/atlas";
import { DATA_SOURCES, databaseCopy, formatCount } from "@/components/database/databaseCopy";
import type { Lang } from "@/lib/i18n";
import styles from "./databaseHub.module.css";

/**
 * Page heading of the WoW database. Counters are the catalog's own totals; without them (loading) the row is omitted.
 * No breadcrumb trail: AtlasBreadcrumbs links prefetch /wow in the viewport, which also pulls that page's preloaded artwork (~120 KB).
 */
export function DatabaseHero({ lang, stats }: { lang: Lang; stats?: { records: number; types: number } }) {
  const copy = databaseCopy[lang];
  return (
    <AtlasHero
      className={styles.hero}
      emblem={<Library />}
      eyebrow={copy.eyebrow}
      title={copy.title}
      titleId="database-title"
      lede={copy.lede}
      statsLabel={copy.statsLabel}
      stats={stats ? [
        { value: formatCount(stats.records, lang), label: copy.statRecords },
        { value: formatCount(stats.types, lang), label: copy.statTypes },
      ] : undefined}
      actions={(
        <ul className={styles.sources} aria-label={copy.sourcesLabel}>
          <li>{copy.sourcesLabel}</li>
          {DATA_SOURCES.map((source) => (
            <li key={source.label}><a href={source.href} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true">↗</span></a></li>
          ))}
        </ul>
      )}
    />
  );
}
