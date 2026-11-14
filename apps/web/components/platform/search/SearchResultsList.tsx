"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { Lang } from "@/lib/i18n-paths";
// The CSS modules directly, not CatalogRecordRow and the materialAtlas barrel: this list renders on the client.
import materialStyles from "@/components/wow/shared/material/material.module.css";
import rowStyles from "@/components/database/catalogRecordRow.module.css";
import paint from "@/components/library/libraryMaterial.module.css";
import { searchListParams, type SearchListQuery, type SearchRow } from "./searchList";
import styles from "./searchPage.module.css";

type Props = {
  lang: Lang;
  rows: SearchRow[];
  /** Cursor of the page after `rows`. */
  next?: string;
  /** The page's query: "show more" asks for the same search from `next` on. */
  query: SearchListQuery;
  /** Address of the next page for browsers without JavaScript. */
  nextHref?: string;
  /** `materialIconFrameStyle(libraryKit, 56)` and the kit's button style (computed on the server). */
  rowFrame: CSSProperties;
  buttonStyle: CSSProperties;
};

type Stored = { first: string; extra: SearchRow[]; next?: string; y?: number };

const STORE = "gildra:search-list:";
const RETURN = "gildra:search-return";

function storageKey(game = "") {
  return `${STORE}${game}:${window.location.pathname}${window.location.search}`;
}

function readStored(key: string, first: string): Stored | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as Stored | null;
    return stored && stored.first === first && Array.isArray(stored.extra) ? stored : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: Stored) {
  try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or full storage: the list simply starts over */ }
}

/**
 * The records a search found, as the rows of the shared record list (the markup
 * and classes of CatalogRecordRow). "Show more" appends the next page in place,
 * like the library lists: no record twice, the loaded rows and the scroll
 * position kept for the tab session, so coming back from a record lands on the
 * same row.
 */
export function SearchResultsList({ lang, rows: initialRows, next: initialNext, query, nextHref, rowFrame, buttonStyle }: Props) {
  const copy = libraryCardCopy[lang];
  const [rows, setRows] = useState(initialRows);
  const [next, setNext] = useState(initialNext);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const restoreY = useRef<number | null>(null);
  const first = initialRows[0]?.id ?? "";
  const game = query.game;

  // Rows loaded before leaving the page come back first (before paint, so the list does not jump).
  useLayoutEffect(() => {
    const key = storageKey(game);
    const stored = readStored(key, first);
    let returning = false;
    try {
      returning = window.sessionStorage.getItem(RETURN) === key;
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
  }, [first, game, initialRows]);

  useLayoutEffect(() => {
    if (restoreY.current === null) return;
    const y = restoreY.current;
    restoreY.current = null;
    window.scrollTo({ top: y, behavior: "instant" });
    // The router may still settle the scroll after the transition; keep the row in place once more.
    requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo({ top: y, behavior: "instant" }); });
  }, [rows]);

  const remember = useCallback((extra: SearchRow[], cursor: string | undefined, y?: number) => {
    writeStored(storageKey(game), { first, extra, next: cursor, y });
  }, [first, game]);

  // Leaving for a record: remember where the reader was in the list.
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as Element).closest?.("a[href]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    remember(rows.slice(initialRows.length), next, window.scrollY);
    try { window.sessionStorage.setItem(RETURN, storageKey(game)); } catch { /* storage unavailable */ }
  };

  async function showMore() {
    if (!next || state === "loading") return;
    setState("loading");
    try {
      const params = searchListParams(query, next);
      params.set("lang", lang);
      const response = await fetch(`/api/platform/search/more?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = await response.json() as { rows: SearchRow[]; next?: string };
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

  return (
    <div className={styles.found} onClickCapture={onClickCapture}>
      <ul className={styles.resultList}>
        {rows.map((row) => {
          const colour = row.quality !== undefined ? itemQualityColors[row.quality as keyof typeof itemQualityColors] : undefined;
          return (
            <li key={row.id} className={rowStyles.row} data-quality={colour ? row.quality : undefined}
              style={colour ? { "--record-quality": colour.frame, "--record-quality-text": colour.text } as CSSProperties : undefined}>
              <span className={`${materialStyles.iconFrame} ${rowStyles.icon}`} style={rowFrame} aria-hidden="true">
                <ResilientImage src={row.iconUrl} alt="" width={48} height={48} loading="lazy" fallback={<CatalogGlyph symbol={row.iconSymbol ?? "#ic-gem"} className={rowStyles.glyph} />} />
              </span>
              <div className={rowStyles.body}>
                <p className={rowStyles.type}>{row.typeLabel}</p>
                <h3 className={rowStyles.name}><Link href={row.href} prefetch={false} className={rowStyles.link}>{row.name}</Link></h3>
                {row.description ? <p className={rowStyles.description}>{row.description}</p> : null}
                {/* A no-break space keeps each "·" on the line of the fact before it, so a wrapped line never starts with a dot. */}
                {row.meta.length ? <p className={rowStyles.meta}>{row.meta.map((fact, index) => <span key={index}>{index ? "\u00a0· " : null}{fact}</span>)}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>

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
