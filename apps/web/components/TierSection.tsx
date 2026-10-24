"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, RotateCcw } from "lucide-react";
import { SpecSlot } from "./SpecSlot";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { p, type Lang } from "@/lib/i18n-paths";
import type { GameIntelligence, TierEntry, TierActivity, TierContext, TierRole, TierSnapshot } from "@/lib/platform/games/intelligence";
import { normalizeTierSnapshot, currentWowSeason } from "@/lib/platform/games/tierSnapshot";
import { tierCopy } from "@/components/blocks/wow/tierWorkspace/tierCopy";
import styles from "@/components/blocks/wow/tierWorkspace/tierWorkspace.module.css";

function entryTheme(e: TierEntry) { return getTalentSpecTheme(`${e.specSlug}-${e.classSlug}`) ?? getTalentSpecTheme(e.specSlug); }
const roles: TierRole[] = ["dps", "healer", "tank"];
const activities: TierActivity[] = ["mythic_plus", "raid"];
const contextKey = (c: TierContext) => `${c.selectionType}:${c.selectionId}:${c.addonKey}`;
type Filters = { activity: TierActivity; role: TierRole; cls: string; q: string; context: string; keyType: string; difficulty: string };
const defaults: Filters = { activity: "mythic_plus", role: "dps", cls: "all", q: "", context: "all", keyType: "all", difficulty: "raid_hero" };
function readFilters(): Filters {
  const query = new URLSearchParams(window.location.search);
  return { activity: query.get("activity") === "raid" ? "raid" : "mythic_plus",
    role: roles.includes(query.get("role") as TierRole) ? query.get("role") as TierRole : "dps",
    cls: query.get("class") ?? "all", q: (query.get("q") ?? "").slice(0, 100), context: query.get("context") ?? "all",
    keyType: ["all", "high", "middle", "low"].includes(query.get("key") ?? "") ? query.get("key")! : "all",
    difficulty: ["raid_hero", "raid_normal", "raid_myth"].includes(query.get("difficulty") ?? "") ? query.get("difficulty")! : "raid_hero" };
}

export function TierSection({ lang, intelligence }: { lang: Lang; intelligence: GameIntelligence }) {
  const copy = tierCopy[lang];
  const ru = lang === "ru";
  const [filters, setFilters] = useState<Filters>(defaults);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState<{ key: string; snapshot: TierSnapshot } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState("");
  const cached = useRef(new Map<string, TierSnapshot>());
  const { activity, role, cls, q, keyType, difficulty } = filters;
  const contexts = useMemo(() => (intelligence.tierContexts ?? []).filter(c => c.activity === activity && c.seasonId === currentWowSeason && (!c.role || c.role === role)), [intelligence.tierContexts, activity, role]);
  const options = [...new Map(contexts.filter(c => c.selectionType !== "all").map(c => [contextKey(c), c])).values()];
  const selectedContext = contexts.find(c => contextKey(c) === filters.context);
  const base = !selectedContext && filters.context === "all" && keyType === "all";
  const queryContext = selectedContext ?? contexts.find(c => c.selectionType === "all");
  const query = new URLSearchParams({ activity, role, limit: "40" });
  if (!base && queryContext) {
    query.set("selectionType", queryContext.selectionType); query.set("selectionId", queryContext.selectionId); query.set("addon", queryContext.addonKey);
    if (activity === "mythic_plus") query.set("keyType", keyType);
    else query.set("difficulty", difficulty);
  }
  const requestKey = query.toString();
  const initial = intelligence.tierLists?.[activity]?.snapshots?.[role];
  const snapshot = remote?.key === requestKey ? remote.snapshot : base ? initial : undefined;

  useEffect(() => {
    const restore = () => { setFilters(readFilters()); setSelection(""); };
    restore(); setReady(true);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function update(patch: Partial<Filters>, replace = false) {
    const next = { ...filters, ...patch };
    setFilters(next); setSelection("");
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      const param = key === "cls" ? "class" : key === "keyType" ? "key" : key;
      if (value === defaults[key as keyof Filters]) url.searchParams.delete(param); else url.searchParams.set(param, value);
    }
    window.history[replace ? "replaceState" : "pushState"](window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  useEffect(() => {
    if (!ready) return;
    setError("");
    if (!base && !queryContext) { setLoading(false); setError(copy.unavailableView); return; }
    if (base && initial && retry === 0) { setLoading(false); return; }
    const controller = new AbortController();
    const previous = cached.current.get(requestKey);
    if (previous) setRemote({ key: requestKey, snapshot: previous });
    setLoading(true);
    void fetch(`/v1/meta/wow/tier-list?${requestKey}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const value = normalizeTierSnapshot(await response.json(), activity, role);
      if (!value) throw new Error("unverified");
      if (controller.signal.aborted) return;
      cached.current.set(requestKey, value); setRemote({ key: requestKey, snapshot: value });
    }).catch(() => {
      if (!controller.signal.aborted) setError(copy.refreshFailed);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ready, requestKey, activity, role, base, queryContext, initial, retry, copy]);

  const entries = snapshot?.entries ?? [];
  const className = (e: TierEntry) => ru ? entryTheme(e)?.classNameRu ?? e.className : e.className;
  const specName = (e: TierEntry) => ru ? entryTheme(e)?.specNameRu ?? e.specName : e.specName;
  const classes = [...new Map(entries.map(e => [e.classSlug, className(e)])).entries()];
  const visible = entries.filter(e => (cls === "all" || e.classSlug === cls) && `${e.specName} ${e.className} ${specName(e)} ${className(e)}`.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()));
  const selected = visible.find(e => `${e.classSlug}:${e.specSlug}` === selection) ?? visible[0];
  const hasScore = entries.some(e => e.score !== undefined);
  const hasKey = activity === "mythic_plus" && entries.some(e => e.maxKey !== undefined);
  const fmt = (value?: number) => value === undefined ? "—" : new Intl.NumberFormat(copy.numberLocale, { maximumFractionDigits: 1 }).format(value);
  const specSlug = selected ? [selected.specSlug, `${selected.specSlug}-${selected.classSlug}`].find(slug => getTalentSpecTheme(slug)) : undefined;
  const availableKeys = [...new Set(contexts.filter(c => contextKey(c) === contextKey(queryContext ?? { selectionType: "all", selectionId: "all", addonKey: "midnight" } as TierContext)).map(c => c.keyType).filter(Boolean))];
  const availableDifficulties = [...new Set(contexts.filter(c => selectedContext && contextKey(c) === contextKey(selectedContext)).map(c => c.difficulty).filter(Boolean))];

  return <div className={styles.workspace}>
    <section className={styles.main} aria-labelledby="tier-results-title">
      <div className={styles.resultsHead}><h2 id="tier-results-title" className={styles.resultsTitle}>{activity === "mythic_plus" ? copy.resultsMythic : copy.resultsRaid}</h2></div>
      <div className={styles.segmented} role="group" aria-label={copy.mode}>{activities.map(value => <button key={value} type="button" className={styles.segment} aria-pressed={activity === value} onClick={() => update({ activity: value, context: "all", keyType: "all", cls: "all" })}>{copy.modes[value]}</button>)}</div>
      <div className={styles.roleTabs} role="group" aria-label={copy.role}>{roles.map(value => <button key={value} type="button" className={styles.roleTab} aria-pressed={role === value} onClick={() => update({ role: value, cls: "all", context: "all", keyType: "all" })}>{copy.roles[value]}</button>)}</div>
      <div className={styles.filters}>
        <label className={styles.searchShell}><Search aria-hidden="true" /><span className={styles.srOnly}>{copy.search}</span><input type="search" className={styles.search} placeholder={copy.searchPlaceholder} value={q} onChange={e => update({ q: e.target.value }, true)} /></label>
        <label className={styles.field}><span className={styles.label}>{copy.classFilter}</span><select className={styles.select} value={cls} onChange={e => update({ cls: e.target.value })}><option value="all">{copy.allClasses}</option>{classes.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label>
        {options.length > 0 && <label className={styles.field}><span className={styles.label}>{copy.content}</span><select className={styles.select} value={filters.context} onChange={e => update({ context: e.target.value, keyType: "all" })}><option value="all">{activity === "mythic_plus" ? copy.allDungeons : copy.allRaids}</option>{options.map(c => <option key={contextKey(c)} value={contextKey(c)}>{c.selectionName}</option>)}</select></label>}
        {availableKeys.length > 1 && <label className={styles.field}><span className={styles.label}>{copy.keyRange}</span><select className={styles.select} value={keyType} onChange={e => update({ keyType: e.target.value })}>{availableKeys.map(key => <option key={key} value={key}>{copy.keys[key as keyof typeof copy.keys]}</option>)}</select></label>}
        {availableDifficulties.length > 0 && <label className={styles.field}><span className={styles.label}>{copy.difficulty}</span><select className={styles.select} value={difficulty} onChange={e => update({ difficulty: e.target.value })}>{availableDifficulties.map(value => <option key={value} value={value}>{copy.difficulties[value!]}</option>)}</select></label>}
        <button type="button" className={styles.action} onClick={() => update(defaults)}><RotateCcw aria-hidden="true" />{copy.resetFilters}</button>
      </div>
      {error && <p className={styles.alert} role="alert">{error}</p>}
      {snapshot && <p className={styles.resultsMeta}>{snapshot.seasonId === currentWowSeason ? (copy.currentSeason) : (copy.unconfirmedSeason)}{snapshot.status === "stale" ? (copy.updateNeeded) : ""}{snapshot.updatedAt && Number.isFinite(Date.parse(snapshot.updatedAt)) && <> · <time dateTime={snapshot.updatedAt}>{new Date(snapshot.updatedAt).toLocaleString(copy.dateLocale, {timeZone:"UTC"})} UTC</time></>}</p>}
      <div className={styles.tableBox} aria-busy={loading} data-scrollbox>
        {visible.length > 0 ? <table className={styles.table}>
          <caption className={styles.srOnly}>{copy.tableCaption(copy.modes[activity], copy.roles[role])}</caption>
          <thead><tr><th scope="col">{copy.tier}</th><th scope="col">{copy.spec}</th>{hasScore && <th scope="col" className={styles.num}>{copy.score}</th>}{hasKey && <th scope="col" className={styles.num}>{copy.maxKey}</th>}</tr></thead>
          <tbody>{visible.map(entry => <tr key={`${entry.classSlug}:${entry.specSlug}`} className={selected === entry ? styles.selectedRow : undefined}>
            <td><span className={styles.tierMark} data-tier={entry.tier[0].toLowerCase()}>{entry.tier}</span></td>
            <th scope="row" className={styles.specCell}><button type="button" className={styles.specButton} aria-controls="spec-detail" aria-pressed={selected === entry} onClick={() => setSelection(`${entry.classSlug}:${entry.specSlug}`)}><span className={styles.specName}>{specName(entry)}</span><span className={styles.className}>{className(entry)}</span></button></th>
            {hasScore && <td className={styles.num}>{fmt(entry.score)}</td>}{hasKey && <td className={styles.num}>{entry.maxKey === undefined ? "—" : `+${entry.maxKey}`}</td>}
          </tr>)}</tbody>
        </table> : <p className={styles.empty} role="status">{loading ? copy.loadingSlice : snapshot ? copy.empty : (copy.rankingUnavailable)}</p>}
      </div>
      <button type="button" className={styles.action} disabled={loading} onClick={() => setRetry(n => n + 1)}>{loading ? copy.updating : copy.refreshRanking}</button>
      {snapshot && <details className={styles.sources}><summary className={styles.sourcesTitle}>{copy.methodologyTitle}</summary>
        <p>{snapshot.context ? copy.sourceSlice : copy.methodology}</p>
        <ul className={styles.sourceList}>{snapshot.sources.map(source => <li key={source.slug}><span className={styles.sourceName}>{source.provider}</span><span>{source.updatedAt && Number.isFinite(Date.parse(source.updatedAt)) ? new Date(source.updatedAt).toLocaleString(copy.dateLocale, { timeZone: "UTC" }) + " UTC" : "—"}</span>{source.url && <a href={source.url} target="_blank" rel="noreferrer">{copy.openSource}</a>}</li>)}</ul>
      </details>}
    </section>
    {selected && <aside className={styles.detail} id="spec-detail" aria-labelledby="spec-detail-title"><p className={styles.detailEyebrow}>{copy.detailLabel}</p><div className={styles.detailHead}>
      <SpecSlot name={`${selected.specName} ${selected.className}`} cls={selected.classSlug} classSlug={selected.classSlug} specSlug={selected.specSlug} size="lg" />
      <div><h2 id="spec-detail-title" className={styles.detailTitle}>{specName(selected)}</h2><p>{className(selected)} · {copy.tier} {selected.tier}</p></div></div>
      <div className={styles.detailActions}>{specSlug && <Link className={`${styles.action} ${styles.actionPrimary}`} href={p(lang, `/talents/${specSlug}`)} prefetch={false}>{copy.openTalents}</Link>}{selected.guideUrl && <a className={styles.action} href={selected.guideUrl} target="_blank" rel="noreferrer">{copy.openGuide}</a>}</div>
    </aside>}
  </div>;
}
