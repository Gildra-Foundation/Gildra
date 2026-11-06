"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import { RecordPreviewButton } from "@/components/database/RecordPreviewButton";
import { LibraryRecordCard } from "@/components/library/LibraryRecordCard";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import { libraryListSearch, type LibraryColumn, type LibraryListQuery, type LibraryRecordView } from "@/components/library/libraryRecordView";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { Lang } from "@/lib/i18n-paths";
import materialStyles from "@/components/wow/shared/material/material.module.css";
import paint from "./libraryMaterial.module.css";
import styles from "./libraryResults.module.css";

export type LibraryListLayout = "table" | "tray";

type Props = {
  lang: Lang;
  layout: LibraryListLayout;
  columns: LibraryColumn[];
  rows: LibraryRecordView[];
  /** Cursor of the page after `rows`. */
  next?: string;
  /** The page's query: "show more" asks for the same list from `next` on. */
  query: LibraryListQuery;
  /** Address of the next page for browsers without JavaScript. */
  nextHref?: string;
  iconSymbol?: string;
  /** `materialIconFrameStyle(libraryKit, …)` for rows and tray tiles, and the kit's button style (computed on the server). */
  rowFrame: CSSProperties;
  tileFrame: CSSProperties;
  buttonStyle: CSSProperties;
};

type Stored = { first: string; extra: LibraryRecordView[]; next?: string; y?: number };

const STORE = "gildra:library-list:";
const RETURN = "gildra:library-return";

function storageKey() {
  return `${STORE}${window.location.pathname}${window.location.search}`;
}

function readStored(first: string): Stored | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(storageKey()) ?? "null") as Stored | null;
    return stored && stored.first === first && Array.isArray(stored.extra) ? stored : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored) {
  try { window.sessionStorage.setItem(storageKey(), JSON.stringify(value)); } catch { /* private mode or full storage: the list simply starts over */ }
}

/**
 * The records of a library dataset: a table (icon, name in its quality colour,
 * the facts the dataset really has as columns, the tooltip button) or the tray
 * of icon tiles for collections. "Show more" appends the next page in place;
 * the loaded rows and the scroll position are kept for the tab session, so
 * coming back from a record lands on the same row.
 */
export function LibraryResults({ lang, layout, columns, rows: initialRows, next: initialNext, query, nextHref, iconSymbol, rowFrame, tileFrame, buttonStyle }: Props) {
  const copy = libraryCardCopy[lang];
  const [rows, setRows] = useState(initialRows);
  const [next, setNext] = useState(initialNext);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const restoreY = useRef<number | null>(null);
  const first = initialRows[0]?.id ?? "";

  // Rows loaded before leaving the page come back first (before paint, so the list does not jump).
  useLayoutEffect(() => {
    const stored = readStored(first);
    let returning = false;
    try {
      returning = window.sessionStorage.getItem(RETURN) === storageKey();
      if (returning) window.sessionStorage.removeItem(RETURN);
    } catch { /* storage unavailable */ }
    if (!stored) return;
    if (stored.extra.length) {
      // Session storage is outside React and absent on the server: the stored rows can only join after hydration, before paint.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([...initialRows, ...stored.extra]);
      setNext(stored.next);
    }
    if (returning && typeof stored.y === "number") restoreY.current = stored.y;
  }, [first, initialRows]);

  useLayoutEffect(() => {
    if (restoreY.current === null) return;
    const y = restoreY.current;
    restoreY.current = null;
    window.scrollTo({ top: y, behavior: "instant" });
    // The router may still settle the scroll after the transition; keep the row in place once more.
    requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo({ top: y, behavior: "instant" }); });
  }, [rows]);

  const remember = useCallback((extra: LibraryRecordView[], cursor: string | undefined, y?: number) => {
    writeStored({ first, extra, next: cursor, y });
  }, [first]);

  // Leaving for a record: remember where the reader was in the list.
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as Element).closest?.("a[href]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    remember(rows.slice(initialRows.length), next, window.scrollY);
    try { window.sessionStorage.setItem(RETURN, storageKey()); } catch { /* storage unavailable */ }
  };

  async function showMore() {
    if (!next || state === "loading") return;
    setState("loading");
    try {
      const response = await fetch(`/api/platform/library/records?${libraryListSearch(query, next, lang)}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = await response.json() as { rows: LibraryRecordView[]; next?: string };
      const known = new Set(rows.map((row) => row.id));
      const merged = [...rows, ...page.rows.filter((row) => !known.has(row.id))];
      setRows(merged);
      setNext(page.next);
      setState("idle");
      remember(merged.slice(initialRows.length), page.next);
    } catch {
      setState("error");
    }
  }

  const preview = (row: LibraryRecordView, className: string) => (
    <RecordPreviewButton id={row.id} externalId={row.externalId} type={row.type} lang={lang} iconSymbol={iconSymbol} iconUrl={row.iconUrl}
      labels={{ label: copy.previewLabel(row.name), loading: copy.previewLoading, error: copy.previewError, retry: copy.retry }}
      className={className} errorClassName={styles.previewError} />
  );
  const track = (row: LibraryRecordView) => JSON.stringify({ id: row.externalId, type: row.type });

  return (
    <div className={styles.list} onClickCapture={onClickCapture}>
      {layout === "tray" ? (
        <ul className={styles.tray}>
          {rows.map((row) => (
            <LibraryRecordCard key={row.id} id={row.id} href={row.href} name={row.name} lang={lang} layout="tray" iconUrl={row.iconUrl} iconSymbol={iconSymbol}
              quality={row.quality} itemLevel={row.itemLevel} description={row.description} facts={[]} iconFrameStyle={tileFrame}
              track={{ event: "catalog_detail_opened", props: { id: row.externalId, type: row.type } }} action={preview(row, styles.preview)} />
          ))}
        </ul>
      ) : (
        <table className={styles.table} data-columns={columns.length}>
          <thead>
            <tr>
              <th scope="col" className={styles.nameHead}>{copy.columns.name}</th>
              {columns.map((column) => <th key={column} scope="col" className={numeric(column) ? styles.numeric : undefined}>{copy.columns[column]}</th>)}
              <th scope="col" className={styles.actionHead}><span className="sr-only">{copy.preview}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const colour = row.quality !== undefined ? itemQualityColors[row.quality as keyof typeof itemQualityColors] : undefined;
              const style = colour ? { "--record-quality": colour.frame, "--record-quality-text": colour.text } as CSSProperties : undefined;
              return (
                <tr key={row.id} className={styles.row} style={style} data-quality={colour ? row.quality : undefined} data-hover-preview={row.id} data-hover-icon={row.iconUrl || undefined}>
                  <th scope="row" className={styles.nameCell}>
                    <div className={styles.nameInner}>
                    <span className={`${materialStyles.iconFrame} ${styles.icon}`} style={rowFrame} aria-hidden="true">
                      <ResilientImage src={row.iconUrl} alt="" width={36} height={36} loading="lazy" fallback={<CatalogGlyph symbol={iconSymbol ?? "#ic-gem"} className={styles.glyph} />} />
                    </span>
                    <span className={styles.nameText}>
                      <Link href={row.href} prefetch={false} className={styles.link} data-track="catalog_detail_opened" data-track-props={track(row)}>{row.name}</Link>
                      {subline(row, columns) ? <span className={styles.description}>{subline(row, columns)}</span> : null}
                    </span>
                    </div>
                  </th>
                  {columns.map((column) => {
                    const value = row[column];
                    return (
                      <td key={column} className={numeric(column) ? `${styles.fact} ${styles.numeric}` : styles.fact} data-label={numeric(column) ? copy.columns[column] : undefined} data-empty={value === undefined || undefined}>
                        {value ?? <span aria-hidden="true">—</span>}
                      </td>
                    );
                  })}
                  <td className={styles.actionCell}>{preview(row, styles.preview)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {next ? (
        <div className={styles.more}>
          {state === "error" ? <p className={styles.moreError} role="alert">{copy.moreError}</p> : null}
          <span className={paint.painted} style={buttonStyle}>
            <AtlasButton variant="primary" onClick={() => void showMore()} aria-busy={state === "loading" || undefined} disabled={state === "loading"}
              iconAfter={<ChevronDown aria-hidden="true" />}>
              {state === "loading" ? copy.loadingMore : state === "error" ? copy.retry : copy.showMore}
            </AtlasButton>
          </span>
          {nextHref ? <noscript><a className={styles.nextLink} href={nextHref}>{copy.showMore}</a></noscript> : null}
        </div>
      ) : null}
      <p className="sr-only" role="status">{state === "loading" ? copy.loadingMore : ""}</p>
    </div>
  );
}

/** Under the name: the description when the dataset has no fact columns, else a slot the table left out as a column. */
function subline(row: LibraryRecordView, columns: LibraryColumn[]) {
  if (!columns.length) return row.description;
  return row.type === "item" && !columns.includes("slot") ? row.slot : undefined;
}

function numeric(column: LibraryColumn) {
  return column === "itemLevel" || column === "requiredLevel";
}
