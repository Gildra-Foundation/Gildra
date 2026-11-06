"use client";

import Image from "next/image";
import { AlertTriangle, LoaderCircle, MapPin, Search } from "lucide-react";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import { useEffect, useId, useRef, useState } from "react";
import type { FarmActivity, FarmTarget, GearFarmJob, GearFarmResult } from "@/lib/wow/gearFarm/types";
import { confirmedFarmActivities, isConfirmedFarmUpgrade } from "@/lib/wow/gearFarm/recommendations";
import { GearPlannerItem } from "./GearPlannerItem";
import styles from "./gearFarmPlanner.module.css";
import tools from "./characterTools.module.css";

const copy = {
  ru: {
    title: "Где добыть улучшения",
    start: "Подобрать", searching: "Подбираем…", cancel: "Отменить", cancelled: "Подбор отменён.",
    sources: "Проверяем места добычи…", rewards: "Проверяем добычу", simulating: "Сравниваем с надетым",
    normal: "Обычная сложность", raidFinder: "Поиск рейда", world: "Мировое логово",
    groupDungeon: "Группа", groupRaid: "Рейд", worldGroup: "Открытый бой", requiresLevel: "Уровень", requiresGear: "Ур. предметов",
    recommended: "Рекомендуемый ур. предметов", queueNotMet: "Для поиска группы нужен ур. предметов", moreLoot: "Ещё добыча",
    empty: "Улучшений в добыче не найдено.", replaces: "Вместо", current: "Надето", boss: "Босс", slots: "Слот",
    genericError: "Не удалось завершить подбор. Попробуйте позже.", session: "Войдите в Battle.net повторно.",
    running: "Предыдущий подбор ещё выполняется.", rateLimit: "Слишком много запусков. Подождите минуту.", expired: "Подбор устарел. Запустите его снова.",
    unavailable: "Подбор сейчас недоступен. Попробуйте позже.", equipmentError: "Не хватает данных о надетых вещах.",
  },
  en: {
    title: "Where to farm upgrades",
    start: "Find upgrades", searching: "Searching…", cancel: "Cancel", cancelled: "Search cancelled.",
    sources: "Checking loot sources…", rewards: "Checking loot", simulating: "Comparing with equipped gear",
    normal: "Normal", raidFinder: "Raid Finder", world: "World lair",
    groupDungeon: "Group", groupRaid: "Raid", worldGroup: "Open encounter", requiresLevel: "Level", requiresGear: "Item level",
    recommended: "Recommended item level", queueNotMet: "Dungeon Finder needs item level", moreLoot: "More loot",
    empty: "No upgrades found in the loot.", replaces: "Replaces", current: "Equipped", boss: "Boss", slots: "Slot",
    genericError: "The search could not finish. Try again later.", session: "Sign in to Battle.net again.",
    running: "Your previous search is still running.", rateLimit: "Too many searches. Wait a minute.", expired: "The search has expired. Start it again.",
    unavailable: "The search is unavailable right now. Try again later.", equipmentError: "Data about your equipped items is incomplete.",
  },
};
type Copy = typeof copy.en;
const slotNames: Record<string, [string, string]> = {
  HEAD: ["Голова", "Head"], NECK: ["Шея", "Neck"], SHOULDER: ["Плечи", "Shoulders"], CHEST: ["Грудь", "Chest"],
  WAIST: ["Пояс", "Waist"], LEGS: ["Ноги", "Legs"], FEET: ["Ступни", "Feet"], WRIST: ["Запястья", "Wrists"],
  HANDS: ["Кисти рук", "Hands"], BACK: ["Спина", "Back"], FINGER_1: ["Кольцо 1", "Ring 1"], FINGER_2: ["Кольцо 2", "Ring 2"],
  TRINKET_1: ["Аксессуар 1", "Trinket 1"], TRINKET_2: ["Аксессуар 2", "Trinket 2"], MAIN_HAND: ["Правая рука", "Main hand"], OFF_HAND: ["Левая рука", "Off hand"],
};
const endpoint = "/api/wow/gear-farm-plans";
type Request = { controller: AbortController; id?: string };
function removeJob(id: string) { return fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true, signal: AbortSignal.timeout(10_000) }).catch(() => undefined); }
function waitForPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1500);
    signal.addEventListener("abort", abort, { once: true });
  });
}
function ActivityIcon({ src }: { src?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={styles.activityIcon} aria-hidden="true">{src && failed !== src ? <Image src={src} alt="" fill sizes="64px" unoptimized onError={() => setFailed(src)} /> : <MapPin />}</span>;
}
function Target({ target, activityName, c, ru }: { target: FarmTarget; activityName: string; c: Copy; ru: boolean }) {
  const number = (n: number) => new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(n);
  if (!isConfirmedFarmUpgrade(target)) return null;
  const item = {
    itemId: target.itemId, name: target.name, iconUrl: target.iconUrl, quality: target.quality,
    slotType: target.slotType, source: target.source ?? `${activityName} · ${target.encounterName}`,
    itemLevel: target.itemLevel, requiredLevel: target.requiredLevel, stats: target.stats, statLines: target.statLines,
    weapon: target.weapon, effects: target.effects, effectsVerified: target.effectsVerified,
  };
  return <li className={styles.target} data-farm-verification={target.verification}>
    <div className={styles.targetHeading}>
      <div className={styles.reward}><GearPlannerItem item={item} locale={ru ? "ru" : "en"} verified /><span className={styles.rewardMeta}>{slotNames[target.slotType]?.[ru ? 0 : 1] ?? c.slots} · {target.encounterName}</span></div>
      <div className={styles.gain}><strong>+{number(target.deltaPercent)}%</strong><span>+{number(target.deltaDps)} DPS</span></div>
    </div>
    <div className={styles.replacement}><span>{c.replaces}</span>{target.currentItem ? <GearPlannerItem item={target.currentItem} locale={ru ? "ru" : "en"} /> : <span>{c.current}: {number(target.currentItemLevel)}</span>}</div>
  </li>;
}
function Activity({ activity, c, ru }: { activity: FarmActivity; c: Copy; ru: boolean }) {
  const key = (target: FarmTarget) => `${target.itemId}:${target.slotType}:${target.encounterId}`;
  const facts = [
    activity.difficulty === "raid-finder" ? c.raidFinder : activity.difficulty === "world" ? c.world : c.normal,
    activity.difficulty === "world" ? c.worldGroup : activity.group === "raid" ? c.groupRaid : c.groupDungeon,
    activity.minLevel !== undefined ? `${c.requiresLevel} ${activity.minLevel}+` : "",
    activity.minItemLevel !== undefined ? `${c.requiresGear} ${activity.minItemLevel}+` : "",
    activity.recommendedItemLevel !== undefined ? `${c.recommended} ${activity.recommendedItemLevel}` : "",
  ].filter(Boolean).join(" · ");
  return <li className={styles.activity} data-farm-access={activity.access}>
    <header className={styles.activityHeader}><ActivityIcon src={activity.imageUrl} /><div><h4>{activity.name}</h4><span>{facts}</span>{activity.queueGearSatisfied === false && activity.queueMinItemLevel !== undefined ? <span>{c.queueNotMet} {activity.queueMinItemLevel}</span> : null}</div></header>
    <ul className={styles.targets}>{activity.targets.slice(0, 4).map(target => <Target key={key(target)} target={target} activityName={activity.name} c={c} ru={ru} />)}</ul>
    {activity.targets.length > 4 ? <details className={styles.moreTargets}><summary>{c.moreLoot}: {activity.targets.length - 4}</summary><ul className={styles.targets}>{activity.targets.slice(4).map(target => <Target key={key(target)} target={target} activityName={activity.name} c={c} ru={ru} />)}</ul></details> : null}
  </li>;
}
function Results({ result, c, ru }: { result: GearFarmResult; c: Copy; ru: boolean }) {
  const recommendations = confirmedFarmActivities(result.activities);
  if (!recommendations.length) return <p className={tools.status} role="status">{c.empty}</p>;
  return <ul className={styles.activities}>{recommendations.map(activity => <Activity key={activity.id} activity={activity} c={c} ru={ru} />)}</ul>;
}

export function GearFarmPlanner({ characterSlug, snapshotKey, localePrefix = "/ru" }: { characterSlug: string; snapshotKey: string; localePrefix?: "" | "/ru" }) {
  const ru = localePrefix === "/ru", c = copy[ru ? "ru" : "en"], titleId = useId();
  const scope = `${characterSlug}:${snapshotKey}:${localePrefix}`;
  const [state, setState] = useState<{ scope: string; starting?: boolean; job?: GearFarmJob; error?: string }>({ scope });
  const active = useRef<Request | null>(null), current = state.scope === scope ? state : undefined;
  useEffect(() => () => { const request = active.current; active.current = null; request?.controller.abort(); if (request?.id) removeJob(request.id); }, [scope]);
  const running = Boolean(current?.starting || current?.job?.status === "queued" || current?.job?.status === "running");
  async function start() {
    const request: Request = { controller: new AbortController() };
    if (active.current) return;
    active.current = request;
    setState({ scope, starting: true });
    try {
      // Receive a newly created job ID even if the user cancels while POST is in flight.
      let response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterSlug, locale: ru ? "ru" : "en" }), signal: AbortSignal.timeout(30_000) });
      let job = await response.json() as GearFarmJob;
      if (!response.ok) throw new Error(job.error ?? "farm_plan_unavailable");
      request.id = job.id;
      if (request.controller.signal.aborted || active.current !== request) { removeJob(job.id); return; }
      while (!request.controller.signal.aborted && active.current === request) {
        setState({ scope, job });
        if (job.status !== "queued" && job.status !== "running") break;
        await waitForPoll(request.controller.signal);
        response = await fetch(`${endpoint}?id=${encodeURIComponent(job.id)}`, { cache: "no-store", signal: request.controller.signal });
        job = await response.json() as GearFarmJob;
        if (!response.ok) throw new Error(job.error ?? "farm_plan_unavailable");
      }
    } catch (reason) {
      if (!request.controller.signal.aborted && active.current === request) {
        if (request.id) await removeJob(request.id);
        if (!request.controller.signal.aborted && active.current === request) setState({ scope, error: reason instanceof Error ? reason.message : "farm_plan_unavailable" });
      }
    } finally { if (active.current === request) active.current = null; }
  }
  function cancel() {
    const request = active.current; active.current = null; request?.controller.abort();
    if (request?.id) removeJob(request.id);
    setState({ scope, job: { id: request?.id ?? "", status: "cancelled", progress: null, result: null, error: null } });
  }
  const failure = current?.error || (current?.job?.status === "failed" ? current.job.error : null);
  const messages: Record<string, string> = { session_expired: c.session, plan_already_running: c.running, plan_rate_limited: c.rateLimit, plan_not_found: c.expired, equipment_constraints_unverified: c.equipmentError };
  const progress = current?.job?.progress, phase = progress?.phase;
  const progressLabel = phase === "rewards" ? c.rewards : phase === "simulating" ? c.simulating : c.sources;
  return <section className={`${tools.tool} ${styles.panel}`} aria-labelledby={titleId} aria-busy={running} data-gear-farm>
    <div className={tools.head}>
      <h3 className={tools.title} id={titleId}>{c.title}</h3>
      <div className={tools.actions}>
        {running ? <button type="button" className={tools.quiet} onClick={cancel}>{c.cancel}</button> : null}
        <MaterialButton kit={CHARACTERS_KIT} fit="stack" variant="primary" type="button" onClick={() => void start()} disabled={running} icon={running ? <LoaderCircle className={tools.spin} aria-hidden="true" /> : <Search aria-hidden="true" />}>{running ? c.searching : c.start}</MaterialButton>
      </div>
    </div>
    {running ? <div role="status" className={tools.status}>{progressLabel}{progress && phase !== "sources" ? ` ${progress.completed} / ${progress.total}` : ""}</div> : null}
    {running && progress?.total ? <div className={tools.progress} aria-hidden="true"><i style={{ width: `${Math.min(100, progress.completed / progress.total * 100)}%` }} /></div> : null}
    {failure ? <p role="alert" className={tools.alert}><AlertTriangle aria-hidden="true" />{messages[failure] ?? (failure === "farm_plan_unavailable" ? c.genericError : c.unavailable)}</p> : null}
    {current?.job?.status === "cancelled" ? <p role="status" className={tools.status}>{c.cancelled}</p> : null}
    {current?.job?.status === "completed" && current.job.result ? <Results result={current.job.result} c={c} ru={ru} /> : null}
  </section>;
}
