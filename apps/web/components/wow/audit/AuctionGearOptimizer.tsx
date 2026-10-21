"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuctionGearJob } from "@/lib/wow/auctionGearJobs";
import type { AuctionGearAssemblyResult, AuctionGearSearchResult, AuctionPlanProgress } from "@/lib/wow/auctionGearTypes";
import { auctionGearSlots, parseAuctionGearSlots, type AuctionGearSlot } from "@/lib/wow/auctionGearSelection";
import { encodeAuctionGearSelectionTransport } from "@/lib/wow/auctionGearSelectionTransport";
import { normalizeAuctionBudgetGold } from "@/lib/wow/auctionGearBudget";
import { auctionGearMarketExpiry, auctionGearPricesAreFresh } from "@/lib/wow/auctionGearFreshness";
import { auctionGearVariantSelectionKey } from "@/lib/wow/auctionGearExclusions";
import { auctionGearCoverageReasons } from "@/lib/wow/auctionGearCoverage";
import { getAuctionGearRecommendationGroups, getAuctionGearRecommendations } from "@/lib/wow/auctionGearRecommendations";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { AuctionClientError, auctionClientCacheKey, auctionClientDelay, auctionClientPollDelay, auctionClientJobUrl, auctionClientRequestUrl, clearAcknowledgedAuctionClientCache, fetchAuctionClientResult,
  forgetAuctionClientJob, forgetAuctionClientRequest, hasPendingAuctionClientJob, readAuctionClientCache, parseAuctionClientFormIntent, releasePriorAuctionClientJob, rememberAuctionClientJob, rememberAuctionClientRequest,
  removeAuctionClientJob, removeAuctionClientRequest, retireAuctionClient, waitForAuctionClientRetirement, writeAuctionClientCache,
  parseAuctionClientActiveRecovery, type AuctionClientActiveRecovery, type AuctionClientCache } from "@/lib/wow/auctionGearClient";
import { auctionGearServiceMessage } from "@/lib/wow/auctionGearCopy";
import { GearPlannerItem, gearPlannerItemStatDescription } from "./GearPlannerItem";
import { AuctionGearSuggestions } from "./AuctionGearSuggestions";
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
type Metadata = Pick<NonNullable<AuctionGearJob["result"]>, "market" | "profileFingerprint" | "scenario" | "coverage" | "objective">;
type SearchResult = AuctionGearSearchResult & Metadata;
type AssemblyResult = AuctionGearAssemblyResult & Metadata;
type PlannerJob = Omit<AuctionGearJob, "result"> & { result: SearchResult | AssemblyResult | null };
type Mode = "search" | "assembly";
type Transport = { mode: Mode; status: PlannerJob["status"] | "starting"; progress: AuctionPlanProgress | null; error: string | null };
type SearchRequest = { action: "search"; clientRequestId?: string; characterSlug: string; budgetGold: string; selectedSlots: AuctionGearSlot[]; scenario: string; objective: "value" | "dps"; locale: "ru" | "en" };
type RequestBody = SearchRequest | { action: "resume"; searchId: string; clientRequestId?: string } | { action: "assemble"; searchId: string; excludedOptionIds: string[]; excludedVariantKeys: string[]; clientRequestId?: string } | { action: "poll"; id: string; observedActive?: boolean };
type ActiveRequest = { mode: Mode; controller: AbortController; id?: string; observedActive?: boolean; done: Promise<void>; finish: () => void };
const jobIsActive = (job: Pick<PlannerJob, "status">) => job.status === "queued" || job.status === "running";
const intentMatchesSearch = (intent: NonNullable<ReturnType<typeof parseAuctionClientFormIntent>>, result: SearchResult) =>
  Number(intent.budgetGold) === result.budgetCopper / 10000 && intent.scenario === result.scenario &&
  intent.objective === (result.objective ?? "dps") && sameSelection(intent.selectedSlots, parseAuctionGearSlots(result.selectedSlots));
const sameSelection = (a: readonly string[] = [], b: readonly string[] = []) => { const left = new Set(a), right = new Set(b); return left.size === right.size && [...left].every(key => right.has(key)); };
type Recovery = { kind: "recovery"; search: SearchResult; assembly: AssemblyResult | null;
  excludedOptionIds: string[]; excludedVariantKeys?: string[]; activeJob: PlannerJob | null; needsRefresh: true };

export function AuctionGearOptimizer(props: Props) {
  return <AuctionGearOptimizerContent key={`${props.characterSlug}:${props.snapshotKey}:${props.specializationSlug}:${props.localePrefix ?? "/ru"}`} {...props} />;
}
function AuctionGearOptimizerContent({ characterSlug, snapshotKey, specializationSlug, localePrefix = "/ru" }: Props) {
  const locale = localePrefix === "/ru" ? "ru" : "en";
  const ru = locale === "ru";
  const t = (r: string, e: string) => ru ? r : e;
  const [initializing, setInitializing] = useState(true);
  const [discovered, setDiscovered] = useState<AuctionClientActiveRecovery | null>(null);
  const [ownerLookupFailed, setOwnerLookupFailed] = useState(false);
  const [budget, setBudgetInput] = useState("10000");
  // Keep the accepted amount separate from intermediate keyboard drafts. Recovery
  // restores valid server-owned intent through this setter; typing uses raw input.
  const acceptedBudget = useRef("10000");
  const budgetInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const suggestionFocusSlot = useRef<string | null>(null);
  const editFocusRequested = useRef(false);
  const setBudget = useCallback((value: string) => {
    acceptedBudget.current = normalizeAuctionBudgetGold(value, locale);
    setBudgetInput(value);
  }, [locale]);
  let validBudget = true;
  try { normalizeAuctionBudgetGold(budget, locale); } catch { validBudget = false; }
  const [objective, setObjective] = useState<"value" | "dps">("value");
  const [excludedVariantKeys, setExcludedVariantKeys] = useState<Set<string>>(new Set());
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [excludedLimit, setExcludedLimit] = useState(20);
  const [scenario, setScenario] = useState("single-target");
  const [selectedSlots, setSelectedSlots] = useState<AuctionGearSlot[]>([...auctionGearSlots]);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [assembly, setAssembly] = useState<AssemblyResult | null>(null);
  const [assemblyStale, setAssemblyStale] = useState(false);
  const [marketStale, setMarketStale] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [retryJob, setRetryJob] = useState<{ id: string; mode: Mode; observedActive?: boolean } | null>(null);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [cancellation, setCancellation] = useState<"pending" | "failed" | null>(null);
  const cancelling = useRef<Promise<boolean> | null>(null);
  const restoreAfterCancellation = useRef(false);
  const [transport, setTransport] = useState<Transport | null>(null);
  const active = useRef<ActiveRequest | null>(null);
  const recoveryController = useRef<AbortController | null>(null);
  const mountGeneration = useRef(0);
  const scopeAlive = useRef(true);
  const cache = useRef<AuctionClientCache | null>(null);
  const runRef = useRef<((body: RequestBody, mode: Mode) => Promise<void>) | null>(null);
  const cacheKey = auctionClientCacheKey({ characterSlug, locale }, specializationSlug);
  const theme = getTalentSpecTheme(specializationSlug);
  const supported = theme && ["melee", "ranged"].includes(theme.role);
  const running = transport?.status === "starting" || transport?.status === "queued" || transport?.status === "running";
  const formLocked = initializing || running || Boolean(cancellation || discovered?.activeJob || ownerLookupFailed);
  useEffect(() => {
    if (!formLocked && editFocusRequested.current) {
      editFocusRequested.current = false;
      budgetInput.current?.focus();
    }
  }, [formLocked]);
  // Timers and tab re-entry can only expire prices. Only newly verified server
  // work may clear stale state, never a cached completed job or wall-clock tick.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      const now = Date.now();
      let nextExpiry = Infinity;
      for (const [market, expire] of [[search?.market, setMarketStale], [assembly?.market, setAssemblyStale]] as const) {
        if (!market) continue;
        if (!auctionGearPricesAreFresh(market, now)) expire(true);
        else nextExpiry = Math.min(nextExpiry, auctionGearMarketExpiry(market));
      }
      if (Number.isFinite(nextExpiry)) timer = setTimeout(check, Math.max(1, nextExpiry - now + 1));
    };
    check();
    const visible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", visible); };
  }, [search?.market, assembly?.market]);
  const numeric = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
  const signed = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const gold = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 4 });
  const number = (value: number) => numeric.format(value);
  const money = (value: number) => `${gold.format(value / 10000)} ${t("зол.", "gold")}`;
  const slotName = (slot: string) => slotNames[slot]?.[ru ? 0 : 1] ?? slot;
  const recommendationGroups = useMemo(() => getAuctionGearRecommendationGroups(search?.items ?? [], { excludedOptionIds: excluded, excludedVariantKeys }), [search, excluded, excludedVariantKeys]);
  useEffect(() => {
    const slot = suggestionFocusSlot.current;
    if (!slot) return;
    suggestionFocusSlot.current = null;
    const group = [...(panel.current?.querySelectorAll<HTMLElement>("[data-auction-slot]") ?? [])].find(element => element.dataset.auctionSlot === slot);
    const summary = group?.querySelector<HTMLElement>("summary") ?? panel.current?.querySelector<HTMLElement>("[data-auction-exclusions] > summary");
    summary?.focus();
  }, [recommendationGroups]);
  const excludedUpgrades = search && getAuctionGearRecommendations(search.items).some(item => excluded.has(item.optionId) || excludedVariantKeys.has(auctionGearVariantSelectionKey(item)));
  const available = search?.items.filter(item => !excluded.has(item.optionId) && !excludedVariantKeys.has(auctionGearVariantSelectionKey(item))) ?? [];
  const selectionLocked = !validBudget || Boolean(cancellation || running && transport?.mode !== "search");
  const measuredSignificant = Boolean(assembly && assembly.comparison.deltaDps > 0 && assembly.comparison.uncertainty.significant);
  const confirmed = assembly?.bestConfirmed ?? (measuredSignificant ? assembly : null);
  const displayed = confirmed ?? assembly;
  const lots = confirmed ? [...new Map(confirmed.purchases.map(item => [item.auctionId, item])).values()] : [];
  const excludedGroups = useMemo(() => {
    const groups = new Map<string, { item: NonNullable<SearchResult>["items"][number]; lots: Set<number> }>();
    for (const item of search?.items ?? []) {
      const key = auctionGearVariantSelectionKey(item);
      if (!excluded.has(item.optionId) && !excludedVariantKeys.has(key)) continue;
      const group = groups.get(key) ?? { item, lots: new Set<number>() };
      group.lots.add(item.auctionId); groups.set(key, group);
    }
    return [...groups];
  }, [search, excluded, excludedVariantKeys]);
  const messages: Record<string, string> = {
    invalid_budget: t("Введите сумму от 0 до 99 999 999,9999 золота. Пример: 10 000,1234.", "Enter a budget from 0 to 99,999,999.9999 gold. Example: 10,000.1234."),
    invalid_equipment_slots: t("Выберите хотя бы один слот экипировки.", "Choose at least one equipment slot."),
    session_expired: t("Войдите в Battle.net повторно.", "Sign in to Battle.net again."),
    market_stale: t("Снимок аукциона устарел. Запустите новый поиск после обновления рынка.", "The auction snapshot is too old. Start a new search after the market updates."),
    market_timestamp_unverified: t("Не удалось подтвердить время обновления аукциона.", "The auction update time could not be verified."),
    equipment_constraints_unverified: t("В каталоге не хватает данных об ограничениях надетых вещей.", "The catalog is missing constraints for your equipped items."),
    damage_specialization_required: t("Сравнение DPS доступно для специализаций, наносящих урон.", "DPS comparisons are available for damage specializations."),
    plan_already_running: t("Предыдущий расчёт ещё выполняется.", "Your previous calculation is still running."),
    plan_rate_limited: t("Слишком много запусков. Подождите минуту и продолжите расчёт.", "Too many searches. Wait a minute and continue."),
    plan_waiting_for_quota: t("Ожидаем освобождения очереди. Сборка продолжится автоматически…", "Waiting for calculation capacity. Loadout assembly will continue automatically…"),
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
  const failureText = (error: string | null) => error ? auctionGearServiceMessage(error, ru) ?? messages[error] ?? t("Не удалось завершить расчёт. Повторите попытку.", "The calculation could not finish. Try again.") : "";

  // Retire a pending request only on a real scope unmount. Recovery
  // retries and StrictMode effect replay must keep the same server job alive.
  useEffect(() => {
    const generation = ++mountGeneration.current;
    scopeAlive.current = true;
    const isLatestMount = () => mountGeneration.current === generation;
    return () => {
      const pendingRequestId = !active.current ? cache.current?.clientRequestId : undefined;
      queueMicrotask(() => {
        if (isLatestMount()) {
          scopeAlive.current = false;
          if (pendingRequestId) retireAuctionClient(removeAuctionClientRequest(pendingRequestId, { characterSlug, locale }));
        }
      });
    };
  }, []);

  useEffect(() => {
    const stored = readAuctionClientCache(cacheKey);
    const saved = stored?.profileKey === snapshotKey ? stored : null;
    if (stored && !saved) writeAuctionClientCache(cacheKey, null);
    cache.current = saved;
    const controller = new AbortController();
    let mounted = true;
    void (async () => {
      await Promise.resolve();
      if (!mounted) return;
      setInitializing(false);
      if (!saved) return;
      const intent = saved.formIntent;
      if (intent?.characterSlug === characterSlug && intent.locale === locale) {
        setBudget(intent.budgetGold); setScenario(intent.scenario); setObjective(intent.objective); setSelectedSlots(intent.selectedSlots);
      }
      if (saved.cancellationRequested) {
        restoreAfterCancellation.current = Boolean(saved.searchId);
        setExcluded(new Set(saved.excludedOptionIds)); setExcludedVariantKeys(new Set(saved.excludedVariantKeys ?? []));
        await cancel(); return;
      }
      if (saved.jobId && !saved.searchId) { setExcluded(new Set(saved.excludedOptionIds)); setExcludedVariantKeys(new Set(saved.excludedVariantKeys ?? [])); await runRef.current?.({ action: "poll", id: saved.jobId }, saved.mode); return; }
      if (!saved.searchId && !saved.clientRequestId) return;
      recoveryController.current = controller;
      setTransport({ mode: saved.mode, status: "starting", progress: null, error: null });
      try {
        await waitForAuctionClientRetirement();
        controller.signal.throwIfAborted();
        if (saved.clientRequestId) {
          const job = await fetchAuctionClientResult<PlannerJob>(auctionClientRequestUrl(saved.clientRequestId, { characterSlug, locale }), controller.signal, () => {
            if (mounted) setTransport({ mode: saved.mode, status: "starting", progress: null, error: "plan_reconnecting" });
          });
          if (!mounted || controller.signal.aborted) return;
          if (typeof job.id !== "string" || !job.id) throw new Error("invalid_plan_result");
          // A pending assembly may be restored after a reload. Keep its owned
          // search/checkpoint visible even if that job was interrupted.
          if (saved.searchId) {
            const query = new URLSearchParams({ searchId: saved.searchId, characterSlug, locale });
            const previous = await fetchAuctionClientResult<Recovery>(`/api/wow/auction-gear-plans?${query}`, controller.signal, () => {});
            if (!mounted || controller.signal.aborted) return;
            if (previous.kind !== "recovery" || previous.search.searchId !== saved.searchId) throw new Error("invalid_plan_result");
            const currentExclusions = new Set(saved.excludedOptionIds);
            const previousExclusions = new Set(previous.excludedOptionIds);
            const selectionChanged = currentExclusions.size !== previousExclusions.size || [...currentExclusions].some(id => !previousExclusions.has(id)) || !sameSelection(saved.excludedVariantKeys, previous.excludedVariantKeys);
            setSearch(previous.search); setAssembly(selectionChanged ? null : previous.assembly); setExcluded(currentExclusions); setExcludedVariantKeys(new Set(saved.excludedVariantKeys ?? previous.excludedVariantKeys ?? []));
            setBudget(String(previous.search.budgetCopper / 10000)); setScenario(previous.search.scenario); setObjective(previous.search.objective ?? "dps");
            setSelectedSlots(parseAuctionGearSlots(previous.search.selectedSlots));
            setAssemblyStale(true); setMarketStale(true);
            if (selectionChanged) {
              remember({ jobId: job.id });
              await cancel();
              return;
            }
          }
          const recoveredMode = job.mode ?? saved.mode;
          cache.current = { ...saved, jobId: job.id, mode: recoveredMode };
          writeAuctionClientCache(cacheKey, cache.current);
          rememberAuctionClientJob({ characterSlug, locale }, job.id);
          setHasRecovery(false);
          await runRef.current?.({ action: "poll", id: job.id, observedActive: jobIsActive(job) }, recoveredMode);
          return;
        }
        const query = new URLSearchParams({ searchId: saved.searchId!, characterSlug, locale });
        const result = await fetchAuctionClientResult<Recovery>(`/api/wow/auction-gear-plans?${query}`, controller.signal, () => {
          if (mounted) setTransport({ mode: "search", status: "starting", progress: null, error: "plan_reconnecting" });
        });
        if (!mounted || controller.signal.aborted) return;
        if (result.kind !== "recovery" || result.search.searchId !== saved.searchId) throw new Error("invalid_plan_result");
        // A form edit can retire an old job while preserving a newer safe draft.
        // The owned old checkpoint anchors recovery; its prices/results do not apply to that draft.
        if (saved.formIntent && !intentMatchesSearch(saved.formIntent, result.search)) {
          setSearch(null); setAssembly(null); setAssemblyStale(false); setMarketStale(false);
          setHasRecovery(false); setTransport(null);
          return;
        }
        const restoredExclusions = new Set(saved.excludedOptionIds ?? result.excludedOptionIds);
        const previousExclusions = new Set(result.excludedOptionIds);
        const selectionChanged = restoredExclusions.size !== previousExclusions.size || [...restoredExclusions].some(id => !previousExclusions.has(id)) || !sameSelection(saved.excludedVariantKeys, result.excludedVariantKeys);
        setExcluded(restoredExclusions); setExcludedVariantKeys(new Set(saved.excludedVariantKeys ?? []));
        cache.current = { ...saved, excludedOptionIds: [...restoredExclusions], jobId: undefined };
        writeAuctionClientCache(cacheKey, cache.current);
        setSearch(result.search); setAssembly(selectionChanged ? null : result.assembly); setAssemblyStale(true); setMarketStale(true);
        setBudget(String(result.search.budgetCopper / 10000)); setScenario(result.search.scenario); setObjective(result.search.objective ?? "dps");
        setSelectedSlots(parseAuctionGearSlots(result.search.selectedSlots));
        setTransport({ mode: "search", status: "completed", progress: null, error: null });
        if (result.activeJob && !selectionChanged) await runRef.current?.({ action: "poll", id: result.activeJob.id, observedActive: jobIsActive(result.activeJob) }, result.activeJob.mode ?? result.activeJob.result?.kind ?? saved.mode);
        else if (result.activeJob) { remember({ jobId: result.activeJob.id }); await cancel(); }
        else if (saved.jobId) forgetAuctionClientJob(saved.jobId);
      } catch (error) {
        if (!mounted || controller.signal.aborted) return;
        const code = error instanceof Error ? error.message : "auction_plan_unavailable";
        if (["search_not_found", "search_expired", "plan_not_found"].includes(code)) {
          if (saved.clientRequestId) {
            // A missing lookup can race a delayed POST. Cancel its identity
            // durably before allowing the browser to forget that intent.
            const cancelled = await removeAuctionClientRequest(saved.clientRequestId, { characterSlug, locale });
            if (!mounted || controller.signal.aborted) return;
            if (!cancelled?.ok) {
              setHasRecovery(true); setTransport({ mode: saved.mode, status: "failed", progress: null, error: "plan_connection_interrupted" });
              return;
            }
          }
          if (saved.clientRequestId && saved.searchId) {
            try {
              const query = new URLSearchParams({ searchId: saved.searchId, characterSlug, locale });
              const previous = await fetchAuctionClientResult<Recovery>(`/api/wow/auction-gear-plans?${query}`, controller.signal, () => {});
              if (!mounted || controller.signal.aborted) return;
              if (previous.kind !== "recovery" || previous.search.searchId !== saved.searchId) throw new Error("invalid_plan_result");
              const restoredExclusions = new Set(saved.excludedOptionIds);
              const previousExclusions = new Set(previous.excludedOptionIds);
              const selectionChanged = restoredExclusions.size !== previousExclusions.size || [...restoredExclusions].some(id => !previousExclusions.has(id)) || !sameSelection(saved.excludedVariantKeys, previous.excludedVariantKeys);
              setExcluded(restoredExclusions); setExcludedVariantKeys(new Set(saved.excludedVariantKeys ?? [])); setSearch(previous.search); setAssembly(selectionChanged ? null : previous.assembly);
              setAssemblyStale(true); setMarketStale(true);
              setBudget(String(previous.search.budgetCopper / 10000)); setScenario(previous.search.scenario); setObjective(previous.search.objective ?? "dps");
              setSelectedSlots(parseAuctionGearSlots(previous.search.selectedSlots));
              cache.current = { ...saved, jobId: undefined, clientRequestId: undefined };
              writeAuctionClientCache(cacheKey, cache.current);
              // The old intent was cancelled. Keep its owned checkpoint; any
              // newer active job needs an explicit, separately validated action.
              setHasRecovery(false); setTransport({ mode: "search", status: "completed", progress: null, error: null });
              return;
            } catch (fallbackError) {
              if (!mounted || controller.signal.aborted) return;
              const fallbackCode = fallbackError instanceof Error ? fallbackError.message : "auction_plan_unavailable";
              if (!["search_not_found", "search_expired", "plan_not_found"].includes(fallbackCode)) {
                setHasRecovery(true); setTransport({ mode: saved.mode, status: "failed", progress: null, error: fallbackCode });
                return;
              }
            }
          }
          cache.current = null; writeAuctionClientCache(cacheKey, null);
          setHasRecovery(false);
          setTransport({ mode: saved.mode, status: "failed", progress: null, error: "recovery_expired" });
        } else { setHasRecovery(true); setTransport({ mode: saved.mode, status: "failed", progress: null, error: code }); }
      } finally {
        if (recoveryController.current === controller) recoveryController.current = null;
      }
    })();
    return () => {
      mounted = false; controller.abort();
      if (recoveryController.current === controller) recoveryController.current = null;
      const current = active.current;
      active.current = null;
      current?.controller.abort();
      if (current) {
        const deletion = current.id ? removeAuctionClientJob(current.id) : cache.current?.clientRequestId ? removeAuctionClientRequest(cache.current.clientRequestId, { characterSlug, locale }) : Promise.resolve();
        retireAuctionClient(current.done, deletion);
      }
    };
  }, [cacheKey, characterSlug, locale, recoveryAttempt, setBudget, snapshotKey]);

  function remember(update: Partial<AuctionClientCache>) {
    cache.current = { version: 1, profileKey: snapshotKey, mode: "search", excludedOptionIds: [], ...cache.current, ...update };
    writeAuctionClientCache(cacheKey, cache.current.searchId || cache.current.jobId || cache.current.clientRequestId ? cache.current : null);
  }
  function invalidate(draft: Partial<{ budget: string; scenario: string; objective: "value" | "dps"; selectedSlots: AuctionGearSlot[] }> = {}): Promise<boolean> | null {
    const needsRetirement = Boolean(retryJob || hasRecovery || cache.current?.jobId || cache.current?.clientRequestId || cache.current?.cancellationRequested);
    let retirement: Promise<boolean> | null = null;
    if (needsRetirement) {
      try {
        const intent = parseAuctionClientFormIntent({ characterSlug, locale,
          budgetGold: normalizeAuctionBudgetGold(draft.budget ?? budget, locale), scenario: draft.scenario ?? scenario,
          objective: draft.objective ?? objective, selectedSlots: draft.selectedSlots ?? selectedSlots });
        if (intent) remember({ formIntent: intent });
      } catch { /* Invalid drafts are not restored from storage. Keep the owned handles until acknowledgement. */ }
      retirement = cancel();
    }
    setSearch(null); setAssembly(null); setAssemblyStale(false); setMarketStale(false); setExcluded(new Set()); setExcludedVariantKeys(new Set()); setExcludedOpen(false); setExcludedLimit(20);
    if (!needsRetirement) {
      setTransport(null); setRetryJob(null); setHasRecovery(false);
      cache.current = null; writeAuctionClientCache(cacheKey, null);
    }
    return retirement;
  }
  async function run(initial: RequestBody, mode: Mode) {
    if (!scopeAlive.current || active.current || cache.current?.cancellationRequested) return;
    const generation = mountGeneration.current;
    const ownsScope = () => scopeAlive.current && mountGeneration.current === generation;
    let finish!: () => void;
    const request: ActiveRequest = { mode, controller: new AbortController(), observedActive: initial.action === "poll" && initial.observedActive === true,
      done: new Promise(resolve => { finish = resolve; }), finish: () => finish() };
    const isCurrent = () => ownsScope() && active.current === request && !request.controller.signal.aborted;
    const cleanup = waitForAuctionClientRetirement();
    active.current = request;
    setTransport({ mode, status: "starting", progress: null, error: null });
    // Keep useful measured facts while making previous market prices explicitly stale.
    setAssemblyStale(true);
    setMarketStale(true); setRetryJob(null); setHasRecovery(false);
    let body = initial;
    let assemblySelection = {
      excludedOptionIds: initial.action === "assemble" ? [...initial.excludedOptionIds] : [...(cache.current?.excludedOptionIds ?? [])],
      excludedVariantKeys: initial.action === "assemble" ? [...initial.excludedVariantKeys] : [...(cache.current?.excludedVariantKeys ?? [])],
    };
    try {
      if (body.action === "search") {
        body = { ...body, clientRequestId: body.clientRequestId ?? crypto.randomUUID() };
        const formIntent = parseAuctionClientFormIntent(body);
        if (!formIntent) throw new Error("invalid_plan_request");
        // Preserve retry input even if retiring an older job delays this POST.
        // Keep the global active handle unchanged until that older job retires.
        remember({ mode, clientRequestId: body.clientRequestId, formIntent });
      }
      // A new action waits for cancellation cleanup, including a late POST ID.
      await cleanup;
      if (!isCurrent()) return;
      if (body.action !== "poll") {
        await releasePriorAuctionClientJob();
        if (!isCurrent()) return;
        if (hasPendingAuctionClientJob()) throw new Error("plan_cancellation_unconfirmed");
      }
      while (isCurrent()) {
        let transportOwner = { profileKey: snapshotKey, jobId: cache.current?.jobId, clientRequestId: cache.current?.clientRequestId };
        const onReconnect = () => {
          if (isCurrent()) setTransport(previous => ({ mode, status: "running", progress: previous?.progress ?? null, error: "plan_reconnecting" }));
        };
        let payload: PlannerJob;
        if (body.action === "poll") {
          request.id = body.id;
          payload = await fetchAuctionClientResult<PlannerJob>(auctionClientJobUrl(body.id, { characterSlug, locale }), request.controller.signal, onReconnect);
        } else {
          request.id = undefined;
          // Recovery can observe the server job before this POST's 202 reaches us.
          body = { ...body, clientRequestId: body.clientRequestId ?? crypto.randomUUID() };
          remember({ mode, clientRequestId: body.clientRequestId });
          rememberAuctionClientRequest({ characterSlug, locale }, body.clientRequestId!);
          transportOwner = { profileKey: snapshotKey, jobId: cache.current?.jobId, clientRequestId: body.clientRequestId };
          const response = await fetch("/api/wow/auction-gear-plans", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(encodeAuctionGearSelectionTransport(body)),
            // Keep receiving the created ID after cancellation or unmount.
            signal: AbortSignal.timeout(30_000),
          });
          payload = await response.json() as PlannerJob;
          if (!response.ok) {
            // An old error response must not clear a replacement request's saved intent.
            if (!isCurrent()) return;
            if (body.clientRequestId) {
              forgetAuctionClientRequest(body.clientRequestId);
              remember({ clientRequestId: undefined });
            }
            // This response confirms that no job was admitted. Keep the same
            // calculation alive, but use a new request identity after the quota resets.
            if (response.status === 429 && payload.error === "plan_rate_limited" && body.action === "assemble") {
              body = { ...body, clientRequestId: undefined };
              setTransport(previous => ({ mode, status: "starting", progress: previous?.progress ?? null, error: "plan_waiting_for_quota" }));
              await auctionClientDelay(60_000, request.controller.signal);
              continue;
            }
            // A previous unknown POST can already own this search. Recover it
            // before offering another expensive action.
            if (payload.error === "plan_already_running" && body.action === "search") {
              // A new tab has no browser handle. Offer an explicit owner-checked
              // recovery choice; neither discovery nor this 409 resumes the job.
              setOwnerLookupFailed(true);
              const found = "activeJob" in payload ? parseAuctionClientActiveRecovery(payload)
                : parseAuctionClientActiveRecovery(await fetchAuctionClientResult<unknown>("/api/wow/auction-gear-plans?active=1", request.controller.signal, onReconnect));
              if (!found.activeJob) throw new Error("plan_not_found");
              if (!isCurrent()) return;
              setDiscovered(found); setOwnerLookupFailed(false); setTransport(null);
              return;
            } else if (payload.error === "plan_already_running" && body.action !== "search") {
              const query = new URLSearchParams({ searchId: body.searchId, characterSlug, locale });
              const recovered = await fetchAuctionClientResult<Recovery>(`/api/wow/auction-gear-plans?${query}`, request.controller.signal, onReconnect);
              if (!recovered.activeJob) throw new Error(payload.error);
              if (body.action === "assemble") {
                const intended = new Set(body.excludedOptionIds), current = new Set(recovered.excludedOptionIds);
                if (intended.size !== current.size || [...intended].some(id => !current.has(id)) || !sameSelection(body.excludedVariantKeys, recovered.excludedVariantKeys)) throw new Error(payload.error);
              }
              mode = recovered.activeJob.mode ?? mode;
              request.mode = mode;
              if (mode === "assembly") {
                assemblySelection = { excludedOptionIds: [...recovered.excludedOptionIds], excludedVariantKeys: [...(recovered.excludedVariantKeys ?? [])] };
                remember(assemblySelection);
                setExcluded(new Set(assemblySelection.excludedOptionIds)); setExcludedVariantKeys(new Set(assemblySelection.excludedVariantKeys));
              }
              payload = recovered.activeJob;
            } else throw new Error(payload.error ?? "auction_plan_unavailable");
          }
        }
        request.id = payload.id;
        if (!isCurrent()) {
          const removed = await removeAuctionClientJob(payload.id);
          if (removed?.ok || removed?.status === 404) {
            if (transportOwner.clientRequestId) forgetAuctionClientRequest(transportOwner.clientRequestId);
            clearAcknowledgedAuctionClientCache(cacheKey, transportOwner);
          }
          return;
        }
        remember({ jobId: payload.id, mode });
        rememberAuctionClientJob({ characterSlug, locale }, payload.id);
        // Reattaching an already completed job is recovery, not a new market
        // check. An observed active job may publish newly verified facts later.
        request.observedActive = body.action !== "poll" || body.observedActive === true || jobIsActive(payload);
        const recoveredCompleted = body.action === "poll" && payload.status === "completed" && !request.observedActive;
        let pollAttempt = 0;
        while (payload.status === "queued" || payload.status === "running") {
          setTransport({ mode, status: payload.status, progress: payload.progress, error: null });
          await auctionClientDelay(auctionClientPollDelay(pollAttempt++), request.controller.signal);
          payload = await fetchAuctionClientResult<PlannerJob>(auctionClientJobUrl(request.id, { characterSlug, locale }), request.controller.signal, onReconnect);
          if (!isCurrent()) return;
        }
        if (!isCurrent()) return;
        if (payload.status === "failed") throw new Error(payload.error ?? "auction_plan_unavailable");
        if (payload.status === "cancelled") {
          setAssemblyStale(true); setMarketStale(true);
          remember({ jobId: undefined, clientRequestId: undefined }); forgetAuctionClientJob(payload.id); request.id = undefined;
          setTransport({ mode, status: "cancelled", progress: null, error: null }); return;
        }
        const result = payload.result;
        if (payload.status !== "completed" || !result || result.kind !== mode) throw new Error("invalid_plan_result");
        if (body.action !== "search" && body.action !== "poll" && result.searchId !== body.searchId) throw new Error("invalid_plan_result");
        if (initial.action === "poll") {
          setBudget(String(result.budgetCopper / 10000)); setScenario(result.scenario); setObjective(result.objective ?? "dps");
          setSelectedSlots(parseAuctionGearSlots(result.selectedSlots));
        }
        remember({ searchId: result.searchId, jobId: undefined, clientRequestId: undefined, mode,
          formIntent: result.kind === "search" ? parseAuctionClientFormIntent({ characterSlug, locale, budgetGold: String(result.budgetCopper / 10000),
            scenario: result.scenario, objective: result.objective ?? "dps", selectedSlots: parseAuctionGearSlots(result.selectedSlots) }) ?? undefined : cache.current?.formIntent });
        forgetAuctionClientJob(payload.id);
        request.id = undefined;
        const pricesStale = recoveredCompleted || !auctionGearPricesAreFresh(result.market);
        let complete: boolean;
        if (result.kind === "search") {
          // Each response is an authoritative snapshot: sold lots must disappear.
          setSearch(result);
          setMarketStale(pricesStale);
          complete = result.searchComplete;
          body = { action: "resume", searchId: result.searchId };
        } else {
          setAssembly(result);
          setAssemblyStale(pricesStale);
          if (result.updatedSearch) {
            setSearch({ ...result.updatedSearch, market: result.market,
              profileFingerprint: result.profileFingerprint, scenario: result.scenario, objective: result.objective, coverage: result.coverage });
            setMarketStale(pricesStale);
          }
          // Keep publishing checkpoints while one user-started calculation
          // advances. Reading an old completed job must not silently start new work.
          complete = result.exhaustiveComplete || recoveredCompleted;
          // A fresh identity is allocated on the next POST; reusing the previous
          // nonce would replay that completed step without advancing the cursor.
          body = { action: "assemble", searchId: result.searchId, ...assemblySelection };
        }
        if (complete) { setTransport({ mode, status: "completed", progress: null, error: null }); return; }
        setTransport({ mode, status: "starting", progress: null, error: null });
      }
    } catch (reason) {
      if (isCurrent()) {
        // A later step may have observed changed lots before it failed.
        setAssemblyStale(true); setMarketStale(true);
        if (reason instanceof Error && reason.message === "plan_cancellation_unconfirmed") {
          remember({ cancellationRequested: true }); setCancellation("failed");
          setTransport({ mode, status: "failed", progress: null, error: reason.message });
          return;
        }
        if (reason instanceof AuctionClientError && reason.reconnect && request.id) {
          setRetryJob({ id: request.id, mode, observedActive: request.observedActive });
        } else if (request.id) {
          const owner = { profileKey: snapshotKey, jobId: cache.current?.jobId, clientRequestId: cache.current?.clientRequestId };
          const removed = await removeAuctionClientJob(request.id);
          if (!isCurrent()) {
            if (removed?.ok || removed?.status === 404) {
              if (owner.clientRequestId) forgetAuctionClientRequest(owner.clientRequestId);
              clearAcknowledgedAuctionClientCache(cacheKey, owner);
            }
            return;
          }
          if (!removed?.ok && removed?.status !== 404) {
            remember({ cancellationRequested: true }); setCancellation("failed");
            setTransport({ mode, status: "failed", progress: null, error: "plan_cancellation_unconfirmed" });
            return;
          }
          remember({ jobId: undefined, clientRequestId: undefined });
        }
        const pendingInitial = Boolean(!request.id && cache.current?.clientRequestId);
        if (pendingInitial) setHasRecovery(true);
        if (isCurrent()) {
          setTransport({ mode, status: "failed", progress: null, error: pendingInitial ? "plan_connection_interrupted" : reason instanceof Error ? reason.message : "auction_plan_unavailable" });
        }
      }
    } finally {
      if (active.current === request) active.current = null;
      request.finish();
    }
  }
  useEffect(() => { runRef.current = run; });
  async function findOwnedCalculation() {
    if (active.current || recoveryController.current || cancellation) return;
    const controller = new AbortController(), generation = mountGeneration.current;
    const current = () => scopeAlive.current && mountGeneration.current === generation && !controller.signal.aborted;
    recoveryController.current = controller;
    setTransport({ mode: "search", status: "starting", progress: null, error: null });
    try {
      const found = parseAuctionClientActiveRecovery(await fetchAuctionClientResult<unknown>("/api/wow/auction-gear-plans?active=1", controller.signal, () => {}));
      if (!current()) return;
      setDiscovered(found.activeJob ? found : null); setOwnerLookupFailed(false); setTransport(null);
    } catch (error) {
      if (current()) { setOwnerLookupFailed(true); setTransport({ mode: "search", status: "failed", progress: null, error: error instanceof Error ? error.message : "plan_connection_interrupted" }); }
    } finally { if (recoveryController.current === controller) recoveryController.current = null; }
  }
  async function openOwnedCalculation() {
    const job = discovered?.activeJob, intent = discovered?.formIntent;
    if (!job || !intent || job.scope.characterSlug !== characterSlug || job.scope.locale !== locale || active.current || cancellation) return;
    const controller = new AbortController(), generation = mountGeneration.current;
    const current = () => scopeAlive.current && mountGeneration.current === generation && !controller.signal.aborted;
    recoveryController.current = controller;
    setBudget(intent.budgetGold); setScenario(intent.scenario); setObjective(intent.objective); setSelectedSlots(intent.selectedSlots);
    setTransport({ mode: job.mode, status: "starting", progress: null, error: null });
    let restoredContext: Partial<AuctionClientCache> = {};
    try {
      if (job.searchId) {
        const query = new URLSearchParams({ searchId: job.searchId, characterSlug, locale });
        let previous: Recovery | undefined;
        let initialSearchDtoMissing = false;
        try {
          previous = await fetchAuctionClientResult<Recovery>(`/api/wow/auction-gear-plans?${query}`, controller.signal, () => {});
        } catch (error) {
          // Initial search IDs are durable before their first public DTO. Only
          // this exact missing-DTO response may fall through to the explicitly
          // opened, scoped job. Assembly must restore its current exclusions.
          if (job.mode !== "search" || !(error instanceof AuctionClientError) || error.status !== 404 || error.message !== "search_not_found") throw error;
          initialSearchDtoMissing = true;
        }
        if (!current()) return;
        if (!initialSearchDtoMissing) {
          if (!previous || previous.kind !== "recovery" || previous.search.searchId !== job.searchId || !intentMatchesSearch(intent, previous.search)) throw new Error("invalid_plan_result");
          setSearch(previous.search); setAssembly(previous.assembly); setExcluded(new Set(previous.excludedOptionIds)); setExcludedVariantKeys(new Set(previous.excludedVariantKeys ?? []));
          setMarketStale(true); setAssemblyStale(true);
          restoredContext = { searchId: job.searchId, excludedOptionIds: previous.excludedOptionIds, excludedVariantKeys: previous.excludedVariantKeys ?? [] };
        }
      }
      if (!current()) return;
      // Persist a polling handle only with its authoritative assembly selection.
      // A failed context lookup can be retried through owner discovery after reload.
      remember({ jobId: job.id, clientRequestId: undefined, mode: job.mode, formIntent: intent, ...restoredContext });
      rememberAuctionClientJob(job.scope, job.id);
      setDiscovered(null); setOwnerLookupFailed(false);
      await run({ action: "poll", id: job.id, observedActive: true }, job.mode);
    } catch (error) {
      if (current()) setTransport({ mode: job.mode, status: "failed", progress: null, error: error instanceof Error ? error.message : "plan_connection_interrupted" });
    } finally { if (recoveryController.current === controller) recoveryController.current = null; }
  }
  async function cancelOwnedCalculation() {
    const job = discovered?.activeJob;
    if (!job || cancellation) return;
    // Persist only cancellation ownership for a different scope. A reload can
    // retry DELETE, but must never silently poll it as the current character.
    remember({ jobId: job.id, clientRequestId: undefined, mode: job.mode, cancellationRequested: true });
    rememberAuctionClientJob(job.scope, job.id);
    editFocusRequested.current = true;
    await cancel();
  }
  async function startSearch() {
    if (!validBudget || initializing || active.current || discovered?.activeJob || ownerLookupFailed || cache.current?.cancellationRequested) return;
    try {
      const budgetGold = normalizeAuctionBudgetGold(budget, locale);
      const slots = parseAuctionGearSlots(selectedSlots);
      const generation = mountGeneration.current;
      const retirement = invalidate();
      if (retirement && !await retirement) return;
      if (!scopeAlive.current || mountGeneration.current !== generation) return;
      void run({ action: "search", characterSlug, budgetGold, selectedSlots: slots, scenario, objective, locale }, "search");
    } catch (reason) {
      setTransport({ mode: "search", status: "failed", progress: null, error: reason instanceof Error ? reason.message : "invalid_plan_request" });
    }
  }
  async function startAssembly() {
    if (!validBudget || !search || !available.length || cache.current?.cancellationRequested) return;
    const generation = mountGeneration.current;
    if (active.current) {
      if (active.current.mode !== "search") return;
      // Reuse the existing cancellation/retirement barrier: the assembly POST
      // waits until the owned discovery job has been retired on the server.
      if (!await cancel()) return;
    }
    // Cancellation may finish after this keyed character/profile/locale scope was removed.
    if (!scopeAlive.current || mountGeneration.current !== generation) return;
    if (hasRecovery) { setRecoveryAttempt(value => value + 1); return; }
    if (retryJob?.mode === "assembly") { void run({ action: "poll", id: retryJob.id, observedActive: retryJob.observedActive }, "assembly"); return; }
    void run({ action: "assemble", searchId: search.searchId, excludedOptionIds: [...excluded], excludedVariantKeys: [...excludedVariantKeys] }, "assembly");
  }
  async function editParameters() {
    const generation = mountGeneration.current;
    editFocusRequested.current = true;
    if (!await cancel() || !scopeAlive.current || mountGeneration.current !== generation) editFocusRequested.current = false;
  }
  async function cancel(): Promise<boolean> {
    if (cancelling.current) return cancelling.current;
    const current = active.current;
    const mode = current?.mode ?? discovered?.activeJob?.mode ?? cache.current?.mode ?? "search";
    const ownedId = current?.id ?? cache.current?.jobId ?? discovered?.activeJob?.id;
    const nonce = cache.current?.clientRequestId;
    // Keep intermediate DPS results, but require a successful market check
    // before treating their purchases as verified after an interrupted step.
    setAssemblyStale(true); setMarketStale(true);
    active.current = null; current?.controller.abort();
    const recovery = recoveryController.current;
    recoveryController.current = null; recovery?.abort();
    // The handles remain recoverable until the server acknowledges retirement.
    remember({ jobId: ownedId, mode, cancellationRequested: true });
    setCancellation("pending"); setRetryJob(null); setHasRecovery(false);
    setTransport({ mode, status: "starting", progress: null, error: "plan_cancelling" });
    const generation = mountGeneration.current;
    const work = (async () => {
      let acknowledged = true;
      if (ownedId || nonce) {
        const response = ownedId ? await removeAuctionClientJob(ownedId) : await removeAuctionClientRequest(nonce!, { characterSlug, locale });
        acknowledged = Boolean(response?.ok || ownedId && response?.status === 404);
      }
      // A different scope may have left the globally owned job awaiting cleanup.
      if (acknowledged && hasPendingAuctionClientJob()) {
        await releasePriorAuctionClientJob();
        acknowledged = !hasPendingAuctionClientJob();
      }
      if (!scopeAlive.current || mountGeneration.current !== generation) {
        if (acknowledged) {
          if (nonce) forgetAuctionClientRequest(nonce);
          clearAcknowledgedAuctionClientCache(cacheKey, { profileKey: snapshotKey, jobId: ownedId, clientRequestId: nonce });
        }
        return acknowledged;
      }
      if (acknowledged) {
        if (nonce) forgetAuctionClientRequest(nonce);
        remember({ jobId: undefined, clientRequestId: undefined, cancellationRequested: undefined });
        setCancellation(null); setDiscovered(null); setOwnerLookupFailed(false); setTransport({ mode, status: "cancelled", progress: null, error: null });
        if (restoreAfterCancellation.current) {
          restoreAfterCancellation.current = false;
          setRecoveryAttempt(value => value + 1);
        }
      } else {
        setCancellation("failed");
        setTransport({ mode, status: "failed", progress: null, error: "plan_cancellation_unconfirmed" });
      }
      return acknowledged;
    })();
    cancelling.current = work;
    // A successful nonce cancellation is durable even before a late POST arrives.
    // The next POST still waits for its late acknowledgement/ID cleanup.
    retireAuctionClient(...(current ? [current.done] : []), work);
    try { return await work; } finally { if (cancelling.current === work) cancelling.current = null; }
  }
  function setAllowed(optionId: string, value: boolean) {
    const item = search?.items.find(item => item.optionId === optionId);
    if (!item) return;
    const key = auctionGearVariantSelectionKey(item), variants = new Set(excludedVariantKeys), next = new Set(excluded);
    if (value) {
      variants.delete(key);
      for (const option of search?.items ?? []) if (auctionGearVariantSelectionKey(option) === key) next.delete(option.optionId);
    } else variants.add(key);
    suggestionFocusSlot.current = item.slotType;
    changeExclusions(next, variants);
  }
  function changeExclusions(next: Set<string>, variants = excludedVariantKeys) {
    if (!validBudget || active.current?.mode === "assembly" || cancellation) return;
    const needsCancellation = Boolean(active.current?.mode === "search" || recoveryController.current || retryJob || hasRecovery);
    if (needsCancellation) void cancel();
    setExcluded(next); setExcludedVariantKeys(variants);
    remember({ excludedOptionIds: [...next], excludedVariantKeys: [...variants] });
    setAssembly(null);
    if (!needsCancellation) { setRetryJob(null); setHasRecovery(false); setTransport(null); }
  }
  function setLotAllowed(auctionId: number, value: boolean) {
    const next = new Set(excluded);
    for (const item of search?.items ?? []) if (item.auctionId === auctionId) {
      if (value) next.delete(item.optionId); else next.add(item.optionId);
    }
    changeExclusions(next);
  }
  function setAllAllowed(value: boolean) {
    const variants = new Set(value ? [] : search?.items.map(auctionGearVariantSelectionKey));
    if (!excluded.size && sameSelection([...variants], [...excludedVariantKeys])) return;
    changeExclusions(new Set(), variants);
  }
  function continueSearch() {
    if (!validBudget || !search || active.current || cache.current?.cancellationRequested) return;
    if (hasRecovery) { setRecoveryAttempt(value => value + 1); return; }
    void run({ action: "resume", searchId: search.searchId }, "search");
  }
  const progress = transport?.progress;
  const progressText = !progress ? t("Ожидаем расчёта…", "Waiting for calculation…")
    : progress?.phase === "market" ? t("Загружаем рынок сервера…", "Loading your realm market…")
    : progress?.phase === "catalog" ? t("Проверяем совместимость вещей…", "Checking item compatibility…")
    : progress?.phase === "variants" ? t("Проверяем точные свойства вариантов…", "Resolving exact item properties…")
    : transport?.mode === "assembly" ? t("Проверяем совместимые комплекты…", "Comparing compatible loadouts…")
    : t("Рассчитываем DPS каждой замены…", "Calculating DPS for each replacement…");
  const feedback = (mode: Mode) => transport?.mode !== mode ? null : <>
    {running ? <p role="status" className={styles.note}>{["plan_reconnecting", "plan_cancelling", "plan_waiting_for_quota"].includes(transport.error ?? "") ? failureText(transport.error) : progressText}{progress ? ` ${number(progress.completed)} / ${number(progress.total)}` : ""}</p> : null}
    {transport.status === "failed" ? <p role="alert" className={styles.feedback}>{failureText(transport.error)}</p> : null}
    {transport.status === "cancelled" ? <p role="status" className={styles.note}>{search ? t("Расчёт остановлен. Полученные результаты сохранены.", "Calculation stopped. Available results have been kept.") : t("Поиск отменён.", "Search cancelled.")}</p> : null}
    {transport.status === "failed" && cancellation === "failed" ? <button type="button" className={styles.button} onClick={() => void cancel()}>{t("Повторить отмену", "Retry cancellation")}</button> : null}
    {transport.status === "failed" && !cancellation && retryJob ? <button type="button" className={styles.button} disabled={!validBudget} onClick={() => void run({ action: "poll", id: retryJob.id, observedActive: retryJob.observedActive }, retryJob.mode)}>{t("Повторить подключение", "Reconnect to calculation")}</button> : null}
    {transport.status === "failed" && !cancellation && !retryJob && hasRecovery ? <button type="button" className={styles.button} disabled={!validBudget} onClick={() => setRecoveryAttempt(value => value + 1)}>{t("Повторить восстановление", "Retry recovery")}</button> : null}
  </>;
  const significantGain = Boolean(confirmed);
  const coverageReasons = search ? auctionGearCoverageReasons(search.coverage, search.dataComplete, locale) : [];
  const incompleteData = coverageReasons.length > 0;
  const discoveryIncomplete = Boolean(search && (search.discoveryComplete === false || search.discoveryComplete === undefined && search.searchLimited));
  const marketChange = assembly?.marketChange;
  const marketChanged = Boolean(marketChange && Object.values(marketChange).some(value => value > 0));

  return <section ref={panel} className={styles.panel} aria-labelledby="auction-gear-title" data-auction-gear>
    <header><small>{t("АУКЦИОН СЕРВЕРА", "REALM AUCTION HOUSE")}</small><h2 id="auction-gear-title">{t("Найти вещи под бюджет", "Find gear within your budget")}</h2><p>{t("Выгодные улучшения с аукциона и совместимый сет в вашем бюджете.", "Good-value auction upgrades and a compatible loadout within your budget.")}</p></header>
    {discovered?.activeJob ? <div className={styles.calculation} data-auction-owned-recovery>
      <p role="status" className={styles.note}>{t("У вас уже есть незавершённый расчёт.", "You already have an unfinished calculation.")} {discovered.activeJob.scope.characterSlug.split("--").slice(1).join(" · ")} · {discovered.activeJob.scope.locale.toUpperCase()}.</p>
      {discovered.formIntent ? <p className={styles.note}>{t("Бюджет прежнего расчёта", "Original calculation budget")}: {money(Number(discovered.formIntent.budgetGold) * 10000)}. {discovered.formIntent.objective === "value" ? t("Цена / прирост DPS", "Price / DPS gain") : t("Максимум DPS", "Maximum DPS")}.</p> : <p className={styles.note}>{t("Исходные параметры недоступны. Отмените прежний расчёт, чтобы начать новый.", "The original parameters are unavailable. Cancel the previous calculation to start a new one.")}</p>}
      {discovered.activeJob.scope.characterSlug !== characterSlug || discovered.activeJob.scope.locale !== locale ? <p className={styles.note}>{t("Этот расчёт относится к другому персонажу или языку. Можно отменить его и продолжить подбор здесь.", "This calculation belongs to another character or language. You can cancel it and continue selection here.")}</p> : null}
      <div className={styles.actions}>{discovered.formIntent && discovered.activeJob.scope.characterSlug === characterSlug && discovered.activeJob.scope.locale === locale ? <button type="button" className={styles.button} disabled={running || Boolean(cancellation)} onClick={() => void openOwnedCalculation()}>{t("Открыть расчёт", "Open calculation")}</button> : null}
      {!cancellation ? <button type="button" className={styles.button} disabled={running} onClick={() => void cancelOwnedCalculation()}>{t("Отменить и изменить параметры", "Cancel and change parameters")}</button> : null}</div>
    </div> : null}
    {ownerLookupFailed && !discovered?.activeJob ? <button type="button" className={styles.button} disabled={running || Boolean(cancellation)} onClick={() => void findOwnedCalculation()}>{t("Найти активный расчёт", "Find active calculation")}</button> : null}
    {!supported ? <p>{messages.damage_specialization_required}</p> : <form onSubmit={event => { event.preventDefault(); startSearch(); }}>
      {running && !cancellation ? <button className={styles.button} type="button" onClick={() => void editParameters()}>{t("Изменить параметры", "Change parameters")}</button> : null}
      <div className={styles.controls}>
        <label>{t("Бюджет, золото", "Budget, gold")}<input ref={budgetInput} name="budgetGold" inputMode="decimal" value={budget} onChange={event => {
          const next = event.target.value; setBudgetInput(next);
          let amount: string;
          try { amount = normalizeAuctionBudgetGold(next, locale); }
          catch { return; } // Retain facts and ownership while the draft is incomplete; actions stay disabled.
          if (amount === acceptedBudget.current) return;
          acceptedBudget.current = amount;
          invalidate({ budget: next });
        }} disabled={formLocked} required aria-invalid={!validBudget || undefined} aria-describedby={validBudget ? "auction-budget-help" : "auction-budget-help auction-budget-error"} /></label>
        <label>{t("Сценарий", "Encounter")}<select value={scenario} onChange={event => { setScenario(event.target.value); invalidate({ scenario: event.target.value }); }} disabled={formLocked}>
          <option value="single-target">{t("Одна цель · 120 секунд", "Single target · 120 seconds")}</option><option value="aoe">{t("5 целей · 60 секунд", "5 targets · 60 seconds")}</option><option value="execute">{t("Короткий бой · 90 секунд", "Short fight · 90 seconds")}</option>
        </select></label>
      </div>
      <details className={styles.calculation}><summary>{t("Слоты экипировки и цель подбора", "Equipment slots and objective")} · {selectedSlots.length} / {auctionGearSlots.length}</summary>
      <div className={styles.controls}><label>{t("Цель подбора", "Selection objective")}<select name="objective" value={objective} onChange={event => { setObjective(event.target.value as "value" | "dps"); invalidate({ objective: event.target.value as "value" | "dps" }); }} disabled={formLocked}><option value="value">{t("Цена / прирост DPS", "Price / DPS gain")}</option><option value="dps">{t("Максимум DPS", "Maximum DPS")}</option></select></label></div>
      <fieldset className={styles.slotFieldset} disabled={formLocked}>
        <legend>{t("Какие слоты искать", "Equipment slots to search")}</legend>
        <div className={styles.selectionActions}><button className={styles.button} type="button" onClick={() => { if (sameSelection(selectedSlots, auctionGearSlots)) return; setSelectedSlots([...auctionGearSlots]); invalidate({ selectedSlots: [...auctionGearSlots] }); }}>{t("Выбрать все", "Select all")}</button><button className={styles.button} type="button" onClick={() => { if (!selectedSlots.length) return; setSelectedSlots([]); invalidate({ selectedSlots: [] }); }}>{t("Снять выбор", "Clear selection")}</button></div>
        <div className={styles.slots}>{auctionGearSlots.map(slot => <label key={slot}><input type="checkbox" name="selectedSlots" value={slot} checked={selectedSlots.includes(slot)} onChange={event => { const next = event.target.checked ? auctionGearSlots.filter(value => value === slot || selectedSlots.includes(value)) : selectedSlots.filter(value => value !== slot); setSelectedSlots(next); invalidate({ selectedSlots: next }); }} /><span>{slotName(slot)}</span></label>)}</div>
      </fieldset></details>
      <p id="auction-budget-help" className={styles.note}>{t("Цены указаны за целый лот.", "Prices cover whole lots.")}</p>
      {!validBudget ? <p id="auction-budget-error" role="alert" className={styles.note}>{messages.invalid_budget} {search ? t("Сохранённый результат относится к последнему корректному бюджету. Исправьте ввод, чтобы продолжить подбор.", "The saved result uses your last valid budget. Correct the input to continue selection.") : ""}</p> : null}
      <div className={styles.actions}><button className={styles.button} type="submit" disabled={formLocked || !validBudget}>{running && transport?.mode === "search" ? t("Ищем вещи…", "Searching…") : search ? t("Новый поиск", "New search") : t("Найти улучшения", "Find upgrades")}</button>{search ? <a className={styles.returnToAssembly} href="#auction-assembly">{t("К сборке сета", "Build a loadout")}</a> : null}{!cancellation && running && (transport?.mode === "search" || !search) ? <button className={styles.button} type="button" onClick={cancel}>{transport?.mode === "assembly" ? t("Отменить сборку", "Cancel assembly") : t("Отменить поиск", "Cancel search")}</button> : null}</div>
      {!search ? <p id="auction-assembly-start-help" className={styles.note}>{t("Сначала запустите поиск вещей. Затем можно проверить их сочетания и собрать совместимый сет в пределах бюджета.", "Search for gear first, then compare combinations and build a compatible loadout within your budget.")}</p> : null}
    </form>}
    {feedback("search")}
    {!search ? feedback("assembly") : null}
    {search ? <div className={styles.searchResult} data-auction-search-result>
      <p className={styles.market}>{search.market.region.toUpperCase()} · {search.market.realm} · {t("Рынок обновлён", "Market updated")} <time dateTime={new Date(search.market.updatedAt).toISOString()}>{new Date(search.market.updatedAt).toLocaleString(ru ? "ru-RU" : "en-US")}</time></p>
      {marketStale ? <p className={styles.note}>{t("Показан предыдущий снимок рынка. Цены и доступность не подтверждены до следующего успешного расчёта.", "This is the previous market snapshot. Prices and availability are not verified until the next successful calculation.")}</p> : null}

      <div className={styles.recommendationHeading}><h3>{t("Выгодные улучшения", "Best-value upgrades")}</h3><span className={styles.note}>{t("Сейчас", "Current")}: {number(search.baseline.dps)} DPS</span></div>

      <p className={styles.note}>{search.searchComplete ? t("Проверка найденных вариантов завершена.", "Evaluation of discovered options is complete.") : `${t("Осталось сравнить найденных замен", "Discovered replacements still to compare")}: ${number(search.pendingItems)}.`} {discoveryIncomplete ? t("Поиск вариантов по рынку ещё не завершён.", "Discovery of market options is not complete yet.") : ""} {incompleteData ? t("Часть вещей не удалось проверить из-за недостающих данных. Отсутствие улучшений в списке не означает, что их нет на аукционе.", "Some items could not be verified because required data is missing. An empty upgrade list does not mean the auction house has no upgrades.") : ""}</p>
      {incompleteData ? <details className={styles.calculation}><summary>{t("Часть рынка пока не проверена", "Part of the market is unverified")}</summary>
      {coverageReasons.map(reason => <p key={reason.key} className={styles.note}>{reason.text}</p>)}
      </details> : null}
      {!search.searchComplete && !running && !cancellation ? <button disabled={!validBudget} className={styles.button} type="button" onClick={continueSearch}>{t("Продолжить проверку вещей", "Continue item comparisons")}</button> : null}
      {search.searchComplete && (incompleteData || discoveryIncomplete) ? <div><button className={styles.button} type="button" disabled={!validBudget || running || Boolean(cancellation)} onClick={continueSearch}>{t("Обновить варианты", "Refresh options")}</button><p className={styles.note}>{t("Если недостающие варианты ещё не появились, попробуйте обновить их позже.", "If missing options have not appeared yet, try refreshing again later.")}</p></div> : null}
      {recommendationGroups.length ? <>
        <p className={styles.note}>{t("Меньше золота за +1 DPS — выгоднее покупка. По кнопке — до двух альтернатив на слот.", "Lower gold per +1 DPS means better value. Open up to two alternatives for each slot.")}</p>
        {running && transport?.mode === "search" ? <p className={styles.note}>{t("Выбор можно менять сейчас: поиск остановится и сохранит найденные варианты.", "You can edit choices now: discovery will pause and keep the options already found.")}</p> : null}
        <AuctionGearSuggestions groups={recommendationGroups} locale={locale} excluded={excluded} excludedVariantKeys={excludedVariantKeys} running={selectionLocked} marketStale={marketStale} slotName={slotName} onAllowed={setAllowed} />
      </> : <p role="status" className={styles.empty}>{excludedUpgrades ? t("Найденные подтверждённые улучшения исключены из подбора. Верните нужные варианты в разделе «Исключения» ниже.", "The confirmed upgrades found are excluded from selection. Restore the options you want in Exclusions below.") : search.searchComplete && !discoveryIncomplete && !incompleteData ? t("Подтверждённых улучшений по отдельности не найдено. Сборка сета всё ещё может найти прирост от сочетания вещей.", "No individual upgrades were confirmed. Loadout assembly can still find a gain from combining items.") : t("В проверенной части рынка улучшений по отдельности пока нет. Поиск или проверка данных ещё не завершены; это не окончательный вывод по аукциону.", "No individual upgrades have been confirmed in the verified part of the market yet. Discovery or data verification is incomplete; this is not a final conclusion about the auction house.")}</p>}
        <section id="auction-assembly" tabIndex={-1} className={styles.assembly} aria-labelledby="auction-assembly-title" data-auction-assembly>
          <h3 id="auction-assembly-title">{t("Собрать сет под бюджет", "Build a loadout within budget")}</h3><p className={styles.note}>{(search.objective ?? "dps") === "value" ? t("Подбираем наименьшую цену за подтверждённый прирост DPS всего сета. Иногда выгоднее одна замена и часть бюджета остаётся. Лимит покупок", "Find the lowest price per confirmed DPS gained by the whole loadout. Sometimes one replacement offers better value and leaves budget unspent. Purchase limit") : t("Подбираем наибольший подтверждённый DPS в пределах бюджета. Лимит покупок", "Find the highest confirmed DPS within budget. Purchase limit")} <strong>{money(search.budgetCopper)}</strong>.</p>
          <div className={styles.actions}><button className={`${styles.button} ${styles.primaryButton}`} type="button" disabled={selectionLocked || !available.length} aria-describedby={!validBudget ? "auction-budget-error" : !available.length ? "auction-assembly-disabled-reason" : undefined} onClick={startAssembly}>{running && transport?.mode === "assembly" ? t("Собираем сет…", "Building loadout…") : assembly?.exhaustiveComplete ? t("Обновить и пересобрать сет", "Refresh and rebuild loadout") : assembly ? t("Продолжить сборку сета", "Continue loadout assembly") : t("Собрать сет под бюджет", "Build a loadout within budget")}</button>{!cancellation && running && transport?.mode === "assembly" ? <button className={styles.button} type="button" onClick={cancel}>{t("Отменить сборку", "Cancel assembly")}</button> : null}</div>
          {!available.length ? <p id="auction-assembly-disabled-reason" data-assembly-disabled-reason className={styles.note}>{search.items.length ? t("Все найденные варианты исключены. Разрешите вариант в карточке или восстановите исключённые варианты ниже.", "All discovered options are excluded. Allow a variant in its card or restore excluded variants below.") : t("Проверенных доступных вариантов для сборки пока нет.", "No verified, available options have been found for assembly yet.")}</p> : null}
          <details className={styles.calculation}><summary>{t("Настроить варианты для сета", "Loadout options")}</summary>
          {search.items.length ? <div className={styles.selectionActions}><button className={styles.button} type="button" disabled={selectionLocked} onClick={() => setAllAllowed(true)}>{t("Разрешить все варианты", "Allow all options")}</button><button className={styles.button} type="button" disabled={selectionLocked} onClick={() => setAllAllowed(false)}>{t("Исключить все варианты", "Exclude all options")}</button></div> : null}
          </details>
          {excludedGroups.length ? <details data-auction-exclusions className={styles.excludedLots} onToggle={event => setExcludedOpen(event.currentTarget.open)}><summary>{t("Исключения", "Exclusions")}: {number(excludedGroups.length)}</summary>
            <p className={styles.note}>{t("Выбор в карточке исключает вариант во всех лотах и слотах. Исключение покупки запрещает только её лот во всех слотах.", "A card selection excludes that variant across all lots and slots. Excluding a purchase blocks only that lot across all slots.")}</p>
            {excludedOpen ? <><ul>{excludedGroups.slice(0, excludedLimit).map(([key, group], index) => {
              const facts = gearPlannerItemStatDescription(group.item, locale);
              const context = [`${t("Вариант", "Variant")} ${index + 1}`, group.item.itemLevel !== undefined ? `${t("Уровень предмета", "Item level")} ${number(group.item.itemLevel)}` : "", ...facts].filter(Boolean).join(" · ");
              return <li key={key}><div className={styles.excludedItem}><GearPlannerItem item={group.item} locale={locale} /><span className={styles.note}>{context}</span><span className={styles.note}>{t("Лотов", "Lots")}: {number(group.lots.size)}</span></div><button data-excluded-restore type="button" disabled={selectionLocked} className={styles.button} aria-label={`${t("Вернуть вариант в подбор", "Restore variant to assembly")}: ${group.item.name}; ${context}`} onClick={() => setAllowed(group.item.optionId, true)}>{t("Вернуть вариант в подбор", "Restore variant to assembly")}</button></li>;
            })}</ul>{excludedGroups.length > excludedLimit ? <button type="button" className={styles.button} onClick={() => setExcludedLimit(limit => limit + 20)}>{t("Показать ещё 20", "Show 20 more")}</button> : null}</> : null}
          </details> : null}
          {running && transport?.mode === "search" ? <p className={styles.note}>{t("Можно собрать сет из уже найденных вариантов. Поиск остановится; позднее его можно продолжить.", "You can build from the options already found. Discovery will stop and can be continued later.")}</p> : !search.searchComplete && available.length ? <p className={styles.note}>{t("Поиск ещё не завершён. Сет будет собран из доступных на момент сборки проверенных вариантов.", "The search is incomplete. The loadout will use the verified options available when assembly runs.")}</p> : null}
          {feedback("assembly")}
          {assembly && displayed ? <div className={styles.result} data-auction-assembly-result data-exhaustive={assembly.exhaustiveComplete} data-price-state={assemblyStale ? "stale" : "verified"}>
            <h3>{confirmed ? (assembly.objective ?? "dps") === "value" ? t("Самый выгодный подтверждённый сет среди проверенных", "Best-value confirmed loadout evaluated so far") : t("Лучший подтверждённый сет среди проверенных", "Best confirmed loadout evaluated so far") : assembly.exhaustiveComplete ? t("Подтверждённого улучшения пока нет", "No confirmed upgrade yet") : t("Лучший из проверенных комплектов", "Best loadout evaluated so far")}</h3>
            {assemblyStale ? <p role="status" className={styles.staleResult}>{t("Предыдущий результат сохранён. Цены и доступность лотов не подтверждены: обновите и пересоберите сет перед покупкой.", "The previous result has been kept. Prices and availability are not verified: refresh and rebuild the loadout before buying.")}</p> : null}
            <p className={styles.note}>{assembly.exhaustiveComplete ? t("Все сочетания свойств разрешённых вариантов проверены; для каждого выбраны доступные лоты под бюджет.", "All effect combinations of allowed options have been checked, with available lots allocated within budget for each.") : running && transport?.mode === "assembly" ? t("Перебор сочетаний продолжается автоматически. Показан лучший найденный результат для выбранной цели. Расчёт можно остановить.", "Combination evaluation continues automatically. This is the best result found for the selected objective. You can stop the calculation.") : t("Перебор сочетаний не завершён. Показан лучший найденный результат для выбранной цели. Нажмите «Продолжить сборку сета», чтобы возобновить автоматическую проверку.", "Combination evaluation is incomplete. This is the best result found for the selected objective. Select “Continue loadout assembly” to resume automatic evaluation.")} {discoveryIncomplete || incompleteData ? t("Проверена только доступная часть рынка: это не подтверждение лучшего сета на всём аукционе.", "Only the verified part of the market is covered; this does not establish the best loadout across the whole auction house.") : ""} {t("Рассмотрено сочетаний свойств", "Effect combinations checked")}: {number(assembly.combinationsChecked)}.</p>
            {!assemblyStale && marketChanged && marketChange ? <p role="status" className={styles.note}>{t("Доступность лотов обновлена перед сборкой.", "Lot availability was refreshed before assembly.")} {t("Недоступно", "Unavailable")}: {marketChange.removedLots}; {t("цена изменилась", "price changed")}: {marketChange.repricedLots}; {t("количество изменилось", "quantity changed")}: {marketChange.quantityChangedLots}; {t("свойства изменились", "properties changed")}: {marketChange.variantsChangedLots}. {t("Список вещей и стоимость сета пересчитаны.", "The item list and loadout cost have been recalculated.")}</p> : null}
            <dl className={styles.totals}><div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(assembly.budgetCopper)}</dd></div><div><dt>{assemblyStale ? t("Предыдущая стоимость", "Previous cost") : t("Стоимость комплекта", "Loadout cost")}</dt><dd>{money(displayed.spentCopper)}</dd></div><div><dt>{t("Останется", "Remaining")}</dt><dd>{money(displayed.remainingCopper)}</dd></div>{confirmed && displayed.comparison.deltaDps > 0 ? <div><dt>{t("Цена за +1 DPS всего сета", "Whole-loadout cost per +1 DPS")}</dt><dd>{displayed.spentCopper / displayed.comparison.deltaDps < 1 ? `<${money(1)}` : money(displayed.spentCopper / displayed.comparison.deltaDps)}</dd></div> : null}</dl>
            <dl className={styles.dpsMetrics}><div><dt>{t("Сейчас", "Current gear")}</dt><dd>{number(displayed.comparison.baselineDps)} <span>DPS</span></dd></div><div><dt>{t("С этим комплектом", "With this loadout")}</dt><dd>{number(displayed.comparison.candidateDps)} <span>DPS</span></dd></div><div className={significantGain ? styles.gain : undefined}><dt>{t("Изменение всего комплекта", "Whole-loadout change")}</dt><dd>{signed.format(displayed.comparison.deltaPercent)}% <span>{signed.format(displayed.comparison.deltaDps)} DPS</span></dd></div></dl>
            <p className={significantGain ? styles.confirmed : styles.note}>{significantGain ? t("Прирост DPS превышает погрешность сравнения.", "The DPS gain exceeds the comparison uncertainty.") : t("Прирост не подтверждён: разница в пределах погрешности или улучшения нет.", "No confirmed gain: the difference is within uncertainty or there is no improvement.")} {number(displayed.comparison.confidence)}% {t("доверительный интервал", "confidence interval")}: ±{number(displayed.comparison.uncertainty.marginPercent)}%.</p>
            {confirmed && assembly.comparison.candidateDps !== confirmed.comparison.candidateDps ? <details className={styles.calculation}><summary>{t("Другой результат с максимальным измеренным DPS", "Another result with the highest measured DPS")}</summary><p className={styles.note}>{number(assembly.comparison.candidateDps)} DPS ({signed.format(assembly.comparison.deltaDps)} DPS). {(assembly.objective ?? "dps") === "value" && measuredSignificant ? t("Он не выбран для покупки: показанный выше подтверждённый сет выгоднее по цене за прирост DPS.", "It was not selected for purchase: the confirmed loadout above offers better value per DPS gained.") : t("Его прирост не подтверждён с учётом погрешности. Для покупки показан подтверждённый сет выше.", "Its gain is not confirmed after accounting for uncertainty. The confirmed loadout above is shown for purchase.")}</p></details> : null}
            {significantGain && lots.length ? <><h3>{assemblyStale ? t("Вещи из предыдущего результата", "Items from the previous result") : t("Что купить для сета", "Items to buy for this loadout")}</h3><p className={styles.note}>{assemblyStale ? t("Список сохранён для справки. Сначала обновите цены и доступность лотов.", "This list is kept for reference. Refresh lot prices and availability first.") : t("Прирост подтверждён для всего сета. Покупайте и надевайте указанные вещи вместе; по отдельности некоторые из них могут не давать улучшения. Остальные слоты сохраняют текущую экипировку.", "The gain is confirmed for the whole loadout. Buy and equip these items together; some may not improve DPS individually. Other slots keep their equipped items.")}</p><ul className={styles.lots}>{lots.map(lot => {
              const replacements = confirmed?.purchases.filter(item => item.auctionId === lot.auctionId) ?? [];
              return <li className={styles.lot} key={lot.auctionId}><div className={styles.lotHeader}><div className={styles.purchase}><GearPlannerItem item={lot} locale={locale} /></div><div className={styles.price}><span className={styles.label}>{assemblyStale ? t("Предыдущая цена лота", "Previous whole-lot price") : t("Цена целого лота", "Whole-lot price")}</span><strong>{money(lot.lotCostCopper)}</strong><span>{t("Количество в лоте", "Lot quantity")}: {lot.quantity}</span></div></div><button type="button" className={`${styles.button} ${styles.excludeLot}`} disabled={selectionLocked} onClick={() => setLotAllowed(lot.auctionId, false)}>{t("Исключить лот из сборки", "Exclude lot from loadout")}: {lot.name}</button><ul className={styles.replacements}>{replacements.map(item => <li key={item.slotType}><div className={styles.replacementLabel}><strong>{slotName(item.slotType)}</strong><span>{t("Заменяет надетый предмет", "Replaces equipped item")}</span></div>{item.currentItem ? <GearPlannerItem item={item.currentItem} locale={locale} /> : <span className={styles.note}>{t("Надетый предмет не указан.", "Equipped item details are unavailable.")}</span>}</li>)}</ul>{lot.quantity > 1 ? <p className={styles.note}>{t(`Используется ${replacements.length} из ${lot.quantity} шт. Цена целого лота учтена один раз.`, `Uses ${replacements.length} of ${lot.quantity} items. The whole lot is charged once.`)}</p> : null}</li>;
            })}</ul></> : <p>{assembly.purchases.length ? t("Покупки пока не рекомендуем: прирост всего сета не превышает погрешность сравнения.", "No purchases are recommended yet: the whole-loadout gain does not exceed comparison uncertainty.") : assembly.exhaustiveComplete ? t("Среди проверенных сочетаний разрешённых вариантов текущая экипировка дала максимальный расчётный DPS.", "Your current gear had the highest simulated DPS among the verified combinations of allowed options.") : t("На текущем шаге замена экипировки не дала более высокого расчётного DPS.", "No replacement has produced higher simulated DPS so far.")}</p>}
            {significantGain && displayed.removedSlots.includes("OFF_HAND") ? <p className={styles.note}>{t("Для двуручного оружия предмет из левой руки снимается.", "The off-hand item is removed to equip the two-handed weapon.")}</p> : null}
          </div> : null}
        </section>
      <p className={styles.note}>{t("Лоты могут выкупить другие игроки. Перед покупкой сверьте цену, уровень и характеристики. Зачарования и камни в бюджет не включены.", "Other players can buy these lots. Check the price, item level and properties before purchasing. Enchants and gems are excluded from the budget.")}</p>
      <details className={styles.calculation}><summary>{t("Как получен результат", "How this result was calculated")}</summary><p>{t("DPS — средний урон в секунду в выбранном бою. Каждая замена сравнивается с текущей экипировкой; проценты разных замен нельзя складывать.", "DPS is average damage per second in the selected fight. Each replacement is compared with your current gear; percentages from different replacements cannot be added together.")}</p><p>{t("Индивидуальных расчётов", "Individual simulations")}: {number(search.simulations)}. {t("Движок", "Engine")}: {search.engine}.</p>{assembly ? <p>{t("Допустимых сочетаний свойств", "Valid effect combinations")}: {number(assembly.validCombinations)}. {t("Сочетаний свойств до проверки бюджета и совместимости", "Effect combinations before budget and compatibility checks")}: {assembly.combinationCount}.</p> : null}</details>
    </div> : null}
  </section>;
}
