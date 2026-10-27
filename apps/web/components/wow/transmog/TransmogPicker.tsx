"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasInput, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import {
  armoredSlots, armorTypes, classIds,
  type ArmorType, type TransmogAppearance, type TransmogSetDetail, type TransmogSetSummary, type TransmogSlot,
} from "@/lib/wow/transmog/model";
import { transmogCopy } from "./transmogCopy";
import { TransmogIcon } from "./TransmogIcon";
import styles from "./transmog.module.css";

type Lang = "ru" | "en";
type Page<T> = { data: T[]; total: number; nextCursor?: string };
export const apiLocale = (lang: Lang) => (lang === "ru" ? "ru_RU" : "en_US");

export function qualityStyle(quality: number) {
  const palette = itemQualityColors[quality as keyof typeof itemQualityColors];
  return palette ? { "--transmog-quality": palette.frame, "--transmog-quality-text": palette.text } as CSSProperties : undefined;
}

/**
 * Answers of the transmog API for this visit, keyed by URL. Pages and sets are
 * immutable within a catalog build, so a slot or a query seen once opens at once.
 */
const answers = new Map<string, Promise<unknown>>();
function cachedJson<T>(url: string): Promise<T> {
  let entry = answers.get(url) as Promise<T> | undefined;
  if (!entry) {
    entry = fetch(url).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<T>;
    });
    entry.catch(() => answers.delete(url));
    answers.set(url, entry);
  }
  return entry;
}
const settled = new Set<string>();

/** Default armor filter of a slot: the armor type of what is worn there. */
export function defaultArmor(slot: TransmogSlot, current?: TransmogAppearance): ArmorType | "all" {
  return armoredSlots.has(slot) && current?.armor && current.armor !== "cosmetic" ? current.armor : "all";
}

export function appearancesUrl(lang: Lang, slot: TransmogSlot, query: string, armor: ArmorType | "all") {
  const filter = armoredSlots.has(slot) && armor !== "all";
  return `/api/wow/transmog/appearances?slot=${slot}&locale=${apiLocale(lang)}&limit=40${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}${filter ? `&armor=${armor}` : ""}`;
}
export function setsUrl(lang: Lang, query: string, classId: number) {
  return `/api/wow/transmog/sets?locale=${apiLocale(lang)}&limit=30${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}${classId ? `&class=${classId}` : ""}`;
}
export const setDetailUrl = (lang: Lang, id: number) => `/api/wow/transmog/sets/${id}?locale=${apiLocale(lang)}`;

/** Warms the cache in the background (first page of every slot, set details on hover). */
export function prefetchJson(url: string) {
  void cachedJson(url).then(() => settled.add(url), () => undefined);
}
export const loadSetDetail = (lang: Lang, id: number) => cachedJson<TransmogSetDetail>(setDetailUrl(lang, id));

/** Debounced search with cursor paging; cached answers show without waiting. */
function usePagedSearch<T>(url: string) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const latest = useRef("");

  const load = async (target: string, append: boolean) => {
    latest.current = target;
    setState("loading");
    try {
      const page = await cachedJson<Page<T>>(target);
      settled.add(target);
      if (latest.current !== target) return;
      setItems((previous) => (append ? [...previous, ...page.data] : page.data));
      setTotal(page.total);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      if (latest.current === target) setState("error");
    }
  };

  useEffect(() => {
    if (settled.has(url)) { void load(url, false); return; }
    const timer = window.setTimeout(() => void load(url, false), 120);
    return () => window.clearTimeout(timer);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => { if (cursor && state !== "loading") void load(`${url}&cursor=${encodeURIComponent(cursor)}`, true); };
  const retry = () => void load(url, false);
  return { items, total, cursor, state, more, retry };
}

/** Loads the next page when the end of the list scrolls into view. */
function useLoadMore(more: () => void, active: boolean) {
  const sentinel = useRef<HTMLLIElement>(null);
  const moreRef = useRef(more);
  useEffect(() => { moreRef.current = more; });
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !active) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) moreRef.current(); }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);
  return sentinel;
}

/** ↑/↓/Home/End move between the buttons of a result list. */
function listKeys(event: KeyboardEvent<HTMLUListElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
  buttons[next]?.focus();
}

export function ItemPicker({ lang, slot, current, hidden, onPick, onPreview, onToggleHidden, onRemove }: {
  lang: Lang;
  slot: TransmogSlot;
  current?: TransmogAppearance;
  hidden: boolean;
  onPick: (appearance: TransmogAppearance) => void;
  /** Try a look on the mannequin without wearing it; null ends the preview. */
  onPreview: (appearance: TransmogAppearance | null) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
}) {
  const c = transmogCopy[lang];
  const [query, setQuery] = useState("");
  // Start from the armor type of what is worn: plate looks for a plate outfit.
  const [armor, setArmor] = useState<ArmorType | "all">(defaultArmor(slot, current));
  const armorSlot = useRef<TransmogSlot | null>(current ? slot : null);
  const currentArmor = current?.armor;
  useEffect(() => { setQuery(""); }, [slot]);
  // Once per slot, as soon as the worn look is known (it may arrive after the share link resolves).
  useEffect(() => {
    if (armorSlot.current === slot) return;
    if (!current) { setArmor("all"); return; }
    armorSlot.current = slot;
    setArmor(defaultArmor(slot, current));
  }, [current, currentArmor, slot]);
  const search = usePagedSearch<TransmogAppearance>(appearancesUrl(lang, slot, query, armor));
  const sentinel = useLoadMore(search.more, Boolean(search.cursor));
  const hoverTimer = useRef<number | undefined>(undefined);
  const preview = (item: TransmogAppearance | null, delay: number) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => onPreview(item), delay);
  };
  useEffect(() => () => { window.clearTimeout(hoverTimer.current); onPreview(null); }, [slot]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.pickerBody}>
      <div className={styles.slotHeader}>
        <span className={styles.slotHeaderIcon} style={current ? qualityStyle(current.quality) : undefined} aria-hidden="true">
          {current?.iconName ? <TransmogIcon name={current.iconName} size={44} eager /> : null}
        </span>
        <div className={styles.slotHeaderText}>
          <h3 className={styles.slotTitle}>{c.slots[slot]}</h3>
          <p className={styles.slotNow}>{current ? current.name : c.empty}{hidden ? ` · ${c.hiddenTag}` : ""}</p>
        </div>
        <div className={styles.slotActions}>
          <AtlasButton size="sm" variant="ghost" onClick={onToggleHidden} aria-pressed={hidden} title={`${hidden ? c.show : c.hide} (H)`}>{hidden ? c.show : c.hide}</AtlasButton>
          <AtlasButton size="sm" variant="ghost" onClick={onRemove} disabled={!current}>{c.remove}</AtlasButton>
        </div>
      </div>
      <label className={styles.searchLabel}>
        <span className={styles.visuallyHidden}>{c.searchItems}</span>
        <AtlasInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.searchItemsIn(c.slots[slot])} maxLength={80} data-transmog-search enterKeyHint="search" />
        <kbd className={styles.searchKey} aria-hidden="true">/</kbd>
      </label>
      {armoredSlots.has(slot) ? (
        <div className={styles.chips} role="group" aria-label={c.armorFilter}>
          {(["all", ...armorTypes] as const).map((type) => (
            <button key={type} type="button" className={styles.chip} aria-pressed={armor === type} onClick={() => setArmor(type)}>{c.armor[type]}</button>
          ))}
        </div>
      ) : null}
      <p className={styles.resultCount} aria-live="polite">
        {search.state === "error" ? c.error : search.state === "ready" ? (search.total ? c.results(search.total) : c.nothing) : c.loading}
        {search.state === "ready" && search.total ? <span className={styles.resultTip}>{c.hoverTip}</span> : null}
      </p>
      {search.state === "error" ? <AtlasButton size="sm" onClick={search.retry}>{c.retry}</AtlasButton> : null}
      <ul className={styles.results} data-transmog-results data-loading={search.state === "loading" || undefined} onKeyDown={listKeys}
        onMouseLeave={() => preview(null, 160)}>
        {search.items.map((item) => {
          const worn = current?.appearanceId === item.appearanceId;
          return (
            <li key={item.appearanceId}>
              <button type="button" className={styles.result} style={qualityStyle(item.quality)} aria-pressed={worn}
                onClick={() => { window.clearTimeout(hoverTimer.current); onPick(item); }}
                onMouseEnter={(event) => { if (event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType !== "mouse") return; preview(item, 140); }}
                onFocus={() => preview(item, 60)} onBlur={() => preview(null, 200)}
                data-appearance={item.modifiedAppearanceId}>
                <span className={styles.resultIcon} aria-hidden="true">{item.iconName ? <TransmogIcon name={item.iconName} size={40} /> : null}</span>
                <span className={styles.resultText}>
                  <span className={styles.resultName}>{item.name}</span>
                  <span className={styles.resultMeta}>{[item.armor ? c.armor[item.armor] : null, item.itemCount > 1 ? c.shared(item.itemCount) : null].filter(Boolean).join(" · ") || c.qualities[item.quality]}</span>
                </span>
                {worn ? <span className={styles.wornTag}>{c.worn}</span> : null}
              </button>
            </li>
          );
        })}
        {search.cursor ? <li ref={sentinel} className={styles.sentinel} aria-hidden="true" /> : null}
      </ul>
      {search.cursor ? <AtlasButton size="sm" variant="ghost" onClick={search.more} disabled={search.state === "loading"}>{c.more}</AtlasButton> : null}
    </div>
  );
}

export function SetPicker({ lang, wearing, onWear }: { lang: Lang; wearing: number | null; onWear: (set: TransmogSetSummary) => void }) {
  const c = transmogCopy[lang];
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState(0);
  const search = usePagedSearch<TransmogSetSummary>(setsUrl(lang, query, classId));
  const sentinel = useLoadMore(search.more, Boolean(search.cursor));
  return (
    <div className={styles.pickerBody}>
      <div className={styles.setFilters}>
        <label className={styles.searchLabel}>
          <span className={styles.visuallyHidden}>{c.searchSets}</span>
          <AtlasInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.searchSets} maxLength={80} enterKeyHint="search" />
        </label>
        <label>
          <span className={styles.visuallyHidden}>{c.classFilter}</span>
          <AtlasSelect value={classId} onChange={(event) => setClassId(Number(event.target.value))} aria-label={c.classFilter}>
            <option value={0}>{c.allClasses}</option>
            {classIds.map((entry) => <option key={entry.id} value={entry.id}>{c.classes[entry.slug]}</option>)}
          </AtlasSelect>
        </label>
      </div>
      <p className={styles.resultCount} aria-live="polite">
        {search.state === "error" ? c.error : search.state === "ready" ? (search.total ? c.setResults(search.total) : c.nothing) : c.loading}
        <span className={styles.resultTip}>{c.wearHint}</span>
      </p>
      {search.state === "error" ? <AtlasButton size="sm" onClick={search.retry}>{c.retry}</AtlasButton> : null}
      <ul className={styles.results} data-transmog-sets data-loading={search.state === "loading" || undefined} onKeyDown={listKeys}>
        {search.items.map((entry) => (
          <li key={entry.id}>
            <button type="button" className={styles.result} aria-pressed={wearing === entry.id} onClick={() => onWear(entry)} data-set={entry.id}
              onMouseEnter={() => prefetchJson(setDetailUrl(lang, entry.id))} onFocus={() => prefetchJson(setDetailUrl(lang, entry.id))}>
              <span className={styles.resultIcon} aria-hidden="true">{entry.iconName ? <TransmogIcon name={entry.iconName} size={40} /> : null}</span>
              <span className={styles.resultText}>
                <span className={styles.resultName}>{entry.name}</span>
                <span className={styles.resultMeta}>{c.pieces(entry.itemCount)}</span>
              </span>
              <span className={styles.wornTag}>{wearing === entry.id ? c.worn : c.wear}</span>
            </button>
          </li>
        ))}
        {search.cursor ? <li ref={sentinel} className={styles.sentinel} aria-hidden="true" /> : null}
      </ul>
      {search.cursor ? <AtlasButton size="sm" variant="ghost" onClick={search.more} disabled={search.state === "loading"}>{c.more}</AtlasButton> : null}
    </div>
  );
}
