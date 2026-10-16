"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AuctionGearJob } from "@/lib/wow/auctionGearJobs";
import type { AuctionGearAssemblyResult, AuctionGearSearchResult, AuctionPlanProgress } from "@/lib/wow/auctionGearTypes";
import { auctionGearSlots, parseAuctionGearSlots, type AuctionGearSlot } from "@/lib/wow/auctionGearSelection";
import { goldToCopper } from "@/lib/wow/auctionMarket";
import { getAuctionGearRecommendations } from "@/lib/wow/auctionGearRecommendations";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { GearPlannerItem } from "./GearPlannerItem";
import styles from "./auctionGearOptimizer.module.css";

const slotNames: Record<string, [string, string]> = {
  HEAD: ["Голова", "Head"], NECK: ["Шея", "Neck"], SHOULDER: ["Плечи", "Shoulders"],
  CHEST: ["Грудь", "Chest"], WAIST: ["Пояс", "Waist"], LEGS: ["Ноги", "Legs"],
  FEET: ["Ступни", "Feet"], WRIST: ["Запястья", "Wrists"], HANDS: ["Кисти рук", "Hands"],
  BACK: ["Спина", "Back"], FINGER_1: ["Кольцо 1", "Ring 1"], FINGER_2: ["Кольцо 2", "Ring 2"],
  TRINKET_1: ["Аксессуар 1", "Trinket 1"], TRINKET_2: ["Аксессуар 2", "Trinket 2"],
  MAIN_HAND: ["Правая рука", "Main hand"], OFF_HAND: ["Левая рука", "Off hand"],
};
type Props = { characterSlug: string; snapshotKey: string; specializationSlug: string; localePrefix?: "" | "/ru" };
type Metadata = Pick<NonNullable<AuctionGearJob["result"]>, "market" | "profileFingerprint" | "scenario" | "coverage">;
type SearchResult = AuctionGearSearchResult & Metadata;
type AssemblyResult = AuctionGearAssemblyResult & Metadata;
type PlannerJob = Omit<AuctionGearJob, "result"> & { result: SearchResult | AssemblyResult | null };
type Mode = "search" | "assembly";
type Transport = { mode: Mode; status: PlannerJob["status"] | "starting"; progress: AuctionPlanProgress | null; error: string | null };
type SearchRequest = { action: "search"; characterSlug: string; budgetGold: string; selectedSlots: AuctionGearSlot[]; scenario: string; locale: "ru" | "en" };
type RequestBody = SearchRequest | { action: "resume"; searchId: string } | { action: "assemble"; searchId: string; allowedOptionIds: string[] };
type ActiveRequest = { mode: Mode; controller: AbortController; id?: string; done: Promise<void>; finish: () => void };

function removeAuctionJob(id: string) {
  return fetch(`/api/wow/auction-gear-plans?id=${encodeURIComponent(id)}`, {
    method: "DELETE", keepalive: true, signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
function pollDelay(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1500);
    function abort() { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function AuctionGearOptimizer(props: Props) {
  return <AuctionGearOptimizerContent key={`${props.characterSlug}:${props.snapshotKey}:${props.specializationSlug}:${props.localePrefix ?? "/ru"}`} {...props} />;
}
function AuctionGearOptimizerContent({ characterSlug, specializationSlug, localePrefix = "/ru" }: Props) {
  const locale = localePrefix === "/ru" ? "ru" : "en";
  const ru = locale === "ru";
  const t = (r: string, e: string) => ru ? r : e;
  const [budget, setBudget] = useState("10000");
  const [scenario, setScenario] = useState("single-target");
  const [selectedSlots, setSelectedSlots] = useState<AuctionGearSlot[]>([...auctionGearSlots]);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [assembly, setAssembly] = useState<AssemblyResult | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<"price" | "dps">("price");
  const [visibleItems, setVisibleItems] = useState(20);
  const [transport, setTransport] = useState<Transport | null>(null);
  const active = useRef<ActiveRequest | null>(null);
  const retiring = useRef<Promise<unknown>>(Promise.resolve());
  const theme = getTalentSpecTheme(specializationSlug);
  const supported = theme && ["melee", "ranged"].includes(theme.role);
  const running = transport?.status === "starting" || transport?.status === "queued" || transport?.status === "running";
  const numeric = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
  const signed = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const gold = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 4 });
  const number = (value: number) => numeric.format(value);
  const money = (value: number) => `${gold.format(value / 10000)} ${t("зол.", "gold")}`;
  const slotName = (slot: string) => slotNames[slot]?.[ru ? 0 : 1] ?? slot;
  const recommendations = useMemo(() => getAuctionGearRecommendations(search?.items ?? []), [search]);
  const sortedItems = useMemo(() => [...recommendations].sort((a, b) => {
    if (sort === "dps") {
      const aDps = a.comparison?.deltaDps ?? -Infinity, bDps = b.comparison?.deltaDps ?? -Infinity;
      if (aDps !== bDps) return bDps > aDps ? 1 : -1;
    }
    return a.lotCostCopper - b.lotCostCopper || (b.comparison?.deltaDps ?? 0) - (a.comparison?.deltaDps ?? 0) || a.auctionId - b.auctionId || a.optionId.localeCompare(b.optionId);
  }), [recommendations, sort]);
  const allowed = recommendations.filter(item => !excluded.has(item.optionId)).map(item => item.optionId);
  const lots = assembly ? [...new Map(assembly.purchases.map(item => [item.auctionId, item])).values()] : [];
  const messages: Record<string, string> = {
    invalid_budget: t("Введите сумму в золоте: от 0, не более четырёх знаков после запятой.", "Enter a gold budget of 0 or more, with up to four decimal places."),
    invalid_equipment_slots: t("Выберите хотя бы один слот экипировки.", "Choose at least one equipment slot."),
    session_expired: t("Войдите в Battle.net повторно.", "Sign in to Battle.net again."),
    market_stale: t("Снимок аукциона устарел. Запустите новый поиск после обновления рынка.", "The auction snapshot is too old. Start a new search after the market updates."),
    market_timestamp_unverified: t("Не удалось подтвердить время обновления аукциона.", "The auction update time could not be verified."),
    equipment_constraints_unverified: t("В каталоге не хватает данных об ограничениях надетых вещей.", "The catalog is missing constraints for your equipped items."),
    damage_specialization_required: t("Сравнение DPS доступно для специализаций, наносящих урон.", "DPS comparisons are available for damage specializations."),
    plan_already_running: t("Предыдущий расчёт ещё выполняется.", "Your previous calculation is still running."),
    plan_rate_limited: t("Слишком много запусков. Подождите минуту и продолжите расчёт.", "Too many searches. Wait a minute and continue."),
    plan_queue_full: t("Очередь расчётов заполнена. Повторите позже.", "The calculation queue is full. Try again later."),
    simulation_unavailable: t("Сервис SimulationCraft сейчас недоступен. Повторите позже.", "SimulationCraft is unavailable. Try again later."),
    variant_metadata_worker_upgrade_required: t("Проверка характеристик вещей сейчас недоступна. Повторите позже.", "Item property verification is unavailable. Try again later."),
    variant_resolution_unavailable: t("Не удалось проверить свойства аукционных вещей. Повторите позже.", "Auction item properties could not be verified. Try again later."),
    item_reference_unavailable: t("Не удалось получить контрольные данные вещей от Blizzard. Повторите позже.", "Blizzard item reference data could not be loaded. Try again later."),
    plan_not_found: t("Расчёт больше недоступен. Запустите новый поиск.", "The search has expired. Start a new search."),
    search_not_found: t("Список вещей больше недоступен. Запустите новый поиск.", "The item list has expired. Start a new search."),
    search_expired: t("Список вещей устарел. Запустите новый поиск.", "The item list has expired. Start a new search."),
    search_capacity: t("Сейчас выполняется слишком много поисков. Повторите позже.", "Too many searches are active. Try again later."),
    search_not_ready: t("Дождитесь первого результата поиска, затем продолжите расчёт.", "Wait for the first search result before continuing."),
    auction_market_changed: t("Лоты или цены на рынке изменились. Запустите новый поиск.", "Auction lots or prices changed. Start a new search."),
    invalid_auction_selection: t("Выбранные варианты больше недоступны. Запустите новый поиск.", "The selected options are no longer available. Start a new search."),
    character_snapshot_changed: t("Экипировка персонажа изменилась. Запустите новый поиск.", "Your character equipment changed. Start a new search."),
    simulation_version_changed: t("Движок расчёта обновился. Запустите новый поиск.", "The simulation engine changed. Start a new search."),
  };
  const failureText = (error: string | null) => error ? messages[error] ?? t("Не удалось завершить расчёт. Повторите попытку.", "The calculation could not finish. Try again.") : "";

  useEffect(() => () => {
    const current = active.current;
    active.current = null;
    current?.controller.abort();
    if (current?.id) void removeAuctionJob(current.id);
  }, []);

  function invalidate() { setSearch(null); setAssembly(null); setExcluded(new Set()); setTransport(null); setVisibleItems(20); }
  async function run(initial: RequestBody, mode: Mode) {
    if (active.current) return;
    let finish!: () => void;
    const request: ActiveRequest = { mode, controller: new AbortController(), done: new Promise(resolve => { finish = resolve; }), finish: () => finish() };
    const cleanup = retiring.current;
    active.current = request;
    setTransport({ mode, status: "starting", progress: null, error: null });
    if (mode === "search") setAssembly(null);
    let body = initial;
    try {
      // A new action waits for cancellation cleanup, including a late POST ID.
      await cleanup;
      while (active.current === request && !request.controller.signal.aborted) {
        request.id = undefined;
        let response = await fetch("/api/wow/auction-gear-plans", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          // Keep receiving the created ID after cancellation or unmount.
          signal: AbortSignal.timeout(30_000),
        });
        let payload = await response.json() as PlannerJob;
        if (!response.ok) throw new Error(payload.error ?? "auction_plan_unavailable");
        request.id = payload.id;
        if (active.current !== request || request.controller.signal.aborted) { await removeAuctionJob(payload.id); return; }
        while (payload.status === "queued" || payload.status === "running") {
          setTransport({ mode, status: payload.status, progress: payload.progress, error: null });
          await pollDelay(request.controller.signal);
          response = await fetch(`/api/wow/auction-gear-plans?id=${encodeURIComponent(request.id)}`, { cache: "no-store", signal: request.controller.signal });
          payload = await response.json() as PlannerJob;
          if (!response.ok) throw new Error(payload.error ?? "auction_plan_unavailable");
          if (active.current !== request || request.controller.signal.aborted) return;
        }
        if (active.current !== request || request.controller.signal.aborted) return;
        if (payload.status === "failed") throw new Error(payload.error ?? "auction_plan_unavailable");
        if (payload.status === "cancelled") { setTransport({ mode, status: "cancelled", progress: null, error: null }); return; }
        const result = payload.result;
        if (payload.status !== "completed" || !result || result.kind !== mode) throw new Error("invalid_plan_result");
        if (body.action !== "search" && result.searchId !== body.searchId) throw new Error("invalid_plan_result");
        let complete: boolean;
        if (result.kind === "search") {
          setSearch(previous => previous?.searchId === result.searchId ? {
            ...result, items: [...new Map([...previous.items, ...result.items].map(item => [item.optionId, item])).values()],
          } : result);
          complete = result.searchComplete;
          body = { action: "resume", searchId: result.searchId };
        } else {
          setAssembly(result);
          complete = result.exhaustiveComplete;
        }
        if (complete) { setTransport({ mode, status: "completed", progress: null, error: null }); return; }
        setTransport({ mode, status: "starting", progress: null, error: null });
      }
    } catch (reason) {
      if (active.current === request && !request.controller.signal.aborted) {
        if (request.id) await removeAuctionJob(request.id);
        if (active.current === request && !request.controller.signal.aborted) {
          setTransport({ mode, status: "failed", progress: null, error: reason instanceof Error ? reason.message : "auction_plan_unavailable" });
        }
      }
    } finally {
      if (active.current === request) active.current = null;
      request.finish();
    }
  }
  function startSearch() {
    if (active.current) return;
    try {
      goldToCopper(budget);
      const slots = parseAuctionGearSlots(selectedSlots);
      invalidate();
      void run({ action: "search", characterSlug, budgetGold: budget, selectedSlots: slots, scenario, locale }, "search");
    } catch (reason) {
      setTransport({ mode: "search", status: "failed", progress: null, error: reason instanceof Error ? reason.message : "invalid_plan_request" });
    }
  }
  function startAssembly() {
    if (!search || !allowed.length || active.current) return;
    void run({ action: "assemble", searchId: search.searchId, allowedOptionIds: allowed }, "assembly");
  }
  function cancel() {
    const current = active.current;
    if (!current) return;
    active.current = null;
    current.controller.abort();
    const deletion = current.id ? removeAuctionJob(current.id) : Promise.resolve();
    retiring.current = Promise.all([current.done, deletion]);
    setTransport({ mode: current.mode, status: "cancelled", progress: null, error: null });
  }
  function setAllowed(optionId: string, value: boolean) {
    setExcluded(previous => { const next = new Set(previous); if (value) next.delete(optionId); else next.add(optionId); return next; });
    setAssembly(null);
    setTransport(null);
  }
  const progress = transport?.progress;
  const progressText = !progress ? t("Ожидаем расчёта…", "Waiting for calculation…")
    : transport?.mode === "assembly" ? t("Проверяем совместимые комплекты…", "Comparing compatible loadouts…")
    : progress?.phase === "market" ? t("Загружаем рынок сервера…", "Loading your realm market…")
    : progress?.phase === "catalog" ? t("Проверяем совместимость вещей…", "Checking item compatibility…")
    : progress?.phase === "variants" ? t("Проверяем точные свойства вариантов…", "Resolving exact item properties…")
    : t("Рассчитываем DPS каждой замены…", "Calculating DPS for each replacement…");
  const feedback = (mode: Mode) => transport?.mode !== mode ? null : <>
    {running ? <p role="status" className={styles.note}>{progressText}{progress ? ` ${number(progress.completed)} / ${number(progress.total)}` : ""}</p> : null}
    {transport.status === "failed" ? <p role="alert" className={styles.feedback}>{failureText(transport.error)}</p> : null}
    {transport.status === "cancelled" ? <p role="status" className={styles.note}>{search ? t("Расчёт остановлен. Полученные результаты сохранены.", "Calculation stopped. Available results have been kept.") : t("Поиск отменён.", "Search cancelled.")}</p> : null}
  </>;
  const significantGain = Boolean(assembly && assembly.comparison.deltaDps > 0 && assembly.comparison.uncertainty.significant);

  return <section className={styles.panel} aria-labelledby="auction-gear-title" data-auction-gear>
    <header><small>{t("АУКЦИОН СЕРВЕРА", "REALM AUCTION HOUSE")}</small><h2 id="auction-gear-title">{t("Найти вещи под бюджет", "Find gear within your budget")}</h2><p>{t("Выберите слоты — покажем вещи с подтверждённым приростом DPS. Из выбранных улучшений можно собрать единый совместимый сет под бюджет.", "Choose equipment slots to see items with a confirmed DPS gain. Build a compatible whole loadout within budget from the upgrades you select.")}</p></header>
    {!supported ? <p>{messages.damage_specialization_required}</p> : <form onSubmit={event => { event.preventDefault(); startSearch(); }}>
      <div className={styles.controls}>
        <label>{t("Бюджет, золото", "Budget, gold")}<input name="budgetGold" inputMode="decimal" value={budget} onChange={event => { setBudget(event.target.value); invalidate(); }} disabled={running} required aria-describedby="auction-budget-help" /></label>
        <label>{t("Сценарий", "Encounter")}<select value={scenario} onChange={event => { setScenario(event.target.value); invalidate(); }} disabled={running}>
          <option value="single-target">{t("Одна цель · 120 секунд", "Single target · 120 seconds")}</option><option value="aoe">{t("5 целей · 60 секунд", "5 targets · 60 seconds")}</option><option value="execute">{t("Короткий бой · 90 секунд", "Short fight · 90 seconds")}</option>
        </select></label>
      </div>
      <fieldset className={styles.slotFieldset} disabled={running}>
        <legend>{t("Какие слоты искать", "Equipment slots to search")}</legend>
        <div className={styles.selectionActions}><button className={styles.button} type="button" onClick={() => { setSelectedSlots([...auctionGearSlots]); invalidate(); }}>{t("Выбрать все", "Select all")}</button><button className={styles.button} type="button" onClick={() => { setSelectedSlots([]); invalidate(); }}>{t("Снять выбор", "Clear selection")}</button></div>
        <div className={styles.slots}>{auctionGearSlots.map(slot => <label key={slot}><input type="checkbox" name="selectedSlots" value={slot} checked={selectedSlots.includes(slot)} onChange={event => { setSelectedSlots(previous => event.target.checked ? auctionGearSlots.filter(value => value === slot || previous.includes(value)) : previous.filter(value => value !== slot)); invalidate(); }} /><span>{slotName(slot)}</span></label>)}</div>
      </fieldset>
      <p id="auction-budget-help" className={styles.note}>{t("Покажем улучшения не дороже бюджета. Единый сет тоже останется в этой сумме. Цена — за целый лот; покупки вы совершаете сами.", "Each listed upgrade costs no more than your budget. The whole loadout also stays within that amount. Prices cover whole lots; you make the purchases yourself.")}</p>
      <div className={styles.actions}><button className={styles.button} type="submit" disabled={running}>{running && transport?.mode === "search" ? t("Ищем вещи…", "Searching…") : search ? t("Новый поиск", "New search") : t("Найти улучшения", "Find upgrades")}</button>{!search ? <button className={`${styles.button} ${styles.primaryButton}`} type="button" disabled aria-describedby="auction-assembly-start-help">{t("Собрать сет под бюджет", "Build a loadout within budget")}</button> : null}{running && transport?.mode === "search" ? <button className={styles.button} type="button" onClick={cancel}>{t("Отменить поиск", "Cancel search")}</button> : null}</div>
      {!search ? <p id="auction-assembly-start-help" className={styles.note}>{t("Сначала найдите подтверждённые улучшения. Затем можно собрать из них единый сет в пределах указанного бюджета.", "Find confirmed upgrades first, then combine them into a whole loadout within your budget.")}</p> : null}
    </form>}
    {feedback("search")}
    {search ? <div className={styles.searchResult} data-auction-search-result>
      <p className={styles.market}>{search.market.region.toUpperCase()} · {search.market.realm} · {t("Рынок обновлён", "Market updated")} <time dateTime={new Date(search.market.updatedAt).toISOString()}>{new Date(search.market.updatedAt).toLocaleString(ru ? "ru-RU" : "en-US")}</time></p>
      <dl className={styles.totals}><div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(search.budgetCopper)}</dd></div><div><dt>{t("Текущий DPS", "Current DPS")}</dt><dd>{number(search.baseline.dps)}</dd></div><div><dt>{t("Подтверждено улучшений", "Confirmed upgrades")}</dt><dd>{recommendations.length}</dd></div></dl>
        <section id="auction-assembly" tabIndex={-1} className={styles.assembly} aria-labelledby="auction-assembly-title" data-auction-assembly>
          <h3 id="auction-assembly-title">{t("Собрать сет под бюджет", "Build a loadout within budget")}</h3><p className={styles.note}>{t("Бюджет сета", "Loadout budget")}: <strong>{money(search.budgetCopper)}</strong>. {t("Подберём совместимое сочетание выбранных улучшений из списка ниже.", "Find a compatible combination of the upgrades selected in the list below.")} {t("Выбрано улучшений", "Upgrades selected")}: {allowed.length} / {recommendations.length}.</p>
          <div className={styles.actions}><button className={`${styles.button} ${styles.primaryButton}`} type="button" disabled={running || !allowed.length || assembly?.exhaustiveComplete === true} onClick={startAssembly}>{running && transport?.mode === "assembly" ? t("Собираем сет…", "Building loadout…") : assembly && !assembly.exhaustiveComplete ? t("Продолжить сборку сета", "Continue loadout assembly") : t("Собрать сет под бюджет", "Build a loadout within budget")}</button>{running && transport?.mode === "assembly" ? <button className={styles.button} type="button" onClick={cancel}>{t("Отменить сборку", "Cancel assembly")}</button> : null}</div>
          {!allowed.length ? <p className={styles.note}>{recommendations.length ? t("Выберите хотя бы одно улучшение в списке ниже.", "Select at least one upgrade in the list below.") : t("Для сборки нужно хотя бы одно подтверждённое улучшение DPS.", "At least one confirmed DPS upgrade is needed to build a loadout.")}</p> : null}
          {running && transport?.mode === "search" ? <p className={styles.note}>{t("Сборка станет доступна после завершения или остановки поиска.", "Assembly becomes available when the search finishes or is stopped.")}</p> : !search.searchComplete && allowed.length ? <p className={styles.note}>{t("Поиск ещё не завершён. Сет будет собран из уже подтверждённых улучшений.", "The search is incomplete. The loadout will use the upgrades confirmed so far.")}</p> : null}
          {feedback("assembly")}
          {assembly ? <div className={styles.result} data-auction-assembly-result data-exhaustive={assembly.exhaustiveComplete}>
            <h3>{assembly.exhaustiveComplete ? t("Максимальный расчётный DPS из выбранных улучшений", "Highest simulated DPS from selected upgrades") : t("Лучший из проверенных комплектов", "Best loadout evaluated so far")}</h3>
            <p className={styles.note}>{assembly.exhaustiveComplete ? t("Все сочетания выбранных улучшений проверены. Охват самого рынка может быть ограничен.", "All combinations of the selected upgrades have been checked. Market coverage itself may be limited.") : t("Проверка ещё не завершена. Это лучший найденный результат на текущем шаге.", "Evaluation is incomplete. This is the best result found so far.")} {t("Рассмотрено сочетаний", "Combinations checked")}: {number(assembly.combinationsChecked)}.</p>
            <dl className={styles.totals}><div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(assembly.budgetCopper)}</dd></div><div><dt>{t("Стоимость комплекта", "Loadout cost")}</dt><dd>{money(assembly.spentCopper)}</dd></div><div><dt>{t("Останется", "Remaining")}</dt><dd>{money(assembly.remainingCopper)}</dd></div></dl>
            <dl className={styles.dpsMetrics}><div><dt>{t("Сейчас", "Current gear")}</dt><dd>{number(assembly.comparison.baselineDps)} <span>DPS</span></dd></div><div><dt>{t("С этим комплектом", "With this loadout")}</dt><dd>{number(assembly.comparison.candidateDps)} <span>DPS</span></dd></div><div className={significantGain ? styles.gain : undefined}><dt>{t("Изменение всего комплекта", "Whole-loadout change")}</dt><dd>{signed.format(assembly.comparison.deltaPercent)}% <span>{signed.format(assembly.comparison.deltaDps)} DPS</span></dd></div></dl>
            <p className={significantGain ? styles.confirmed : styles.note}>{significantGain ? t("Прирост DPS превышает погрешность сравнения.", "The DPS gain exceeds the comparison uncertainty.") : t("Прирост не подтверждён: разница в пределах погрешности или улучшения нет.", "No confirmed gain: the difference is within uncertainty or there is no improvement.")} {number(assembly.comparison.confidence)}% {t("доверительный интервал", "confidence interval")}: ±{number(assembly.comparison.uncertainty.marginPercent)}%.</p>
            {lots.length ? <><h3>{t("Что купить для сета", "Items to buy for this loadout")}</h3><p className={styles.note}>{t("Остальные слоты сохраняют текущую экипировку.", "Other slots keep their equipped items.")}</p><ul className={styles.lots}>{lots.map(lot => {
              const replacements = assembly.purchases.filter(item => item.auctionId === lot.auctionId);
              return <li className={styles.lot} key={lot.auctionId}><div className={styles.lotHeader}><div className={styles.purchase}><GearPlannerItem item={lot} locale={locale} /></div><div className={styles.price}><span className={styles.label}>{t("Цена целого лота", "Whole-lot price")}</span><strong>{money(lot.lotCostCopper)}</strong><span>{t("Количество в лоте", "Lot quantity")}: {lot.quantity}</span></div></div><ul className={styles.replacements}>{replacements.map(item => <li key={item.slotType}><div className={styles.replacementLabel}><strong>{slotName(item.slotType)}</strong><span>{t("Заменяет надетый предмет", "Replaces equipped item")}</span></div>{item.currentItem ? <GearPlannerItem item={item.currentItem} locale={locale} /> : <span className={styles.note}>{t("Надетый предмет не указан.", "Equipped item details are unavailable.")}</span>}</li>)}</ul>{lot.quantity > 1 ? <p className={styles.note}>{t(`Используется ${replacements.length} из ${lot.quantity} шт. Цена целого лота учтена один раз.`, `Uses ${replacements.length} of ${lot.quantity} items. The whole lot is charged once.`)}</p> : null}</li>;
            })}</ul></> : <p>{assembly.exhaustiveComplete ? t("Текущая экипировка дала максимальный расчётный DPS среди сочетаний выбранных улучшений.", "Your current gear had the highest simulated DPS among combinations of the selected upgrades.") : t("На текущем шаге замена экипировки не дала более высокого расчётного DPS.", "No replacement has produced higher simulated DPS so far.")}</p>}
            {assembly.removedSlots.includes("OFF_HAND") ? <p className={styles.note}>{t("Для двуручного оружия предмет из левой руки снимается.", "The off-hand item is removed to equip the two-handed weapon.")}</p> : null}
          </div> : null}
        </section>
      <h3>{t("Улучшения с аукциона", "Auction upgrades")}</h3>
      <p className={styles.note}>{t("Каждая замена сравнивается отдельно с текущей экипировкой. Эти проценты нельзя складывать. DPS — средний урон в секунду в выбранном бою.", "Each replacement is compared separately with your equipped gear. These percentages cannot be added together. DPS means average damage per second in the selected fight.")}</p>
      <p className={styles.note}>{search.searchComplete ? t("Проверка завершена. Показаны только подтверждённые улучшения.", "Evaluation is complete. Only confirmed upgrades are shown.") : `${t("Осталось проверить замен", "Replacements still to evaluate")}: ${number(search.pendingItems)}.`} {search.searchLimited ? t("Охват рынка ограничен проверенными вариантами.", "Market coverage is limited to the verified variants.") : ""}</p>
      {!search.searchComplete && !running ? <button className={styles.button} type="button" onClick={() => void run({ action: "resume", searchId: search.searchId }, "search")}>{t("Продолжить проверку вещей", "Continue item comparisons")}</button> : null}
      {recommendations.length ? <>
        <div className={styles.listToolbar}><label>{t("Сортировка", "Sort by")}<select value={sort} onChange={event => { setSort(event.target.value as "price" | "dps"); setVisibleItems(20); }}><option value="price">{t("Цена: от дешёвых", "Price: lowest first")}</option><option value="dps">{t("Изменение DPS: от большего", "DPS change: highest first")}</option></select></label><p>{t("Разрешено для сборки", "Allowed for assembly")}: <strong>{allowed.length} / {recommendations.length}</strong></p></div>
        <div className={styles.selectionActions}><button className={styles.button} type="button" disabled={running} onClick={() => { setExcluded(new Set()); setAssembly(null); setTransport(null); }}>{t("Выбрать все улучшения", "Select all upgrades")}</button><button className={styles.button} type="button" disabled={running} onClick={() => { setExcluded(new Set(recommendations.map(item => item.optionId))); setAssembly(null); setTransport(null); }}>{t("Снять выбор улучшений", "Clear upgrade selection")}</button></div>
        <ul className={styles.lots}>{sortedItems.slice(0, visibleItems).map(item => <li className={styles.lot} key={item.optionId} data-auction-option={item.optionId} data-auction-evaluation={item.evaluation}>
          <div className={styles.lotHeader}><div className={styles.purchase}><span className={styles.label}>{slotName(item.slotType)}</span><GearPlannerItem item={item} locale={locale} /></div><div className={styles.price}><span className={styles.label}>{t("Цена целого лота", "Whole-lot price")}</span><strong>{money(item.lotCostCopper)}</strong><span>{t("Количество в лоте", "Lot quantity")}: {item.quantity}</span></div></div>
          <div className={styles.optionDetails}><div className={styles.individual} data-positive><strong>{t("Подтверждённый прирост", "Confirmed improvement")}</strong>{item.comparison ? <><span className={styles.delta}>{signed.format(item.comparison.deltaPercent)}% <small>· {signed.format(item.comparison.deltaDps)} DPS</small></span><span className={styles.note}>{number(item.comparison.confidence)}% {t("доверительный интервал", "confidence interval")}: ±{number(item.comparison.uncertainty.marginPercent)}%</span></> : null}</div><label className={styles.include}><input type="checkbox" checked={!excluded.has(item.optionId)} disabled={running} onChange={event => setAllowed(item.optionId, event.target.checked)} aria-label={`${t("Учитывать при сборке", "Allow in assembly")}: ${item.name}, ${slotName(item.slotType)}`} /><span>{t("Учитывать при сборке", "Allow in assembly")}</span></label></div>
          <div className={styles.replacement}><span>{t("Заменяет", "Replaces")}</span>{item.currentItem ? <GearPlannerItem item={item.currentItem} locale={locale} /> : <span className={styles.note}>{t("Надетый предмет не указан.", "Equipped item details are unavailable.")}</span>}</div>
        </li>)}</ul>
        {visibleItems < sortedItems.length ? <button className={styles.button} type="button" onClick={() => setVisibleItems(value => value + 20)}>{t("Показать ещё", "Show more")} · {Math.min(20, sortedItems.length - visibleItems)}</button> : null}
        <p className={styles.note}>{t("Показано замен", "Replacements shown")}: {Math.min(visibleItems, sortedItems.length)} / {sortedItems.length}. {t("Один лот может подходить разным слотам; при сборке его цена учитывается один раз.", "One lot can fit different slots; assembly charges its price once.")}</p>
        <a className={styles.returnToAssembly} href="#auction-assembly">{t("Вернуться к сборке сета", "Return to loadout assembly")}</a>
      </> : <p role="status" className={styles.empty}>{search.searchComplete ? t("Для выбранных слотов в этом бюджете подтверждённых улучшений DPS не найдено.", "No confirmed DPS upgrades were found for the selected slots within this budget.") : t("Подтверждённых улучшений пока нет. Проверка найденных вещей ещё не завершена.", "No upgrades have been confirmed yet. Evaluation of the found items is still incomplete.")}</p>}
      <p className={styles.note}>{t("Лоты могут выкупить другие игроки. Перед покупкой сверьте цену, уровень и характеристики. Зачарования и камни в бюджет не включены.", "Other players can buy these lots. Check the price, item level and properties before purchasing. Enchants and gems are excluded from the budget.")}</p>
      <details className={styles.calculation}><summary>{t("Как получен результат", "How this result was calculated")}</summary><p>{t("Индивидуальных расчётов", "Individual simulations")}: {number(search.simulations)}. {t("Движок", "Engine")}: {search.engine}.</p>{assembly ? <p>{t("Допустимых сочетаний", "Valid combinations")}: {number(assembly.validCombinations)}. {t("Сочетаний до проверки бюджета и совместимости", "Combinations before budget and compatibility checks")}: {assembly.combinationCount}.</p> : null}</details>
    </div> : null}
  </section>;
}
