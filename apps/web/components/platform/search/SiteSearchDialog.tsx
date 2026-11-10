"use client";

import { memo, useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Castle, ChevronDown, Clock3, Compass, CornerDownLeft, Database, History, MapPin, Search, Skull, Swords, X } from "lucide-react";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { lessMotion } from "@gildra/atlas-ui/motionPreference";
import { knownRenderTier } from "@gildra/atlas-ui/renderTier";
import { routeTurnDeviceAllowed, type RouteTurnDevice } from "@/components/motion/routeTurnDevice";
import type { SiteSearchGroup } from "@/lib/search/siteIndex";
import { readRecentPages, readRecentQueries, rememberQuery } from "./recentPages";
import { indexFailed, loadedIndex, loadIndex, subscribeIndex, type SiteIndex } from "./siteSearchIndex";
import { siteSearchCopy, type SiteSearchLang } from "./siteSearchCopy";
import { matchRanges, prepareIndex, searchIndex } from "./siteSearchMatch";
import styles from "./siteSearch.module.css";

type RowIcon = "recent" | "database" | SiteSearchGroup;
type Row = { key: string; href: string; title: string; detail?: string; icon?: RowIcon; image?: string; query?: string };
type Group = { id: string; label: string; rows: Row[] };

/** Results per group while typing: the best few of each kind, the rest one keystroke away. */
const GROUP_LIMIT = 6;
const SECTION_SUGGESTIONS = 7;

const groupIcons: Partial<Record<RowIcon, ReactNode>> = {
  recent: <Clock3 size={16} strokeWidth={1.8} />,
  database: <Database size={16} strokeWidth={1.8} />,
  section: <Compass size={16} strokeWidth={1.8} />,
  place: <MapPin size={16} strokeWidth={1.8} />,
  raid: <Swords size={16} strokeWidth={1.8} />,
  boss: <Skull size={16} strokeWidth={1.8} />,
  lair: <Skull size={16} strokeWidth={1.8} />,
  dungeon: <Castle size={16} strokeWidth={1.8} />,
};

/** The tab's render tier as the page hand-over probed it (RouteTransitionRuntime keeps it for the session). */
function renderTier() {
  try {
    const saved = sessionStorage.getItem("gildra-render-tier");
    return knownRenderTier() ?? (saved === "gpu" || saved === "cpu" ? saved : undefined);
  } catch {
    return knownRenderTier();
  }
}

type IdleDeadline = { timeRemaining: () => number };
type IdleWindow = Window & { requestIdleCallback?: (callback: (deadline: IdleDeadline) => void, options?: { timeout: number }) => number };

// The chunk loads while the page is idle (or on first use): the index it searches is
// normalised in idle time too, a slice per idle period and the page's language first, so
// the first keystroke only matches (and no idle task grows long enough to delay a tap).
function prepareWhenIdle(lists: SiteIndex[SiteSearchLang][]) {
  const idle = window as IdleWindow;
  const step = (deadline: IdleDeadline) => {
    while (lists.length && prepareIndex(lists[0], deadline)) lists.shift();
    if (lists.length) schedule();
  };
  const schedule = () => {
    if (idle.requestIdleCallback) idle.requestIdleCallback(step, { timeout: 3000 });
    else setTimeout(() => step({ timeRemaining: () => 8 }), 200);
  };
  schedule();
}
if (typeof window !== "undefined") {
  const ru = document.documentElement.lang.startsWith("ru");
  void loadIndex().then((index: SiteIndex) => prepareWhenIdle(ru ? [index.ru, index.en] : [index.en, index.ru]), () => undefined);
}

/** The title with the query's words marked. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const ranges = useMemo(() => (query ? matchRanges(text, query) : []), [text, query]);
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

type RowEvents = {
  /** The pointer rests on a row: it becomes the selected one. */
  hover: (index: number) => void;
  open: (row: Row, event: MouseEvent<HTMLDivElement>) => void;
  prefetch: (row: Row) => void;
};

/**
 * One result. Options, not links: the dialog's focus trap walks every focusable element on opening, and
 * a list of links made that the longest part of it. Enter or a click opens through the router; Ctrl/⌘
 * or the middle button opens a tab, as a link would. Memoised: a keystroke or an arrow redraws only the
 * rows whose content or selection changed.
 */
const Option = memo(function Option({ row, id, index, selected, query, events }: { row: Row; id: string; index: number; selected: boolean; query: string; events: RowEvents }) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      className={styles.option}
      data-href={row.href || undefined}
      onMouseMove={() => { if (!selected) events.hover(index); }}
      onMouseEnter={() => events.prefetch(row)}
      onClick={(event) => events.open(row, event)}
      onAuxClick={(event) => { if (event.button === 1 && row.href) window.open(row.href, "_blank", "noopener"); }}
    >
      <span className={styles.optionIcon} data-image={row.image ? "" : undefined} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 32 px thumbnail, already sized by the index */}
        {row.image ? <img src={row.image} alt="" width={32} height={32} loading="lazy" decoding="async" /> : row.query !== undefined ? <History size={16} strokeWidth={1.8} /> : groupIcons[row.icon ?? "section"] ?? <Compass size={16} strokeWidth={1.8} />}
      </span>
      <span className={styles.optionText}>
        <span className={styles.optionTitle}><Highlighted text={row.title} query={row.icon === "database" || row.query !== undefined ? "" : query} /></span>
        {row.detail ? <span className={styles.optionDetail}>{row.detail}</span> : null}
      </span>
      {selected ? <CornerDownLeft className={styles.enter} size={14} aria-hidden="true" /> : null}
    </div>
  );
});

/** The grouped results; it follows the deferred query, so typing into the field never redraws it. */
const ResultList = memo(function ResultList({ groups, id, current, query, events }: { groups: Group[]; id: string; current: string | undefined; query: string; events: RowEvents }) {
  // Each group's first row in the whole list (the keyboard walks every row in order).
  const starts = groups.reduce<number[]>((list, group, index) => [...list, index ? list[index - 1] + groups[index - 1].rows.length : 0], []);
  return <>
    {groups.map((group, groupIndex) => (
      <div className={styles.group} role="group" aria-labelledby={`${id}-g-${group.id}`} key={group.id} data-group={group.id}>
        <p className={styles.groupLabel} id={`${id}-g-${group.id}`}>{group.label}</p>
        {group.rows.map((row, rowIndex) => (
          <Option key={row.key} row={row} id={`${id}-${row.key}`} index={starts[groupIndex] + rowIndex} selected={current === row.key} query={query} events={events} />
        ))}
      </div>
    ))}
  </>;
});

/**
 * The quick search dialog. Loaded when the page is idle (or on first use) and
 * mounted afresh on every opening, so the query starts clean; after a close it
 * stays mounted until its exit animation has played. On wider screens it grows
 * out of the toolbar's search field (`origin`), on phones it is a full-screen sheet.
 */
export function SiteSearchDialog({ open, onClose, lang, initialQuery = "", origin }: { open: boolean; onClose: () => void; lang: SiteSearchLang; initialQuery?: string; origin?: DOMRect | null }) {
  const copy = siteSearchCopy[lang];
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // The index is usually warm already (idle time, hover); otherwise it arrives while the dialog opens.
  const index = useSyncExternalStore(subscribeIndex, loadedIndex, () => null);
  const failed = useSyncExternalStore(subscribeIndex, indexFailed, () => false) && !index;
  const [query, setQuery] = useState(initialQuery);
  // Results follow the field at a lower priority: typing never waits for the list.
  const deferred = useDeferredValue(query);
  // The first commit is only the frame and the field (the opening task stays short); the rows
  // follow in a render of their own, inside the unfold, before its content fades in.
  const rowsReady = useDeferredValue(true, false);
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecentPages);
  const [queries] = useState(readRecentQueries);
  const prefix = lang === "ru" ? "/ru" : "";
  const localized = (href: string) => (href === "/" ? prefix || "/" : `${prefix}${href}`);

  // The panel unfolds from the toolbar's field: it starts as that field's box
  // and opens to its own, the contents fading in behind the edge.
  useLayoutEffect(() => {
    const panel = body.current?.closest<HTMLElement>(".ui-dialog");
    // The blurred veil only where the page is composited on a GPU: in software every frame re-blurs the page.
    if (panel?.parentElement && !routeTurnDeviceAllowed(navigator as Navigator & RouteTurnDevice, renderTier() ?? "cpu")) panel.parentElement.dataset.veil = "plain";
    if (!panel || !origin || lessMotion() || typeof panel.animate !== "function" || !window.matchMedia("(min-width: 721px)").matches) return;
    // Nothing is measured here (a read would force the new dialog's layout inside the opening task):
    // the panel hangs centred from min(12vh, 104px) (siteSearch.module.css), so the field's box is
    // expressed against that — horizontally in percentages of the panel's own width.
    panel.dataset.morph = "";
    const centre = window.innerWidth / 2;
    const shift = origin.top - Math.min(window.innerHeight * .12, 104);
    const inset = `inset(0px max(0px, calc(50% - ${Math.round(origin.right - centre)}px)) calc(100% - ${Math.round(origin.height)}px) max(0px, calc(50% - ${Math.round(centre - origin.left)}px)))`;
    const animation = panel.animate([
      { clipPath: inset, translate: `0 ${Math.round(shift)}px`, opacity: .4 },
      { clipPath: "inset(0px)", translate: "0 0", opacity: 1 },
    ], { duration: 220, easing: "cubic-bezier(.2, .7, .2, 1)" });
    const content = panel.querySelectorAll<HTMLElement>("[data-search-reveal]");
    content.forEach((element) => element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 60, easing: "ease-out", fill: "backwards" }));
    animation.finished.then(() => { delete panel.dataset.morph; }, () => { delete panel.dataset.morph; });
    return () => animation.cancel();
  }, [origin]);

  const trimmed = deferred.trim();
  const groups = useMemo<Group[]>(() => {
    const entries = index?.[lang] ?? [];
    if (!trimmed) {
      const queryRows: Row[] = queries.slice(0, 3).map((text) => ({ key: `q${text}`, href: "", title: text, icon: "recent", query: text }));
      const recentRows: Row[] = recent.slice(0, 4).map((page) => ({ key: `r${page.h}`, href: localized(page.h), title: page.t, icon: "recent" }));
      const sectionRows: Row[] = entries.filter((entry) => entry.g === "section").slice(0, SECTION_SUGGESTIONS)
        .map((entry) => ({ key: `s${entry.h}`, href: localized(entry.h), title: entry.t, icon: "section" }));
      return [
        ...(queryRows.length ? [{ id: "queries", label: copy.recentQueries, rows: queryRows }] : []),
        ...(recentRows.length ? [{ id: "recent", label: copy.recent, rows: recentRows }] : []),
        ...(sectionRows.length ? [{ id: "sections", label: copy.sections, rows: sectionRows }] : []),
      ];
    }
    const hits = searchIndex(entries, trimmed, 80);
    // Groups in the order of their best result; a few rows each.
    const byGroup = new Map<string, Row[]>();
    for (const hit of hits) {
      const group = hit.g ?? "section";
      const rows = byGroup.get(group) ?? [];
      if (rows.length >= GROUP_LIMIT) continue;
      rows.push({ key: `h${hit.h}${hit.t}`, href: localized(hit.h), title: hit.t, detail: hit.d, icon: group, image: hit.i });
      byGroup.set(group, rows);
    }
    return [
      ...[...byGroup].map(([group, rows]) => ({ id: group, label: copy.groups[group as SiteSearchGroup] ?? copy.results, rows })),
      { id: "database", label: copy.databaseGroup, rows: [{ key: "db", href: `${prefix}/search?q=${encodeURIComponent(trimmed)}`, title: copy.database(trimmed), icon: "database" as const }] },
    ];
    // `localized` only depends on `prefix`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, lang, trimmed, recent, queries, copy, prefix]);

  const rows = groups.flatMap((group) => group.rows);
  const hitCount = trimmed ? rows.length - 1 : 0;
  const current = rows[Math.min(active, rows.length - 1)];
  const optionId = (row: Row) => `${id}-${row.key}`;
  // A new result list starts at its first row.
  const [listFor, setListFor] = useState(trimmed);
  if (listFor !== trimmed) {
    setListFor(trimmed);
    setActive(0);
  }

  const go = (row: Row | undefined) => {
    if (!row) return;
    if (row.query !== undefined) {
      setQuery(row.query);
      input.current?.focus();
      return;
    }
    if (trimmed && row.icon !== "database") rememberQuery(trimmed);
    onClose();
    router.push(row.href);
  };

  const move = (step: number) => {
    if (!rows.length) return;
    const next = (Math.min(active, rows.length - 1) + step + rows.length) % rows.length;
    setActive(next);
    document.getElementById(optionId(rows[next]))?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      go(current);
    } else if (event.key === "Escape" && query) {
      // The first Esc clears the field, the next one closes.
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    }
  };

  // One stable set of row handlers, so the memoised rows stay still while the field changes.
  const latestGo = useRef(go);
  useLayoutEffect(() => { latestGo.current = go; });
  const events = useMemo<RowEvents>(() => ({
    hover: (index) => setActive(index),
    prefetch: (row) => { if (row.href && row.icon !== "database") router.prefetch(row.href); },
    open: (row, event) => {
      if (row.href && (event.metaKey || event.ctrlKey || event.shiftKey)) { window.open(row.href, "_blank", "noopener"); return; }
      latestGo.current(row);
    },
  }), [router]);

  const status = failed ? copy.failed : index && trimmed && hitCount === 0 ? copy.nothing : null;
  return (
    <AtlasDialog open={open} onClose={onClose} label={copy.dialog} variant="sheet" className={styles.dialog} initialFocusRef={input}>
      <div className={styles.head} ref={body}>
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
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button className={styles.clear} type="button" onClick={() => { setQuery(""); input.current?.focus(); }}>
            <X size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className="sr-only">{copy.clear}</span>
          </button>
        ) : null}
        <button className={styles.close} type="button" onClick={onClose}>
          <span className={styles.closeKey}>Esc</span>
          <ChevronDown className={styles.closeIcon} size={22} strokeWidth={1.8} aria-hidden="true" />
          <span className="sr-only">{copy.close}</span>
        </button>
      </div>
      <div className={styles.list} id={`${id}-list`} role="listbox" aria-label={copy.dialog} data-search-reveal>
        {status ? <p className={styles.status}>{status}</p> : null}
        {rowsReady ? <ResultList groups={groups} id={id} current={current?.key} query={trimmed} events={events} /> : null}
        {!index && !failed ? <div className={styles.skeleton} aria-hidden="true"><i /><i /><i /><i /></div> : null}
      </div>
      <span className="sr-only" aria-live="polite">{trimmed && index ? copy.count(hitCount) : ""}</span>
      <div className={styles.foot} aria-hidden="true" data-search-reveal>
        <span>{trimmed && index ? copy.count(hitCount) : ""}</span>
        <span className={styles.hints}>
          {copy.hints.map(([key, label]) => <span key={key}><kbd>{key}</kbd> {label}</span>)}
        </span>
      </div>
    </AtlasDialog>
  );
}
