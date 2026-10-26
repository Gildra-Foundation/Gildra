import type { CSSProperties } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import type { CatalogProduct, CatalogRecord, LibraryDataset } from "@/lib/api/client";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { LIBRARY_FEATURED } from "@/lib/library/featured";
import { LibraryUnavailable } from "@/components/library/LibraryUnavailable";
import { libraryCopy, libraryGroupText } from "@/components/library/libraryCopy";
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
const severity: Freshness[] = ["fresh", "unknown", "empty", "stale", "refreshing", "failed"];

/** Covered share as a whole percent (a gap of a few records in 160 000 still reads as 100%). */
function coveredPercent(value: number, total: number) {
  return total > 0 ? Math.round((Math.min(value, total) / total) * 100) : 0;
}

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
 * /library and /ru/library: hero, edition switch, ONE freshness notice for the
 * shown edition, then the datasets grouped by area. A card states coverage only
 * where it is incomplete, and a state badge only for datasets that do not apply.
 */
export function LibraryLanding({ lang, datasets, products, samples, selectedProduct, unavailable = false }: Props) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const formatter = new Intl.NumberFormat(libraryLandingCopy[lang].numberLocale);
  const total = distinctRecordCount(datasets);
  const groups = Array.from(Map.groupBy(datasets, (dataset) => dataset.group));
  const productQuery = selectedProduct === "wow" ? "" : `?product=${encodeURIComponent(selectedProduct)}`;

  const checked = datasets.reduce<Date | null>((latest, dataset) => {
    if (!dataset.coverageUpdatedAt) return latest;
    const candidate = new Date(dataset.coverageUpdatedAt);
    return !latest || candidate > latest ? candidate : latest;
  }, null);
  const product = products.find((entry) => entry.slug === selectedProduct);
  const states: Freshness[] = [
    ...(product?.freshness ? [product.freshness] : []),
    ...datasets.filter((dataset) => dataset.applicability === "applicable").map((dataset) => dataset.freshness),
  ];
  const state = states.reduce<Freshness>((worst, next) => (severity.indexOf(next) > severity.indexOf(worst) ? next : worst), "fresh");
  const checkedText = checked
    ? copy.checkedAt(checked.toLocaleString(libraryLandingCopy[lang].numberLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC")
    : copy.neverChecked;
  const notice = state === "failed" ? { tone: "caution" as const, title: copy.failedTitle, text: copy.failedText }
    : state === "stale" || state === "empty" ? { tone: "caution" as const, title: copy.staleTitle, text: copy.staleText }
      : state === "refreshing" ? { tone: "info" as const, title: copy.refreshingTitle, text: copy.refreshingText }
        : { tone: "info" as const, title: copy.freshTitle, text: "" };

  const featured = LIBRARY_FEATURED.map((slug) => datasets.find((dataset) => dataset.slug === slug)).filter((dataset): dataset is LibraryDataset => Boolean(dataset && dataset.entityCount > 0));
  const datasetHref = (dataset: LibraryDataset) => `${prefix}/library/${encodeURIComponent(dataset.slug)}${productQuery}`;

  return (
    <AtlasFrame as="div" lang={lang} scene="archive" dataAttributes={{ "data-library-root": true }}>
      <AtlasHero
        title={copy.title}
        lede={copy.lede}
        statsLabel={copy.statsLabel}
        stats={unavailable ? undefined : [
          ...(total === null ? [] : [{ value: formatter.format(total), label: copy.statRecords }]),
          { value: formatter.format(datasets.length), label: copy.statDatasets },
        ]}
        actions={unavailable ? undefined : (
          // The whole catalog is searchable on /database; a plain GET form works without JavaScript.
          <form className={styles.search} role="search" action={`${prefix}/database`} method="get">
            <label className="sr-only" htmlFor="library-search">{copy.searchLabel}</label>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input id="library-search" name="q" type="search" placeholder={copy.searchPlaceholder} autoComplete="off" required maxLength={200} />
            {selectedProduct !== "wow" ? <input type="hidden" name="product" value={selectedProduct} /> : null}
            <button type="submit">{copy.searchSubmit}</button>
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

          <AtlasNotice tone={notice.tone} title={notice.title} className={styles.notice}>
            {notice.text ? `${notice.text} ` : ""}{checkedText}
          </AtlasNotice>

          {featured.length ? (
            <AtlasSection id="featured" title={copy.featuredTitle} description={copy.featuredText}>
              <ul className={styles.featured}>
                {featured.map((dataset) => (
                  <li key={dataset.slug} className={styles.plate}>
                    <span className={styles.plateIcon} aria-hidden="true">
                      {/* The dataset preview, or the icon of its first sample record when the catalog has not chosen one yet. */}
                      <ResilientImage src={dataset.previewImageUrl || samples[dataset.slug]?.[0]?.iconUrl} alt="" width={58} height={58} loading="lazy" fallback={<CatalogGlyph symbol={dataset.iconSymbol} />} />
                    </span>
                    <h3><Link href={datasetHref(dataset)} prefetch={false} className={styles.plateLink}>{dataset.name}</Link></h3>
                    <p className={styles.plateText}>{dataset.description}</p>
                    <p className={styles.plateCount}><b>{formatter.format(dataset.entityCount)}</b> {copy.statRecords}</p>
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
                  </li>
                ))}
              </ul>
            </AtlasSection>
          ) : null}

          <AtlasSection id="datasets" title={copy.datasetsTitle} description={copy.datasetsText(datasets.length)}>
            <div className={styles.groups}>
              {groups.map(([group, entries]) => (
                <section key={group} className={styles.group} aria-labelledby={`library-group-${group}`}>
                  <h3 id={`library-group-${group}`}>{libraryGroupText[group]?.[lang] ?? group}</h3>
                  <ul className={styles.list}>
                    {entries.map((dataset) => {
                      const gaps = dataset.applicability === "applicable" ? [
                        { label: copy.coverage.text, value: coveredPercent(dataset.verifiedLocalizedCount, dataset.entityCount) },
                        { label: copy.coverage.tooltip, value: coveredPercent(dataset.tooltipCount, dataset.entityCount) },
                        { label: copy.coverage.images, value: coveredPercent(dataset.imageCount, dataset.entityCount) },
                      ].filter((entry) => entry.value < 100) : [];
                      const badge = dataset.applicability === "pending_source" ? copy.pendingSource : dataset.applicability === "not_applicable" ? copy.notApplicable : null;
                      return (
                        <li key={dataset.slug} className={styles.row}>
                          <span className={styles.rowIcon} aria-hidden="true">
                            <ResilientImage src={dataset.previewImageUrl} alt="" width={36} height={36} loading="lazy" fallback={<CatalogGlyph symbol={dataset.iconSymbol} />} />
                          </span>
                          <span className={styles.rowBody}>
                            <Link href={datasetHref(dataset)} prefetch={false} className={styles.rowLink}>{dataset.name}</Link>
                            {badge || gaps.length ? (
                              <span className={styles.rowNote}>
                                {badge ? <span className={styles.state} title={dataset.applicabilityReason || undefined}>{badge}</span> : null}
                                {gaps.length ? <span className={styles.gaps} aria-label={copy.coverageLabel}>{gaps.map((gap) => `${gap.label} ${gap.value}%`).join(" · ")}</span> : null}
                              </span>
                            ) : null}
                          </span>
                          <b className={styles.rowCount}>{formatter.format(dataset.entityCount)}</b>
                        </li>
                      );
                    })}
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
