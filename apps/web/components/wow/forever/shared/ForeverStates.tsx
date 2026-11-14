import type { ReactNode } from "react";
import { AtlasEmpty, AtlasSkeleton } from "@gildra/atlas-ui/AtlasState";
import type { Lang } from "@/lib/i18n-paths";
import { sharedCopy } from "./sharedCopy";
import styles from "./forever.module.css";

/** Nothing matched: one short line and, when filters are applied, the way back. Sits inside the list's <ForeverPanel>. */
export function ForeverEmpty({ lang, title, children, reset }: { lang: Lang; title?: ReactNode; children?: ReactNode; /** Address without the filters. */ reset?: string }) {
  const t = sharedCopy[lang];
  return <AtlasEmpty className={styles.state} title={title ?? t.empty} action={reset ? <a className={styles.link} href={reset}>{t.reset}</a> : undefined}>
    {children ?? (reset ? t.emptyText : undefined)}
  </AtlasEmpty>;
}

/** The loading stand-in of a list inside a panel: rows, cards or lines of the same footprint. */
export function ForeverSkeleton({ lang, variant = "rows", count = 6 }: { lang: Lang; variant?: "lines" | "cards" | "rows"; count?: number }) {
  return <AtlasSkeleton variant={variant} count={count} label={sharedCopy[lang].loading} />;
}
