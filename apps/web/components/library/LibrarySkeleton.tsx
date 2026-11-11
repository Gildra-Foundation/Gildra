import { AtlasFrame, AtlasHero, AtlasSkeleton } from "@/components/atlas";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { libraryCopy } from "@/components/library/libraryCopy";
import { libraryKit } from "@/components/library/libraryKit";
import styles from "./librarySkeleton.module.css";

type Lang = "en" | "ru";

/** Route loading state of /library/<dataset>: the library trail, a title bar, the form plaque and rows shaped like the record table. */
export function LibraryDatasetSkeleton({ lang }: { lang: Lang }) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  return (
    <AtlasFrame lang={lang} scene="archive" dataAttributes={{ "data-library-root": true, "data-book-route-loading": true }}>
      <AtlasHero breadcrumbs={[{ label: copy.wow, href: prefix || "/" }, { label: copy.library, href: `${prefix}/library` }]} breadcrumbsLabel={copy.breadcrumbsLabel}
        title={<span className={styles.title} aria-hidden="true" />} lede={<span className={styles.lede} aria-hidden="true" />} />
      <div className={styles.body}>
        <MaterialPlaque kit={libraryKit} aria-hidden="true"><div className={styles.field} /></MaterialPlaque>
        <AtlasSkeleton variant="rows" count={8} label={copy.loading} />
      </div>
    </AtlasFrame>
  );
}

/** Route loading state of a library record: trail, icon and title bars, the tooltip plaque. */
export function LibraryRecordSkeleton({ lang }: { lang: Lang }) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  return (
    <AtlasFrame lang={lang} scene="archiveDeep" dataAttributes={{ "data-database-entity": true, "data-book-route-loading": true }}>
      <AtlasHero breadcrumbs={[{ label: copy.library, href: `${prefix}/library` }]} breadcrumbsLabel={copy.breadcrumbsLabel}
        title={<span className={styles.recordTitle} aria-hidden="true"><span className={styles.icon} /><span className={styles.title} /></span>}
        aside={<MaterialPlaque kit={libraryKit} className={styles.tooltip} aria-hidden="true"><AtlasSkeleton variant="lines" count={6} label={copy.loading} /></MaterialPlaque>} />
    </AtlasFrame>
  );
}
