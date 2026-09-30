import styles from "./platformHome.module.css";

const bars = (count: number) => Array.from({ length: count }, (_, index) => <span key={index} />);

export function PlatformHomeSkeleton({ lang = "en" }: { lang?: "en" | "ru" }) {
  return (
    <div className={`${styles.page} ${styles.skeleton}`} aria-busy="true" aria-label={lang === "ru" ? "Gildra загружается" : "Loading Gildra"}>
      <div className={styles.skeletonHeader}>
        <b>GILDRA</b><span /><span /><span /><i />
      </div>
      <div className={styles.skeletonHero}>
        <div><i /><span><small /><b /></span></div>
        <aside>{bars(4)}</aside>
      </div>
      <div className={styles.skeletonDashboard}>
        <div>
          <section className={styles.skeletonMeta}><b />{bars(5)}</section>
          <aside><section>{bars(5)}</section><section>{bars(5)}</section></aside>
        </div>
        <aside><section>{bars(5)}</section><section>{bars(6)}</section></aside>
        <section className={styles.skeletonRecommendations}>{bars(4)}</section>
      </div>
    </div>
  );
}
