import { AtlasFrame, AtlasHero, AtlasSkeleton } from "@/components/atlas";
import type { Lang } from "@/lib/i18n";
import { searchCopy } from "./searchCopy";
import styles from "./searchPage.module.css";

/** Route loading state of /search: the real heading and placeholders shaped like the results. */
export function SearchPageSkeleton({ lang }: { lang: Lang }) {
  const t = searchCopy[lang];
  return (
    <AtlasFrame lang={lang} art="/assets/wow/loading/archive.webp" artPosition="center 45%" dataAttributes={{ "data-book-route-loading": true }}>
      <AtlasHero
        title={t.title}
        lede={t.lede}
        actions={<div className={styles.skeletonSearch} aria-hidden="true" />}
      />
      <AtlasSkeleton variant="rows" count={5} label={t.counting} className={styles.skeleton} />
    </AtlasFrame>
  );
}
