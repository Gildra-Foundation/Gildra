import { Search } from "lucide-react";
import { PlatformHeader } from "@/components/platform/home/PlatformHeader";
import { PlatformAtmosphere } from "@/components/platform/shared/PlatformAtmosphere";
import homeStyles from "@/components/platform/home/rotationPageShell.module.css";
import type { Lang } from "@/lib/i18n";
import { fallbackPlatformHome } from "@/lib/platform/home/fallback";
import styles from "./searchPage.module.css";

export function SearchPageSkeleton({ lang }: { lang: Lang }) {
  const home = fallbackPlatformHome(lang);
  return <div className={homeStyles.page}>
    <PlatformAtmosphere />
    <PlatformHeader data={home} lang={lang} active="search" showSearch={false} scopeLabel={lang === "ru" ? "Все игры" : "All Games"} />
    <main className={`${styles.page} ${styles.searchSkeleton}`} aria-busy="true" aria-label={lang === "ru" ? "Загрузка поиска" : "Loading search"}>
      <div className={styles.skeletonSearch}><Search /></div>
      <div className={styles.skeletonTabs}><i /><i /><i /></div>
      <div className={styles.skeletonLayout}>
        <aside><b /><i /><i /><i /><i /></aside>
        <section><b />{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</section>
        <aside><b /><span /><span /><span /></aside>
      </div>
    </main>
  </div>;
}
