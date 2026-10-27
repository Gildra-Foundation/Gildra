import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import { formatAtlasDate } from "@gildra/atlas-ui/format";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import { MaterialButton, MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import type { CatalogProduct, CatalogRecord, LibraryDataset } from "@/lib/api/client";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { LIBRARY_FEATURED } from "@/lib/library/featured";
import { LibraryUnavailable } from "@/components/library/LibraryUnavailable";
import { LIBRARY_HIDDEN_DATASETS, libraryCopy, libraryDatasetLine, libraryGroupText } from "@/components/library/libraryCopy";
import { libraryKit } from "@/components/library/libraryKit";
import styles from "./library.module.css";
import { libraryLandingCopy } from "./libraryLandingCopy";

type Props = {
  lang: "en" | "ru";
  datasets: LibraryDataset[];
  products: CatalogProduct[];
  /** A few records with icons per featured dataset (the plate strips). */
  samples: Record<string, CatalogRecord[]>;
  selectedProduct: string;
  unavailable?: boolean;
};

type Freshness = "fresh" | "stale" | "empty" | "refreshing" | "failed" | "unknown";

/**
 * Distinct records across the datasets. Category and item-class datasets (Weapons, Armor, Gems…) are
 * subsets of their entity type's whole dataset, so each entity type is counted once. Returns null when
 * the union cannot be known (several filtered datasets of one type without a whole-type dataset).
 */
function distinctRecordCount(datasets: LibraryDataset[]): number | null {
  let total = 0;
  for (const entries of Map.groupBy(datasets, (dataset) => dataset.entityType).values()) {
    const whole = entries.filter((dataset) => !dataset.categoryPath && dataset.itemClassId == null);
    if (whole.length) total += Math.max(...whole.map((dataset) => dataset.entityCount));
    else if (entries.length === 1) total += entries[0].entityCount;
    else return null;
  }
  return total;
}

/**
 * /library and /ru/library (gildra-wow-material-design §3.7): hero with the
 * library search, edition switch, the featured datasets on painted plaques,
 * then every dataset grouped by area on glass. One quiet line says when the
 * data was updated; a notice appears only when the data really lags (stale or
 * failed update), never while a refresh simply runs.
 */
export function LibraryLanding({ lang, datasets: allDatasets, products, samples, selectedProduct, unavailable = false }: Props) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const formatter = new Intl.NumberFormat(libraryLandingCopy[lang].numberLocale);
  const datasets = allDatasets.filter((dataset) => dataset.entityCount > 0 && !LIBRARY_HIDDEN_DATASETS.has(dataset.slug));
  const total = distinctRecordCount(datasets);
  const groups = Array.from(Map.groupBy(datasets, (dataset) => dataset.group));
  const productQuery = selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`;

  const checked = allDatasets.reduce<string | null>((latest, dataset) => (
    dataset.coverageUpdatedAt && (!latest || dataset.coverageUpdatedAt > latest) ? dataset.coverageUpdatedAt : latest
  ), null);
  const product = products.find((entry) => entry.slug === selectedProduct);
  const states: Freshness[] = [
    ...(product?.freshness ? [product.freshness] : []),
    ...datasets.filter((dataset) => dataset.applicability === "applicable").map((dataset) => dataset.freshness),
  ];
  const notice = states.includes("failed") ? { title: copy.failedTitle, text: copy.failedText }
    : states.includes("stale") ? { title: copy.staleTitle, text: copy.staleText } : null;

  const featured = LIBRARY_FEATURED.map((slug) => datasets.find((dataset) => dataset.slug === slug)).filter((dataset): dataset is LibraryDataset => Boolean(dataset));
  const datasetHref = (dataset: LibraryDataset) => `${prefix}/library/${encodeURIComponent(dataset.slug)}${productQuery}`;

  return (
    <AtlasFrame as="div" lang={lang} scene="archive" dataAttributes={{ "data-library-root": true }}>
      <AtlasHero
        breadcrumbs={[{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.library }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        statsLabel={copy.statsLabel}
        stats={unavailable ? undefined : [
          ...(total === null ? [] : [{ value: formatter.format(total), label: copy.statRecords }]),
          { value: formatter.format(datasets.length), label: copy.statDatasets },
        ]}
        actions={unavailable ? undefined : (
          // The whole library is searched on /search; a plain GET form works without JavaScript.
          <form className={styles.search} role="search" action={`${prefix}/search`} method="get">
            <span className={styles.searchField}>
              <label className="sr-only" htmlFor="library-search">{copy.searchLabel}</label>
              <Search className={styles.searchIcon} aria-hidden="true" />
              <input id="library-search" name="q" type="search" placeholder={copy.searchPlaceholder} autoComplete="off" required maxLength={200} />
            </span>
            <MaterialButton kit={libraryKit} fit="stack" type="submit" iconAfter={<ArrowRight aria-hidden="true" />}>{copy.searchSubmit}</MaterialButton>
          </form>
        )}
      />

      {unavailable ? <LibraryUnavailable lang={lang} /> : (
        <>
          {products.length > 1 ? (
            <nav className={styles.editions} aria-label={copy.editions}>
              {products.map((entry) => (
                <Link key={entry.slug} href={`${prefix}/library${entry.slug === "wow" ? "" : `?product=${encodeURIComponent(entry.slug)}`}`} prefetch={false}
                  aria-current={entry.slug === selectedProduct ? "page" : undefined}>{entry.name}</Link>
              ))}
            </nav>
          ) : null}

          {notice ? <AtlasNotice tone="caution" title={notice.title} className={styles.notice}>{notice.text}</AtlasNotice> : null}

          {featured.length ? (
            <AtlasSection id="featured" title={copy.featuredTitle}>
              <ul className={styles.featured}>
                {featured.map((dataset) => (
                  <MaterialPlaque key={dataset.slug} kit={libraryKit} as="li" className={styles.plate}>
                    <span className={`${materialStyles.iconFrame} ${styles.plateIcon}`} style={materialIconFrameStyle(libraryKit, 64)} aria-hidden="true">
                      {/* The dataset preview, or the icon of its first sample record when the catalog has not chosen one yet. */}
                      <ResilientImage src={dataset.previewImageUrl || samples[dataset.slug]?.[0]?.iconUrl} alt="" width={64} height={64} loading="lazy" fallback={<CatalogGlyph symbol={dataset.iconSymbol} />} />
                    </span>
                    <h3 className={styles.plateTitle}><Link href={datasetHref(dataset)} prefetch={false} className={styles.plateLink}>{dataset.name}</Link></h3>
                    <p className={styles.plateText}>{libraryDatasetLine(dataset, lang)}</p>
                    <p className={styles.plateCount}><b>{formatter.format(dataset.entityCount)}</b> {copy.recordsWord(dataset.entityCount)}</p>
                    {samples[dataset.slug]?.length ? (
                      <span className={styles.strip} aria-hidden="true">
                        {samples[dataset.slug].map((record) => {
                          const colour = record.quality !== undefined ? itemQualityColors[record.quality as keyof typeof itemQualityColors] : undefined;
                          return (
                            <span key={record.id} style={colour ? { "--record-quality": colour.frame } as CSSProperties : undefined}>
                              <ResilientImage src={record.iconUrl} alt="" width={32} height={32} loading="lazy" fallback={null} />
                            </span>
                          );
                        })}
                      </span>
                    ) : null}
                  </MaterialPlaque>
                ))}
              </ul>
            </AtlasSection>
          ) : null}

          <AtlasSection id="datasets" title={copy.datasetsTitle}>
            <div className={styles.groups}>
              {groups.map(([group, entries]) => (
                <section key={group} className={styles.group} aria-labelledby={`library-group-${group}`}>
                  <h3 id={`library-group-${group}`}>{libraryGroupText[group]?.[lang] ?? group}</h3>
                  <ul className={styles.list}>
                    {entries.map((dataset) => (
                      <li key={dataset.slug} className={styles.row}>
                        <span className={styles.rowIcon} aria-hidden="true">
                          <ResilientImage src={dataset.previewImageUrl} alt="" width={36} height={36} loading="lazy" fallback={<CatalogGlyph symbol={dataset.iconSymbol} />} />
                        </span>
                        <Link href={datasetHref(dataset)} prefetch={false} className={styles.rowLink}>{dataset.name}</Link>
                        <b className={styles.rowCount}>{formatter.format(dataset.entityCount)}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {checked ? <p className={styles.freshness}>{copy.updated(formatAtlasDate(checked, lang))}</p> : null}
          </AtlasSection>
        </>
      )}
    </AtlasFrame>
  );
}
