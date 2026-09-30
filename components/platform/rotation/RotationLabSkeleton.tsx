import styles from "./rotationLab.module.css";

const bars = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => <i key={`${prefix}-${index}`} />);

export function RotationLabSkeleton({ lang, showHeader = true }: { lang: "en" | "ru"; showHeader?: boolean }) {
  return (
    <div className={`${styles.shell} ${styles.rotationSkeleton}`} aria-busy="true" aria-label={lang === "ru" ? "Загрузка лаборатории ротации" : "Loading Rotation Lab"}>
      {showHeader ? <header className={styles.skeletonHeader}>
        <strong>GILDRA</strong><i /><nav aria-hidden="true">{bars(4, "header-nav")}</nav><span /><b />
      </header> : null}
      <main className={styles.lab}>
        <section className={styles.skeletonHero} aria-hidden="true">
          <div className={styles.skeletonSpec}><i /><span /><small /></div>
          <div className={styles.skeletonTitle}><small /><h1 /><p /><span /></div>
        </section>
        <section className={styles.skeletonResult} aria-hidden="true"><article><header />{bars(4, "metric")}</article><aside>{bars(4, "detail")}</aside></section>
        <section className={styles.skeletonFindings} aria-hidden="true">{bars(3, "findings")}</section>
        <div className={styles.skeletonWorkspace} aria-hidden="true"><aside>{bars(6, "rules")}</aside><section><header />{bars(5, "timeline")}</section></div>
      </main>
    </div>
  );
}
