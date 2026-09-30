import styles from "./weeklyChecklistPage.module.css";

export function WeeklyChecklistSkeleton({ locale }: { locale: "ru" | "en" }) {
  const label = locale === "ru" ? "Загружаем еженедельный прогресс персонажа" : "Loading character weekly progress";

  return (
    <main className={styles.skeletonPage} aria-busy="true" aria-label={label}>
      <span className={styles.skeletonLabel}>{label}</span>
      <header className={styles.skeletonHero}>
        <div className={styles.skeletonInner}>
          <div className={`${styles.skeletonCrumb} ${styles.skeletonBlock}`} />
          <div className={styles.skeletonHeroGrid}>
            <div>
              <div className={`${styles.skeletonTitle} ${styles.skeletonBlock}`} />
              <div className={`${styles.skeletonText} ${styles.skeletonBlock}`} />
            </div>
            <div className={`${styles.skeletonCharacter} ${styles.skeletonBlock}`} />
          </div>
          <div className={`${styles.skeletonStatus} ${styles.skeletonBlock}`} />
        </div>
      </header>
      <div className={styles.skeletonContent}>
        <div className={`${styles.skeletonNext} ${styles.skeletonBlock}`} />
        <div className={styles.skeletonLayout}>
          <div className={styles.skeletonMain}>
            <div className={`${styles.skeletonVault} ${styles.skeletonBlock}`} />
            <div className={`${styles.skeletonJournal} ${styles.skeletonBlock}`}>
              {Array.from({ length: 6 }, (_, index) => <div className={`${styles.skeletonRow} ${styles.skeletonBlock}`} key={index} />)}
            </div>
          </div>
          <div className={`${styles.skeletonSide} ${styles.skeletonBlock}`} />
        </div>
      </div>
    </main>
  );
}
