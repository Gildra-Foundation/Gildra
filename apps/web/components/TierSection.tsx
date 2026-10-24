"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Castle, ChevronDown, Search, Swords } from "lucide-react";
import { SpecSlot } from "./SpecSlot";
import { classIcon } from "@/lib/gameAssets";
import { p, type Lang } from "@/lib/i18n-paths";
import { ANCHORS } from "@/lib/anchors";
import type { GameIntelligence, TierActivity, TierContext, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { tierCopy, type KeyRange, type TierCopy } from "@/components/blocks/wow/tierWorkspace/tierCopy";
import styles from "@/components/blocks/wow/tierWorkspace/tierWorkspace.module.css";
import { lessMotion } from "@/lib/client/motionPreference";
import { tierSectionCopy } from "./tierSectionCopy";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import { SOURCE_META, SourceBadge, SourceCompare, useSourceRoles } from "@/components/blocks/wow/tierWorkspace/TierSources";
import { DEFAULT_SOURCE_DIFFICULTY, SOURCE_DIFFICULTIES, TIER_SOURCES, isTierSource, type ExternalTierSource, type TierSourceId, type TierSourceSlices } from "@/components/blocks/wow/tierWorkspace/tierSourceKeys";
import { tierSourcesCopy } from "@/components/blocks/wow/tierWorkspace/tierSourcesCopy";

const CLASS_KEYS: Record<string, string> = {
  "death-knight": "dk", "demon-hunter": "dh", evoker: "evoker", mage: "mage",
  paladin: "pal", rogue: "rogue", druid: "druid", priest: "priest",
  hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};
const ROLES = ["dps", "healer", "tank"] as const;
const ACTIVITIES = ["mythic_plus", "raid"] as const;
const KEY_RANGES: KeyRange[] = ["all", "high", "middle", "low"];
const EMPTY_ROLES: Record<TierRole, TierEntry[]> = { dps: [], healer: [], tank: [] };

function classKey(slug: string) { return CLASS_KEYS[slug] ?? slug; }
/** Class colour token — used only on spec identity (icon chip, class name). */
function classStyle(slug: string) { return { "--class-color": `var(--c-${classKey(slug)}, var(--atlas-text-muted))` } as CSSProperties; }
function fullSpecName(entry: TierEntry) { return `${entry.specName} ${entry.className}`; }
function entryKey(entry: TierEntry) { return `${entry.role}:${entry.classSlug}:${entry.specSlug}`; }
function contextKey(context: TierContext) { return `${context.selectionType}:${context.selectionId}:${context.addonKey}`; }
function contextLabel(context: TierContext) { return context.addonKey === "midnight" ? context.selectionName : `${context.selectionName} · ${context.addonName}`; }
function tierClass(tier: string) {
  const letter = tier.charAt(0).toLowerCase();
  return ["s", "a", "b", "c", "d"].includes(letter) ? letter : "b";
}
const isExternal = (href?: string) => Boolean(href && /^https?:\/\//.test(href));

function compact(value: number | undefined, lang: Lang) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat(tierSectionCopy[lang].numberLocale, {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1,
  }).format(value);
}

function Trend({ value, copy }: { value?: number; copy: TierCopy }) {
  if (!value) return <span className={styles.trendFlat}><span aria-hidden="true">—</span><span className={styles.srOnly}>{copy.trendFlat}</span></span>;
  const up = value > 0;
  return <span className={up ? styles.trendUp : styles.trendDown}><span aria-hidden="true">{up ? "▲" : "▼"} {Math.abs(value)}</span><span className={styles.srOnly}>{up ? copy.trendUp(value) : copy.trendDown(-value)}</span></span>;
}

function TierMark({ tier, copy, size = "md" }: { tier: string; copy: TierCopy; size?: "md" | "sm" }) {
  return <span className={size === "sm" ? `${styles.tierMark} ${styles.tierMarkSm}` : styles.tierMark} data-tier={tierClass(tier)}><span className={styles.srOnly}>{copy.tier} </span>{tier}</span>;
}

/** Localized spec and class names by spec slug (built on the server from the talent spec themes). */
export type TierSpecNames = Record<string, { specName: string; className: string }>;

/**
 * Interactive tier table of /tier-lists: source tabs (Gildra, mythicstats.com,
 * u.gg, Compare), role tabs, class filter and search, the ranked table and the
 * spec card. With live data it also offers dungeon / raid slices (fetched from
 * the meta API); with the saved sample (`sampleRoles` from the server) those
 * controls and the source tabs are not rendered, the page notice explains why.
 * Tab, mode, role and source raid difficulty are kept in the URL.
 */
export function TierSection({ lang, intelligence, sample = false, sampleRoles, specPaths = [], specNames, sourceSlices = {} }: { lang: Lang; intelligence: GameIntelligence; sample?: boolean; sampleRoles?: Record<TierRole, TierEntry[]>; specPaths?: string[]; specNames: TierSpecNames; sourceSlices?: TierSourceSlices }) {
  const copy = tierCopy[lang];
  const sourceCopy = tierSourcesCopy[lang];
  const [source, setSource] = useState<TierSourceId>("gildra");
  const [view, setView] = useState<"list" | "compare">("list");
  const [sourceDifficulty, setSourceDifficulty] = useState(DEFAULT_SOURCE_DIFFICULTY);
  const [urlRead, setUrlRead] = useState(false);
  const [activity, setActivity] = useState<TierActivity>("mythic_plus");
  const [role, setRole] = useState<TierRole>("dps");
  const [cls, setCls] = useState("all");
  const [q, setQ] = useState("");
  const [contextValue, setContextValue] = useState("all:all");
  const [keyType, setKeyType] = useState<KeyRange>("all");
  const [difficulty, setDifficulty] = useState("raid_hero");
  const [remoteRoles, setRemoteRoles] = useState<Record<TierRole, TierEntry[]> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("");
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const specPathSet = useMemo(() => new Set(specPaths), [specPaths]);

  const contexts = useMemo(() => {
    const unique = new Map<string, TierContext>();
    for (const context of intelligence.tierContexts ?? []) {
      if (context.activity !== activity || context.selectionType === "all") continue;
      unique.set(contextKey(context), context);
    }
    return [...unique.values()].sort((a, b) => a.selectionName.localeCompare(b.selectionName, lang === "ru" ? "ru" : "en"));
  }, [activity, intelligence.tierContexts, lang]);
  const selectedContext = contexts.find((context) => contextKey(context) === contextValue);
  /** The published "all dungeons" slice lets the key range work without picking a dungeon. */
  const allContext = useMemo(() => (intelligence.tierContexts ?? []).find((context) => context.activity === activity && context.selectionType === "all"), [activity, intelligence.tierContexts]);
  const queryContext = selectedContext ?? (activity === "mythic_plus" && keyType !== "all" ? allContext : undefined);
  const keyRangeEnabled = !sample && source === "gildra" && activity === "mythic_plus" && Boolean(selectedContext || allContext);
  const difficultyEnabled = !sample && activity === "raid" && Boolean(selectedContext);
  const raidDifficulties = useMemo(() => {
    if (!selectedContext || activity !== "raid") return ["raid_myth", "raid_hero", "raid_normal"];
    return [...new Set((intelligence.tierContexts ?? []).filter((item) => item.activity === "raid" && contextKey(item) === contextKey(selectedContext) && item.difficulty).map((item) => item.difficulty as string))];
  }, [activity, intelligence.tierContexts, selectedContext]);

  const suppliedRoles = intelligence.tierLists?.[activity]?.roles ?? (activity === "mythic_plus" ? intelligence.roles : undefined);
  const baseRoles = suppliedRoles ?? (sample && activity === "mythic_plus" && sampleRoles ? sampleRoles : EMPTY_ROLES);
  const external = source !== "gildra";
  const needUgg = source === "ugg" || view === "compare";
  const needStats = (source === "mythicstats" || view === "compare") && activity === "mythic_plus";
  const ugg = useSourceRoles(needUgg ? "ugg" : "gildra", activity, sourceDifficulty, sourceSlices);
  const stats = useSourceRoles(needStats ? "mythicstats" : "gildra", activity, sourceDifficulty, sourceSlices);
  const sourceState = source === "ugg" ? ugg : source === "mythicstats" ? stats : null;
  const activeRoles = sourceState ? sourceState.data?.roles ?? EMPTY_ROLES : remoteRoles ?? baseRoles;
  const localize = useCallback((entries: TierEntry[] = []) => entries.map((entry) => {
    const names = specNames[entry.specSlug] ?? specNames[`${entry.specSlug}-${entry.classSlug}`];
    return names ? { ...entry, ...names } : entry;
  }), [specNames]);
  const roleEntries = useMemo(() => localize(activeRoles[role]), [activeRoles, role, localize]);
  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    roleEntries.forEach((entry) => seen.set(entry.classSlug, entry.className));
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [roleEntries]);
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return roleEntries.filter((entry) => (cls === "all" || entry.classSlug === cls)
      && (!query || `${entry.specName} ${entry.className}`.toLowerCase().includes(query)));
  }, [roleEntries, cls, q]);
  const groups = useMemo(() => {
    const result: { tier: string; rows: TierEntry[] }[] = [];
    for (const entry of filtered) {
      const group = result.find((item) => item.tier === entry.tier);
      if (group) group.rows.push(entry); else result.push({ tier: entry.tier, rows: [entry] });
    }
    return result;
  }, [filtered]);
  const selected = roleEntries.find((entry) => entryKey(entry) === selectedSlug) ?? filtered[0] ?? roleEntries[0];
  const maxScore = Math.max(...roleEntries.map((entry) => entry.score ?? 0), 1);
  const rate = (entry: TierEntry) => (role === "healer" ? entry.averageHps : entry.averageDps);
  const rateLabel = role === "healer" ? "HPS" : "DPS";
  const hasScore = roleEntries.some((entry) => entry.score !== undefined);
  const hasRate = roleEntries.some((entry) => rate(entry) !== undefined);
  const hasKey = activity === "mythic_plus" && roleEntries.some((entry) => entry.maxKey);
  const hasTrend = roleEntries.some((entry) => entry.rankChange !== undefined);
  const hasPopularity = external && roleEntries.some((entry) => entry.popularity !== undefined);
  const scopeName = selectedContext ? contextLabel(selectedContext) : activity === "mythic_plus" ? copy.allDungeons : copy.allRaids;
  const scopeDetail = external || view === "compare" ? (activity === "raid" ? (sourceDifficulty === "all" ? sourceCopy.allDifficulties : copy.difficulties[sourceDifficulty]) : "")
    : activity === "mythic_plus"
    ? (queryContext || keyType !== "all" ? copy.keys[keyType] : "")
    : (selectedContext ? copy.difficulties[difficulty] ?? difficulty : "");
  const updated = Date.parse(intelligence.updatedAt) > 0
    ? new Intl.DateTimeFormat(tierSectionCopy[lang].dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(intelligence.updatedAt))
    : "";
  const number = new Intl.NumberFormat(tierSectionCopy[lang].numberLocale);

  const specHref = (entry: TierEntry) => {
    const match = [`${entry.classSlug}/${entry.specSlug}`, `${entry.classSlug}/${entry.specSlug}-${entry.classSlug}`].find((path) => specPathSet.has(path));
    return match ? p(lang, `/wow/classes/${match}`) : undefined;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sourceParam = params.get("source");
    if (sourceParam === "compare") setView("compare");
    else if (isTierSource(sourceParam)) setSource(sourceParam);
    const roleParam = params.get("role");
    if (roleParam === "healer" || roleParam === "tank") setRole(roleParam);
    const difficultyParam = params.get("difficulty");
    if (difficultyParam && SOURCE_DIFFICULTIES.includes(difficultyParam)) setSourceDifficulty(difficultyParam);
    setUrlRead(true);
    if (params.get("activity") !== "raid" || sourceParam === "mythicstats") return;
    setActivity("raid");
    setContextValue("all:all");
    setRemoteRoles(null);
    setSelectedSlug("");
    setCls("all");
    setQ("");
  }, []);

  /** Tab, mode, role and source raid difficulty live in the URL so a view can be shared. */
  useEffect(() => {
    if (!urlRead) return;
    const url = new URL(window.location.href);
    const set = (key: string, value: string, fallback: string) => { if (value === fallback) url.searchParams.delete(key); else url.searchParams.set(key, value); };
    set("source", view === "compare" ? "compare" : source, "gildra");
    set("activity", activity, "mythic_plus");
    set("role", role, "dps");
    set("difficulty", (external || view === "compare") && activity === "raid" ? sourceDifficulty : DEFAULT_SOURCE_DIFFICULTY, DEFAULT_SOURCE_DIFFICULTY);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [urlRead, source, view, activity, role, sourceDifficulty, external]);

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
        activity,
        role: value,
        limit: "60",
        selectionType: queryContext.selectionType,
        selectionId: queryContext.selectionId,
        addon: queryContext.addonKey,
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
    setSelectedSlug("");
    setCls("all");
    setQ("");
  };

  const chooseTab = (id: string) => {
    if (id !== "compare" && !isTierSource(id)) return;
    setView(id === "compare" ? "compare" : "list");
    setSource(id === "compare" ? "gildra" : id);
    setSelectedSlug("");
    setCls("all");
    if (id === "mythicstats" && activity === "raid") switchActivity("mythic_plus");
  };

  const chooseRole = (value: TierRole) => {
    setRole(value);
    setCls("all");
    setSelectedSlug("");
  };

  const chooseContext = (value: string) => {
    setContextValue(value);
    setSelectedSlug("");
    if (activity !== "raid") return;
    const next = contexts.find((item) => contextKey(item) === value);
    if (!next) return;
    const available = (intelligence.tierContexts ?? []).filter((item) => item.activity === "raid" && contextKey(item) === value && item.difficulty).map((item) => item.difficulty as string);
    if (!available.includes(difficulty) && available[0]) setDifficulty(available[0]);
  };

  /** On one-column layouts the card sits under the table: bring it into view. */
  const selectEntry = (entry: TierEntry) => {
    setSelectedSlug(entryKey(entry));
    if (!window.matchMedia("(max-width: 1199px)").matches) return;
    window.requestAnimationFrame(() => {
      const reduce = lessMotion();
      document.getElementById("spec-detail")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      detailTitle.current?.focus({ preventScroll: true });
    });
  };

  const contentOptions = (
    <>
      <option value="all:all">{activity === "mythic_plus" ? copy.allDungeons : copy.allRaids}</option>
      {contexts.filter((item) => item.selectionType !== "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}
      {activity === "raid" && contexts.some((item) => item.selectionType === "boss")
        ? <optgroup label={copy.bosses}>{contexts.filter((item) => item.selectionType === "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}</optgroup>
        : null}
    </>
  );
  const controlsHint = sample ? ""
    : source === "mythicstats" ? sourceCopy.noRaid
    : external ? ""
    : activity === "mythic_plus" && !keyRangeEnabled ? copy.pickDungeonFirst
      : activity === "raid" && !difficultyEnabled ? copy.pickRaidFirst : "";
  // The sample has no slices and only Mythic+ DPS rows: controls that could only lead to an empty table are not rendered.
  const showModes = !sample || Boolean(intelligence.tierLists?.raid);
  const visibleRoles = sample ? ROLES.filter((value) => (activeRoles[value]?.length ?? 0) > 0) : [...ROLES];
  const showRoleTabs = visibleRoles.length > 1;

  const metrics = selected ? [
    selected.score !== undefined ? { label: copy.score, value: compact(selected.score, lang) } : null,
    selected.averageDps !== undefined && (role !== "healer" || selected.averageHps === undefined) ? { label: "DPS", value: compact(selected.averageDps, lang) } : null,
    selected.averageHps !== undefined && (role === "healer" || selected.averageDps === undefined) ? { label: "HPS", value: compact(selected.averageHps, lang) } : null,
    activity === "mythic_plus" && selected.maxKey ? { label: copy.maxKey, value: `+${number.format(selected.maxKey)}` } : null,
    activity === "raid" && selectedContext ? { label: copy.difficulty, value: copy.difficulties[difficulty] ?? difficulty } : null,
    selected.rankChange !== undefined ? { label: copy.weeklyChange, value: <Trend value={selected.rankChange} copy={copy} /> } : null,
    selected.popularity ? { label: copy.popularity, value: `${number.format(Number((selected.popularity * 100).toFixed(1)))}%` } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null) : [];
  const selectedGuide = selected?.guideUrl || (isExternal(selected?.sourceUrl) ? selected?.sourceUrl : undefined);
  const selectedGuideLabel = external ? sourceCopy.openOn(SOURCE_META[source as ExternalTierSource].site) : selected?.guideUrl ? copy.openGuide : copy.openSource;
  const selectedSpecPage = selected ? specHref(selected) : undefined;

  const sourceLabel = (id: TierSourceId) => id === "gildra" ? "Gildra" : SOURCE_META[id].name;
  const activeTab = view === "compare" ? "compare" : source;
  const externalSource = external ? source as ExternalTierSource : null;
  const badge = externalSource
    ? <SourceBadge lang={lang} source={externalSource} activity={activity} role={role} difficulty={sourceDifficulty} updatedAt={sourceState?.data?.updatedAt} />
    : null;
  const busy = isLoading || Boolean(sourceState?.loading);

  const head = (
    <div className={styles.resultsHead}>
      <div className={styles.resultsCopy}>
        <h2 id="tier-results-title" className={styles.resultsTitle}>{view === "compare" ? sourceCopy.compareTitle : activity === "mythic_plus" ? copy.resultsMythic : copy.resultsRaid}</h2>
        <p className={styles.resultsMeta}>{external ? `${sourceLabel(source)} · ` : ""}{scopeName}{scopeDetail ? ` · ${scopeDetail}` : ""}{showRoleTabs ? "" : ` · ${copy.roles[role]}`}</p>
      </div>
      {busy ? <span className={styles.count} aria-live="polite">{copy.updating}</span> : null}
    </div>
  );

  const controls = showModes ? (
    <div className={styles.controls} role="group" aria-label={copy.controlsLabel}>
      <div className={styles.field}>
        <span className={styles.label} id="tier-mode-label">{copy.mode}</span>
        <div className={styles.segmented} role="group" aria-labelledby="tier-mode-label">
          {ACTIVITIES.map((value) => {
            const off = value === "raid" && source === "mythicstats" && view === "list";
            return (
              <button type="button" key={value} className={styles.segment} aria-pressed={activity === value} disabled={off} title={off ? sourceCopy.mythicPlusOnly : undefined} onClick={() => switchActivity(value)}>
                {value === "mythic_plus" ? <Swords aria-hidden="true" /> : <Castle aria-hidden="true" />}{copy.modes[value]}
              </button>
            );
          })}
        </div>
      </div>
      {!sample && !external && view === "list" ? (
        <>
          <div className={`${styles.field} ${styles.fieldGrow}`}>
            <label className={styles.label} htmlFor="tier-content">{copy.content}</label>
            <span className={styles.selectShell}>
              <select id="tier-content" className={styles.select} value={contextValue} onChange={(event) => chooseContext(event.target.value)} disabled={!contexts.length}>{contentOptions}</select>
              <ChevronDown aria-hidden="true" />
            </span>
          </div>
          {activity === "mythic_plus" ? (
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.label} id="tier-key-label">{copy.keyRange}</span>
              <div className={`${styles.segmented} ${styles.segmentedFour}`} role="group" aria-labelledby="tier-key-label">
                {KEY_RANGES.map((value) => (
                  <button type="button" key={value} className={styles.segment} aria-pressed={keyType === value} disabled={!keyRangeEnabled} onClick={() => setKeyType(value)}>{copy.keys[value]}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.label} id="tier-difficulty-label">{copy.difficulty}</span>
              <div className={styles.segmented} role="group" aria-labelledby="tier-difficulty-label">
                {raidDifficulties.map((value) => (
                  <button type="button" key={value} className={styles.segment} aria-pressed={difficultyEnabled && difficulty === value} disabled={!difficultyEnabled} onClick={() => setDifficulty(value)}>{copy.difficulties[value] ?? value}</button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
      {(source === "ugg" || view === "compare") && activity === "raid" ? (
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label} id="tier-source-difficulty-label">{copy.difficulty}</span>
          <div className={`${styles.segmented} ${styles.segmentedFour}`} role="group" aria-labelledby="tier-source-difficulty-label">
            {SOURCE_DIFFICULTIES.map((value) => (
              <button type="button" key={value} className={styles.segment} aria-pressed={sourceDifficulty === value} onClick={() => setSourceDifficulty(value)}>{value === "all" ? sourceCopy.allDifficulties : copy.difficulties[value]}</button>
            ))}
          </div>
        </div>
      ) : null}
      {controlsHint && view === "list" ? <p className={styles.controlsHint}>{controlsHint}</p> : null}
    </div>
  ) : null;

  const roleTabs = showRoleTabs ? (
    <div className={styles.roleTabs} role="group" aria-label={copy.role}>
      {visibleRoles.map((value) => (
        <button type="button" key={value} className={styles.roleTab} aria-pressed={role === value} onClick={() => chooseRole(value)}>
          {copy.roles[value]}{view === "list" ? <span className={styles.roleCount}>{activeRoles[value]?.length ?? 0}</span> : null}
        </button>
      ))}
    </div>
  ) : null;

  const list = (
    <>
      <div className={styles.filters}>
        <span className={styles.searchShell}>
          <Search aria-hidden="true" />
          <input type="search" className={styles.search} placeholder={copy.searchPlaceholder} aria-label={copy.search} value={q} onChange={(event) => setQ(event.target.value)} />
        </span>
        {classes.length ? (
          <div className={styles.chips} role="group" aria-label={copy.classFilter} data-scrollbox>
            <button type="button" className={styles.chip} aria-pressed={cls === "all"} onClick={() => setCls("all")}>{copy.allClasses}</button>
            {classes.map(([slug, name]) => {
              const icon = classIcon(classKey(slug));
              return (
                <button type="button" className={styles.chip} aria-pressed={cls === slug} onClick={() => setCls(slug)} key={slug} style={classStyle(slug)}>
                  {icon ? <Image className={styles.chipIcon} src={icon} alt="" width={20} height={20} /> : null}{name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {loadError && !external ? <p className={styles.alert} role="status">{loadError}</p> : null}
      {sourceState?.error ? <p className={styles.alert} role="status">{sourceCopy.loadError}</p> : null}

      <div className={styles.tableBox} aria-busy={busy} data-loading={busy || undefined} data-scrollbox>
        {filtered.length ? (
          <table className={styles.table}>
            <caption className={styles.srOnly}>{copy.tableCaption(scopeName, copy.roles[role])}</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.colTier}>{copy.tier}</th>
                <th scope="col">{copy.spec}</th>
                {hasScore ? <th scope="col" className={styles.num}>{copy.score}</th> : null}
                {hasRate ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{rateLabel}</th> : null}
                {hasKey ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{copy.maxKey}</th> : null}
                {hasTrend ? <th scope="col" className={styles.num}>{copy.trend}</th> : null}
                {hasPopularity ? <th scope="col" className={`${styles.num} ${styles.secondary}`}>{copy.popularity}</th> : null}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.tier} className={styles.group} data-tier={tierClass(group.tier)}>
                {group.rows.map((entry, index) => {
                  const isSelected = Boolean(selected && entryKey(selected) === entryKey(entry));
                  return (
                    <tr key={entryKey(entry)} className={isSelected ? styles.selectedRow : undefined}>
                      {index === 0 ? <th scope="rowgroup" rowSpan={group.rows.length} className={styles.tierCell}><TierMark tier={group.tier} copy={copy} /></th> : null}
                      <td className={styles.specCell}>
                        <div className={styles.specInner}>
                        <SpecSlot name={fullSpecName(entry)} cls={classKey(entry.classSlug)} classSlug={entry.classSlug} specSlug={entry.specSlug} />
                        <button type="button" className={styles.specButton} style={classStyle(entry.classSlug)} aria-controls="spec-detail" aria-current={isSelected ? "true" : undefined} onClick={() => selectEntry(entry)}>
                          <span className={styles.specName}>{entry.specName}</span>
                          <span className={styles.className}>{entry.className}{entry.group && sourceCopy.group[entry.group] ? <span className={styles.groupTag}> · {sourceCopy.group[entry.group]}</span> : null}</span>
                        </button>
                        </div>
                      </td>
                      {hasScore ? (
                        <td className={`${styles.num} ${styles.score}`}>
                          {compact(entry.score, lang)}
                          <span className={styles.scoreBar} aria-hidden="true"><i style={{ width: `${entry.score ? Math.max(5, entry.score / maxScore * 100) : 0}%` }} /></span>
                        </td>
                      ) : null}
                      {hasRate ? <td className={`${styles.num} ${styles.secondary}`}>{compact(rate(entry), lang)}</td> : null}
                      {hasKey ? <td className={`${styles.num} ${styles.secondary}`}>{entry.maxKey ? `+${number.format(entry.maxKey)}` : "—"}</td> : null}
                      {hasTrend ? <td className={styles.num}><Trend value={entry.rankChange} copy={copy} /></td> : null}
                      {hasPopularity ? <td className={`${styles.num} ${styles.secondary}`}>{entry.popularity ? `${number.format(Number((entry.popularity * 100).toFixed(1)))}%` : "—"}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        ) : busy ? null : (
          <p className={styles.empty}>{sample && !roleEntries.length ? copy.emptySample : copy.empty}</p>
        )}
        {busy ? <div className={styles.loading} role="status"><span aria-hidden="true" /><b>{copy.loadingSlice}</b></div> : null}
      </div>

      {!external && !sample && intelligence.sources.length ? (
        <div className={styles.sources}>
          <h3 className={styles.sourcesTitle}>{copy.sourceTitle}</h3>
          <p>{queryContext ? copy.sourceSlice : copy.sourceOverall}</p>
          <ul className={styles.sourceList}>
            {intelligence.sources.map((item) => (
              <li key={item.slug}>
                <span className={styles.sourceName}>{item.provider}</span>
                <span className={styles.sourceStatus} data-status={item.status}>{copy.sourceStatus[item.status] ?? item.status}</span>
                <span className={styles.sourceCount}>{copy.records(number.format(item.recordCount))}</span>
              </li>
            ))}
          </ul>
          {updated ? <p className={styles.updated}>{copy.updated}: <time dateTime={intelligence.updatedAt}>{updated} UTC</time></p> : null}
        </div>
      ) : null}
    </>
  );

  const compareView = view === "compare" ? (
    <SourceCompare
      lang={lang}
      activity={activity}
      role={role}
      classStyle={classStyle}
      renderSpec={(entry) => <SpecSlot name={`${entry.specName} ${entry.className}`} cls={classKey(entry.classSlug)} classSlug={entry.classSlug} specSlug={entry.specSlug} />}
      columns={[
        { id: "gildra" as const, label: "Gildra", short: "Gildra", entries: localize(baseRoles[role]) },
        ...(activity === "mythic_plus" ? [{ id: "mythicstats" as const, label: "mythicstats.com", short: "MS", entries: stats.data && localize(stats.data.roles[role]) }] : []),
        { id: "ugg" as const, label: "u.gg", short: "u.gg", entries: ugg.data && localize(ugg.data.roles[role]) },
      ]}
    />
  ) : null;

  const body = (
    <>
      {head}
      {badge}
      {controls}
      {roleTabs}
      {view === "compare" ? compareView : list}
    </>
  );
  const tabs = [
    ...TIER_SOURCES.map((id) => ({ id, label: sourceLabel(id), count: id === "gildra" ? sourceCopy.gildraHint : id === "mythicstats" ? "M+" : undefined })),
    { id: "compare", label: sourceCopy.compare },
  ];

  return (
    <div className={styles.workspace} id={ANCHORS.tierList}>
      <section className={styles.main} id={ANCHORS.builds} aria-labelledby="tier-results-title">
        {!sample ? (
          <AtlasTabs className={styles.sourceTabs} label={sourceCopy.tabsLabel} value={activeTab} onChange={chooseTab}
            tabs={tabs.map((tab) => ({ ...tab, content: tab.id === activeTab ? <div className={styles.sourcePanel}>{body}</div> : null }))} />
        ) : body}
      </section>

      <aside className={styles.detail} id="spec-detail" aria-labelledby={selected ? "spec-detail-title" : undefined} aria-label={selected ? undefined : copy.detailLabel}>
        <p className={styles.detailEyebrow}>{copy.detailLabel}</p>
        {selected ? (
          <>
            <div className={styles.detailHead}>
              <SpecSlot name={fullSpecName(selected)} cls={classKey(selected.classSlug)} classSlug={selected.classSlug} specSlug={selected.specSlug} size="lg" />
              <div className={styles.detailName} style={classStyle(selected.classSlug)}>
                <h2 id="spec-detail-title" ref={detailTitle} tabIndex={-1} className={styles.detailTitle}>{selected.specName} <span className={styles.className}>{selected.className}</span></h2>
                <p className={styles.detailRank}><TierMark tier={selected.tier} copy={copy} size="sm" />{copy.rankLine(selected.rank, copy.roles[selected.role] ?? copy.roles[role])}</p>
              </div>
            </div>
            {metrics.length ? (
              <dl className={styles.metrics}>
                {metrics.map((item) => <div key={item.label} className={styles.metric}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
              </dl>
            ) : null}
            {selectedGuide || selectedSpecPage ? (
              <div className={styles.detailActions}>
                {selectedGuide ? <a className={`${styles.action} ${styles.actionPrimary}`} href={selectedGuide} target="_blank" rel="noreferrer">{selectedGuideLabel}<ArrowUpRight aria-hidden="true" /></a> : null}
                {selectedSpecPage ? <Link className={selectedGuide ? styles.action : `${styles.action} ${styles.actionPrimary}`} href={selectedSpecPage}>{copy.specPage}</Link> : null}
              </div>
            ) : null}
          </>
        ) : <p className={styles.detailEmpty}>{sample ? copy.emptySample : copy.noRows}</p>}
      </aside>

    </div>
  );
}
