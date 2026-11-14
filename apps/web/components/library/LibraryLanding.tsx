import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AtlasField, AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import { MaterialButton, MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import type { CatalogProduct, CatalogRecord, LibraryDataset } from "@/lib/api/client";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { LIBRARY_FEATURED } from "@/lib/library/featured";
import { LibraryUnavailable } from "@/components/library/LibraryUnavailable";
import { LIBRARY_HIDDEN_DATASETS, libraryCopy, libraryDatasetLine, libraryGroupText } from "@/components/library/libraryCopy";
import { libraryKit } from "@/components/library/libraryKit";
import { LibrarySearchBox, type LibrarySearchSection } from "@/components/library/LibrarySearchBox";
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

/**
 * /library and /ru/library (gildra-wow-material-design §3.7): the hero holds
 * the library search on the library plaque — instant suggestions of sections
 * and records as you type, Enter for every result — and the edition switch;
 * then the featured datasets on painted plaques and every dataset grouped by
 * area on glass with the kit's icon frames. The record count of a dataset
 * stands once, in its row. No freshness dates or notices (gildra-clean-ui).
 */
export function LibraryLanding({ lang, datasets: allDatasets, products, samples, selectedProduct, unavailable = false }: Props) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const formatter = new Intl.NumberFormat(libraryLandingCopy[lang].numberLocale);
  const datasets = allDatasets.filter((dataset) => dataset.entityCount > 0 && !LIBRARY_HIDDEN_DATASETS.has(dataset.slug));
  const groups = Array.from(Map.groupBy(datasets, (dataset) => dataset.group));
  const productQuery = selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`;

  const featured = LIBRARY_FEATURED.map((slug) => datasets.find((dataset) => dataset.slug === slug)).filter((dataset): dataset is LibraryDataset => Boolean(dataset));
  const rowFrame = materialIconFrameStyle(libraryKit, 44);
  const datasetHref = (dataset: LibraryDataset) => `${prefix}/library/${encodeURIComponent(dataset.slug)}${productQuery}`;
  const sections: LibrarySearchSection[] = datasets.map((dataset) => ({ slug: dataset.slug, name: dataset.name, href: datasetHref(dataset), iconUrl: dataset.previewImageUrl || samples[dataset.slug]?.[0]?.iconUrl, iconSymbol: dataset.iconSymbol }));

  return (
    <AtlasFrame lang={lang} scene="archive" dataAttributes={{ "data-library-root": true }}>
      <AtlasHero
        className={styles.hero}
        breadcrumbs={[{ label: copy.wow, href: prefix || "/" }, { label: copy.library }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        title={copy.title}
        actions={unavailable ? undefined : (
          // The whole library is searched on /search; a plain GET form works without JavaScript, the field suggests as you type.
          <MaterialPlaque kit={libraryKit} as="section" id="library-search" className={styles.searchPlaque} aria-label={copy.searchTitle}>
            <form className={styles.search} role="search" action={`${prefix}/search`} method="get">
              <AtlasField label={copy.searchFieldLabel} htmlFor="library-search-input" className={styles.searchField}>
                <LibrarySearchBox lang={lang} id="library-search-input" placeholder={copy.searchPlaceholder} product={selectedProduct} sections={sections} required />
              </AtlasField>
              <MaterialButton kit={libraryKit} fit="stack" type="submit" variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{copy.searchSubmit}</MaterialButton>
            </form>
            {products.length > 1 ? (
              <nav className={styles.editions} aria-label={copy.editions}>
                {products.map((entry) => (
                  <Link key={entry.slug} href={`${prefix}/library${entry.slug === "wow" ? "" : `?product=${encodeURIComponent(entry.slug)}`}`} prefetch={false}
                    aria-current={entry.slug === selectedProduct ? "page" : undefined}>{entry.name}</Link>
                ))}
              </nav>
            ) : null}
          </MaterialPlaque>
        )}
      />

      {unavailable ? <LibraryUnavailable lang={lang} /> : (
        <>
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
                        <span className={`${materialStyles.iconFrame} ${styles.rowIcon}`} style={rowFrame} aria-hidden="true">
                          <ResilientImage src={dataset.previewImageUrl} alt="" width={40} height={40} loading="lazy" fallback={<CatalogGlyph symbol={dataset.iconSymbol} />} />
                        </span>
                        <Link href={datasetHref(dataset)} prefetch={false} className={styles.rowLink}>{dataset.name}</Link>
                        <b className={styles.rowCount}>{formatter.format(dataset.entityCount)}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </AtlasSection>
        </>
      )}
    </AtlasFrame>
  );
}
