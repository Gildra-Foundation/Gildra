"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Castle, ChevronDown, Layers3, Map as MapIcon, Shield, Sparkles, Swords } from "lucide-react";
import { SpecSlot } from "./SpecSlot";
import { classIcon } from "@/lib/gameAssets";
import { AdSlot } from "./AdSlot";
import { p, t as tr, type Lang } from "@/lib/i18n";
import type { GameIntelligence, TierActivity, TierContext, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { specPages } from "@/lib/specs";

const CLASS_KEYS: Record<string, string> = {
  "death-knight": "dk", "demon-hunter": "dh", evoker: "evoker", mage: "mage",
  paladin: "pal", rogue: "rogue", druid: "druid", priest: "priest",
  hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};

const ROLE_LABELS: Record<TierRole, { en: string; ru: string }> = {
  dps: { en: "DPS", ru: "БОЙЦЫ" }, healer: { en: "Healers", ru: "ЛЕКАРИ" }, tank: { en: "Tanks", ru: "ТАНКИ" },
};

const CLASS_SLUGS: Record<string, string> = {
  dk: "death-knight", dh: "demon-hunter", evoker: "evoker", mage: "mage",
  pal: "paladin", rogue: "rogue", druid: "druid", priest: "priest",
  hunter: "hunter", shaman: "shaman", lock: "warlock", monk: "monk", war: "warrior",
};

const fixedPreviewDps: TierEntry[] = specPages.map((entry) => ({
  rank: entry.rank,
  tier: entry.tier.toUpperCase(),
  role: "dps",
  className: entry.className,
  classSlug: CLASS_SLUGS[entry.row.spec.cls] ?? entry.row.spec.cls,
  specName: entry.row.spec.name.replace(new RegExp(` ${entry.className}$`), ""),
  specSlug: entry.slug,
  score: Number(entry.row.score),
  popularity: Number(entry.row.pop.replace("%", "")) / 100,
  maxKey: Number(entry.row.key.replace("+", "")),
  rankChange: entry.row.trend.dir === "up" ? entry.row.trend.val : entry.row.trend.dir === "down" ? -(entry.row.trend.val ?? 0) : 0,
  sourceUrl: `/specs/${entry.slug}`,
}));

const emptyRoles: Record<TierRole, TierEntry[]> = { dps: [], healer: [], tank: [] };
const fixedPreviewRoles: Record<TierRole, TierEntry[]> = { ...emptyRoles, dps: fixedPreviewDps };

function classKey(slug: string) { return CLASS_KEYS[slug] ?? slug; }
function fullSpecName(entry: TierEntry) { return `${entry.specName} ${entry.className}`; }
function entryKey(entry: TierEntry) { return `${entry.role}:${entry.classSlug}:${entry.specSlug}`; }
function contextKey(context: TierContext) { return `${context.selectionType}:${context.selectionId}:${context.addonKey}`; }
function contextLabel(context: TierContext) { return context.addonKey === "midnight" ? context.selectionName : `${context.selectionName} · ${context.addonName}`; }
function tierClass(tier: string) {
  return (["s", "a", "b", "c", "d"].includes(tier.charAt(0).toLowerCase()) ? tier.charAt(0).toLowerCase() : "b");
}

const KEY_LABELS = {
  all: { en: "All keys", ru: "Все ключи" },
  high: { en: "+15 and above", ru: "+15 и выше" },
  middle: { en: "+7 to +14", ru: "+7–14" },
  low: { en: "+2 to +6", ru: "+2–6" },
} as const;

const DIFFICULTY_LABELS = {
  raid_myth: { en: "Mythic", ru: "Эпохальный" },
  raid_hero: { en: "Heroic", ru: "Героический" },
  raid_normal: { en: "Normal", ru: "Обычный" },
  raid_h10: { en: "Heroic 10", ru: "Героический 10" },
  raid_h25: { en: "Heroic 25", ru: "Героический 25" },
  raid_n10: { en: "Normal 10", ru: "Обычный 10" },
  raid_n25: { en: "Normal 25", ru: "Обычный 25" },
} as const;

function difficultyLabel(value: string, lang: Lang) {
  return DIFFICULTY_LABELS[value as keyof typeof DIFFICULTY_LABELS]?.[lang] ?? value;
}

function compact(value: number | undefined, lang: Lang) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1,
  }).format(value);
}

function Trend({ value }: { value?: number }) {
  if (!value) return <span className="flat">—</span>;
  return <span className={value > 0 ? "up" : "down"}>{value > 0 ? "▲" : "▼"} {Math.abs(value)}</span>;
}

export function TierSection({ lang, intelligence }: { lang: Lang; intelligence: GameIntelligence }) {
  const tt = tr(lang);
  const [activity, setActivity] = useState<TierActivity>("mythic_plus");
  const [role, setRole] = useState<TierRole>("dps");
  const [cls, setCls] = useState("all");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const [contextValue, setContextValue] = useState("all:all");
  const [keyType, setKeyType] = useState<"all" | "high" | "middle" | "low">("all");
  const [difficulty, setDifficulty] = useState("raid_hero");
  const [remoteRoles, setRemoteRoles] = useState<Record<TierRole, TierEntry[]> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const contexts = useMemo(() => {
    const unique = new Map<string, TierContext>();
    for (const context of intelligence.tierContexts ?? []) {
      if (context.activity !== activity || context.selectionType === "all") continue;
      unique.set(contextKey(context), context);
    }
    return [...unique.values()].sort((a, b) => a.selectionName.localeCompare(b.selectionName, lang === "ru" ? "ru" : "en"));
  }, [activity, intelligence.tierContexts, lang]);
  const selectedContext = contexts.find((context) => contextKey(context) === contextValue);
  const raidDifficulties = useMemo(() => {
    if (!selectedContext || activity !== "raid") return ["raid_myth", "raid_hero", "raid_normal"];
    return [...new Set((intelligence.tierContexts ?? []).filter((item) => item.activity === "raid" && contextKey(item) === contextKey(selectedContext) && item.difficulty).map((item) => item.difficulty as string))];
  }, [activity, intelligence.tierContexts, selectedContext]);
  const suppliedRoles = intelligence.tierLists?.[activity]?.roles ?? (activity === "mythic_plus" ? intelligence.roles : undefined);
  const usingFixedPreview = !suppliedRoles && activity === "mythic_plus";
  const baseRoles = suppliedRoles ?? (usingFixedPreview ? fixedPreviewRoles : emptyRoles);
  const providerLabel = usingFixedPreview
    ? (lang === "ru" ? "Фиксированные данные интерфейса" : "Fixed interface data")
    : intelligence.providerLabel;
  const activeRoles = remoteRoles ?? baseRoles;
  const roleEntries = activeRoles?.[role] ?? [];
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
  const [selectedSlug, setSelectedSlug] = useState("");
  const selected = roleEntries.find((entry) => entryKey(entry) === selectedSlug) ?? filtered[0] ?? roleEntries[0];
  const maxScore = Math.max(...roleEntries.map((entry) => entry.score ?? 0), 1);
  const updated = Date.parse(intelligence.updatedAt) > 0
    ? new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(intelligence.updatedAt))
    : "—";

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("activity") !== "raid") return;
    setActivity("raid");
    setContextValue("all:all");
    setRemoteRoles(null);
    setSelectedSlug("");
    setCls("all");
    setQ("");
  }, []);

  useEffect(() => {
    if (!selectedContext) {
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
        selectionType: selectedContext.selectionType,
        selectionId: selectedContext.selectionId,
        addon: selectedContext.addonKey,
      });
      if (activity === "mythic_plus") params.set("keyType", keyType);
      if (activity === "raid") params.set("difficulty", difficulty);
      return params;
    };
    Promise.all(((["dps", "healer", "tank"] as const)).map(async (value) => {
      const response = await fetch(`/v1/meta/wow/tier-list?${paramsFor(value)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`tier list request failed (${response.status})`);
      const snapshot = await response.json() as { entries: TierEntry[] };
      return [value, snapshot.entries] as const;
    })).then((items) => {
      setRemoteRoles(Object.fromEntries(items) as Record<TierRole, TierEntry[]>);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRemoteRoles(null);
      setLoadError(lang === "ru" ? "Не удалось загрузить выбранный срез. Показан общий рейтинг." : "The selected slice could not be loaded. Showing the overall ranking.");
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [activity, difficulty, keyType, lang, selectedContext]);

  const switchActivity = (value: TierActivity) => {
    setActivity(value);
    setContextValue("all:all");
    setRemoteRoles(null);
    setSelectedSlug("");
    setCls("all");
    setQ("");
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

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* Clipboard access is optional. */ }
  };

  return (
    <div className="tierpage" id="tierlist">
      <aside className="tp-side">
        <div className="tp-brand"><Image className="logo-mark" src="/brand/helmet.png" alt="" width={24} height={24} /><span className="t">{tt("TIER LISTS")}</span></div>
        <div className="tp-nav" aria-label={lang === "ru" ? "Тип рейтинга" : "Ranking type"}>
          <button type="button" className={activity === "mythic_plus" ? "active" : ""} onClick={() => switchActivity("mythic_plus")} aria-pressed={activity === "mythic_plus"}><Swords aria-hidden="true" /> Mythic+</button>
          <button type="button" className={activity === "raid" ? "active" : ""} onClick={() => { setActivity("raid"); setContextValue("all:all"); setRemoteRoles(null); setSelectedSlug(""); setCls("all"); setQ(""); }} aria-pressed={activity === "raid"}><Shield aria-hidden="true" />{tt("Raid")}</button>
        </div>
        <div className="filters-panel">
          <div className="fgroup"><label htmlFor="tier-content-side">{lang === "ru" ? "Контент" : "Content"}</label><select id="tier-content-side" value={contextValue} onChange={(event) => chooseContext(event.target.value)}><option value="all:all">{activity === "mythic_plus" ? (lang === "ru" ? "Все подземелья" : "All dungeons") : (lang === "ru" ? "Все рейды" : "All raids")}</option>{contexts.filter((item) => item.selectionType !== "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}</select></div>
          <div className="fgroup"><label>{lang === "ru" ? "Роль" : "Role"}</label><div className="seg">{(["dps", "healer", "tank"] as const).map((value) => <button type="button" className={role === value ? "on" : ""} onClick={() => { setRole(value); setCls("all"); setSelectedSlug(""); }} key={value}>{ROLE_LABELS[value][lang]}</button>)}</div></div>
          {activity === "mythic_plus" ? <div className="fgroup"><label htmlFor="tier-key-side">{lang === "ru" ? "Уровень ключа" : "Key range"}</label><select id="tier-key-side" value={keyType} onChange={(event) => setKeyType(event.target.value as typeof keyType)}>{Object.entries(KEY_LABELS).map(([value, label]) => <option value={value} key={value}>{label[lang]}</option>)}</select></div> : <div className="fgroup"><label>{lang === "ru" ? "Сложность" : "Difficulty"}</label><div className="seg seg-stack">{raidDifficulties.map((value) => <button type="button" className={difficulty === value ? "on" : ""} onClick={() => setDifficulty(value)} key={value}>{difficultyLabel(value, lang)}</button>)}</div></div>}
          <div className="fgroup"><label>{lang === "ru" ? "Источник" : "Source"}</label><strong>{providerLabel}</strong><small>{updated} UTC</small></div>
        </div>
        <div className="about"><b><svg className="i"><use href="#ic-info" /></svg>{usingFixedPreview ? (lang === "ru" ? "Фиксированный набор интерфейса" : "Fixed interface dataset") : (lang === "ru" ? "Данные провайдера" : "Provider data")}</b>{usingFixedPreview ? (lang === "ru" ? "Сохранённые строки восстановлены локально и явно помечены; они не выдаются за текущий API-снимок." : "The saved rows are restored locally and explicitly labeled; they are not presented as a current API snapshot.") : (lang === "ru" ? "Тиры публикуются из Wowhead, числовые метрики дополняются совпадающим срезом wow.gg." : "Tiers are published from Wowhead; numeric metrics are enriched from the matching wow.gg snapshot.")}</div>
        <div className="filters-panel">{intelligence.sources.map((source) => <div className="fgroup" key={source.slug}><label>{source.provider}</label><span className={`library-freshness is-${source.status}`}><i />{source.status} · {source.recordCount}</span></div>)}</div>
        <AdSlot variant="rect" lang={lang} />
        <div className="side-live"><span className="pulse" />{lang === "ru" ? "API-снимок" : "API snapshot"} · {intelligence.version}</div>
      </aside>

      <div className="tp-center">
        <div className="crumbs"><Link href={p(lang, "/")}>{tt("Home")}</Link><span className="sep">›</span><span>{lang === "ru" ? "Тир-листы" : "Tier Lists"}</span><span className="sep">›</span><span>{activity === "mythic_plus" ? "Mythic+" : (lang === "ru" ? "Рейды" : "Raids")}</span></div>
        <div className="tp-title"><h1>{activity === "mythic_plus" ? tt("MYTHIC+ TIER LIST") : (lang === "ru" ? "РЕЙДОВЫЙ ТИР-ЛИСТ" : "RAID TIER LIST")}</h1><span className="dia">◆</span><span className="rule" /></div>
        <div className="tp-sub">{lang === "ru" ? "Живой рейтинг специализаций по данным последних боёв" : "Live specialization rankings from the latest combat data"}</div>

        <section className={`content-scope is-${activity}`} aria-label={lang === "ru" ? "Выбор контента" : "Content selection"}>
          <div className="scope-emblem" aria-hidden="true">{activity === "mythic_plus" ? <MapIcon /> : <Castle />}</div>
          <div className="scope-copy"><span><Sparkles aria-hidden="true" /> {selectedContext?.addonName ?? "Midnight"} · Season 1</span><strong>{selectedContext?.selectionName ?? (activity === "mythic_plus" ? (lang === "ru" ? "Все подземелья сезона" : "All season dungeons") : (lang === "ru" ? "Все рейды сезона" : "All season raids"))}</strong><small>{activity === "mythic_plus" ? (lang === "ru" ? "Рейтинг по прохождениям ключей" : "Ranked from completed keystone runs") : (lang === "ru" ? `${difficultyLabel(difficulty, lang)} режим` : `${difficultyLabel(difficulty, lang)} difficulty`)}</small></div>
          <label className="scope-select"><span>{lang === "ru" ? "Подземелье / рейд" : "Dungeon / raid"}</span><span className="select-shell"><select value={contextValue} onChange={(event) => chooseContext(event.target.value)}><option value="all:all">{activity === "mythic_plus" ? (lang === "ru" ? "Все подземелья" : "All dungeons") : (lang === "ru" ? "Все рейды" : "All raids")}</option>{contexts.filter((item) => item.selectionType !== "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}{activity === "raid" && contexts.some((item) => item.selectionType === "boss") ? <optgroup label={lang === "ru" ? "Отдельные боссы" : "Individual bosses"}>{contexts.filter((item) => item.selectionType === "boss").map((item) => <option key={contextKey(item)} value={contextKey(item)}>{contextLabel(item)}</option>)}</optgroup> : null}</select><ChevronDown aria-hidden="true" /></span></label>
          <div className="scope-mode" aria-label={lang === "ru" ? "Режим контента" : "Content mode"}><button type="button" className={activity === "mythic_plus" ? "on" : ""} onClick={() => switchActivity("mythic_plus")}><Swords aria-hidden="true" />Mythic+</button><button type="button" className={activity === "raid" ? "on" : ""} onClick={() => switchActivity("raid")}><Shield aria-hidden="true" />{lang === "ru" ? "Рейды" : "Raids"}</button></div>
        </section>
        {activity === "raid" ? <div className="context-controls"><span>{lang === "ru" ? "Сложность" : "Difficulty"}</span>{raidDifficulties.map((value) => <button type="button" className={difficulty === value ? "on" : ""} onClick={() => setDifficulty(value)} key={value}>{difficultyLabel(value, lang)}</button>)}</div> : <div className="context-controls"><span>{lang === "ru" ? "Ключи" : "Keys"}</span>{Object.entries(KEY_LABELS).map(([value, label]) => <button type="button" className={keyType === value ? "on" : ""} onClick={() => setKeyType(value as typeof keyType)} key={value}>{label[lang]}</button>)}</div>}
        {loadError ? <div className="tier-alert" role="status">{loadError}</div> : null}
        <div className="tp-toolbar">
          <div className="tabs">{(["dps", "healer", "tank"] as const).map((value) => <button type="button" className={role === value ? "on" : ""} onClick={() => { setRole(value); setCls("all"); setSelectedSlug(""); }} key={value}>{ROLE_LABELS[value][lang]}</button>)}</div>
          <span className="tool tool-static"><Layers3 aria-hidden="true" />{isLoading ? (lang === "ru" ? "Обновление…" : "Updating…") : `${filtered.length} ${lang === "ru" ? "спеков" : "specs"}`}</span>
          <button type="button" className="tool" onClick={share}><svg className="i"><use href="#ic-share" /></svg>{copied ? tt("Copied ✓") : tt("Share")}</button>
        </div>

        <div className="filterbar">
          <label className="fsearch"><svg className="i"><use href="#ic-search" /></svg><input type="search" placeholder={tt("Search spec...")} aria-label={tt("Search spec...")} value={q} onChange={(event) => setQ(event.target.value)} /></label>
          <div className="chips"><button type="button" className={`chip${cls === "all" ? " on" : ""}`} onClick={() => setCls("all")}>{tt("All Classes")}</button>{classes.map(([slug, name]) => { const key = classKey(slug); const icon = classIcon(key); return <button type="button" className={`chip${cls === slug ? " on" : ""}`} onClick={() => setCls(slug)} key={slug}>{icon ? <span className={`coct ${key}`}><Image src={icon} alt="" width={56} height={56} /></span> : null}{name}</button>; })}</div>
        </div>

        <div className={`tier-table-wrap${isLoading ? " is-loading" : ""}`} aria-busy={isLoading}><table className="tt">
          <thead><tr><th>{tt("Tier")}</th><th>{tt("Spec")}</th><th className="num">{tt("Score")}</th><th className="num">{role === "healer" ? "HPS" : "DPS"}</th>{activity === "mythic_plus" ? <th className="num col-key">{lang === "ru" ? "Макс. ключ" : "Max key"}</th> : null}<th className="num">{tt("Trend")}</th></tr></thead>
          <tbody>{groups.map((group) => group.rows.map((entry, index) => <tr key={entryKey(entry)} className={selected && entryKey(selected) === entryKey(entry) ? "hl" : ""}>
            {index === 0 ? <td className="tcell" rowSpan={group.rows.length}><div className={`in tc-${tierClass(group.tier)}`}><span className="big">{group.tier}</span><span className="lbl">{tt("Tier").toUpperCase()}</span></div></td> : null}
            <td><div className="scell"><SpecSlot name={fullSpecName(entry)} cls={classKey(entry.classSlug)} classSlug={entry.classSlug} specSlug={entry.specSlug} size="sm" /><button type="button" className="scell-name" onClick={() => setSelectedSlug(entryKey(entry))}>{entry.specName}</button></div></td>
            <td className="num score">{compact(entry.score, lang)}<span className="sbar"><i style={{ width: `${entry.score ? Math.max(5, entry.score / maxScore * 100) : 0}%` }} /></span></td>
            <td className="num">{compact(role === "healer" ? entry.averageHps : entry.averageDps, lang)}</td>
            {activity === "mythic_plus" ? <td className="num col-key">{entry.maxKey ? `+${entry.maxKey}` : "—"}</td> : null}
            <td className="num"><Trend value={entry.rankChange} /></td>
          </tr>))}</tbody>
        </table>{isLoading ? <div className="tier-loading"><span /><b>{lang === "ru" ? "Собираем выбранный срез" : "Loading selected slice"}</b></div> : null}</div>
        {!filtered.length ? <div className="faq-note">{lang === "ru" ? "По выбранным фильтрам специализаций нет." : "No specializations match the selected filters."}</div> : null}
        <div className="tfoot">{lang === "ru" ? "Источник" : "Source"}: {providerLabel} · {updated} UTC · {selectedContext?.selectionName ?? (activity === "mythic_plus" ? "Mythic+" : (lang === "ru" ? "Все рейды" : "All raids"))}</div>
        <div className="faq-note"><b>{lang === "ru" ? "Как читать данные?" : "How should I read this?"}</b>{selectedContext ? (lang === "ru" ? "Тир, порядок и метрики рассчитаны по выбранному срезу wow.gg; смена подземелья, рейда, босса или сложности перестраивает рейтинг." : "Tier, order and metrics come from the selected wow.gg slice; changing dungeon, raid, boss or difficulty rebuilds the ranking.") : (lang === "ru" ? "Общий тир и порядок — редакционный срез Wowhead. Числовые метрики дополняются совпадающей записью wow.gg." : "Overall tier and order come from the published Wowhead snapshot. Numeric metrics are enriched from the matching wow.gg record.")}</div>
        <AdSlot lang={lang} />
        <div className="bhead" id="builds"><span className="t">{lang === "ru" ? "ПЕРВИЧНЫЕ ИСТОЧНИКИ" : "PRIMARY SOURCES"}</span><span className="dia">◆</span><span className="rule" /></div>
        <div className="builds">{roleEntries.slice(0, 6).map((entry) => <a href={entry.guideUrl || entry.sourceUrl} target={usingFixedPreview ? undefined : "_blank"} rel={usingFixedPreview ? undefined : "noreferrer"} className="bcard" key={entryKey(entry)}><SpecSlot name={fullSpecName(entry)} cls={classKey(entry.classSlug)} classSlug={entry.classSlug} specSlug={entry.specSlug} /><span className="binfo"><span className="bname">{entry.specName} {entry.className}</span><span className="bauthor">{entry.guideUrl ? (lang === "ru" ? "Гайд провайдера" : "Provider guide") : providerLabel}</span></span><span className={`bpill ${tierClass(entry.tier)}`}>{entry.tier}</span></a>)}</div>
      </div>

      <aside className="tp-detail" id="spec-detail">
        {selected ? <><div className="dhero"><div className="dhead"><div className="dicon"><b><SpecSlot name={fullSpecName(selected)} cls={classKey(selected.classSlug)} classSlug={selected.classSlug} specSlug={selected.specSlug} size="sm" /></b></div><div className="name"><h2>{selected.specName} {selected.className}</h2><div className="tier-line">{selected.tier} TIER · #{selected.rank}</div></div></div><div className="dtabs"><button className="on" aria-current="page">{tt("Overview")}</button><button aria-disabled="true" disabled>API</button></div></div>
          <div className="dbody"><div className="dgrid"><div className="dcard"><h4>{lang === "ru" ? "Производительность" : "Performance"}</h4><div className="dline"><span>{tt("Score")}</span><b>{compact(selected.score, lang)}</b></div><div className="dline"><span>DPS</span><b>{compact(selected.averageDps, lang)}</b></div><div className="dline"><span>HPS</span><b>{compact(selected.averageHps, lang)}</b></div></div><div className="dcard"><h4>{tt("Quick Stats")}</h4>{activity === "mythic_plus" ? <div className="dline"><span>{lang === "ru" ? "Макс. ключ" : "Max key"}</span><b>{selected.maxKey ? `+${selected.maxKey}` : "—"}</b></div> : <div className="dline"><span>{lang === "ru" ? "Сложность" : "Difficulty"}</span><b>{difficultyLabel(difficulty, lang)}</b></div>}<div className="dline"><span>{tt("Weekly Change")}</span><b className={selected.rankChange && selected.rankChange > 0 ? "pos" : ""}>{selected.rankChange ? `${selected.rankChange > 0 ? "+" : ""}${selected.rankChange}` : "—"}</b></div><div className="dline"><span>{tt("Popularity")}</span><b>{selected.popularity ? `${(selected.popularity * 100).toFixed(1)}%` : "—"}</b></div></div></div><div className="dactions"><a className="btn btn-primary" href={selected.guideUrl || selected.sourceUrl} target="_blank" rel="noreferrer">{lang === "ru" ? "Открыть источник" : "Open source"}</a><Link className="btn btn-dim" href={p(lang, "/wow")}>{lang === "ru" ? "Штаб WoW" : "WoW hub"}</Link></div></div></> : <div className="dbody"><div className="faq-note">{lang === "ru" ? "Нет опубликованных строк." : "No published rows."}</div></div>}
      </aside>
    </div>
  );
}
