"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Castle, ChevronDown, Columns3, LayoutGrid, List, Search, Shield, Swords } from "lucide-react";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AtlasSwap } from "@gildra/atlas-ui/AtlasSwap";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { p, type Lang } from "@/lib/i18n-paths";
import { ANCHORS } from "@/lib/anchors";
import type { GameIntelligence, TierContext, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { tierCopy, type KeyRange, type TierCopy } from "@/components/blocks/wow/tierWorkspace/tierCopy";
import styles from "@/components/blocks/wow/tierWorkspace/tierWorkspace.module.css";
import { tierSectionCopy } from "./tierSectionCopy";
import { SourceCompare, useTierCompare, useTierList } from "@/components/blocks/wow/tierWorkspace/TierSources";
import {
  DEFAULT_SOURCE_DIFFICULTY, PVP_BRACKETS, PVP_REGIONS, SOURCE_DIFFICULTIES, SOURCE_SITES, TIER_MODES,
  isBracket, isRegion, isTierMode, isTierSource,
  type ListQuery, type PvpBracket, type PvpRegion, type TierMode, type TierSourceId, type TierSourceInfo, type TierSourceTabs,
} from "@/components/blocks/wow/tierWorkspace/tierSourceKeys";
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
const KEY_RANGES: KeyRange[] = ["all", "high", "middle", "low"];
const RAID_LEVELS = ["raid_myth", "raid_hero", "raid_normal"];
const EMPTY_ROLES: Record<TierRole, TierEntry[]> = { dps: [], healer: [], tank: [] };
const MODE_ICONS: Record<TierMode, ReactNode> = { mythic_plus: <Swords aria-hidden="true" />, raid: <Castle aria-hidden="true" />, pvp: <Shield aria-hidden="true" /> };
const LADDER_URL = "https://worldofwarcraft.blizzard.com/en-gb/game/pvp/leaderboards";
type Layout = "tiers" | "list" | "compare";
/** The slim Ranking Hall kit (sectionKits.ts): oxidised bronze, copper rails, ember garnet — filters and the board. */
const KIT: AnyMaterialKit = "tier-lists";

/** The numbers each tab's spec card shows, in order (the first three that the row has). */
type Metric = "sources" | "score" | "rate" | "popularity" | "maxKey" | "rating" | "players" | "winRate" | "simDps" | "behind";
const CARD_METRICS: Partial<Record<TierSourceId | "ladder", Metric[]>> = {
  gildra: ["sources", "score", "popularity", "rate"],
  ladder: ["popularity", "rating", "winRate", "players"],
  wowgg: ["score", "rate", "rating", "players", "popularity", "maxKey"],
  ugg: ["score", "rate", "popularity"],
  wowmeta: ["rating", "maxKey", "players"],
  wythic: ["popularity"],
  murlok: ["score"],
  sim: ["simDps", "behind"],
};

function contextKey(context: TierContext) { return `${context.selectionType}:${context.selectionId}:${context.addonKey}`; }
function contextLabel(context: TierContext) { return context.addonKey === "midnight" ? context.selectionName : `${context.selectionName} · ${context.addonName}`; }
const isGear = (value: string | null): value is SimGear => Boolean(value && (SIM_GEAR as readonly string[]).includes(value));
const isTargets = (value: number): value is SimTargets => (SIM_TARGETS as readonly number[]).includes(value);

function Trend({ value, change, copy }: { value?: number; change?: "up" | "down"; copy: TierCopy }) {
  if (!value && change) {
    const up = change === "up";
    return <span className={up ? styles.trendUp : styles.trendDown}><span aria-hidden="true">{up ? "▲" : "▼"}</span><span className={styles.srOnly}>{up ? copy.trendUp(1) : copy.trendDown(1)}</span></span>;
  }
  if (!value) return <span className={styles.trendFlat}><span aria-hidden="true">—</span><span className={styles.srOnly}>{copy.trendFlat}</span></span>;
  const up = value > 0;
  return <span className={up ? styles.trendUp : styles.trendDown}><span aria-hidden="true">{up ? "▲" : "▼"} {Math.abs(value)}</span><span className={styles.srOnly}>{up ? copy.trendUp(value) : copy.trendDown(-value)}</span></span>;
}

/**
 * The tier workspace of /tier-lists: mode (Mythic+, raids, arena), role and source as segmented controls,
 * then the classic tier rows (badge + spec icons, hover/tap card, click → talents), the compact list or the
 * comparison of every source with the overall tier. Each tab keeps its source's own ranking; Gildra is the
 * consensus of the sources (Mythic+, raids) or the Blizzard PvP ladder (arena). With the saved sample
 * (`sampleRoles`, meta API off) only the Mythic+ DPS rows render and the page notice says so.
 * Mode, role, source, bracket, region, difficulty, view, sim targets and gear set live in the URL.
 */
export function TierSection({ lang, intelligence, sample = false, sampleRoles, specNames, sourceTabs }: { lang: Lang; intelligence: GameIntelligence; sample?: boolean; sampleRoles?: Record<TierRole, TierEntry[]>; specNames: TierSpecNames; sourceTabs?: TierSourceTabs }) {
  const copy = tierCopy[lang];
  const sourceCopy = tierSourcesCopy[lang];
  const simCopy = simTierCopy[lang];
  const locale = tierSectionCopy[lang].numberLocale;
  const [tab, setTab] = useState<TierSourceId>("gildra");
  const [layout, setLayout] = useState<Layout>("tiers");
  const [sourceDifficulty, setSourceDifficulty] = useState(DEFAULT_SOURCE_DIFFICULTY);
  const [urlRead, setUrlRead] = useState(false);
  const [mode, setMode] = useState<TierMode>("mythic_plus");
  const [role, setRole] = useState<TierRole>("dps");
  const [bracket, setBracket] = useState<PvpBracket>("3v3");
  const [region, setRegion] = useState<PvpRegion>("all");
  const [cls, setCls] = useState("all");
  const [q, setQ] = useState("");
  const [contextValue, setContextValue] = useState("all:all");
  const [keyType, setKeyType] = useState<KeyRange>("all");
  const [difficulty, setDifficulty] = useState("raid_hero");
  const [targets, setTargets] = useState<SimTargets>(1);
  const [gear, setGear] = useState<SimGear>("best");

  const tabsInfo = useMemo(() => sourceTabs?.tabs ?? [], [sourceTabs]);
  const ladder = Boolean(sourceTabs?.ladder);
  const tabInfo = useCallback((id: TierSourceId): TierSourceInfo | undefined => tabsInfo.find((item) => item.id === id), [tabsInfo]);
  /** The modes with at least one list: the arena needs the ladder or a PvP source. */
  const modes = useMemo(() => TIER_MODES.filter((value) => value !== "pvp" || ladder || tabsInfo.some((item) => item.activities.includes("pvp"))), [ladder, tabsInfo]);
  /** The tabs of a mode, Gildra first; sims only for Mythic+. */
  const tabsFor = useCallback((value: TierMode): TierSourceId[] => {
    if (sample) return ["gildra"];
    const list: TierSourceId[] = value !== "pvp" || ladder ? ["gildra"] : [];
    tabsInfo.forEach((item) => { if (item.activities.includes(value)) list.push(item.id); });
    if (value === "mythic_plus") list.push("sim");
    return list;
  }, [ladder, sample, tabsInfo]);
  const modeTabs = useMemo(() => tabsFor(mode), [tabsFor, mode]);
  const source: TierSourceId = modeTabs.includes(tab) ? tab : modeTabs[0] ?? "gildra";
  const compare = layout === "compare" && !sample;
  const sim = source === "sim" && !compare;
  const wowgg = source === "wowgg" && !compare;
  const info = tabInfo(source);
  const showBracket = mode === "pvp" && (compare || !info?.anyBracket);
  const showRegion = mode === "pvp" && !compare && (source === "gildra" || Boolean(info?.regions));

  const contexts = useMemo(() => {
    const unique = new Map<string, TierContext>();
    if (mode === "pvp") return [];
    for (const context of intelligence.tierContexts ?? []) {
      if (context.activity !== mode || context.selectionType === "all") continue;
      // The API names dungeons, raids and bosses in Russian only; the English page leaves them out.
      if (lang !== "ru" && /[Ѐ-ӿ]/.test(context.selectionName)) continue;
      unique.set(contextKey(context), context);
    }
    return [...unique.values()].sort((a, b) => a.selectionName.localeCompare(b.selectionName, lang === "ru" ? "ru" : "en"));
  }, [mode, intelligence.tierContexts, lang]);
  const selectedContext = contexts.find((context) => contextKey(context) === contextValue);
  /** The published "all dungeons" slice lets the key range work without picking a dungeon. */
  const allContext = useMemo(() => (intelligence.tierContexts ?? []).find((context) => context.activity === mode && context.selectionType === "all"), [mode, intelligence.tierContexts]);
  const queryContext = selectedContext ?? (mode === "mythic_plus" && keyType !== "all" ? allContext : undefined);
  const keyRangeEnabled = wowgg && mode === "mythic_plus" && Boolean(selectedContext || allContext);
  const raidDifficulties = useMemo(() => {
    if (!selectedContext || mode !== "raid") return RAID_LEVELS;
    return [...new Set((intelligence.tierContexts ?? []).filter((item) => item.activity === "raid" && contextKey(item) === contextKey(selectedContext) && item.difficulty).map((item) => item.difficulty as string))];
  }, [mode, intelligence.tierContexts, selectedContext]);

  /** What the open tab loads: nothing for Gildra's server-rendered Mythic+/raid lists and the sims. */
  const listQuery = useMemo<ListQuery | null>(() => {
    if (sample || compare || sim) return null;
    if (source === "gildra" && mode !== "pvp") return null;
    const query: ListQuery = { source: source as ListQuery["source"], mode };
    if (mode === "pvp") Object.assign(query, { bracket, region: showRegion ? region : "all" });
    if (mode === "raid") query.difficulty = source === "wowgg" ? difficulty : sourceDifficulty;
    if (source === "wowgg" && queryContext) {
      query.selection = { type: queryContext.selectionType, id: queryContext.selectionId, addon: queryContext.addonKey,
        keyType: mode === "mythic_plus" ? keyType : undefined, difficulty: mode === "raid" ? difficulty : undefined };
    }
    return query;
  }, [sample, compare, sim, source, mode, bracket, region, showRegion, difficulty, sourceDifficulty, queryContext, keyType]);
  const list = useTierList(listQuery, {});
  const comparison = useTierCompare(useMemo(() => compare ? { mode, role, bracket, difficulty: sourceDifficulty } : null, [compare, mode, role, bracket, sourceDifficulty]));
  const simData = useSimTier(sim && !sample);

  const serverRoles = mode === "pvp" ? undefined : intelligence.tierLists?.[mode]?.roles ?? (mode === "mythic_plus" ? intelligence.roles : undefined);
  const baseRoles = serverRoles ?? (sample && mode === "mythic_plus" && sampleRoles ? sampleRoles : EMPTY_ROLES);
  const activeRoles = listQuery ? list.data?.roles ?? EMPTY_ROLES : baseRoles;

  const simTables = simData.data?.data.tables;
  const entriesFor = useCallback((value: TierRole): BoardEntry[] => {
    if (sim) {
      if (value === "healer") return [];
      return simRows(simTables?.find((table) => table.role === value && table.targets === targets), gear, specNames).map(fromSimRow);
    }
    return (activeRoles[value] ?? []).map((entry) => fromTierEntry(entry, specNames));
  }, [sim, simTables, targets, gear, activeRoles, specNames]);
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
    const spec = specInfo(specNames, entry.classSlug, entry.specSlug);
    return spec?.talents ? p(lang, `/talents/${spec.talents}`) : undefined;
  }, [specNames, lang]);

  const metricsKey = source === "gildra" && mode === "pvp" ? "ladder" : source;
  const metricOf = (entry: BoardEntry, metric: Metric): { label: string; value: string } | null => {
    switch (metric) {
      case "sources": return entry.sources ? { label: sourceCopy.sources, value: number.format(entry.sources) } : null;
      case "score": return entry.score !== undefined ? { label: copy.score, value: compact(entry.score) } : null;
      case "rate": return entry.rate !== undefined ? { label: rateLabel, value: compact(entry.rate) } : null;
      case "popularity": return entry.popularity !== undefined ? { label: metricsKey === "ladder" ? sourceCopy.share : copy.popularity, value: percent(entry.popularity) } : null;
      case "maxKey": return entry.maxKey !== undefined && mode === "mythic_plus" ? { label: copy.maxKey, value: `+${number.format(entry.maxKey)}` } : null;
      case "rating": return entry.rating !== undefined ? { label: sourceCopy.rating, value: number.format(Math.round(entry.rating)) } : null;
      case "players": return entry.players !== undefined ? { label: sourceCopy.players, value: number.format(entry.players) } : null;
      case "winRate": return entry.winRate !== undefined ? { label: sourceCopy.winRate, value: percent(entry.winRate) } : null;
      case "simDps": return entry.simDps !== undefined ? { label: simCopy.dps, value: number.format(entry.simDps) } : null;
      case "behind": return entry.behind !== undefined && entry.rank > 1 ? { label: simCopy.behind, value: behind(entry) } : null;
    }
  };

  /** The spec card of the board (hover tooltip, tap panel): name, class, tier and rank, hero talents, the source's own numbers. */
  const tip = (entry: BoardEntry) => {
    const spec = specInfo(specNames, entry.classSlug, entry.specSlug);
    const metrics = (CARD_METRICS[metricsKey] ?? []).map((metric) => metricOf(entry, metric))
      .filter((item): item is { label: string; value: string } => item !== null).slice(0, 3);
    return (
      <>
        <span className={styles.tipHead} style={classStyle(entry.classSlug)}>
          <b className={styles.tipName}>{entry.specName}</b>
          <span className={styles.className}>{entry.className}{entry.group && sourceCopy.group[entry.group] ? ` · ${sourceCopy.group[entry.group]}` : ""}</span>
        </span>
        <span className={styles.tipRank}>
          <span className={styles.tierChip} style={tierStyle(entry.tier)}><span className={styles.srOnly}>{copy.tier} </span>{entry.tier}</span>
          <span>{copy.rank}{entry.rank}</span>
          {entry.rankChange || entry.change ? <Trend value={entry.rankChange} change={entry.change} copy={copy} /> : null}
        </span>
        {spec?.heroes ? <span className={styles.tipHeroes}><span className={styles.tipLabel}>{copy.heroes}</span>{spec.heroes.join(" · ")}</span> : null}
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
    const modeParam = params.get("activity");
    const nextMode: TierMode = isTierMode(modeParam) ? modeParam : "mythic_plus";
    setMode(nextMode);
    if (isTierSource(sourceParam)) setTab(sourceParam);
    const viewParam = params.get("view");
    // `source=compare` is the comparison's address before it became a view.
    if (viewParam === "compare" || sourceParam === "compare") setLayout("compare");
    else if (viewParam === "list") setLayout("list");
    const roleParam = params.get("role");
    if (roleParam === "tank" || roleParam === "healer") setRole(roleParam);
    const difficultyParam = params.get("difficulty");
    if (difficultyParam && SOURCE_DIFFICULTIES.includes(difficultyParam)) setSourceDifficulty(difficultyParam);
    if (difficultyParam && RAID_LEVELS.includes(difficultyParam)) setDifficulty(difficultyParam);
    const bracketParam = params.get("bracket");
    if (isBracket(bracketParam)) setBracket(bracketParam);
    const regionParam = params.get("region");
    if (isRegion(regionParam)) setRegion(regionParam);
    const targetParam = Number(params.get("targets"));
    if (isTargets(targetParam)) setTargets(targetParam);
    const gearParam = params.get("gear");
    if (isGear(gearParam)) setGear(gearParam);
    setUrlRead(true);
  }, []);

  /** The view lives in the URL so it can be shared; defaults stay out of it. */
  useEffect(() => {
    if (!urlRead) return;
    const url = new URL(window.location.href);
    const set = (key: string, value: string, fallback: string) => { if (value === fallback) url.searchParams.delete(key); else url.searchParams.set(key, value); };
    set("source", compare ? "gildra" : source, "gildra");
    set("activity", mode, "mythic_plus");
    set("role", role, "dps");
    const raidDifficulty = mode !== "raid" ? DEFAULT_SOURCE_DIFFICULTY : source === "wowgg" && !compare ? difficulty : sourceDifficulty;
    set("difficulty", raidDifficulty, DEFAULT_SOURCE_DIFFICULTY);
    set("bracket", mode === "pvp" ? bracket : "3v3", "3v3");
    set("region", showRegion ? region : "all", "all");
    set("view", layout, "tiers");
    set("targets", sim ? String(targets) : "1", "1");
    set("gear", sim ? gear : "best", "best");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [urlRead, source, compare, mode, role, sourceDifficulty, difficulty, bracket, region, showRegion, layout, sim, targets, gear]);

  const switchMode = (value: string) => {
    if (!isTierMode(value)) return;
    setMode(value);
    setContextValue("all:all");
    setKeyType("all");
    setCls("all");
    setQ("");
    // The sims rank damage dealers and tanks only; a tab the new mode lacks falls back to its first tab.
    if (!tabsFor(value).includes(tab)) setTab(tabsFor(value)[0] ?? "gildra");
  };

  const chooseTab = (id: string) => {
    if (!isTierSource(id)) return;
    setTab(id);
    setCls("all");
    setContextValue("all:all");
    if (id === "sim" && role === "healer") setRole("dps");
  };

  const chooseRole = (value: string) => {
    if (value !== "dps" && value !== "healer" && value !== "tank") return;
    setRole(value);
    setCls("all");
  };

  const chooseContext = (value: string) => {
    setContextValue(value);
    if (mode !== "raid") return;
    const available = (intelligence.tierContexts ?? []).filter((item) => item.activity === "raid" && contextKey(item) === value && item.difficulty).map((item) => item.difficulty as string);
    if (available.length && !available.includes(difficulty)) setDifficulty(available.includes("raid_hero") ? "raid_hero" : available[0]);
  };

  const sourceLabel = useCallback((id: string) => {
    if (id === "gildra" || id === "ladder") return "Gildra";
    if (id === "sim") return simCopy.tab;
    return isTierSource(id) && id !== "gildra" ? SOURCE_SITES[id].name : id;
  }, [simCopy.tab]);
  const busy = list.loading || simData.loading || comparison.loading;
  /** While a switch loads, the board keeps the previous rows (dimmed) and swaps once the new ones are in. */
  const viewKey = [compare ? "compare" : layout, source, mode, role, bracket, region, difficulty, sourceDifficulty, contextValue, keyType, targets, gear, cls].join("|");
  const [held, setHeld] = useState({ key: viewKey, rows: filtered, comparison: comparison.data });
  if (!busy && (held.key !== viewKey || held.rows !== filtered || held.comparison !== comparison.data)) setHeld({ key: viewKey, rows: filtered, comparison: comparison.data });
  const rows = busy && !filtered.length ? held.rows : filtered;
  const comparisonShown = comparison.data ?? (busy ? held.comparison : undefined);
  const title = compare ? sourceCopy.compareTitle : sim ? simCopy.title : mode === "mythic_plus" ? copy.resultsMythic : mode === "raid" ? copy.resultsRaid : copy.resultsArena;
  // The sample has no slices and only Mythic+ DPS rows: controls that could only lead to an empty board are not rendered.
  const showModes = !sample && modes.length > 1;
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
  const segmented = (id: string, label: string, value: string, onChange: (value: string) => void, options: { value: string; label: string; disabled?: boolean }[]) => (
    <div className={styles.field}>
      <span className={styles.label} id={id}>{label}</span>
      <AtlasSegmented className={styles.segmentedControl} aria-labelledby={id} value={value} onValueChange={onChange} options={options} />
    </div>
  );

  const contentOptions = (
    <>
      <option value="all:all">{mode === "mythic_plus" ? copy.allDungeons : copy.allRaids}</option>
      {contexts.filter((item) => item.selectionType !== "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}
      {mode === "raid" && contexts.some((item) => item.selectionType === "boss")
        ? <optgroup label={copy.bosses}>{contexts.filter((item) => item.selectionType === "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}</optgroup>
        : null}
    </>
  );

  /** Mode and role, the source tabs (they scroll sideways when they do not fit), then the options of the open tab. */
  const controls = (
    <MaterialPlaque kit={KIT} className={styles.filters} role="group" aria-label={copy.controlsLabel}>
      <div className={styles.segmentRow}>
        {showModes ? (
          <AtlasSegmented className={styles.segmentedControl} aria-label={copy.mode} value={mode} onValueChange={switchMode}
            options={modes.map((value) => ({ value, label: copy.modes[value], icon: MODE_ICONS[value] }))} />
        ) : null}
        {visibleRoles.length > 1 ? (
          <AtlasSegmented className={styles.segmentedControl} aria-label={copy.role} value={role} onValueChange={chooseRole}
            options={visibleRoles.map((value) => ({ value, label: copy.roles[value], disabled: sim && value === "healer" }))} />
        ) : null}
      </div>
      {!sample && !compare && modeTabs.length > 1 ? (
        <AtlasSegmented className={`${styles.segmentedControl} ${styles.sourceControl}`} aria-label={sourceCopy.source} value={source} onValueChange={chooseTab}
          options={modeTabs.map((id) => ({ value: id, label: sourceLabel(id) }))} />
      ) : null}
      <div className={styles.controls}>
        {showBracket ? segmented("tier-bracket-label", sourceCopy.bracket, bracket, (value) => { if (isBracket(value)) setBracket(value); },
          PVP_BRACKETS.map((value) => ({ value, label: sourceCopy.brackets[value] }))) : null}
        {showRegion ? segmented("tier-region-label", sourceCopy.region, region, (value) => { if (isRegion(value)) setRegion(value); },
          PVP_REGIONS.map((value) => ({ value, label: sourceCopy.regions[value] }))) : null}
        {wowgg && mode !== "pvp" && contexts.length ? select("tier-content", copy.content, contextValue, chooseContext, contentOptions, `${styles.fieldGrow} ${styles.fieldWide}`) : null}
        {keyRangeEnabled ? select("tier-key", copy.keyRange, keyType, (value) => setKeyType(value as KeyRange), KEY_RANGES.map((value) => <option key={value} value={value}>{copy.keys[value]}</option>)) : null}
        {wowgg && mode === "raid" ? segmented("tier-difficulty-label", copy.difficulty, difficulty, setDifficulty,
          raidDifficulties.map((value) => ({ value, label: copy.difficulties[value] ?? value }))) : null}
        {(source === "ugg" || compare) && mode === "raid" ? segmented("tier-source-difficulty-label", copy.difficulty, sourceDifficulty, setSourceDifficulty,
          SOURCE_DIFFICULTIES.map((value) => ({ value, label: value === "all" ? sourceCopy.allDifficulties : copy.difficulties[value] }))) : null}
        {sim ? (
          <>
            {segmented("sim-targets-label", simCopy.targets, String(targets), (value) => { const count = Number(value); if (isTargets(count)) setTargets(count); },
              SIM_TARGETS.map((count) => ({ value: String(count), label: simCopy.targetsLabel(count) })))}
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
    maxKey: copy.maxKey, trend: copy.trend, popularity: metricsKey === "ladder" ? sourceCopy.share : copy.popularity, popularityShort: metricsKey === "ladder" ? sourceCopy.share : copy.popularityShort,
    dps: simCopy.dps, behind: simCopy.behind, rating: sourceCopy.rating, players: sourceCopy.players, winRate: sourceCopy.winRate,
  };
  const compareSpec = useCallback((entry: TierEntry) => {
    const spec = specInfo(specNames, entry.classSlug, entry.specSlug);
    return { specName: spec?.specName ?? entry.specName, className: spec?.className ?? entry.className, classSlug: entry.classSlug, specSlug: entry.specSlug };
  }, [specNames]);

  const ranking = compare ? (
    comparisonShown ? (
      <SourceCompare lang={lang} caption={`${title}: ${copy.modes[mode]} · ${copy.roles[role]}`} data={comparisonShown} sourceLabel={sourceLabel}
        classStyle={classStyle} tierStyle={tierStyle} renderSpec={(entry) => <SpecIcon entry={entry} size={36} />} specNames={compareSpec}
        href={talentsHref} busy={busy} />
    ) : comparison.loading ? <div className={styles.boardEmpty} aria-busy="true" /> : <p className={styles.empty}>{copy.empty}</p>
  ) : layout === "list" ? (
    <TierList entries={rows} labels={listLabels} href={talentsHref} busy={busy} empty={emptyText}
      format={{ compact, number: (value) => number.format(value), percent, behind }} trend={(value, change) => <Trend value={value} change={change} copy={copy} />} />
  ) : (
    <TierBoard entries={rows} labels={{ tier: copy.tierMark, talents: copy.talents, close: copy.close }} tip={tip} href={talentsHref} busy={busy} empty={emptyText} />
  );

  const layoutToggle = (
    <AtlasSegmented size="sm" className={styles.layoutToggle} aria-label={copy.view} value={compare ? "compare" : layout} onValueChange={(value) => setLayout(value === "list" || value === "compare" ? value : "tiers")}
      options={[
        { value: "tiers", label: copy.views.tiers, icon: <LayoutGrid aria-hidden="true" /> },
        { value: "list", label: copy.views.list, icon: <List aria-hidden="true" /> },
        ...(sample ? [] : [{ value: "compare", label: copy.views.compare, icon: <Columns3 aria-hidden="true" /> }]),
      ]} />
  );

  /** One quiet source line under the board: the open site, or the sites behind Gildra's tier. */
  const firstUrl = (activeRoles[role] ?? []).find((entry) => entry.sourceUrl?.startsWith("https://"))?.sourceUrl;
  const consensusNames = modeTabs.filter((id) => id !== "gildra" && id !== "sim").map(sourceLabel);
  const sourceLine = sample ? null : compare ? (
    comparison.data ? <p className={styles.sourceLine}>{copy.sourcesUsed}: {comparison.data.columns.map((column) => column.source === "ladder" ? sourceCopy.ladder : sourceLabel(column.source)).join(" · ")}</p> : null
  ) : source === "gildra" && mode === "pvp" ? (
    <p className={styles.sourceLine}>{sourceCopy.sourceBy}: <a href={LADDER_URL} target="_blank" rel="noopener noreferrer">{sourceCopy.ladder}<ArrowUpRight aria-hidden="true" /></a></p>
  ) : source === "gildra" ? (
    consensusNames.length ? <p className={styles.sourceLine}>{copy.sourcesUsed}: {consensusNames.join(" · ")}</p> : null
  ) : (
    <p className={styles.sourceLine}>
      {sourceCopy.sourceBy}:{" "}
      <a href={(source !== "sim" && firstUrl) || SOURCE_SITES[source].home} target="_blank" rel="noopener noreferrer">{SOURCE_SITES[source].name}<ArrowUpRight aria-hidden="true" /></a>
    </p>
  );

  return (
    <div className={styles.workspace} id={ANCHORS.tierList}>
      <AtlasSection id={ANCHORS.builds} className={styles.section} title={title}
        aside={<div className={styles.sectionAside}>{busy ? <span className={styles.count} aria-live="polite">{sim ? simCopy.loading : copy.updating}</span> : null}{layoutToggle}</div>}>
        <div className={styles.sectionBody}>
          {controls}
          <MaterialPlaque kit={KIT} className={styles.boardPlaque}>
            {list.error || comparison.error ? <p className={styles.alert} role="status">{sourceCopy.loadError}</p> : null}
            <AtlasSwap swapKey={held.key}>{ranking}</AtlasSwap>
          </MaterialPlaque>
        </div>
      </AtlasSection>
      {sourceLine}
    </div>
  );
}
