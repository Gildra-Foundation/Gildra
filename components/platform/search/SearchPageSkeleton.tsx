import { Search } from "lucide-react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import type { Lang } from "@/lib/i18n";
import { searchCopy } from "./searchCopy";
import styles from "./searchPage.module.css";

/** Route loading state of /search: the real heading and placeholders shaped like the results. */
export function SearchPageSkeleton({ lang }: { lang: Lang }) {
  const t = searchCopy[lang];
  return (
    <AtlasFrame lang={lang} dataAttributes={{ "data-book-route-loading": true }}>
      <AtlasHero
        emblem={<Search />}
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lede}
        actions={<div className={styles.skeletonSearch} aria-hidden="true" />}
      />
      <div className={styles.skeleton} aria-busy="true" role="status" aria-label={t.counting}>
        <div className={styles.skeletonTabs}><i /><i /></div>
        <div className={styles.skeletonRows}>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
      </div>
    </AtlasFrame>
  );
}
