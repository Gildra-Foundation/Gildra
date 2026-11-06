"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Castle, ChevronDown, LayoutGrid, List, Search, Swords } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { p, type Lang } from "@/lib/i18n-paths";
import { ANCHORS } from "@/lib/anchors";
import type { GameIntelligence, TierActivity, TierContext, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { tierCopy, type KeyRange, type TierCopy } from "@/components/blocks/wow/tierWorkspace/tierCopy";
import styles from "@/components/blocks/wow/tierWorkspace/tierWorkspace.module.css";
import { tierSectionCopy } from "./tierSectionCopy";
import { SOURCE_META, SourceCompare, useSourceRoles } from "@/components/blocks/wow/tierWorkspace/TierSources";
import { DEFAULT_SOURCE_DIFFICULTY, SOURCE_DIFFICULTIES, TIER_SOURCES, isTierSource, type ExternalTierSource, type TierSourceId, type TierSourceSlices } from "@/components/blocks/wow/tierWorkspace/tierSourceKeys";
import { tierSourcesCopy } from "@/components/blocks/wow/tierWorkspace/tierSourcesCopy";
import { MaterialPlaque, type AnyMaterialKit } from "@/components/wow/shared/materialAtlas";
import { SIM_GEAR, SIM_TARGETS, simTierCopy, type SimGear, type SimTargets } from "@/components/blocks/wow/tierWorkspace/simTierCopy";
import { simRows } from "@/components/blocks/wow/tierWorkspace/simTierRows";
import { useSimTier } from "@/components/blocks/wow/tierWorkspace/useSimTier";
import { SpecIcon, TierBoard } from "@/components/blocks/wow/tierWorkspace/TierBoard";
import { TierList } from "@/components/blocks/wow/tierWorkspace/TierList";
import { fromSimRow, fromTierEntry, specInfo, type BoardEntry, type TierSpecNames } from "@/components/blocks/wow/tierWorkspace/tierBoardRows";
import { classStyle, tierStyle } from "@/components/blocks/wow/tierWorkspace/tierVisuals";

export type { TierSpecNames } from "@/components/blocks/wow/tierWorkspace/tierBoardRows";

const ROLES = ["dps", "healer", "tank"] as const;
const ACTIVITIES = ["mythic_plus", "raid"] as const;
const KEY_RANGES: KeyRange[] = ["all", "high", "middle", "low"];
const RAID_LEVELS = ["raid_myth", "raid_hero", "raid_normal"];
const EMPTY_ROLES: Record<TierRole, TierEntry[]> = { dps: [], healer: [], tank: [] };
type Layout = "tiers" | "list";
type Tab = TierSourceId | "compare";
/** The slim Ranking Hall kit (sectionKits.ts): oxidised bronze, copper rails, ember garnet — filters and the board. */
const KIT: AnyMaterialKit = "tier-lists";

function contextKey(context: TierContext) { return `${context.selectionType}:${context.selectionId}:${context.addonKey}`; }
function contextLabel(context: TierContext) { return context.addonKey === "midnight" ? context.selectionName : `${context.selectionName} · ${context.addonName}`; }
const isGear = (value: string | null): value is SimGear => Boolean(value && (SIM_GEAR as readonly string[]).includes(value));
const isTargets = (value: number): value is SimTargets => (SIM_TARGETS as readonly number[]).includes(value);

function Trend({ value, copy }: { value?: number; copy: TierCopy }) {
  if (!value) return <span className={styles.trendFlat}><span aria-hidden="true">—</span><span className={styles.srOnly}>{copy.trendFlat}</span></span>;
  const up = value > 0;
  return <span className={up ? styles.trendUp : styles.trendDown}><span aria-hidden="true">{up ? "▲" : "▼"} {Math.abs(value)}</span><span className={styles.srOnly}>{up ? copy.trendUp(value) : copy.trendDown(-value)}</span></span>;
}

/**
 * The tier workspace of /tier-lists: mode, role and source as segmented controls, then the classic tier rows
 * (badge + spec icons, hover/tap card, click → talents) or the compact list. Each source keeps its own ranking:
 * Gildra's blend, mythicstats.com, u.gg, the MythiStone sims (by target count and gear set), or the comparison.
 * With the saved sample (`sampleRoles`, meta API off) only the Mythic+ DPS rows render and the page notice says so.
 * Source, mode, role, raid difficulty, layout, sim targets and gear set live in the URL.
 */
export function TierSection({ lang, intelligence, sample = false, sampleRoles, specNames, sourceSlices = {} }: { lang: Lang; intelligence: GameIntelligence; sample?: boolean; sampleRoles?: Record<TierRole, TierEntry[]>; specNames: TierSpecNames; sourceSlices?: TierSourceSlices }) {
  const copy = tierCopy[lang];
  const sourceCopy = tierSourcesCopy[lang];
  const simCopy = simTierCopy[lang];
  const locale = tierSectionCopy[lang].numberLocale;
  const [tab, setTab] = useState<Tab>("gildra");
  const [layout, setLayout] = useState<Layout>("tiers");
  const [sourceDifficulty, setSourceDifficulty] = useState(DEFAULT_SOURCE_DIFFICULTY);
  const [urlRead, setUrlRead] = useState(false);
  const [activity, setActivity] = useState<TierActivity>("mythic_plus");
  const [role, setRole] = useState<TierRole>("dps");
  const [cls, setCls] = useState("all");
  const [q, setQ] = useState("");
  const [contextValue, setContextValue] = useState("all:all");
  const [keyType, setKeyType] = useState<KeyRange>("all");
  const [difficulty, setDifficulty] = useState("raid_hero");
  const [targets, setTargets] = useState<SimTargets>(1);
  const [gear, setGear] = useState<SimGear>("best");
  const [remoteRoles, setRemoteRoles] = useState<Record<TierRole, TierEntry[]> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const compare = tab === "compare";
  const source: TierSourceId = compare ? "gildra" : tab;
  const external = source !== "gildra";
  const sim = source === "sim";

  const contexts = useMemo(() => {
    const unique = new Map<string, TierContext>();
    for (const context of intelligence.tierContexts ?? []) {
      if (context.activity !== activity || context.selectionType === "all") continue;
      // The API names dungeons, raids and bosses in Russian only; the English page leaves them out.
      if (lang !== "ru" && /[Ѐ-ӿ]/.test(context.selectionName)) continue;
      unique.set(contextKey(context), context);
    }
    return [...unique.values()].sort((a, b) => a.selectionName.localeCompare(b.selectionName, lang === "ru" ? "ru" : "en"));
  }, [activity, intelligence.tierContexts, lang]);
  const selectedContext = contexts.find((context) => contextKey(context) === contextValue);
  /** The published "all dungeons" slice lets the key range work without picking a dungeon. */
  const allContext = useMemo(() => (intelligence.tierContexts ?? []).find((context) => context.activity === activity && context.selectionType === "all"), [activity, intelligence.tierContexts]);
  const queryContext = selectedContext ?? (activity === "mythic_plus" && keyType !== "all" ? allContext : undefined);
  const gildraList = !sample && !external && !compare;
  const keyRangeEnabled = gildraList && activity === "mythic_plus" && Boolean(selectedContext || allContext);
  const difficultyEnabled = gildraList && activity === "raid" && Boolean(selectedContext);
  const raidDifficulties = useMemo(() => {
    if (!selectedContext || activity !== "raid") return RAID_LEVELS;
    return [...new Set((intelligence.tierContexts ?? []).filter((item) => item.activity === "raid" && contextKey(item) === contextKey(selectedContext) && item.difficulty).map((item) => item.difficulty as string))];
  }, [activity, intelligence.tierContexts, selectedContext]);

  const suppliedRoles = intelligence.tierLists?.[activity]?.roles ?? (activity === "mythic_plus" ? intelligence.roles : undefined);
  const baseRoles = suppliedRoles ?? (sample && activity === "mythic_plus" && sampleRoles ? sampleRoles : EMPTY_ROLES);
  const needUgg = source === "ugg" || compare;
  const needStats = (source === "mythicstats" || compare) && activity === "mythic_plus";
  const ugg = useSourceRoles(needUgg ? "ugg" : "gildra", activity, sourceDifficulty, sourceSlices);
  const stats = useSourceRoles(needStats ? "mythicstats" : "gildra", activity, sourceDifficulty, sourceSlices);
  const simData = useSimTier(sim && !sample);
  const sourceState = source === "ugg" ? ugg : source === "mythicstats" ? stats : null;
  const activeRoles = sourceState ? sourceState.data?.roles ?? EMPTY_ROLES : remoteRoles ?? baseRoles;

  const simTables = simData.data?.data.tables;
  const simEntries = useCallback((value: TierRole) => {
    if (value === "healer") return [];
    return simRows(simTables?.find((table) => table.role === value && table.targets === targets), gear, specNames).map(fromSimRow);
  }, [simTables, targets, gear, specNames]);
  const entriesFor = useCallback((value: TierRole): BoardEntry[] => sim ? simEntries(value) : (activeRoles[value] ?? []).map((entry) => fromTierEntry(entry, specNames)), [sim, simEntries, activeRoles, specNames]);
  const roleEntries = useMemo(() => entriesFor(role), [entriesFor, role]);
  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    roleEntries.forEach((entry) => seen.set(entry.classSlug, entry.className));
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [roleEntries, lang]);
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return roleEntries.filter((entry) => (cls === "all" || entry.classSlug === cls)
      && (!query || `${entry.specName} ${entry.className}`.toLowerCase().includes(query)));
  }, [roleEntries, cls, q]);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const compactFormat = useMemo(() => ({
    big: new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
    small: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
  }), [locale]);
  const signed = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" }), [locale]);
  const compact = useCallback((value?: number) => value === undefined ? "—" : (Math.abs(value) >= 10_000 ? compactFormat.big : compactFormat.small).format(value), [compactFormat]);
  const percent = useCallback((value: number) => `${number.format(Number((value * 100).toFixed(1)))}%`, [number]);
  const behind = useCallback((entry: BoardEntry) => entry.behind === undefined ? "—" : entry.rank === 1 ? simCopy.leader : `${signed.format(Number(entry.behind.toFixed(1)))}%`, [signed, simCopy.leader]);
  const rateLabel = role === "healer" ? copy.rate.hps : copy.rate.dps;

  const talentsHref = useCallback((entry: Pick<BoardEntry, "classSlug" | "specSlug">) => {
    const info = specInfo(specNames, entry.classSlug, entry.specSlug);
    return info?.talents ? p(lang, `/talents/${info.talents}`) : undefined;
  }, [specNames, lang]);

  /** The spec card of the board (hover tooltip, tap panel): name, class, tier and rank, hero talents, two of the source's own numbers. */
  const tip = (entry: BoardEntry) => {
    const info = specInfo(specNames, entry.classSlug, entry.specSlug);
    const metrics = [
      entry.simDps !== undefined ? { label: simCopy.dps, value: number.format(entry.simDps) } : null,
      entry.behind !== undefined && entry.rank > 1 ? { label: simCopy.behind, value: behind(entry) } : null,
      entry.score !== undefined ? { label: copy.score, value: compact(entry.score) } : null,
      entry.popularity !== undefined ? { label: copy.popularity, value: percent(entry.popularity) } : null,
      entry.rate !== undefined ? { label: rateLabel, value: compact(entry.rate) } : null,
      entry.maxKey !== undefined && activity === "mythic_plus" ? { label: copy.maxKey, value: `+${number.format(entry.maxKey)}` } : null,
    ].filter((item): item is { label: string; value: string } => item !== null).slice(0, 2);
    return (
      <>
        <span className={styles.tipHead} style={classStyle(entry.classSlug)}>
          <b className={styles.tipName}>{entry.specName}</b>
          <span className={styles.className}>{entry.className}{entry.group && sourceCopy.group[entry.group] ? ` · ${sourceCopy.group[entry.group]}` : ""}</span>
        </span>
        <span className={styles.tipRank}>
          <span className={styles.tierChip} style={tierStyle(entry.tier)}><span className={styles.srOnly}>{copy.tier} </span>{entry.tier}</span>
          <span>{copy.rank}{entry.rank}</span>
          {entry.rankChange ? <Trend value={entry.rankChange} copy={copy} /> : null}
        </span>
        {info?.heroes ? <span className={styles.tipHeroes}><span className={styles.tipLabel}>{copy.heroes}</span>{info.heroes.join(" · ")}</span> : null}
        {metrics.length ? (
          <span className={styles.tipMetrics}>
            {metrics.map((item) => <span key={item.label}><span className={styles.tipLabel}>{item.label}</span><b>{item.value}</b></span>)}
          </span>
        ) : null}
      </>
    );
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sourceParam = params.get("source");
    const nextTab: Tab = sourceParam === "compare" ? "compare" : isTierSource(sourceParam) ? sourceParam : "gildra";
    setTab(nextTab);
    const roleParam = params.get("role");
    if (roleParam === "tank" || (roleParam === "healer" && nextTab !== "sim")) setRole(roleParam);
    const difficultyParam = params.get("difficulty");
    if (difficultyParam && SOURCE_DIFFICULTIES.includes(difficultyParam)) setSourceDifficulty(difficultyParam);
    if (params.get("view") === "list") setLayout("list");
    const targetParam = Number(params.get("targets"));
    if (isTargets(targetParam)) setTargets(targetParam);
    const gearParam = params.get("gear");
    if (isGear(gearParam)) setGear(gearParam);
    if (params.get("activity") === "raid" && nextTab !== "mythicstats" && nextTab !== "sim") setActivity("raid");
    setUrlRead(true);
  }, []);

  /** The view lives in the URL so it can be shared; defaults stay out of it. */
  useEffect(() => {
    if (!urlRead) return;
    const url = new URL(window.location.href);
    const set = (key: string, value: string, fallback: string) => { if (value === fallback) url.searchParams.delete(key); else url.searchParams.set(key, value); };
    set("source", tab, "gildra");
    set("activity", activity, "mythic_plus");
    set("role", role, "dps");
    set("difficulty", (external || compare) && activity === "raid" ? sourceDifficulty : DEFAULT_SOURCE_DIFFICULTY, DEFAULT_SOURCE_DIFFICULTY);
    set("view", compare ? "tiers" : layout, "tiers");
    set("targets", sim ? String(targets) : "1", "1");
    set("gear", sim ? gear : "best", "best");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [urlRead, tab, activity, role, sourceDifficulty, external, compare, layout, sim, targets, gear]);

  useEffect(() => {
    if (!queryContext || source !== "gildra") {
      setRemoteRoles(null);
      setLoadError("");
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError("");
    const paramsFor = (value: TierRole) => {
      const params = new URLSearchParams({
        activity, role: value, limit: "60",
        selectionType: queryContext.selectionType, selectionId: queryContext.selectionId, addon: queryContext.addonKey,
      });
      if (activity === "mythic_plus") params.set("keyType", keyType);
      if (activity === "raid") params.set("difficulty", difficulty);
      return params;
    };
    Promise.all(ROLES.map(async (value) => {
      const response = await fetch(`/v1/meta/wow/tier-list?${paramsFor(value)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`tier list request failed (${response.status})`);
      const snapshot = await response.json() as { entries: TierEntry[] };
      return [value, snapshot.entries] as const;
    })).then((items) => {
      setRemoteRoles(Object.fromEntries(items) as Record<TierRole, TierEntry[]>);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRemoteRoles(null);
      setLoadError(copy.loadError);
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [activity, copy.loadError, difficulty, keyType, queryContext, source]);

  const switchActivity = (value: TierActivity) => {
    setActivity(value);
    setContextValue("all:all");
    setRemoteRoles(null);
    setCls("all");
    setQ("");
  };

  const chooseTab = (id: string) => {
    if (id !== "compare" && !isTierSource(id)) return;
    setTab(id);
    setCls("all");
    if ((id === "mythicstats" || id === "sim") && activity === "raid") switchActivity("mythic_plus");
    // The simulations cover damage specs and tanks only.
    if (id === "sim" && role === "healer") setRole("dps");
  };

  const chooseRole = (value: string) => {
    if (value !== "dps" && value !== "healer" && value !== "tank") return;
    setRole(value);
    setCls("all");
  };

  const chooseContext = (value: string) => {
    setContextValue(value);
    if (activity !== "raid") return;
    const available = (intelligence.tierContexts ?? []).filter((item) => item.activity === "raid" && contextKey(item) === value && item.difficulty).map((item) => item.difficulty as string);
    if (!available.includes(difficulty) && available[0]) setDifficulty(available[0]);
  };

  const sourceLabel = (id: TierSourceId) => id === "gildra" ? "Gildra" : id === "sim" ? simCopy.tab : SOURCE_META[id].name;
  const busy = isLoading || Boolean(sourceState?.loading) || simData.loading;
  const title = compare ? sourceCopy.compareTitle : sim ? simCopy.title : activity === "mythic_plus" ? copy.resultsMythic : copy.resultsRaid;
  // The sample has no slices and only Mythic+ DPS rows: controls that could only lead to an empty board are not rendered.
  const showModes = !sample || Boolean(intelligence.tierLists?.raid);
  const visibleRoles = sample ? ROLES.filter((value) => (activeRoles[value]?.length ?? 0) > 0) : [...ROLES];

  const select = (id: string, label: string, value: string, onChange: (value: string) => void, options: ReactNode, className = "") => (
    <div className={`${styles.field} ${className}`}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <span className={styles.selectShell}>
        <select id={id} className={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>{options}</select>
        <ChevronDown aria-hidden="true" />
      </span>
    </div>
  );

  const contentOptions = (
    <>
      <option value="all:all">{activity === "mythic_plus" ? copy.allDungeons : copy.allRaids}</option>
      {contexts.filter((item) => item.selectionType !== "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}
      {activity === "raid" && contexts.some((item) => item.selectionType === "boss")
        ? <optgroup label={copy.bosses}>{contexts.filter((item) => item.selectionType === "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}</optgroup>
        : null}
    </>
  );

  /** Mode, role and source as segmented controls (they scroll sideways on phones), then the options of the chosen source. */
  const controls = (
    <MaterialPlaque kit={KIT} className={styles.filters} role="group" aria-label={copy.controlsLabel}>
      <div className={styles.segmentRow}>
        {showModes ? (
          <AtlasSegmented className={styles.segmentedControl} aria-label={copy.mode} value={activity} onValueChange={(value) => switchActivity(value as TierActivity)}
            options={ACTIVITIES.map((value) => ({ value, label: copy.modes[value], icon: value === "mythic_plus" ? <Swords aria-hidden="true" /> : <Castle aria-hidden="true" />, disabled: value === "raid" && (source === "mythicstats" || sim) && !compare }))} />
        ) : null}
        {visibleRoles.length > 1 ? (
          <AtlasSegmented className={styles.segmentedControl} aria-label={copy.role} value={role} onValueChange={chooseRole}
            options={visibleRoles.map((value) => ({ value, label: copy.roles[value], disabled: sim && value === "healer" }))} />
        ) : null}
        {!sample ? (
          <AtlasSegmented className={`${styles.segmentedControl} ${styles.sourceControl}`} aria-label={sourceCopy.source} value={tab} onValueChange={chooseTab}
            options={[...TIER_SOURCES, "compare" as const].map((id) => ({ value: id, label: id === "compare" ? sourceCopy.compare : sourceLabel(id) }))} />
        ) : null}
      </div>
      <div className={styles.controls}>
        {gildraList ? select("tier-content", copy.content, contextValue, chooseContext, contentOptions, `${styles.fieldGrow} ${styles.fieldWide}`) : null}
        {keyRangeEnabled ? select("tier-key", copy.keyRange, keyType, (value) => setKeyType(value as KeyRange), KEY_RANGES.map((value) => <option key={value} value={value}>{copy.keys[value]}</option>)) : null}
        {difficultyEnabled ? (
          <div className={styles.field}>
            <span className={styles.label} id="tier-difficulty-label">{copy.difficulty}</span>
            <AtlasSegmented className={styles.segmentedControl} aria-labelledby="tier-difficulty-label" value={difficulty} onValueChange={setDifficulty}
              options={raidDifficulties.map((value) => ({ value, label: copy.difficulties[value] ?? value }))} />
          </div>
        ) : null}
        {(source === "ugg" || compare) && activity === "raid" ? (
          <div className={styles.field}>
            <span className={styles.label} id="tier-source-difficulty-label">{copy.difficulty}</span>
            <AtlasSegmented className={styles.segmentedControl} aria-labelledby="tier-source-difficulty-label" value={sourceDifficulty} onValueChange={setSourceDifficulty}
              options={SOURCE_DIFFICULTIES.map((value) => ({ value, label: value === "all" ? sourceCopy.allDifficulties : copy.difficulties[value] }))} />
          </div>
        ) : null}
        {sim ? (
          <>
            <div className={styles.field}>
              <span className={styles.label} id="sim-targets-label">{simCopy.targets}</span>
              <AtlasSegmented className={styles.segmentedControl} aria-labelledby="sim-targets-label" value={String(targets)} onValueChange={(value) => { const count = Number(value); if (isTargets(count)) setTargets(count); }}
                options={SIM_TARGETS.map((count) => ({ value: String(count), label: simCopy.targetsLabel(count) }))} />
            </div>
            {select("sim-gear", simCopy.gear, gear, (value) => { if (isGear(value)) setGear(value); }, SIM_GEAR.map((value) => <option key={value} value={value}>{simCopy.gearNames[value]}</option>))}
          </>
        ) : null}
        {!compare && classes.length > 1
          ? select("tier-class", copy.classLabel, cls, setCls, <><option value="all">{copy.allClasses}</option>{classes.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</>, styles.fieldGrow)
          : null}
        {!compare ? (
          <div className={`${styles.field} ${styles.fieldGrow} ${styles.fieldSearch}`}>
            <label className={styles.label} htmlFor="tier-search">{copy.searchLabel}</label>
            <span className={styles.searchShell}>
              <Search aria-hidden="true" />
              <input id="tier-search" type="search" className={styles.search} placeholder={copy.searchPlaceholder} value={q} onChange={(event) => setQ(event.target.value)} />
            </span>
          </div>
        ) : null}
      </div>
    </MaterialPlaque>
  );

  const emptyText = sim && simData.error ? simCopy.loadError : sample && !roleEntries.length ? copy.emptySample : sim ? simCopy.empty : copy.empty;
  const listLabels = {
    caption: `${title}: ${copy.roles[role]}`, rank: copy.rank, spec: copy.spec, tier: copy.tier, score: copy.score, rate: rateLabel,
    maxKey: copy.maxKey, trend: copy.trend, popularity: copy.popularity, popularityShort: copy.popularityShort, dps: simCopy.dps, behind: simCopy.behind,
  };

  const ranking = compare ? (
    <SourceCompare
      lang={lang}
      activity={activity}
      role={role}
      classStyle={classStyle}
      tierStyle={tierStyle}
      renderSpec={(entry) => <SpecIcon entry={entry} size={36} />}
      columns={[
        { id: "gildra" as const, label: "Gildra", short: "Gildra", entries: baseRoles[role].map((entry) => ({ ...entry, ...specInfo(specNames, entry.classSlug, entry.specSlug) })) },
        ...(activity === "mythic_plus" ? [{ id: "mythicstats" as const, label: "mythicstats.com", short: "MS", entries: stats.data?.roles[role].map((entry) => ({ ...entry, ...specInfo(specNames, entry.classSlug, entry.specSlug) })) }] : []),
        { id: "ugg" as const, label: "u.gg", short: "u.gg", entries: ugg.data?.roles[role].map((entry) => ({ ...entry, ...specInfo(specNames, entry.classSlug, entry.specSlug) })) },
      ]}
    />
  ) : layout === "list" ? (
    <TierList entries={filtered} labels={listLabels} href={talentsHref} busy={busy} empty={emptyText}
      format={{ compact, number: (value) => number.format(value), percent, behind }} trend={(value) => <Trend value={value} copy={copy} />} />
  ) : (
    <TierBoard entries={filtered} labels={{ tier: copy.tierMark, talents: copy.talents, close: copy.close }} tip={tip} href={talentsHref} busy={busy} empty={emptyText} />
  );

  const layoutToggle = compare ? null : (
    <AtlasSegmented size="sm" className={styles.layoutToggle} aria-label={copy.view} value={layout} onValueChange={(value) => setLayout(value === "list" ? "list" : "tiers")}
      options={[
        { value: "tiers", label: copy.views.tiers, icon: <LayoutGrid aria-hidden="true" /> },
        { value: "list", label: copy.views.list, icon: <List aria-hidden="true" /> },
      ]} />
  );

  const externalSource = external ? source as ExternalTierSource : null;
  const providers = [...new Set(intelligence.sources.map((item) => item.provider))];
  const sourceLine = sample ? null : externalSource ? (
    <p className={styles.sourceLine}>
      {sourceCopy.sourceBy}:{" "}
      <a href={SOURCE_META[externalSource].page(activity, role, sourceDifficulty)} target="_blank" rel="noopener noreferrer">{SOURCE_META[externalSource].name}<ArrowUpRight aria-hidden="true" /></a>
    </p>
  ) : compare ? (
    <p className={styles.sourceLine}>{copy.sourcesUsed}: Gildra · {activity === "mythic_plus" ? "mythicstats.com · " : ""}u.gg</p>
  ) : providers.length ? (
    <p className={styles.sourceLine}>{copy.sourcesUsed}: {providers.join(" · ")}</p>
  ) : null;

  return (
    <div className={styles.workspace} id={ANCHORS.tierList}>
      <AtlasSection id={ANCHORS.builds} className={styles.section} title={title}
        aside={<div className={styles.sectionAside}>{busy ? <span className={styles.count} aria-live="polite">{sim ? simCopy.loading : copy.updating}</span> : null}{layoutToggle}</div>}>
        <div className={styles.sectionBody}>
          {controls}
          <MaterialPlaque kit={KIT} className={styles.boardPlaque}>
            {loadError && gildraList ? <p className={styles.alert} role="status">{loadError}</p> : null}
            {sourceState?.error ? <p className={styles.alert} role="status">{sourceCopy.loadError}</p> : null}
            {ranking}
          </MaterialPlaque>
        </div>
      </AtlasSection>
      {sourceLine}
    </div>
  );
}
