import { AtlasFrame, AtlasHero, AtlasSkeleton } from "@/components/atlas";
import type { Lang } from "@/lib/i18n";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { libraryKit } from "@/components/library/libraryKit";
import { searchCopy } from "./searchCopy";
import styles from "./searchPage.module.css";

/** Route loading state of /search: the real heading and placeholders shaped like the results. */
export function SearchPageSkeleton({ lang }: { lang: Lang }) {
  const t = searchCopy[lang];
  return (
    <AtlasFrame lang={lang} scene="archive" dataAttributes={{ "data-book-route-loading": true }}>
      <AtlasHero placeholder title={t.title} />
      <MaterialPlaque kit={libraryKit} className={styles.plaque} aria-hidden="true"><div className={styles.skeletonSearch} /></MaterialPlaque>
      <AtlasSkeleton variant="rows" count={5} label={t.counting} className={styles.skeleton} />
    </AtlasFrame>
  );
}
