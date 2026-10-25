"use client";

import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";

import Image from "next/image";
import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FarmActivity, FarmTarget, GearFarmJob, GearFarmResult } from "@/lib/wow/gearFarm/types";
import { confirmedFarmActivities, isConfirmedFarmUpgrade } from "@/lib/wow/gearFarm/recommendations";
import { GearPlannerItem } from "./GearPlannerItem";
import styles from "./gearFarmPlanner.module.css";

const copy = {
  ru: {
    eyebrow: "ДОБЫЧА ДЛЯ ПЕРСОНАЖА", title: "Куда идти за экипировкой",
    description: "Покажем добычу с подтверждённым приростом DPS для вашего комплекта и специализации. Пассивки и активки учитываются, если их поддерживает SimulationCraft.",
    start: "Подобрать места фарма", searching: "Подбираем…", cancel: "Отменить", cancelled: "Подбор отменён.",
    sources: "Проверяем места и условия доступа…", rewards: "Проверяем добычу и варианты вещей", simulating: "Сравниваем с текущей экипировкой", waiting: "Ожидаем расчёта…",
    available: "Подтверждённые улучшения DPS", conditional: "Нужно проверить открытие", blocked: "Пока недоступны",
    level: "Уровень", equipped: "Надето, ур. предметов", requiresLevel: "Требуется уровень", requiresGear: "Требуется ур. предметов",
    unlock: "Доступ зависит от открытых заданий или прогресса аккаунта.", groupDungeon: "Нужна группа для подземелья", groupRaid: "Нужна рейдовая группа",
    normal: "Обычная сложность", raidFinder: "Поиск рейда", world: "Мировая сложность логова", worldGroup: "Совместный бой на 5–40 игроков; можно встать в очередь одному", recommended: "Рекомендуется ур. предметов", alternativeUnlock: "Альтернатива: персонаж {level} ур. в отряде.", moreLoot: "Ещё целей добычи",
    assumptions: "Открытие заданий и наличие дополнения на аккаунте не подтверждены. Подходящий уровень не гарантирует прохождение: учитывайте группу и механики.",
    potential: "Возможное улучшение по уровню предмета; прирост DPS не рассчитан.", scaling: "Для целей с отметкой «Масштабирование не подтверждено» уровень награды нужно проверить в игровом атласе.", scalingStatus: "Масштабирование не подтверждено", noConfirmed: "В проверенных вариантах подтверждённых улучшений не найдено.", variantVerified: "Вариант награды проверен; прирост DPS ещё не рассчитан.", notUpgrade: "Прирост DPS выше погрешности не подтверждён.", comparisonNote: "Прирост каждой вещи рассчитан отдельно от текущей экипировки: одна цель, 120 секунд. Эти проценты не суммируются.", queueGear: "Поиск группы: минимум ур. предметов", queueMet: "условие экипировки выполнено", queueNotMet: "экипировки для очереди недостаточно", queueUnknown: "условие экипировки не подтверждено", margin95: "95% доверительный интервал", baseline: "DPS текущей экипировки",
    measured: "Проверено симуляцией", dpsGain: "Прирост DPS", replaces: "Заменяет", current: "Надето", loot: "Добыча", boss: "Босс", source: "Условия доступа — Blizzard", details: "Покрытие и проверка данных",
    checked: "Проверено предметов добычи", variants: "Точных вариантов", simulations: "Симуляций", instances: "Мест проверено", unverified: "Вариантов с неподтверждённым масштабированием",
    partial: "Проверены не все варианты добычи. Непроверенные вещи не рекомендуем; отсутствие целей не означает, что улучшений нигде нет.",
    limited: "Поиск ограничен опубликованными местами и подтверждёнными таблицами добычи. Это не полный список способов получить экипировку.",
    empty: "В проверенной добыче не найдено подходящих улучшений. Неподтверждённые варианты не считаются улучшением.",
    noTargets: "Подходящие цели добычи не подтверждены.", updated: "Снимок персонажа проверен", slots: "Слот",
    genericError: "Не удалось завершить подбор. Попробуйте позже.", session: "Войдите в Battle.net повторно.",
    running: "Предыдущий подбор ещё выполняется.", rateLimit: "Слишком много запусков. Подождите минуту.", expired: "Расчёт больше недоступен. Запустите подбор повторно.",
    rulesError: "Условия доступа изменились. Данные подбора нужно обновить.", referenceError: "Не удалось проверить свойства наград по данным Blizzard. Попробуйте позже.", catalogError: "Не удалось загрузить подтверждённую добычу. Попробуйте позже.", equipmentError: "Не хватает данных об ограничениях надетых вещей.", simulationError: "Сервис сравнения экипировки сейчас недоступен. Попробуйте позже.",
  },
  en: {
    eyebrow: "LOOT FOR YOUR CHARACTER", title: "Where to farm gear",
    description: "Find loot with a confirmed DPS gain for your equipped gear and specialization. Passive and on-use effects count when supported by SimulationCraft.",
    start: "Find farming locations", searching: "Searching…", cancel: "Cancel", cancelled: "Search cancelled.",
    sources: "Checking locations and access requirements…", rewards: "Checking loot and item variants", simulating: "Comparing against equipped gear", waiting: "Waiting for the search…",
    available: "Confirmed DPS upgrades", conditional: "Check unlock requirements", blocked: "Not yet accessible",
    level: "Level", equipped: "Equipped item level", requiresLevel: "Requires level", requiresGear: "Requires item level",
    unlock: "Access depends on quest unlocks or account progress.", groupDungeon: "Requires a dungeon group", groupRaid: "Requires a raid group",
    normal: "Normal difficulty", raidFinder: "Raid Finder", world: "World difficulty lair", worldGroup: "Shared encounter for 5–40 players; you can queue alone", recommended: "Recommended item level", alternativeUnlock: "Alternative: a level {level} character in your Warband.", moreLoot: "More loot targets",
    assumptions: "Quest unlocks and expansion ownership are not confirmed. Meeting the level requirement does not guarantee a clear: group composition and mechanics still matter.",
    potential: "Potential item-level improvement; DPS gain has not been measured.", scaling: "Check the reward level in the in-game Adventure Guide for targets marked “Scaling unverified”.", scalingStatus: "Scaling unverified", noConfirmed: "No upgrades were confirmed among the tested options.", variantVerified: "Reward variant verified; DPS gain has not been measured yet.", notUpgrade: "No DPS gain beyond uncertainty was confirmed.", comparisonNote: "Each item is compared separately with your equipped gear: one target, 120 seconds. These percentages cannot be added together.", queueGear: "Dungeon Finder: minimum item level", queueMet: "gear requirement met", queueNotMet: "gear requirement not met", queueUnknown: "gear requirement unverified", margin95: "95% confidence interval", baseline: "Equipped-gear DPS",
    measured: "Verified by simulation", dpsGain: "DPS gain", replaces: "Replaces", current: "Equipped", loot: "Loot", boss: "Boss", source: "Access requirements — Blizzard", details: "Coverage and data verification",
    checked: "Loot items checked", variants: "Exact variants", simulations: "Simulations", instances: "Locations checked", unverified: "Variants with unverified scaling",
    partial: "Some loot variants could not be checked. Unverified items are not recommended; an empty list does not mean no upgrades exist elsewhere.",
    limited: "Search covers published locations and confirmed loot tables. It does not cover every way to obtain gear.",
    empty: "No compatible upgrades were found in the checked loot. Unverified variants are not counted as upgrades.",
    noTargets: "No compatible loot targets have been confirmed.", updated: "Character snapshot checked", slots: "Slot",
    genericError: "The search could not finish. Try again later.", session: "Sign in to Battle.net again.",
    running: "Your previous search is still running.", rateLimit: "Too many searches. Wait a minute.", expired: "The search has expired. Start a new search.",
    rulesError: "Access requirements have changed. The farming data needs an update.", referenceError: "Reward properties could not be verified with Blizzard data. Try again later.", catalogError: "Confirmed loot data could not be loaded. Try again later.", equipmentError: "Constraints for your equipped items could not be verified.", simulationError: "The gear comparison service is unavailable. Try again later.",
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
      <div className={styles.reward}><GearPlannerItem item={item} locale={ru ? "ru" : "en"} verified /><span className={styles.rewardMeta}>{slotNames[target.slotType]?.[ru ? 0 : 1] ?? c.slots} · {c.boss}: {target.encounterName}</span></div>
      <div className={styles.gain}><span>{c.dpsGain}</span><strong>+{number(target.deltaPercent)}%</strong><span>+{number(target.deltaDps)} DPS</span><span>{c.margin95}: ±{number(target.marginPercent)}%</span></div>
    </div>
    <div className={styles.replacement}><span>{c.replaces}</span>{target.currentItem ? <GearPlannerItem item={target.currentItem} locale={ru ? "ru" : "en"} /> : <span>{c.current}: {number(target.currentItemLevel)}</span>}</div>
  </li>;
}
function Activity({ activity, c, ru }: { activity: FarmActivity; c: Copy; ru: boolean }) {
  return <li className={styles.activity} data-farm-access={activity.access}>
    <header className={styles.activityHeader}><ActivityIcon src={activity.imageUrl} /><div><h4>{activity.name}</h4><span>{activity.difficulty === "raid-finder" ? c.raidFinder : activity.difficulty === "world" ? c.world : c.normal}</span></div></header>
    <p className={styles.requirements}>{activity.difficulty === "world" ? c.worldGroup : activity.group === "raid" ? c.groupRaid : c.groupDungeon}{activity.minLevel !== undefined ? ` · ${c.requiresLevel}: ${activity.minLevel}` : ""}{activity.minItemLevel !== undefined ? ` · ${c.requiresGear}: ${activity.minItemLevel}` : ""}</p>
    {activity.queueMinItemLevel !== undefined ? <p className={styles.note}>{c.queueGear}: {activity.queueMinItemLevel} · {activity.queueGearSatisfied === true ? c.queueMet : activity.queueGearSatisfied === false ? c.queueNotMet : c.queueUnknown}</p> : null}
    {activity.recommendedItemLevel !== undefined ? <p className={styles.note}>{c.recommended}: {activity.recommendedItemLevel}</p> : null}
    {activity.access === "unlock_unverified" ? <p className={styles.note}>{c.unlock}{activity.unlockLevel !== undefined ? ` ${c.alternativeUnlock.replace("{level}", String(activity.unlockLevel))}` : ""}</p> : null}
    {activity.targets.length ? <><ul className={styles.targets}>{activity.targets.slice(0, 4).map(target => <Target key={`${target.itemId}:${target.slotType}:${target.encounterId}`} target={target} activityName={activity.name} c={c} ru={ru} />)}</ul>{activity.targets.length > 4 ? <details className={styles.moreTargets}><summary>{c.moreLoot}: {activity.targets.length - 4}</summary><ul className={styles.targets}>{activity.targets.slice(4).map(target => <Target key={`${target.itemId}:${target.slotType}:${target.encounterId}`} target={target} activityName={activity.name} c={c} ru={ru} />)}</ul></details> : null}</> : <p className={styles.note}>{c.noTargets}</p>}
    <a href={activity.sourceUrl} target="_blank" rel="noopener noreferrer">{c.source}</a>
  </li>;
}
function Results({ result, c, ru }: { result: GearFarmResult; c: Copy; ru: boolean }) {
  const recommendations = confirmedFarmActivities(result.activities);
  const restricted = result.activities.filter(activity => activity.access !== "level_condition_met");
  return <div className={styles.result}>
    {result.coverage.searchLimited ? <p className={styles.notice}>{c.partial}</p> : null}
    <dl className={styles.summary}><div><dt>{c.level}</dt><dd>{result.character.level}</dd></div><div><dt>{c.equipped}</dt><dd>{new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(result.character.equippedItemLevel)}</dd></div></dl>
    <p className={styles.note}>{c.assumptions}</p>
    {result.coverage.simulations > 0 ? <p className={styles.note}>{c.comparisonNote}</p> : null}
    {!recommendations.length ? <p role="status">{c.empty}</p> : <section className={styles.group}><h3>{c.available}</h3><ul className={styles.activities}>{recommendations.map(activity => <Activity key={activity.id} activity={activity} c={c} ru={ru} />)}</ul></section>}
    <details className={styles.details}><summary>{c.details}</summary><p>{c.limited}</p>{restricted.length ? <ul>{restricted.map(activity => <li key={activity.id}><a href={activity.sourceUrl} target="_blank" rel="noopener noreferrer">{activity.name}</a>: {activity.access === "unlock_unverified" ? c.unlock : activity.access === "gear_locked" ? `${c.requiresGear}: ${activity.minItemLevel}` : `${c.requiresLevel}: ${activity.minLevel}`}</li>)}</ul> : null}<dl className={styles.coverage}>
      <div><dt>{c.instances}</dt><dd>{result.coverage.instancesChecked}</dd></div><div><dt>{c.checked}</dt><dd>{result.coverage.lootItemsChecked}</dd></div><div><dt>{c.variants}</dt><dd>{result.coverage.exactVariants}</dd></div><div><dt>{c.simulations}</dt><dd>{result.coverage.simulations}</dd></div>
      <div><dt>{c.unverified}</dt><dd>{result.activities.reduce((sum, a) => sum + a.variantsUnverified, 0)}</dd></div>
      {result.baselineDps !== undefined ? <div><dt>{c.baseline}</dt><dd>{new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(result.baselineDps)}</dd></div> : null}
    </dl>{result.engine ? <p>{result.engine}</p> : null}<p>{c.updated}: <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString(ru ? "ru-RU" : "en-US")}</time></p></details>
  </div>;
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
  const messages: Record<string, string> = { session_expired: c.session, plan_already_running: c.running, plan_rate_limited: c.rateLimit, plan_not_found: c.expired, catalog_unavailable: c.catalogError, farm_sources_unavailable: c.catalogError, farm_rules_update_required: c.rulesError, farm_data_update_required: c.rulesError, farm_reward_unverified: c.referenceError, variant_metadata_worker_upgrade_required: c.simulationError, item_reference_unavailable: c.referenceError, equipment_constraints_unverified: c.equipmentError, simulation_unavailable: c.simulationError };
  const progress = current?.job?.progress, phase = progress?.phase;
  return <section className={styles.panel} aria-labelledby={titleId} data-gear-farm>
    <header><small>{c.eyebrow}</small><h2 id={titleId}>{c.title}</h2><p>{c.description}</p></header>
    <div className={styles.controls}><AtlasButton variant="primary" type="button" onClick={() => void start()} disabled={running}>{running ? c.searching : c.start}</AtlasButton>{running ? <AtlasButton type="button" onClick={cancel}>{c.cancel}</AtlasButton> : null}</div>
    {running ? <p role="status">{phase === "sources" ? c.sources : phase === "rewards" || phase === "simulating" ? `${phase === "rewards" ? c.rewards : c.simulating}: ${progress?.completed} / ${progress?.total}` : c.waiting}</p> : null}
    {failure ? <p role="alert">{messages[failure] ?? c.genericError}</p> : null}
    {current?.job?.status === "cancelled" ? <p role="status">{c.cancelled}</p> : null}
    {current?.job?.status === "completed" && current.job.result ? <Results result={current.job.result} c={c} ru={ru} /> : null}
  </section>;
}
