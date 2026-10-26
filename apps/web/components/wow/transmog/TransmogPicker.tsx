"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasInput, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import {
  armoredSlots, armorTypes, classIds,
  type ArmorType, type TransmogAppearance, type TransmogSetSummary, type TransmogSlot,
} from "@/lib/wow/transmog/model";
import { transmogCopy } from "./transmogCopy";
import { TransmogIcon } from "./TransmogIcon";
import styles from "./transmog.module.css";

type Lang = "ru" | "en";
const apiLocale = (lang: Lang) => (lang === "ru" ? "ru_RU" : "en_US");

export function qualityStyle(quality: number) {
  const palette = itemQualityColors[quality as keyof typeof itemQualityColors];
  return palette ? { "--transmog-quality": palette.frame, "--transmog-quality-text": palette.text } as CSSProperties : undefined;
}

/** Debounced search with cursor paging; the previous request is aborted. */
function usePagedSearch<T>(url: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const controller = useRef<AbortController | null>(null);

  const load = async (target: string, append: boolean) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState("loading");
    try {
      const response = await fetch(target, { signal: abort.signal });
      if (!response.ok) throw new Error(String(response.status));
      const page = await response.json() as { data: T[]; total: number; nextCursor?: string };
      setItems((previous) => (append ? [...previous, ...page.data] : page.data));
      setTotal(page.total);
      setCursor(page.nextCursor);
      setState("ready");
    } catch (error) {
      if (!abort.signal.aborted) setState("error");
      void error;
    }
  };

  useEffect(() => {
    if (!url) return;
    const timer = window.setTimeout(() => void load(url, false), 220);
    return () => window.clearTimeout(timer);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => { if (url && cursor) void load(`${url}&cursor=${encodeURIComponent(cursor)}`, true); };
  const retry = () => { if (url) void load(url, false); };
  return { items, total, cursor, state, more, retry };
}

export function ItemPicker({ lang, slot, current, hidden, onPick, onToggleHidden, onRemove }: {
  lang: Lang;
  slot: TransmogSlot;
  current?: TransmogAppearance;
  hidden: boolean;
  onPick: (appearance: TransmogAppearance) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
}) {
  const c = transmogCopy[lang];
  const [query, setQuery] = useState("");
  // Start from the armor type of what is worn: plate looks for a plate outfit.
  const [armor, setArmor] = useState<ArmorType | "all">(current?.armor && current.armor !== "cosmetic" ? current.armor : "all");
  const currentArmor = current?.armor;
  const armorSlot = useRef<TransmogSlot | null>(currentArmor ? slot : null);
  useEffect(() => { setQuery(""); }, [slot]);
  // Once per slot, as soon as the worn look is known (it may arrive after the share link resolves).
  useEffect(() => {
    if (armorSlot.current === slot) return;
    if (!currentArmor && !current) { setArmor("all"); return; }
    armorSlot.current = slot;
    setArmor(currentArmor && currentArmor !== "cosmetic" ? currentArmor : "all");
  }, [current, currentArmor, slot]);
  const filterArmor = armoredSlots.has(slot) && armor !== "all";
  const url = `/api/wow/transmog/appearances?slot=${slot}&locale=${apiLocale(lang)}&limit=40${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}${filterArmor ? `&armor=${armor}` : ""}`;
  const search = usePagedSearch<TransmogAppearance>(url);

  return (
    <div className={styles.pickerBody}>
      <div className={styles.slotHeader}>
        <span className={styles.slotHeaderIcon} style={current ? qualityStyle(current.quality) : undefined} aria-hidden="true">
          {current?.iconName ? <TransmogIcon name={current.iconName} size={44} /> : null}
        </span>
        <div>
          <h3 className={styles.slotTitle}>{c.slots[slot]}</h3>
          <p className={styles.slotNow}>{c.current}: {current ? current.name : c.empty}{hidden ? ` · ${c.hiddenTag}` : ""}</p>
        </div>
      </div>
      <div className={styles.slotActions}>
        <AtlasButton size="sm" variant="ghost" onClick={onToggleHidden} aria-pressed={hidden}>{hidden ? c.show : c.hide}</AtlasButton>
        <AtlasButton size="sm" variant="ghost" onClick={onRemove} disabled={!current}>{c.remove}</AtlasButton>
      </div>
      <label className={styles.searchLabel}>
        <span className={styles.visuallyHidden}>{c.searchItems}</span>
        <AtlasInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.searchItems} maxLength={80} data-transmog-search />
      </label>
      {armoredSlots.has(slot) ? (
        <div className={styles.chips} role="group" aria-label={c.search}>
          {(["all", ...armorTypes] as const).map((type) => (
            <button key={type} type="button" className={styles.chip} aria-pressed={armor === type} onClick={() => setArmor(type)}>{c.armor[type]}</button>
          ))}
        </div>
      ) : null}
      <p className={styles.resultCount} aria-live="polite">{search.state === "error" ? c.error : search.state === "ready" ? (search.total ? c.results(search.total) : c.nothing) : c.loading}</p>
      {search.state === "error" ? <AtlasButton size="sm" onClick={search.retry}>{c.retry}</AtlasButton> : null}
      <ul className={styles.results} data-transmog-results>
        {search.items.map((item) => {
          const worn = current?.appearanceId === item.appearanceId;
          return (
            <li key={item.appearanceId}>
              <button type="button" className={styles.result} style={qualityStyle(item.quality)} aria-pressed={worn} onClick={() => onPick(item)} data-appearance={item.modifiedAppearanceId}>
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
      </ul>
      {search.cursor ? <AtlasButton size="sm" onClick={search.more} disabled={search.state === "loading"}>{c.more}</AtlasButton> : null}
    </div>
  );
}

export function SetPicker({ lang, wearing, onWear }: { lang: Lang; wearing: number | null; onWear: (set: TransmogSetSummary) => void }) {
  const c = transmogCopy[lang];
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState(0);
  const url = `/api/wow/transmog/sets?locale=${apiLocale(lang)}&limit=30${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}${classId ? `&class=${classId}` : ""}`;
  const search = usePagedSearch<TransmogSetSummary>(url);
  return (
    <div className={styles.pickerBody}>
      <p className={styles.hint}>{c.wearHint}</p>
      <div className={styles.setFilters}>
        <label className={styles.searchLabel}>
          <span className={styles.visuallyHidden}>{c.searchSets}</span>
          <AtlasInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.searchSets} maxLength={80} />
        </label>
        <label>
          <span className={styles.visuallyHidden}>{c.classFilter}</span>
          <AtlasSelect value={classId} onChange={(event) => setClassId(Number(event.target.value))} aria-label={c.classFilter}>
            <option value={0}>{c.allClasses}</option>
            {classIds.map((entry) => <option key={entry.id} value={entry.id}>{c.classes[entry.slug]}</option>)}
          </AtlasSelect>
        </label>
      </div>
      <p className={styles.resultCount} aria-live="polite">{search.state === "error" ? c.error : search.state === "ready" ? (search.total ? c.setResults(search.total) : c.nothing) : c.loading}</p>
      {search.state === "error" ? <AtlasButton size="sm" onClick={search.retry}>{c.retry}</AtlasButton> : null}
      <ul className={styles.results} data-transmog-sets>
        {search.items.map((entry) => (
          <li key={entry.id}>
            <button type="button" className={styles.result} aria-pressed={wearing === entry.id} onClick={() => onWear(entry)} data-set={entry.id}>
              <span className={styles.resultIcon} aria-hidden="true">{entry.iconName ? <TransmogIcon name={entry.iconName} size={40} /> : null}</span>
              <span className={styles.resultText}>
                <span className={styles.resultName}>{entry.name}</span>
                <span className={styles.resultMeta}>{c.pieces(entry.itemCount)}</span>
              </span>
              <span className={styles.wornTag}>{wearing === entry.id ? c.worn : c.wear}</span>
            </button>
          </li>
        ))}
      </ul>
      {search.cursor ? <AtlasButton size="sm" onClick={search.more} disabled={search.state === "loading"}>{c.more}</AtlasButton> : null}
    </div>
  );
}
