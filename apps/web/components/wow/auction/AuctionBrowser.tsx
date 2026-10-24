"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasField, AtlasInput, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasPanel } from "@gildra/atlas-ui/AtlasPanel";
import { AtlasSkeleton } from "@gildra/atlas-ui/AtlasState";
import { auctionRegions, validAuctionRealm, type AuctionRegion, type AuctionResult } from "@/lib/wow/auctionBrowser";
import { auctionCopy } from "./auctionCopy";
import { AuctionListings } from "./AuctionListings";
import styles from "./auction.module.css";
const emptyFilters = { region: "eu" as AuctionRegion, realm: "", market: "realm", q: "", sort: "price" };
type Filters = typeof emptyFilters;
const message = (code: string, lang: "ru" | "en") => {
  const c = auctionCopy[lang];
  return code === "not_configured" ? c.notConfigured : ["market_busy", "rate_limited"].includes(code) ? c.busy : ["invalid_query", "invalid_realm"].includes(code) ? c.invalid : c.error;
};
function readFilters(params: URLSearchParams): Filters {
  const next = { ...emptyFilters };
  const region = params.get("region"); if (auctionRegions.includes(region as AuctionRegion)) next.region = region as AuctionRegion;
  const realm = params.get("realm") ?? ""; if (realm === "" || validAuctionRealm(realm)) next.realm = realm;
  if (params.get("market") === "commodities") next.market = "commodities";
  if (params.get("sort") === "quantity") next.sort = "quantity";
  next.q = (params.get("q") ?? "").slice(0, 100);
  return next;
}
export function AuctionBrowser({ lang }: { lang: "ru" | "en" }) {
  const c = auctionCopy[lang], searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => readFilters(new URLSearchParams(searchParams.toString()))), [realmFilter, setRealmFilter] = useState("");
  const [realms, setRealms] = useState<{ slug: string; name: string }[]>([]), [realmState, setRealmState] = useState("loading"), [realmAttempt, setRealmAttempt] = useState(0);
  const [data, setData] = useState<AuctionResult | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null), current = useRef(0), resultRef = useRef<HTMLDivElement>(null);
  const autoSearch = useRef(true);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ action: "realms", region: filters.region, lang });
    fetch(`/api/wow/auction?${params}`, { signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (!controller.signal.aborted) { setRealms(body.realms); setRealmState("ready"); }
    }).catch(reason => { if (!controller.signal.aborted) setRealmState(reason instanceof Error ? reason.message : "upstream_unavailable"); });
    return () => controller.abort();
  }, [filters.region, lang, realmAttempt]);
  function change<K extends keyof Filters>(key: K, value: Filters[K]) {
    current.current++; request.current?.abort(); setBusy(false); setData(null); setError(""); autoSearch.current = false;
    setFilters(previous => ({ ...previous, [key]: value, ...(key === "region" ? { realm: "" } : {}) }));
    if (key === "region") { setRealms([]); setRealmState("loading"); setRealmFilter(""); }
  }
  const load = useCallback(async (selected = filters, page = 1, moveFocus = false) => {
    const serial = ++current.current;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setData(null);
    const params = new URLSearchParams({ ...selected, lang, page: String(page) });
    const url = new URL(window.location.href); url.search = params.toString(); window.history.replaceState(window.history.state, "", url);
    try {
      const response = await fetch(`/api/wow/auction?${params}`, { signal: controller.signal });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (current.current === serial) { setData(body); if (moveFocus) requestAnimationFrame(() => resultRef.current?.focus()); }
    } catch (reason) {
      if (current.current === serial && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "upstream_unavailable");
    } finally { if (current.current === serial && !controller.signal.aborted) setBusy(false); }
  }, [filters, lang]);
  useEffect(() => {
    if (autoSearch.current && (filters.realm || filters.market === "commodities")) {
      autoSearch.current = false;
      const page = Math.max(1, Math.min(100000, Number(searchParams.get("page")) || 1));
      void load(filters, page);
    }
  }, [filters, searchParams, load]);
  const submit = (event: FormEvent) => { event.preventDefault(); void load(); };
  const visibleRealms = realms.filter(r => r.slug === filters.realm || `${r.name} ${r.slug}`.toLocaleLowerCase(lang).includes(realmFilter.toLocaleLowerCase(lang)));
  return <div className={styles.browser}>
    <AtlasPanel>
      <form className={styles.filters} onSubmit={submit}>
        <AtlasField htmlFor="auction-region" label={c.region}><AtlasSelect id="auction-region" value={filters.region} onChange={e => change("region", e.target.value as AuctionRegion)}>{auctionRegions.map(region => <option key={region} value={region}>{region.toUpperCase()}</option>)}</AtlasSelect></AtlasField>
        <AtlasField htmlFor="auction-market" label={c.market}><AtlasSelect id="auction-market" value={filters.market} onChange={e => change("market", e.target.value)}><option value="realm">{c.realmMarket}</option><option value="commodities">{c.commodities}</option></AtlasSelect></AtlasField>
        {filters.market === "realm" ? <>
          <AtlasField htmlFor="auction-realm-filter" label={c.realmSearch}><AtlasInput id="auction-realm-filter" value={realmFilter} onChange={e => setRealmFilter(e.target.value)} type="search" /></AtlasField>
          <AtlasField htmlFor="auction-realm" label={c.realm}><AtlasSelect id="auction-realm" required value={filters.realm} disabled={realmState !== "ready"} onChange={e => change("realm", e.target.value)}><option value="">{realmState === "loading" ? c.loadingRealms : c.realmPlaceholder}</option>{visibleRealms.map(realm => <option key={realm.slug} value={realm.slug}>{realm.name}</option>)}</AtlasSelect></AtlasField>
        </> : null}
        <AtlasField htmlFor="auction-item" label={c.search} className={styles.search}><AtlasInput id="auction-item" value={filters.q} type="search" maxLength={100} placeholder={c.placeholder} onChange={e => change("q", e.target.value)} /></AtlasField>
        <AtlasField htmlFor="auction-sort" label={c.sort}><AtlasSelect id="auction-sort" value={filters.sort} onChange={e => change("sort", e.target.value)}><option value="price">{c.price}</option><option value="quantity">{c.quantitySort}</option></AtlasSelect></AtlasField>
        <AtlasButton type="submit" variant="primary" disabled={busy || (filters.market === "realm" && !filters.realm)}>{busy ? c.loading : c.submit}</AtlasButton>
      </form>
      {filters.market === "realm" && !["ready", "loading"].includes(realmState) ? <div className={styles.error} role="alert"><p>{message(realmState, lang)}</p><AtlasButton onClick={() => { setRealmState("loading"); setRealmAttempt(n => n + 1); }}>{c.retry}</AtlasButton></div> : null}
      <p className={styles.hint}>{c.regionNote}</p>
    </AtlasPanel>
    <div ref={resultRef} tabIndex={-1} className={styles.resultFocus} aria-busy={busy}>
      {busy ? <><p role="status">{c.loading}</p><AtlasSkeleton variant="rows" count={6} label={c.loading} /></> : error ? <AtlasPanel><div role="alert"><h2>{c.title}</h2><p>{message(error, lang)}</p></div><AtlasButton onClick={() => void load()}>{c.retry}</AtlasButton></AtlasPanel>
        : data ? <AtlasPanel padding="none"><AuctionListings data={data} lang={lang} onPage={page => void load(filters, page, true)} /></AtlasPanel>
          : <AtlasPanel><h2>{c.ready}</h2><p>{c.start}</p></AtlasPanel>}
    </div>
    <p className={styles.hint}>{c.note} <a href="https://develop.battle.net/documentation/world-of-warcraft/game-data-apis" target="_blank" rel="noreferrer">{c.source}</a></p>
  </div>;
}
