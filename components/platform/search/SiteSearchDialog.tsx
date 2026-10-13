"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, CornerDownLeft, Database, Search } from "lucide-react";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { readRecentPages } from "./recentPages";
import { loadedIndex, loadIndex, type SiteIndex as Index } from "./siteSearchIndex";
import { siteSearchCopy, type SiteSearchLang } from "./siteSearchCopy";
import { searchIndex } from "./siteSearchMatch";
import styles from "./siteSearch.module.css";

type Row = { key: string; href: string; title: string; kind: string; icon?: "recent" | "database" };
type Group = { label: string; rows: Row[] };

/**
 * The quick search dialog. Loaded only when the reader first opens it and
 * mounted afresh on every opening, so the query and history start clean.
 */
export function SiteSearchDialog({ onClose, lang, initialQuery = "" }: { onClose: () => void; lang: SiteSearchLang; initialQuery?: string }) {
  const copy = siteSearchCopy[lang];
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<Index | null>(loadedIndex);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecentPages);
  const prefix = lang === "ru" ? "/ru" : "";
  const localized = (href: string) => (href === "/" ? prefix || "/" : `${prefix}${href}`);

  useEffect(() => {
    input.current?.focus();
    if (loadedIndex()) return;
    let alive = true;
    loadIndex().then((data) => { if (alive) setIndex(data); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const groups = useMemo<Group[]>(() => {
    const entries = index?.[lang] ?? [];
    const trimmed = query.trim();
    if (!trimmed) {
      const recentRows: Row[] = recent.map((page) => ({ key: `r${page.h}`, href: localized(page.h), title: page.t, kind: "", icon: "recent" }));
      const sectionKind = entries[0]?.s;
      const sectionRows: Row[] = entries.filter((entry) => entry.s === sectionKind).map((entry) => ({ key: `s${entry.h}`, href: localized(entry.h), title: entry.t, kind: "" }));
      return [
        ...(recentRows.length ? [{ label: copy.recent, rows: recentRows }] : []),
        ...(sectionRows.length ? [{ label: copy.sections, rows: sectionRows }] : []),
      ];
    }
    const hits = searchIndex(entries, trimmed);
    const byKind = new Map<string, Row[]>();
    for (const hit of hits) {
      const rows = byKind.get(hit.s) ?? [];
      rows.push({ key: `h${hit.h}`, href: localized(hit.h), title: hit.t, kind: hit.s });
      byKind.set(hit.s, rows);
    }
    return [
      ...[...byKind].map(([label, rows]) => ({ label, rows })),
      { label: copy.databaseGroup, rows: [{ key: "db", href: `${prefix}/search?q=${encodeURIComponent(trimmed)}`, title: copy.database(trimmed), kind: "", icon: "database" as const }] },
    ];
    // `localized` only depends on `prefix`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, lang, query, recent, copy, prefix]);

  const rows = groups.flatMap((group) => group.rows);
  const hitCount = query.trim() ? rows.length - 1 : 0;
  const current = rows[Math.min(active, rows.length - 1)];
  const optionId = (row: Row) => `${id}-${row.key}`;

  const go = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    router.push(row.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!rows.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (Math.min(active, rows.length - 1) + step + rows.length) % rows.length;
      setActive(next);
      document.getElementById(optionId(rows[next]))?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      go(current);
    }
  };

  let position = -1;
  return (
    <AtlasDialog open onClose={onClose} label={copy.dialog} variant="sheet" className={styles.dialog}>
      <div className={styles.head}>
        <AtlasInput
          ref={input}
          type="search"
          role="combobox"
          aria-label={copy.dialog}
          aria-expanded={rows.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(current) : undefined}
          placeholder={copy.placeholder}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          icon={<Search size={16} strokeWidth={1.8} />}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
        />
        <button className={styles.close} type="button" onClick={onClose}>Esc</button>
      </div>
      <div className={styles.list} id={`${id}-list`} role="listbox" aria-label={copy.dialog}>
        {groups.map((group) => (
          <div className={styles.group} role="group" aria-labelledby={`${id}-${group.label}`} key={group.label}>
            <p className={styles.groupLabel} id={`${id}-${group.label}`}>{group.label}</p>
            {group.rows.map((row) => {
              position += 1;
              const index = position;
              const selected = current?.key === row.key;
              return (
                <Link
                  key={row.key}
                  id={optionId(row)}
                  href={row.href}
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  prefetch={false}
                  className={styles.option}
                  onMouseMove={() => { if (!selected) setActive(index); }}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    go(row);
                  }}
                >
                  {row.icon === "recent" ? <Clock3 className={styles.optionIcon} size={15} aria-hidden="true" /> : null}
                  {row.icon === "database" ? <Database className={styles.optionIcon} size={15} aria-hidden="true" /> : null}
                  <span className={styles.optionTitle}>{row.title}</span>
                  {selected ? <CornerDownLeft className={styles.enter} size={14} aria-hidden="true" /> : null}
                </Link>
              );
            })}
          </div>
        ))}
        {!index && !failed ? <p className={styles.status}>{copy.loading}</p> : null}
        {failed ? <p className={styles.status}>{copy.failed}</p> : null}
        {index && query.trim() && hitCount === 0 ? <p className={styles.status}>{copy.nothing}</p> : null}
      </div>
      <span className="sr-only" aria-live="polite">{query.trim() && index ? copy.count(hitCount) : ""}</span>
      <div className={styles.foot} aria-hidden="true">
        <span>{query.trim() && index ? copy.count(hitCount) : ""}</span>
        <span className={styles.hints}>
          {copy.hints.map(([key, label]) => <span key={key}><kbd>{key}</kbd> {label}</span>)}
        </span>
      </div>
    </AtlasDialog>
  );
}
