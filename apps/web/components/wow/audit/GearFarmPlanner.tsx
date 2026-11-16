"use client";

import Image from "next/image";
import { AlertTriangle, LoaderCircle, MapPin, Search } from "lucide-react";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FarmActivity, FarmTarget, GearFarmResult, GearFarmSettings } from "@/lib/wow/gearFarm/types";
import { farmDungeonDifficulties, farmRaidDifficulties, farmMythicKeyBounds } from "@/lib/wow/gearFarm/settings";
import { defaultFarmPreferences, farmPreferencesKey, readFarmPreferences, subscribeFarmPreferences, writeFarmPreferences } from "@/lib/wow/gearFarm/preferences";
import { GearFarmClient, type FarmClientState } from "@/lib/wow/gearFarm/client";
import { farmJobActive, farmScopeKey, parseFarmScope } from "@/lib/wow/gearFarm/recovery";
import { farmCoverageMessage } from "@/lib/wow/gearFarm/coverage";
import { isConfirmedFarmUpgrade } from "@/lib/wow/gearFarm/recommendations";
import { rankedFarmActivities } from "@/lib/wow/upgradePlan";
import { upgradeSlotName } from "./characterUpgradesCopy";
import { GearPlannerItem } from "./GearPlannerItem";
import styles from "./gearFarmPlanner.module.css";
import tools from "./characterTools.module.css";

const copy = {
  ru: {
    title: "Подземелья и рейды",
    recovering: "Проверяем предыдущий подбор…", reconnecting: "Восстанавливаем соединение…", retry: "Подключиться снова", cancelling: "Отменяем…",
    disconnected: "Связь прервалась. Подключитесь снова, чтобы проверить подбор.", changed: "Профиль изменился. Обновите персонажа и повторите подбор.",
    start: "Проверить добычу", searching: "Подбираем…", cancel: "Отменить", cancelled: "Подбор отменён.",
    sources: "Проверяем места добычи…", rewards: "Проверяем добычу", simulating: "Сравниваем с надетым",
    normal: "Обычная", heroic: "Героическая", mythic: "Эпохальная", mythicPlus: "Мифик+", raidFinder: "Поиск рейда", world: "Мировое логово",
    dungeonDifficulty: "Сложность подземелий", raidDifficulty: "Сложность рейдов", keyLevel: "Уровень ключа",
    endgameUnavailable: "Сравнение добычи этих сложностей недоступно: точные уровни наград не подтверждены.",
    difficultyUnavailable: "не подтверждены варианты добычи этой сложности", rewardUnavailable: "не подтверждены точные уровни наград",
    sourceUnavailable: "не удалось проверить список добычи", worldUnavailable: "не подтверждены награды логова",
    groupDungeon: "Подземелье", groupRaid: "Рейд", all: "Все", filter: "Показать", requiresLevel: "Уровень", requiresGear: "Ур. предметов",
    recommended: "Рекомендуемый ур. предметов", queueNotMet: "Для поиска группы нужен ур. предметов", moreLoot: "Ещё добыча",
    empty: "Улучшений в добыче не найдено.", replaces: "Вместо", current: "Надето",
    genericError: "Не удалось завершить подбор. Попробуйте позже.", session: "Войдите в Battle.net повторно.",
    running: "Предыдущий подбор ещё выполняется.", rateLimit: "Слишком много запусков. Подождите минуту.", expired: "Подбор устарел. Запустите его снова.",
    unavailable: "Подбор сейчас недоступен. Попробуйте позже.", equipmentError: "Не хватает данных о надетых вещах.",
  },
  en: {
    title: "Dungeons and raids",
    recovering: "Checking the previous search…", reconnecting: "Reconnecting…", retry: "Reconnect", cancelling: "Cancelling…",
    disconnected: "Connection interrupted. Reconnect to check the search.", changed: "The profile changed. Refresh the character and search again.",
    start: "Check the loot", searching: "Searching…", cancel: "Cancel", cancelled: "Search cancelled.",
    sources: "Checking loot sources…", rewards: "Checking loot", simulating: "Comparing with equipped gear",
    normal: "Normal", heroic: "Heroic", mythic: "Mythic", mythicPlus: "Mythic+", raidFinder: "Raid Finder", world: "World lair",
    dungeonDifficulty: "Dungeon difficulty", raidDifficulty: "Raid difficulty", keyLevel: "Key level",
    endgameUnavailable: "Loot comparison is unavailable for these difficulties: exact reward levels are unverified.",
    difficultyUnavailable: "loot variants for this difficulty are unverified", rewardUnavailable: "exact reward levels are unverified",
    sourceUnavailable: "the loot list could not be verified", worldUnavailable: "lair rewards are unverified",
    groupDungeon: "Dungeon", groupRaid: "Raid", all: "All", filter: "Show", requiresLevel: "Level", requiresGear: "Item level",
    recommended: "Recommended item level", queueNotMet: "Dungeon Finder needs item level", moreLoot: "More loot",
    empty: "No upgrades found in the loot.", replaces: "Replaces", current: "Equipped",
    genericError: "The search could not finish. Try again later.", session: "Sign in to Battle.net again.",
    running: "Your previous search is still running.", rateLimit: "Too many searches. Wait a minute.", expired: "The search has expired. Start it again.",
    unavailable: "The search is unavailable right now. Try again later.", equipmentError: "Data about your equipped items is incomplete.",
  },
};
type Copy = typeof copy.en;
const subscribeHydration = () => () => {};
function difficultyLabel(difficulty: FarmActivity["difficulty"], c: Copy, keyLevel?: number) {
  if (difficulty === "raid-finder") return c.raidFinder;
  if (difficulty === "mythic-plus") return `${c.mythicPlus}${keyLevel === undefined ? "" : ` +${keyLevel}`}`;
  return c[difficulty];
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
      <div className={styles.reward}><GearPlannerItem item={item} locale={ru ? "ru" : "en"} verified /><span className={styles.rewardMeta}>{upgradeSlotName(target.slotType, ru)} · {target.encounterName}</span></div>
      <div className={styles.gain}><strong>+{number(target.deltaPercent)}%</strong><span>+{number(target.deltaDps)} DPS</span></div>
    </div>
    <div className={styles.replacement}><span>{c.replaces}</span>{target.currentItem ? <GearPlannerItem item={target.currentItem} locale={ru ? "ru" : "en"} /> : <span>{c.current}: {number(target.currentItemLevel)}</span>}</div>
  </li>;
}
function Activity({ activity, c, ru }: { activity: FarmActivity; c: Copy; ru: boolean }) {
  const key = (target: FarmTarget) => `${target.itemId}:${target.slotType}:${target.encounterId}`;
  const facts = [
    activity.difficulty === "world" ? c.world : activity.group === "raid" ? c.groupRaid : c.groupDungeon,
    activity.difficulty === "world" ? "" : difficultyLabel(activity.difficulty, c, activity.mythicKeyLevel),
    activity.minLevel !== undefined ? `${c.requiresLevel} ${activity.minLevel}+` : "",
    activity.minItemLevel !== undefined ? `${c.requiresGear} ${activity.minItemLevel}+` : "",
    activity.recommendedItemLevel !== undefined ? `${c.recommended} ${activity.recommendedItemLevel}` : "",
  ].filter(Boolean).join(" · ");
  return <li className={styles.activity} data-farm-access={activity.access} data-farm-group={activity.group}>
    <header className={styles.activityHeader}><ActivityIcon src={activity.imageUrl} /><div><h4>{activity.name}</h4><span>{facts}</span>{activity.queueGearSatisfied === false && activity.queueMinItemLevel !== undefined ? <span className={styles.queue}>{c.queueNotMet} {activity.queueMinItemLevel}</span> : null}</div></header>
    <ul className={styles.targets}>{activity.targets.slice(0, 4).map(target => <Target key={key(target)} target={target} activityName={activity.name} c={c} ru={ru} />)}</ul>
    {activity.targets.length > 4 ? <details className={styles.moreTargets}><summary>{c.moreLoot}: {activity.targets.length - 4}</summary><ul className={styles.targets}>{activity.targets.slice(4).map(target => <Target key={key(target)} target={target} activityName={activity.name} c={c} ru={ru} />)}</ul></details> : null}
  </li>;
}
type GroupFilter = "all" | "dungeon" | "raid";
function Results({ result, c, ru }: { result: GearFarmResult; c: Copy; ru: boolean }) {
  const recommendations = useMemo(() => rankedFarmActivities(result.activities), [result]);
  const [group, setGroup] = useState<GroupFilter>("all");
  const groups = new Set(recommendations.map(activity => activity.group));
  const shown = group === "all" || !groups.has(group) ? recommendations : recommendations.filter(activity => activity.group === group);
  const coverageMessage = farmCoverageMessage(result, ru ? "ru" : "en");
  const unsupported = new Map<string, Set<string>>();
  for (const activity of result.activities) {
    if (!activity.unsupportedReason || activity.access === "level_locked" || activity.access === "gear_locked") continue;
    const reason = ({ difficulty_unverified: c.difficultyUnavailable, reward_sequence_unverified: c.rewardUnavailable,
      source_unavailable: c.sourceUnavailable, world_rewards_unverified: c.worldUnavailable })[activity.unsupportedReason];
    const labels = unsupported.get(reason) ?? new Set<string>();
    labels.add(activity.difficulty === "world" ? c.world : `${activity.group === "raid" ? c.groupRaid : c.groupDungeon}: ${difficultyLabel(activity.difficulty, c, activity.mythicKeyLevel)}`);
    unsupported.set(reason, labels);
  }
  const unavailableMessage = [...unsupported].map(([reason, labels]) => `${[...labels].join(", ")} — ${reason}.`).join(" ");
  const statusMessage = unavailableMessage || coverageMessage;
  if (!recommendations.length) return <p className={tools.status} role="status" data-farm-unsupported={unavailableMessage ? true : undefined}>{statusMessage ?? c.empty}</p>;
  return <>
    {statusMessage ? <p className={tools.status} role="status" data-farm-unsupported={unavailableMessage ? true : undefined}>{statusMessage}</p> : null}
    {groups.size > 1 ? <div className={styles.filters} role="group" aria-label={c.filter}>
      {(["all", "dungeon", "raid"] as const).map(id => <button key={id} type="button" className={styles.filter} aria-pressed={(groups.has(group as "dungeon" | "raid") ? group : "all") === id} onClick={() => setGroup(id)}>
        {id === "all" ? c.all : id === "raid" ? c.groupRaid : c.groupDungeon}
      </button>)}
    </div> : null}
    <ul className={styles.activities}>{shown.map(activity => <Activity key={activity.id} activity={activity} c={c} ru={ru} />)}</ul>
  </>;
}
function ResultsSkeleton() {
  return <div className={styles.skeleton} aria-hidden="true">{[0, 1, 2].map(index => <span key={index}><i /><b /><b /></span>)}</div>;
}

export function GearFarmPlanner({ characterSlug, snapshotKey, localePrefix = "/ru", onResult }: { characterSlug: string; snapshotKey: string; localePrefix?: "" | "/ru"; onResult?: (result: GearFarmResult | null) => void }) {
  const ru = localePrefix === "/ru", c = copy[ru ? "ru" : "en"], titleId = useId();
  const preferenceKey = farmPreferencesKey(characterSlug, snapshotKey);
  const readPreferences = useCallback(() => readFarmPreferences(preferenceKey), [preferenceKey]);
  const rawPreferences = useSyncExternalStore(subscribeFarmPreferences, readPreferences, () => defaultFarmPreferences);
  const preferencesHydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const settings = useMemo(() => JSON.parse(rawPreferences) as GearFarmSettings, [rawPreferences]);
  const farmScope = useMemo(() => parseFarmScope({ characterSlug, profileKey: snapshotKey, locale: ru ? "ru" : "en", ...settings }), [characterSlug, snapshotKey, ru, settings]);
  const changeSettings = (next: GearFarmSettings) => writeFarmPreferences(preferenceKey, next);
  const scope = farmScopeKey(farmScope);
  const [state, setState] = useState<FarmClientState & { scope: string }>({ scope, initializing: true });
  const active = useRef<GearFarmClient | null>(null), current = state.scope === scope ? state : undefined;
  useEffect(() => {
    if (!preferencesHydrated) return;
    const client = new GearFarmClient(farmScope, next => setState({ ...next, scope }));
    active.current = client;
    void client.recover();
    return () => { client.detach(); if (active.current === client) active.current = null; };
  }, [farmScope, scope, preferencesHydrated]);
  const running = Boolean(!current || current.initializing || current.starting || current.cancelling || farmJobActive(current.job) && !current.error);
  const canCancel = Boolean(current?.starting || current?.cancelling || current?.pendingRequest || farmJobActive(current?.job));
  const completed = current?.job?.status === "completed" ? current.job.result : null;
  // The slot overview shares only results scoped to the visible character/profile/settings.
  useEffect(() => { onResult?.(completed ?? null); }, [completed, onResult]);
  const failure = current?.error || (current?.job?.status === "failed" ? current.job.error : null);
  const messages: Record<string, string> = { session_expired: c.session, plan_already_running: c.running, plan_rate_limited: c.rateLimit,
    plan_not_found: c.expired, plan_request_expired: c.expired, plan_timed_out: c.expired,
    plan_connection_interrupted: c.disconnected, character_snapshot_changed: c.changed, equipment_constraints_unverified: c.equipmentError };
  const progress = current?.job?.progress, phase = progress?.phase;
  const progressLabel = phase === "rewards" ? c.rewards : phase === "simulating" ? c.simulating : c.sources;
  return <section className={`${tools.tool} ${styles.panel}`} aria-labelledby={titleId} aria-busy={running} data-gear-farm>
    <div className={tools.head}>
      <h3 className={tools.title} id={titleId}>{c.title}</h3>
      <div className={tools.actions}>
        {canCancel ? <button type="button" className={tools.quiet} disabled={current?.cancelling} onClick={() => void active.current?.cancel()}>{current?.cancelling ? c.cancelling : c.cancel}</button> : null}
        <MaterialButton kit={CHARACTERS_KIT} fit="stack" variant="primary" type="button" onClick={() => void (current?.recoverable ? active.current?.recover() : active.current?.start())} disabled={running} icon={running ? <LoaderCircle className={tools.spin} aria-hidden="true" /> : <Search aria-hidden="true" />}>{running ? current?.initializing ? c.recovering : c.searching : current?.recoverable ? c.retry : c.start}</MaterialButton>
      </div>
    </div>
    <div className={tools.fields}>
      <div className={tools.field}><label htmlFor={`${titleId}-dungeon`}>{c.dungeonDifficulty}</label><AtlasValyroSelect native id={`${titleId}-dungeon`} value={settings.dungeonDifficulty}
        options={farmDungeonDifficulties.map(value => ({ value, label: difficultyLabel(value, c) }))}
        onValueChange={value => changeSettings({ dungeonDifficulty: value as GearFarmSettings["dungeonDifficulty"], raidDifficulty: settings.raidDifficulty,
          ...(value === "mythic-plus" ? { mythicKeyLevel: farmMythicKeyBounds.min } : {}) })} /></div>
      <div className={tools.field}><label htmlFor={`${titleId}-raid`}>{c.raidDifficulty}</label><AtlasValyroSelect native id={`${titleId}-raid`} value={settings.raidDifficulty}
        options={farmRaidDifficulties.map(value => ({ value, label: difficultyLabel(value, c) }))}
        onValueChange={value => changeSettings({ ...settings, raidDifficulty: value as GearFarmSettings["raidDifficulty"] })} /></div>
      {settings.dungeonDifficulty === "mythic-plus" ? <div className={tools.field}><label htmlFor={`${titleId}-key`}>{c.keyLevel}</label><AtlasValyroSelect native id={`${titleId}-key`} value={String(settings.mythicKeyLevel)}
        options={Array.from({ length: farmMythicKeyBounds.max - farmMythicKeyBounds.min + 1 }, (_, index) => ({ value: String(index + farmMythicKeyBounds.min), label: `+${index + farmMythicKeyBounds.min}` }))}
        onValueChange={value => changeSettings({ ...settings, mythicKeyLevel: Number(value) })} /></div> : null}
    </div>
    {!completed && (settings.dungeonDifficulty !== "normal" || settings.raidDifficulty !== "raid-finder") ? <p className={tools.status}>{c.endgameUnavailable}</p> : null}
    {running ? <div role="status" className={tools.status}>{current?.cancelling ? c.cancelling : current?.reconnecting ? c.reconnecting : current?.initializing ? c.recovering : progressLabel}{progress && phase !== "sources" && !current?.reconnecting && !current?.initializing ? ` ${progress.completed} / ${progress.total}` : ""}</div> : null}
    {running && progress?.total ? <div className={tools.progress} aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, progress.completed / progress.total)})` }} /></div> : null}
    {failure ? <p role="alert" className={tools.alert}><AlertTriangle aria-hidden="true" />{messages[failure] ?? (failure === "farm_plan_unavailable" ? c.genericError : c.unavailable)}</p> : null}
    {current?.job?.status === "cancelled" ? <p role="status" className={tools.status}>{c.cancelled}</p> : null}
    {running ? <ResultsSkeleton /> : null}
    {completed ? <Results result={completed} c={c} ru={ru} /> : null}
  </section>;
}
