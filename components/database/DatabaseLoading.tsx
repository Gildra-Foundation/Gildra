import { PageShell } from "@/components/layout/PageShell";
import { AtlasFrame } from "@/components/atlas";
import { DatabaseHero } from "@/components/database/DatabaseHero";
import { databaseCopy } from "@/components/database/databaseCopy";
import type { Lang } from "@/lib/i18n";
import styles from "./databaseHub.module.css";

export function DatabaseLoading({ lang }: { lang: Lang }) {
  return <PageShell lang={lang}><AtlasFrame as="div" lang={lang} art="/assets/wow/loading/archive.webp" artPosition="center 45%"><DatabaseLoadingContent lang={lang} /></AtlasFrame></PageShell>;
}

/**
 * Suspense fallback of the database hub: the real heading (so the title paints
 * at once) and a full-height placeholder for the catalog workspace.
 */
export function DatabaseLoadingContent({ lang }: { lang: Lang }) {
  return (
    <>
      <DatabaseHero lang={lang} />
      <div className={styles.skeleton} role="status" aria-live="polite">
        <span className={styles.skeletonSearch} />
        <div className={styles.skeletonChips}>{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>
        <div className={styles.skeletonRecords}>{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
        <span className="sr-only">{databaseCopy[lang].loading}</span>
      </div>
    </>
  );
}
