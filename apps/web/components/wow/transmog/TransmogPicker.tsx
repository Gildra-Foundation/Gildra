"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Eye, EyeOff, Shirt, X } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasInput, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import {
  armoredSlots, armorTypes, classArmor, classId, classIds,
  type ArmorType, type TransmogAppearance, type TransmogClass, type TransmogSetDetail, type TransmogSetSummary, type TransmogSlot,
} from "@/lib/wow/transmog/model";
import { groupVariants, playerSet } from "@/lib/wow/transmog/outfit";
import { SlotGlyph } from "./TransmogSlotGlyph";
import { transmogCopy } from "./transmogCopy";
import { TransmogIcon } from "./TransmogIcon";
import styles from "./transmog.module.css";

type Lang = "ru" | "en";
export type Page<T> = { data: T[]; total: number; nextCursor?: string };
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
export function cachedJson<T>(url: string): Promise<T> {
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

/** Default armor filter of a slot: the class's armor, else the armor type of what is worn there. */
export function defaultArmor(slot: TransmogSlot, current?: TransmogAppearance, cls: TransmogClass | "" = ""): ArmorType | "all" {
  if (!armoredSlots.has(slot)) return "all";
  if (cls) return classArmor[cls];
  return current?.armor && current.armor !== "cosmetic" ? current.armor : "all";
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

export function ItemPicker({ lang, slot, cls, current, hidden, onPick, onPreview, onToggleHidden, onRemove }: {
  lang: Lang;
  slot: TransmogSlot;
  cls: TransmogClass | "";
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
  // Start from the class's armor, else the armor type of what is worn: plate looks for a plate outfit.
  const [armor, setArmor] = useState<ArmorType | "all">(defaultArmor(slot, current, cls));
  const armorKey = useRef<string | null>(current || cls ? `${slot}|${cls}` : null);
  useEffect(() => { setQuery(""); }, [slot]);
  // Once per slot and class, as soon as the worn look is known (it may arrive after the share link resolves).
  useEffect(() => {
    const key = `${slot}|${cls}`;
    if (armorKey.current === key) return;
    if (!current && !cls) { setArmor("all"); return; }
    armorKey.current = key;
    setArmor(defaultArmor(slot, current, cls));
  }, [cls, current, slot]);
  const search = usePagedSearch<TransmogAppearance>(appearancesUrl(lang, slot, query, armor));
  const sentinel = useLoadMore(search.more, Boolean(search.cursor));
  const hoverTimer = useRef<number | undefined>(undefined);
  const preview = (item: TransmogAppearance | null, delay: number) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => onPreview(item), delay);
  };
  useEffect(() => () => { window.clearTimeout(hoverTimer.current); onPreview(null); }, [slot]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Mouse hover tries a look on; touch taps only pick. */
  const hover = (event: React.MouseEvent, item: TransmogAppearance) => {
    if (event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType !== "mouse") return;
    preview(item, 140);
  };
  const choose = (item: TransmogAppearance) => { window.clearTimeout(hoverTimer.current); onPick(item); };

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
          <AtlasButton variant="ghost" className={styles.slotAction} icon={hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />} onClick={onToggleHidden} aria-pressed={hidden} aria-keyshortcuts="H" title={`${hidden ? c.show : c.hide} (H)`}>{hidden ? c.show : c.hide}</AtlasButton>
          <AtlasButton variant="ghost" className={styles.slotAction} icon={<X aria-hidden />} onClick={onRemove} disabled={!current}>{c.remove}</AtlasButton>
        </div>
      </div>
      <div className={armoredSlots.has(slot) ? styles.filters : undefined}>
        <label className={styles.searchLabel}>
          <span className={styles.visuallyHidden}>{c.searchItemsIn(c.slots[slot])}</span>
          <AtlasInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.search} maxLength={80} data-transmog-search enterKeyHint="search" aria-keyshortcuts="/" />
          <kbd className={styles.searchKey} aria-hidden="true">/</kbd>
        </label>
        {armoredSlots.has(slot) ? (
          <AtlasSelect value={armor} onChange={(event) => setArmor(event.target.value as ArmorType | "all")} aria-label={c.armorFilter} data-transmog-armor>
            {(["all", ...armorTypes] as const).map((type) => <option key={type} value={type}>{c.armor[type]}</option>)}
          </AtlasSelect>
        ) : null}
      </div>
      <SearchState state={search.state} empty={!search.items.length} lang={lang} />
      {search.state === "error" ? <AtlasButton onClick={search.retry}>{c.retry}</AtlasButton> : null}
      <ul className={styles.results} data-transmog-results data-loading={search.state === "loading" || undefined} onKeyDown={listKeys}
        onMouseLeave={() => preview(null, 160)}>
        {groupVariants(search.items).map((group) => {
          const wornIndex = group.variants.findIndex((entry) => entry.appearanceId === current?.appearanceId);
          const main = group.variants[Math.max(0, wornIndex)];
          return (
            <li key={group.key} className={styles.lookRow} style={qualityStyle(group.quality)}>
              <button type="button" className={styles.result} aria-pressed={wornIndex >= 0}
                onClick={() => choose(main)} onMouseEnter={(event) => hover(event, main)} onFocus={() => preview(main, 60)} onBlur={() => preview(null, 200)}
                data-appearance={main.modifiedAppearanceId}>
                <span className={styles.resultIcon} aria-hidden="true">
                  <TransmogIcon name={group.iconName} size={40} fallback={<SlotGlyph slot={slot} />} />
                </span>
                <span className={styles.resultText}>
                  <span className={styles.resultName}>{group.name}</span>
                  {armor === "all" && main.armor ? <span className={styles.resultMeta}>{c.armor[main.armor]}</span> : null}
                </span>
                {wornIndex >= 0 ? <span className={styles.wornTag}>{c.worn}</span> : null}
              </button>
              {group.variants.length > 1 ? (
                <div className={styles.variants} role="group" aria-label={group.name}>
                  {group.variants.map((item, index) => (
                    <button key={item.appearanceId} type="button" className={styles.variant} aria-pressed={index === wornIndex}
                      aria-label={c.variant(index + 1, group.variants.length)} title={c.variant(index + 1, group.variants.length)}
                      onClick={() => choose(item)} onMouseEnter={(event) => hover(event, item)} onFocus={() => preview(item, 60)} onBlur={() => preview(null, 200)}
                      data-appearance={item.modifiedAppearanceId}>
                      {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
        {search.cursor ? <li ref={sentinel} className={styles.sentinel} aria-hidden="true" /> : null}
      </ul>
      {search.cursor ? <AtlasButton className={styles.more} onClick={search.more} disabled={search.state === "loading"}>{c.more}</AtlasButton> : null}
    </div>
  );
}

export function SetPicker({ lang, cls, wearing, onWear }: { lang: Lang; cls: TransmogClass | ""; wearing: number | null; onWear: (set: TransmogSetSummary) => void }) {
  const c = transmogCopy[lang];
  const [query, setQuery] = useState("");
  const [setClass, setSetClass] = useState(classId(cls));
  // A new class in the toolbar resets the class filter of the sets.
  const [seenClass, setSeenClass] = useState(cls);
  if (seenClass !== cls) { setSeenClass(cls); setSetClass(classId(cls)); }
  const search = usePagedSearch<TransmogSetSummary>(setsUrl(lang, query, setClass));
  const sets = search.items.filter(playerSet);
  const sentinel = useLoadMore(search.more, Boolean(search.cursor));
  return (
    <div className={styles.pickerBody}>
      <div className={styles.filters}>
        <label className={styles.searchLabel}>
          <span className={styles.visuallyHidden}>{c.searchSets}</span>
          <AtlasInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.searchSets} maxLength={80} enterKeyHint="search" />
        </label>
        <label>
          <span className={styles.visuallyHidden}>{c.classFilter}</span>
          <AtlasSelect value={setClass} onChange={(event) => setSetClass(Number(event.target.value))} aria-label={c.classFilter}>
            <option value={0}>{c.allClasses}</option>
            {classIds.map((entry) => <option key={entry.id} value={entry.id}>{c.classes[entry.slug]}</option>)}
          </AtlasSelect>
        </label>
      </div>
      <SearchState state={search.state} empty={!sets.length} lang={lang} />
      {search.state === "error" ? <AtlasButton onClick={search.retry}>{c.retry}</AtlasButton> : null}
      <ul className={styles.results} data-transmog-sets data-loading={search.state === "loading" || undefined} onKeyDown={listKeys}>
        {sets.map((entry) => (
          <li key={entry.id}>
            <button type="button" className={styles.result} aria-pressed={wearing === entry.id} onClick={() => onWear(entry)} data-set={entry.id}
              onMouseEnter={() => prefetchJson(setDetailUrl(lang, entry.id))} onFocus={() => prefetchJson(setDetailUrl(lang, entry.id))}>
              <span className={styles.resultIcon} aria-hidden="true"><TransmogIcon name={entry.iconName} size={40} fallback={<Shirt className={styles.slotGlyph} />} /></span>
              <span className={styles.resultText}>
                <span className={styles.resultName}>{entry.name}</span>
                <span className={styles.resultMeta}>{c.pieces(entry.itemCount)}</span>
              </span>
              {wearing === entry.id ? <span className={styles.wornTag}>{c.worn}</span> : null}
            </button>
          </li>
        ))}
        {search.cursor ? <li ref={sentinel} className={styles.sentinel} aria-hidden="true" /> : null}
      </ul>
      {search.cursor ? <AtlasButton className={styles.more} onClick={search.more} disabled={search.state === "loading"}>{c.more}</AtlasButton> : null}
    </div>
  );
}

/** Only states a player acts on: loading before the first answer, nothing found, an error. */
function SearchState({ state, empty, lang }: { state: "idle" | "loading" | "ready" | "error"; empty: boolean; lang: Lang }) {
  const c = transmogCopy[lang];
  const text = state === "error" ? c.error : !empty ? "" : state === "ready" ? c.nothing : c.loading;
  return <p className={styles.resultCount} aria-live="polite">{text}</p>;
}
