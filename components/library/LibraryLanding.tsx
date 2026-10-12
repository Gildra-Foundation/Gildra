import Link from "next/link";
import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection, AtlasTile } from "@/components/atlas";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import type { CatalogProduct, LibraryDataset } from "@/lib/api/client";
import { LibraryUnavailable } from "@/components/library/LibraryUnavailable";
import { libraryCopy, libraryGroupText } from "@/components/library/libraryCopy";
import styles from "./library.module.css";

type Props = {
  lang: "en" | "ru";
  datasets: LibraryDataset[];
  products: CatalogProduct[];
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
 * /library and /ru/library: hero, edition switch, ONE freshness notice for the
 * shown edition, then the datasets grouped by area. A card states coverage only
 * where it is incomplete, and a state badge only for datasets that do not apply.
 */
export function LibraryLanding({ lang, datasets, products, selectedProduct, unavailable = false }: Props) {
  const copy = libraryCopy[lang];
  const prefix = lang === "ru" ? "/ru" : "";
  const formatter = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US");
  const total = datasets.reduce((sum, dataset) => sum + dataset.entityCount, 0);
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
    ? copy.checkedAt(checked.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC")
    : copy.neverChecked;
  const notice = state === "failed" ? { tone: "caution" as const, title: copy.failedTitle, text: copy.failedText }
    : state === "stale" || state === "empty" ? { tone: "caution" as const, title: copy.staleTitle, text: copy.staleText }
      : state === "refreshing" ? { tone: "info" as const, title: copy.refreshingTitle, text: copy.refreshingText }
        : { tone: "info" as const, title: copy.freshTitle, text: "" };

  return (
    <AtlasFrame as="div" lang={lang} art="/assets/wow/loading/tier.webp" artPosition="center 50%" dataAttributes={{ "data-library-root": true }}>
      <AtlasHero
        title={copy.title}
        lede={copy.lede}
        statsLabel={copy.statsLabel}
        stats={unavailable ? undefined : [
          { value: formatter.format(total), label: copy.statRecords },
          { value: formatter.format(datasets.length), label: copy.statDatasets },
        ]}
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

          <AtlasSection id="datasets" title={copy.datasetsTitle} description={copy.datasetsText}>
            <div className={styles.groups}>
              {groups.map(([group, entries]) => (
                <section key={group} className={styles.group} aria-labelledby={`library-group-${group}`}>
                  <h3 id={`library-group-${group}`}>{libraryGroupText[group]?.[lang] ?? group}</h3>
                  <ul className={styles.grid}>
                    {entries.map((dataset) => {
                      const gaps = dataset.applicability === "applicable" ? [
                        { label: copy.coverage.text, value: coveredPercent(dataset.verifiedLocalizedCount, dataset.entityCount) },
                        { label: copy.coverage.tooltip, value: coveredPercent(dataset.tooltipCount, dataset.entityCount) },
                        { label: copy.coverage.images, value: coveredPercent(dataset.imageCount, dataset.entityCount) },
                      ].filter((entry) => entry.value < 100) : [];
                      const badge = dataset.applicability === "pending_source" ? copy.pendingSource : dataset.applicability === "not_applicable" ? copy.notApplicable : null;
                      return (
                        <li key={dataset.slug}>
                          <AtlasTile
                            href={`${prefix}/library/${encodeURIComponent(dataset.slug)}${productQuery}`}
                            icon={<ResilientImage src={dataset.previewImageUrl} alt="" width={44} height={44} loading="lazy" fallback={<CatalogGlyph symbol={dataset.iconSymbol} />} />}
                            title={dataset.name}
                            text={(
                              <>
                                <span className={styles.description}>{dataset.description}</span>
                                <span className={styles.facts}>
                                  <b>{copy.records(formatter.format(dataset.entityCount))}</b>
                                  {badge ? <span className={styles.state} title={dataset.applicabilityReason || undefined}>{badge}</span> : null}
                                  {gaps.length ? <span className={styles.gaps} aria-label={copy.coverageLabel}>{gaps.map((gap) => `${gap.label} ${gap.value}%`).join(" · ")}</span> : null}
                                </span>
                              </>
                            )}
                          />
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
