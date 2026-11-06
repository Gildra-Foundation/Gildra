"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasSkeleton } from "@gildra/atlas-ui/AtlasState";
import { materialStyles } from "@/components/wow/shared/materialAtlas";
import { AUCTION_COMPARE_LIMIT, auctionRegions, type AuctionMarketItem, type AuctionMarketView, type AuctionRegion } from "@/lib/wow/auctionBrowser";
import { auctionCategories, auctionCategory, auctionCategoryGroups, auctionIconUrl } from "@/lib/wow/auctionMarketCategories";
import { sortSummaries, type AuctionSortKey } from "@/lib/wow/auctionMarketSummary";
import type { CompareSortKey } from "@/lib/wow/auctionMarketCompare";
import { auctionCopy } from "./auctionCopy";
import { AuctionCombobox, type ComboOption } from "./AuctionCombobox";
import { AuctionCompare, AuctionCompareTray } from "./AuctionCompare";
import { auctionErrorMessage } from "./auctionErrors";
import { AuctionItemDetail } from "./AuctionItemDetail";
import { AuctionButton, AuctionPlaque } from "./AuctionMaterial";
import { AuctionMarketTable } from "./AuctionMarketTable";
import { AuctionItemLabel } from "./AuctionMarketParts";
import { AuctionMoney } from "./AuctionMoney";
import { currentItems, nextCompareSort, nextSort, readAuctionView, toggleItem, writeAuctionView, type AuctionView } from "./auctionState";
import { useAuctionData } from "./useAuctionData";
import styles from "./auction.module.css";

type Remembered = { region?: string; realms?: Record<string, string> };
const STORE = "gildra:auction";
function remembered(): Remembered {
  try { return JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Remembered; } catch { return {}; }
}
function remember(region: string, realm: string) {
  try {
    const value = remembered();
    window.localStorage.setItem(STORE, JSON.stringify({ region, realms: { ...value.realms, ...(realm ? { [region]: realm } : {}) } }));
  } catch { /* Private mode: the address still carries the choice. */ }
}
const api = (params: Record<string, string>) => `/api/wow/auction?${new URLSearchParams(params)}`;

function useDebounced<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return settled;
}

export function AuctionBrowser({ lang }: { lang: "ru" | "en" }) {
  const c = auctionCopy[lang], searchParams = useSearchParams();
  const [memory] = useState(remembered);
  const view = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString()), region = params.get("region") ?? memory.region ?? "eu";
    return readAuctionView(params, { region: memory.region, realm: memory.realms?.[region] });
  }, [searchParams, memory]);
  const go = useCallback((patch: Partial<AuctionView>, mode: "push" | "replace" = "push") => {
    const next = { ...view, ...patch };
    const query = writeAuctionView(next).toString().replace(/%2C/g, ","), url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (mode === "push") window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
    if (patch.region !== undefined || patch.realm !== undefined) remember(next.region, next.realm);
  }, [view]);

  const category = auctionCategory(view.category);
  const needsRealm = category?.market === "realm" || view.q !== "" || view.itemMarket === "realm" && view.item !== null;

  /* Realms load only when the realm field is on screen. */
  const realms = useAuctionData<{ realms: { slug: string; name: string }[] }>(needsRealm ? api({ action: "realms", region: view.region, lang }) : null);
  const [realmText, setRealmText] = useState<string | null>(null);
  const realmName = realms.data?.realms.find(realm => realm.slug === view.realm)?.name ?? "";
  const realmOptions = useMemo<ComboOption[]>(() => {
    const list = realms.data?.realms ?? [], text = (realmText ?? "").trim().toLocaleLowerCase(lang);
    const matches = text ? list.filter(realm => realm.name.toLocaleLowerCase(lang).includes(text) || realm.slug.includes(text.replace(/\s+/g, "-"))) : list;
    return matches.slice(0, 60).map(realm => ({ key: realm.slug, label: realm.name }));
  }, [realms.data, realmText, lang]);

  /* Search box: suggestions from the market as you type, Enter shows every match. */
  const [findText, setFindText] = useState<string | null>(null);
  const typed = findText ?? view.q, settled = useDebounced(typed.trim(), 300);
  const suggestUrl = findText !== null && settled.length >= 2 ? api({ action: "market", region: view.region, lang, q: settled, limit: "8", ...(view.realm ? { realm: view.realm } : {}) }) : null;
  const suggestions = useAuctionData<AuctionMarketView>(suggestUrl);
  const suggestOptions = useMemo<ComboOption[]>(() => (suggestions.data?.items ?? []).map(item => ({
    key: `${item.market}:${item.itemId}`, label: item.name ?? String(item.itemId),
    render: <span className={styles.suggestion}><AuctionItemLabel item={item} lang={lang} size={28} /><span className={styles.suggestionEnd}>
      <AuctionMoney value={item.minPrice} lang={lang} />
      {view.compare ? view.items.includes(item.itemId) ? <Check size={16} aria-hidden="true" className={styles.suggestionPicked} /> : <Plus size={16} aria-hidden="true" className={styles.suggestionAdd} /> : null}
    </span></span>,
  })), [suggestions.data, lang, view.compare, view.items]);

  /* The list itself. */
  const listUrl = view.compare ? null : view.q ? api({ action: "market", region: view.region, lang, q: view.q, ...(view.realm ? { realm: view.realm } : {}) })
    : category && (category.market === "commodities" || view.realm) ? api({ action: "market", region: view.region, lang, category: category.key, ...(category.market === "realm" ? { realm: view.realm } : {}) }) : null;
  const list = useAuctionData<AuctionMarketView>(listUrl);
  const deferred = useDeferredValue(list.data);
  // Reagents of one expansion share an item level; gear levels vary, so gear is never split.
  const split = useMemo(() => category?.group === "gear" && !view.q ? { rows: deferred?.items ?? [], split: false } : currentItems(deferred?.items ?? []), [deferred, category, view.q]);
  const showAll = view.all || Boolean(view.q) || !split.split;
  const rows = useMemo(() => {
    const base = showAll ? deferred?.items ?? [] : split.rows;
    if (view.sort) return sortSummaries(base, view.sort, view.dir, lang);
    // Default: newest expansion first, then by name with ranks together.
    return [...base].sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || (a.name ?? "").localeCompare(b.name ?? "", lang) || (a.rank ?? 0) - (b.rank ?? 0) || a.itemId - b.itemId);
  }, [deferred, split, showAll, view.sort, view.dir, lang]);
  const mixed = new Set((deferred?.items ?? []).map(item => item.market)).size > 1;

  /* Items the tray and the detail can name without another request. */
  const [known, setKnown] = useState(() => new Map<number, AuctionMarketItem>());
  const trayMissing = !view.compare && view.items.some(id => !known.has(id) && !deferred?.items.some(item => item.itemId === id));
  const trayData = useAuctionData<AuctionMarketView>(trayMissing ? api({ action: "market", region: view.region, lang, items: view.items.join(","), ...(view.realm ? { realm: view.realm } : {}) }) : null);
  const knownItems = useMemo(() => {
    const map = new Map(known);
    for (const item of [...(trayData.data?.items ?? []), ...(deferred?.items ?? [])]) if (!map.has(item.itemId) || item.market === "commodities") map.set(item.itemId, item);
    return map;
  }, [known, trayData.data, deferred]);

  const add = (item: AuctionMarketItem) => {
    setKnown(previous => new Map(previous).set(item.itemId, item));
    if (view.items.includes(item.itemId) || view.items.length >= AUCTION_COMPARE_LIMIT) return;
    go({ items: [...view.items, item.itemId] }, "replace");
  };
  const toggle = (item: AuctionMarketItem) => {
    setKnown(previous => new Map(previous).set(item.itemId, item));
    const items = toggleItem(view.items, item.itemId);
    go({ items, compare: view.compare && items.length > 0 }, "replace");
  };
  /* The item opens as a history step, so Back closes it; closing it ourselves steps back the same way. */
  const [openedHere, setOpenedHere] = useState(false);
  const open = (item: Pick<AuctionMarketItem, "itemId" | "market">) => { setOpenedHere(true); go({ item: item.itemId, itemMarket: item.market }); };
  const closeItem = () => { if (openedHere) { setOpenedHere(false); window.history.back(); } else go({ item: null }, "replace"); };
  const sortBy = (key: AuctionSortKey | "", dir?: "asc" | "desc") => go(!key ? { sort: "", dir: "asc" } : dir ? { sort: key, dir } : nextSort(view, key), "replace");
  const sortCompareBy = (key: CompareSortKey | "", dir?: "asc" | "desc") => go(!key ? { csort: "", cdir: "asc" } : dir ? { csort: key, cdir: dir } : nextCompareSort(view, key), "replace");
  const removeCompared = (id: number) => { const items = view.items.filter(value => value !== id); go({ items, compare: view.compare && items.length > 0 }, "replace"); };

  /* In the comparison the categories fold away; opening it brings the search box and the table into view. */
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const scrollPending = useRef(false);
  const openCompare = () => { setCategoriesOpen(false); scrollPending.current = true; go({ compare: true }); };
  useEffect(() => {
    if (!view.compare || !scrollPending.current) return;
    scrollPending.current = false;
    const frame = requestAnimationFrame(() => document.getElementById("auction-search")?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [view.compare]);
  const pickCategory = (key: AuctionView["category"]) => { setFindText(null); go({ category: key, q: "", compare: false, sort: "", all: false }); };
  const submitSearch = (text: string) => {
    const q = text.trim();
    if (q.length < 2 && !/^\d$/.test(q)) return;
    setFindText(null); go({ q, category: "", compare: false, sort: "", all: false });
  };

  const title = view.compare ? c.compareTitle : view.q ? `«${view.q}»` : category ? c.categories[category.key] : "";
  const realmMissing = category?.market === "realm" && !view.realm;

  return <div className={styles.browser}>
    <AuctionPlaque as="section" id="auction-search" className={styles.searchPlaque} aria-label={c.find} data-compact={view.compare || undefined}>
      <div className={styles.toolbar} data-realm={needsRealm || undefined}>
        <label className={styles.regionField}>
          <span className={styles.fieldLabel}>{c.region}</span>
          <AtlasSelect value={view.region} onChange={event => { const region = event.target.value as AuctionRegion; setRealmText(null); go({ region, realm: memory.realms?.[region] ?? "", items: [], compare: false, item: null }); }}>
            {auctionRegions.map(region => <option key={region} value={region}>{region.toUpperCase()}</option>)}
          </AtlasSelect>
        </label>
        <AuctionCombobox id="auction-find" className={styles.findField} label={c.find} value={typed} placeholder={view.compare ? c.addItem : c.findPlaceholder}
          icon={<Search size={16} />} busy={suggestions.loading} options={suggestOptions} empty={suggestions.data ? c.noSuggestions : undefined}
          onText={setFindText} onSubmitText={submitSearch}
          onPick={option => {
            const [market, id] = option.key.split(":"), item = suggestions.data?.items.find(row => `${row.market}:${row.itemId}` === option.key);
            if (view.compare && item) { add(item); setFindText(""); return; }
            setFindText(null); open({ itemId: Number(id), market: market === "realm" ? "realm" : "commodities" });
          }} />
        {needsRealm ? <AuctionCombobox id="auction-realm" className={styles.realmField} label={c.realm} value={realmText ?? realmName}
          placeholder={realms.loading ? c.loadingRealms : c.realmPick} disabled={!realms.data}
          options={realmOptions} empty={c.realmEmpty} onText={setRealmText}
          onPick={option => { setRealmText(null); go({ realm: option.key }, "replace"); }} /> : null}
      </div>
      {needsRealm && realms.error ? <div className={styles.error} role="alert"><p>{auctionErrorMessage(realms.error, lang)}</p><AuctionButton onClick={realms.retry}>{c.retry}</AuctionButton></div> : null}
      {view.compare ? <button type="button" className={styles.categoriesToggle} aria-expanded={categoriesOpen} aria-controls="auction-categories" onClick={() => setCategoriesOpen(value => !value)}>
        <span>{c.categoriesLabel}</span><ChevronDown size={16} aria-hidden="true" />
      </button> : null}
      <nav id="auction-categories" className={styles.categories} aria-label={c.categoriesLabel} hidden={view.compare && !categoriesOpen}>
        {auctionCategoryGroups.map(group => <div key={group} className={styles.categoryGroup}>
          <h2 className={styles.groupTitle}>{c.groups[group]}</h2>
          <ul className={styles.categoryList}>{auctionCategories.filter(item => item.group === group).map(item => {
            const active = !view.q && !view.compare && view.category === item.key;
            return <li key={item.key}><button type="button" className={styles.categoryChip} aria-pressed={active} onClick={() => pickCategory(item.key)}>
              <Image src={auctionIconUrl(item.icon)} alt="" width={28} height={28} unoptimized />
              <span>{c.categories[item.key]}</span>
            </button></li>;
          })}</ul>
        </div>)}
      </nav>
    </AuctionPlaque>

    <AuctionPlaque as="section" id="auction-results" className={styles.resultsPlaque} aria-labelledby="auction-results-title">
      <div className={styles.plaqueHead}>
        <h2 id="auction-results-title" className={styles.resultsTitle}>
          <span className={materialStyles.title}>{title}</span>
        </h2>
        {!view.compare && !view.q && split.split ? <AtlasSegmented className={styles.segmented} size="sm" aria-label={c.all} value={view.all ? "all" : "current"}
          onValueChange={value => go({ all: value === "all" }, "replace")} options={[{ value: "current", label: c.current }, { value: "all", label: c.all }]} /> : null}
        {view.compare ? <div className={styles.compareActions}>
          <button type="button" className={styles.trayClear} onClick={() => go({ items: [], compare: false }, "replace")}>{c.clear}</button>
          <AuctionButton onClick={() => go({ compare: false })}>{c.backToList}</AuctionButton>
        </div> : null}
      </div>
      <div className={styles.resultBody} aria-busy={list.loading}>
        {view.compare ? <AuctionCompare ids={view.items} region={view.region} realm={view.realm} lang={lang} known={knownItems} onOpen={open} onRemove={removeCompared}
            quantity={view.qty} onQuantity={qty => go({ qty }, "replace")} sort={view.csort} dir={view.cdir} onSort={sortCompareBy} />
          : realmMissing ? <p className={styles.empty}>{c.realmNeeded}</p>
          : list.error ? <div className={styles.stateBox} role="alert"><p className={styles.stateText}>{auctionErrorMessage(list.error, lang)}</p><AuctionButton onClick={list.retry}>{c.retry}</AuctionButton></div>
          : list.loading && !deferred ? <AtlasSkeleton variant="rows" count={8} label={c.loading} className={styles.skeleton} />
          : deferred ? <div className={styles.listWrap} data-pending={list.loading || undefined}>
            {deferred.stale ? <p className={styles.warning} role="status">{c.stale}</p> : null}
            {deferred.truncated ? <p className={styles.warning} role="status">{c.partial}</p> : null}
            {rows.length ? <AuctionMarketTable items={rows} lang={lang} sort={view.sort} dir={view.dir} onSort={sortBy} selected={view.items} onToggle={toggle} onOpen={open} mixed={mixed} label={title} />
              : <div className={styles.stateBox}><p className={styles.emptyTitle}>{c.emptyMarket}</p>{view.q ? <p className={styles.empty}>{c.emptyMarketHint}</p> : null}</div>}
          </div> : null}
      </div>
    </AuctionPlaque>

    {!view.compare ? <AuctionCompareTray ids={view.items} known={knownItems} lang={lang} onCompare={openCompare}
      onClear={() => go({ items: [], compare: false }, "replace")} onRemove={removeCompared} /> : null}

    {view.item ? <AuctionItemDetail key={`${view.itemMarket}:${view.item}`} itemId={view.item} market={view.itemMarket} region={view.region} realm={view.realm} lang={lang}
      preview={knownItems.get(view.item)} picked={view.items.includes(view.item)} onToggle={toggle} onClose={closeItem} /> : null}
  </div>;
}
