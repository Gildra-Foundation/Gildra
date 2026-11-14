"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuctionGearJob } from "@/lib/wow/auctionGearJobs";
import type { AuctionGearAssemblyResult, AuctionGearSearchResult, AuctionPlanProgress } from "@/lib/wow/auctionGearTypes";
import { auctionGearSlots, parseAuctionGearSlots, type AuctionGearSlot } from "@/lib/wow/auctionGearSelection";
import { encodeAuctionGearSelectionTransport } from "@/lib/wow/auctionGearSelectionTransport";
import { parseAuctionGearEncounter, parseAuctionGearCompareScenarios, auctionGearEncounterMatches, type AuctionGearEncounter } from "@/lib/wow/auctionGearScenarios";
import { normalizeAuctionBudgetGold } from "@/lib/wow/auctionGearBudget";
import { auctionGearMarketExpiry, auctionGearPricesAreFresh } from "@/lib/wow/auctionGearFreshness";
import { auctionGearVariantSelectionKey } from "@/lib/wow/auctionGearExclusions";
import { auctionGearCoverageReasons } from "@/lib/wow/auctionGearCoverage";
import { getAuctionGearRecommendationGroups, getAuctionGearRecommendations, type AuctionGearRecommendationGroup } from "@/lib/wow/auctionGearRecommendations";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { AuctionClientError, auctionClientCacheKey, auctionClientDelay, auctionClientPollDelay, auctionClientJobUrl, auctionClientRequestUrl, clearAcknowledgedAuctionClientCache, fetchAuctionClientResult,
  forgetAuctionClientJob, forgetAuctionClientRequest, hasPendingAuctionClientJob, readAuctionClientCache, parseAuctionClientFormIntent, releasePriorAuctionClientJob, rememberAuctionClientJob, rememberAuctionClientRequest,
  removeAuctionClientJob, removeAuctionClientRequest, retireAuctionClient, waitForAuctionClientRetirement, writeAuctionClientCache,
  parseAuctionClientActiveRecovery, type AuctionClientActiveRecovery, type AuctionClientCache } from "@/lib/wow/auctionGearClient";
import { auctionGearServiceMessage } from "@/lib/wow/auctionGearCopy";
import { GearPlannerItem, gearPlannerItemStatDescription } from "./GearPlannerItem";
import { AuctionGearSuggestions } from "./AuctionGearSuggestions";
import { AlertTriangle, LoaderCircle, Search } from "lucide-react";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import styles from "./auctionGearOptimizer.module.css";
import tools from "./characterTools.module.css";
import { auctionFormats, formatGold, formatGoldRate } from "./auctionFormat";
import { upgradeSlotName } from "./characterUpgradesCopy";

type Props = { characterSlug: string; snapshotKey: string; specializationSlug: string; localePrefix?: "" | "/ru";
  /** Confirmed single-item upgrades (best value per slot) for the slot overview; null when there is no search. */
  onRecommendations?: (groups: AuctionGearRecommendationGroup[] | null) => void };
type Metadata = { fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[] } & Pick<NonNullable<AuctionGearJob["result"]>, "market" | "profileFingerprint" | "scenario" | "coverage" | "objective">;
type SearchResult = AuctionGearSearchResult & Metadata;
type AssemblyResult = AuctionGearAssemblyResult & Metadata;
type PlannerJob = Omit<AuctionGearJob, "result"> & { result: SearchResult | AssemblyResult | null };
type Mode = "search" | "assembly";
type Transport = { mode: Mode; status: PlannerJob["status"] | "starting"; progress: AuctionPlanProgress | null; error: string | null };
type SearchRequest = { fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[]; action: "search"; clientRequestId?: string; characterSlug: string; budgetGold: string; selectedSlots: AuctionGearSlot[]; scenario: string; objective: "value" | "dps"; locale: "ru" | "en" };
type RequestBody = SearchRequest | { action: "resume"; searchId: string; clientRequestId?: string } | { action: "assemble"; searchId: string; excludedOptionIds: string[]; excludedVariantKeys: string[]; clientRequestId?: string } | { action: "poll"; id: string; observedActive?: boolean };
type ActiveRequest = { mode: Mode; controller: AbortController; id?: string; observedActive?: boolean; done: Promise<void>; finish: () => void };
const jobIsActive = (job: Pick<PlannerJob, "status">) => job.status === "queued" || job.status === "running";
const intentMatchesSearch = (intent: NonNullable<ReturnType<typeof parseAuctionClientFormIntent>>, result: SearchResult) =>
  Number(intent.budgetGold) === result.budgetCopper / 10000 && intent.scenario === result.scenario &&
  JSON.stringify(parseAuctionGearEncounter(intent)) === JSON.stringify(parseAuctionGearEncounter(result)) &&
  JSON.stringify(intent.compareScenarios ?? []) === JSON.stringify(result.compareScenarios ?? []) &&
  intent.objective === (result.objective ?? "dps") && sameSelection(intent.selectedSlots, parseAuctionGearSlots(result.selectedSlots));
const sameSelection = (a: readonly string[] = [], b: readonly string[] = []) => { const left = new Set(a), right = new Set(b); return left.size === right.size && [...left].every(key => right.has(key)); };
type Recovery = { kind: "recovery"; search: SearchResult; assembly: AssemblyResult | null;
  excludedOptionIds: string[]; excludedVariantKeys?: string[]; activeJob: PlannerJob | null; needsRefresh: true };

export function AuctionGearOptimizer(props: Props) {
  return <AuctionGearOptimizerContent key={`${props.characterSlug}:${props.snapshotKey}:${props.specializationSlug}:${props.localePrefix ?? "/ru"}`} {...props} />;
}
function AuctionGearOptimizerContent({ characterSlug, snapshotKey, specializationSlug, localePrefix = "/ru", onRecommendations }: Props) {
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
  const [fightLengthSeconds, setFightLengthSeconds] = useState(120);
  const [targets, setTargets] = useState(1);
  const [compareScenarios, setCompareScenarios] = useState<AuctionGearEncounter[]>([]);
  const [scenario, setScenario] = useState("single-target");
  function restoreEncounter(value: { scenario: string; fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[] }) {
    const encounter = parseAuctionGearEncounter(value);
    setScenario(encounter.scenario); setFightLengthSeconds(encounter.fightLengthSeconds); setTargets(encounter.targets);
    setCompareScenarios(parseAuctionGearCompareScenarios(value.compareScenarios));
  }

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
  const { numeric, signed } = auctionFormats[ru ? "ru" : "en"];
  const number = (value: number) => numeric.format(value);
  const money = (value: number) => formatGold(value, ru ? "ru" : "en");
  const slotName = (slot: string) => upgradeSlotName(slot, ru);
  const recommendationGroups = useMemo(() => getAuctionGearRecommendationGroups(search?.items ?? [], { excludedOptionIds: excluded, excludedVariantKeys }), [search, excluded, excludedVariantKeys]);
  // Stale prices stay visible here with their warning; the slot overview only shows current ones.
  useEffect(() => { onRecommendations?.(search && !marketStale ? recommendationGroups : null); }, [onRecommendations, recommendationGroups, search, marketStale]);
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
    invalid_budget: t("Введите сумму от 0 до 99 999 999 золота.", "Enter a budget from 0 to 99,999,999 gold."),
    invalid_equipment_slots: t("Выберите хотя бы один слот экипировки.", "Choose at least one equipment slot."),
    session_expired: t("Войдите в Battle.net повторно.", "Sign in to Battle.net again."),
    market_stale: t("Снимок аукциона устарел. Запустите новый поиск после обновления рынка.", "The auction snapshot is too old. Start a new search after the market updates."),
    market_timestamp_unverified: t("Не удалось подтвердить время обновления аукциона.", "The auction update time could not be verified."),
    equipment_constraints_unverified: t("Не хватает данных о надетых вещах.", "Data about your equipped items is incomplete."),
    damage_specialization_required: t("Сравнение DPS доступно для специализаций, наносящих урон.", "DPS comparisons are available for damage specializations."),
    plan_already_running: t("Предыдущий расчёт ещё выполняется.", "Your previous calculation is still running."),
    plan_rate_limited: t("Слишком много запусков. Подождите минуту и продолжите расчёт.", "Too many searches. Wait a minute and continue."),
    plan_waiting_for_quota: t("Ждём очереди…", "Waiting in queue…"),
    plan_queue_full: t("Очередь расчётов заполнена. Повторите позже.", "The calculation queue is full. Try again later."),
    simulation_unavailable: t("Расчёт сейчас недоступен. Повторите позже.", "Calculation is unavailable. Try again later."),
    variant_metadata_worker_upgrade_required: t("Проверка характеристик вещей сейчас недоступна. Повторите позже.", "Item property verification is unavailable. Try again later."),
    variant_resolution_unavailable: t("Не удалось проверить свойства аукционных вещей. Повторите позже.", "Auction item properties could not be verified. Try again later."),
    item_reference_unavailable: t("Не удалось проверить вещи. Повторите позже.", "Items could not be verified. Try again later."),
    plan_not_found: t("Расчёт больше недоступен. Запустите новый поиск.", "The search has expired. Start a new search."),
    search_not_found: t("Список вещей больше недоступен. Запустите новый поиск.", "The item list has expired. Start a new search."),
    search_expired: t("Список вещей устарел. Запустите новый поиск.", "The item list has expired. Start a new search."),
    search_capacity: t("Сейчас выполняется слишком много поисков. Повторите позже.", "Too many searches are active. Try again later."),
    search_not_ready: t("Дождитесь первого результата поиска, затем продолжите расчёт.", "Wait for the first search result before continuing."),
    auction_market_changed: t("Лоты или цены на рынке изменились. Запустите новый поиск.", "Auction lots or prices changed. Start a new search."),
    invalid_auction_selection: t("Выбранные варианты больше недоступны. Запустите новый поиск.", "The selected options are no longer available. Start a new search."),
    character_snapshot_changed: t("Экипировка персонажа изменилась. Запустите новый поиск.", "Your character equipment changed. Start a new search."),
    simulation_version_changed: t("Расчёт обновился. Запустите новый поиск.", "Calculations were updated. Start a new search."),
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
        setBudget(intent.budgetGold); restoreEncounter(intent); setObjective(intent.objective); setSelectedSlots(intent.selectedSlots);
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
            setBudget(String(previous.search.budgetCopper / 10000)); restoreEncounter(previous.search); setObjective(previous.search.objective ?? "dps");
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
        setBudget(String(result.search.budgetCopper / 10000)); restoreEncounter(result.search); setObjective(result.search.objective ?? "dps");
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
              setBudget(String(previous.search.budgetCopper / 10000)); restoreEncounter(previous.search); setObjective(previous.search.objective ?? "dps");
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
  function invalidate(draft: Partial<{ budget: string; scenario: string; fightLengthSeconds: number; targets: number; compareScenarios: AuctionGearEncounter[]; objective: "value" | "dps"; selectedSlots: AuctionGearSlot[] }> = {}): Promise<boolean> | null {
    const needsRetirement = Boolean(retryJob || hasRecovery || cache.current?.jobId || cache.current?.clientRequestId || cache.current?.cancellationRequested);
    let retirement: Promise<boolean> | null = null;
    if (needsRetirement) {
      try {
        const intent = parseAuctionClientFormIntent({ characterSlug, locale,
          budgetGold: normalizeAuctionBudgetGold(draft.budget ?? budget, locale), scenario: draft.scenario ?? scenario,
          fightLengthSeconds: draft.fightLengthSeconds ?? fightLengthSeconds, targets: draft.targets ?? targets, compareScenarios: draft.compareScenarios ?? compareScenarios,
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
        let publishedSearchId = body.action === "resume" || body.action === "assemble" ? body.searchId : body.action === "poll" ? cache.current?.searchId : undefined;
        const acceptedEncounterIntent = cache.current?.formIntent;
        const applyResult = (result: SearchResult | AssemblyResult, pricesStale: boolean) => {
          if (!isCurrent() || payload.id !== request.id || (result.kind !== mode && !(mode === "assembly" && result.kind === "search")) ||
              (publishedSearchId && result.searchId !== publishedSearchId) ||
              (acceptedEncounterIntent && !auctionGearEncounterMatches(acceptedEncounterIntent, result))) {
            throw new Error("invalid_plan_result");
          }
          publishedSearchId = result.searchId;
          if (result.kind === "search") {
            setSearch(result); setMarketStale(pricesStale);
          } else {
            setAssembly(result); setAssemblyStale(pricesStale);
            if (result.updatedSearch) {
              if (result.updatedSearch.searchId !== result.searchId) throw new Error("invalid_plan_result");
              setSearch({ ...result.updatedSearch, market: result.market,
                profileFingerprint: result.profileFingerprint, scenario: result.scenario, fightLengthSeconds: result.fightLengthSeconds, targets: result.targets, compareScenarios: result.compareScenarios, objective: result.objective, coverage: result.coverage });
              setMarketStale(pricesStale);
            }
          }
        };
        let pollAttempt = 0;
        while (payload.status === "queued" || payload.status === "running") {
          if (payload.result) applyResult(payload.result, !auctionGearPricesAreFresh(payload.result.market));
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
          setBudget(String(result.budgetCopper / 10000)); restoreEncounter(result); setObjective(result.objective ?? "dps");
          setSelectedSlots(parseAuctionGearSlots(result.selectedSlots));
        }
        const pricesStale = recoveredCompleted || !auctionGearPricesAreFresh(result.market);
        applyResult(result, pricesStale);
        remember({ searchId: result.searchId, jobId: undefined, clientRequestId: undefined, mode,
          formIntent: result.kind === "search" ? parseAuctionClientFormIntent({ characterSlug, locale, budgetGold: String(result.budgetCopper / 10000),
            scenario: result.scenario, fightLengthSeconds: result.fightLengthSeconds, targets: result.targets, compareScenarios: result.compareScenarios, objective: result.objective ?? "dps", selectedSlots: parseAuctionGearSlots(result.selectedSlots) }) ?? undefined : cache.current?.formIntent });
        forgetAuctionClientJob(payload.id);
        request.id = undefined;
        let complete: boolean;
        if (result.kind === "search") {
          // Each response is an authoritative snapshot: sold lots must disappear.

          complete = result.searchComplete;
          body = { action: "resume", searchId: result.searchId };
        } else {
          // Keep publishing checkpoints while one user-started calculation
          // advances. Reading an old completed job must not silently start new work.
          complete = (result.exhaustiveComplete && result.scenarioComparisonsComplete !== false && result.enhancementOptimization?.complete !== false) || recoveredCompleted;
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
    setBudget(intent.budgetGold); restoreEncounter(intent); setObjective(intent.objective); setSelectedSlots(intent.selectedSlots);
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
      void run({ action: "search", characterSlug, budgetGold, selectedSlots: slots, scenario, fightLengthSeconds, targets, compareScenarios, objective, locale }, "search");
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
    : progress?.phase === "catalog" || progress?.phase === "variants" ? t("Проверяем вещи…", "Checking items…")
    : transport?.mode === "assembly" ? t("Собираем сет…", "Building the loadout…")
    : t("Сравниваем замены…", "Comparing replacements…");
  const feedback = (mode: Mode) => transport?.mode !== mode ? null : <>
    {running ? <p role="status" className={tools.status}><LoaderCircle className={tools.spin} aria-hidden="true" />{["plan_reconnecting", "plan_cancelling", "plan_waiting_for_quota"].includes(transport.error ?? "") ? failureText(transport.error) : progressText}{progress ? ` ${number(progress.completed)} / ${number(progress.total)}` : ""}</p> : null}
    {transport.status === "failed" ? <p role="alert" className={tools.alert}><AlertTriangle aria-hidden="true" />{failureText(transport.error)}</p> : null}
    {transport.status === "cancelled" ? <p role="status" className={tools.status}>{search ? t("Расчёт остановлен.", "Calculation stopped.") : t("Поиск отменён.", "Search cancelled.")}</p> : null}
    {transport.status === "failed" && cancellation === "failed" ? <button type="button" className={tools.quiet} onClick={() => void cancel()}>{t("Повторить отмену", "Retry cancellation")}</button> : null}
    {transport.status === "failed" && !cancellation && retryJob ? <button type="button" className={tools.quiet} disabled={!validBudget} onClick={() => void run({ action: "poll", id: retryJob.id, observedActive: retryJob.observedActive }, retryJob.mode)}>{t("Повторить подключение", "Reconnect to calculation")}</button> : null}
    {transport.status === "failed" && !cancellation && !retryJob && hasRecovery ? <button type="button" className={tools.quiet} disabled={!validBudget} onClick={() => setRecoveryAttempt(value => value + 1)}>{t("Повторить восстановление", "Retry recovery")}</button> : null}
  </>;
  const significantGain = Boolean(confirmed);
  const enhancedGain = assembly?.enhancementOptimization?.recommendations.some(r => r.comparison.deltaDps > 0 && r.comparison.uncertainty.significant);
  const enhancementsPending = assembly?.enhancementOptimization?.status === "pending";
  const incompleteData = Boolean(search && auctionGearCoverageReasons(search.coverage, search.dataComplete, locale).length);
  const discoveryIncomplete = Boolean(search && (search.discoveryComplete === false || search.discoveryComplete === undefined && search.searchLimited));
  const sameScope = discovered?.activeJob ? discovered.activeJob.scope.characterSlug === characterSlug && discovered.activeJob.scope.locale === locale : false;
  const cost = (copper: number, dps: number) => formatGoldRate(copper / dps, locale);
  const enhancementSubtotal = (items: { quotedCopper: number | null }[]) => items.some(item => item.quotedCopper === null)
    ? t("Неизвестна", "Unknown") : money(items.reduce((sum, item) => sum + item.quotedCopper!, 0));

  return <section ref={panel} className={`${tools.tool} ${styles.panel}`} aria-labelledby="auction-gear-title" data-auction-gear>
    <h3 className={tools.title} id="auction-gear-title">{t("Улучшения с аукциона", "Auction House upgrades")}</h3>
    {discovered?.activeJob ? <div className={styles.recovery} data-auction-owned-recovery>
      <p role="status" className={tools.status}>{t("У вас есть незавершённый расчёт", "You have an unfinished calculation")}{discovered.formIntent ? ` · ${money(Number(discovered.formIntent.budgetGold) * 10000)}` : ""}</p>
      <div className={tools.actions}>{discovered.formIntent && sameScope ? <MaterialButton kit={CHARACTERS_KIT} variant="primary" type="button" disabled={running || Boolean(cancellation)} onClick={() => void openOwnedCalculation()}>{t("Открыть расчёт", "Open calculation")}</MaterialButton> : null}
      {!cancellation ? <button type="button" className={tools.quiet} disabled={running} onClick={() => void cancelOwnedCalculation()}>{t("Отменить и изменить параметры", "Cancel and change parameters")}</button> : null}</div>
    </div> : null}
    {ownerLookupFailed && !discovered?.activeJob ? <button type="button" className={tools.quiet} disabled={running || Boolean(cancellation)} onClick={() => void findOwnedCalculation()}>{t("Найти активный расчёт", "Find active calculation")}</button> : null}
    {!supported ? <p className={tools.status}>{messages.damage_specialization_required}</p> : <form className={styles.form} onSubmit={event => { event.preventDefault(); startSearch(); }}>
      <div className={tools.fields}>
        <label className={tools.field}>{t("Бюджет, золото", "Budget, gold")}<input ref={budgetInput} name="budgetGold" inputMode="decimal" value={budget} onChange={event => {
          const next = event.target.value; setBudgetInput(next);
          let amount: string;
          try { amount = normalizeAuctionBudgetGold(next, locale); }
          catch { return; } // Retain facts and ownership while the draft is incomplete; actions stay disabled.
          if (amount === acceptedBudget.current) return;
          acceptedBudget.current = amount;
          invalidate({ budget: next });
        }} disabled={formLocked} required aria-invalid={!validBudget || undefined} aria-describedby={validBudget ? undefined : "auction-budget-error"} /></label>
        <label className={tools.field}>{t("Бой", "Encounter")}<select value={scenario} onChange={event => { setScenario(event.target.value); const preset = parseAuctionGearEncounter({ scenario: event.target.value }); setFightLengthSeconds(preset.fightLengthSeconds); setTargets(preset.targets); invalidate({ scenario: event.target.value, fightLengthSeconds: preset.fightLengthSeconds, targets: preset.targets }); }} disabled={formLocked}>
          <option value="single-target">{t("Одна цель", "Single target")}</option><option value="aoe">{t("5 целей", "5 targets")}</option><option value="execute">{t("Короткий бой", "Short fight")}</option>
        </select></label>
        <label className={tools.field}>{t("Длительность, с", "Duration, seconds")}<input type="number" min={30} max={300} step={1} value={fightLengthSeconds} disabled={formLocked} onChange={event => { setFightLengthSeconds(Number(event.target.value)); invalidate({ fightLengthSeconds: Number(event.target.value) }); }} required /></label>
        <label className={tools.field}>{t("Цели", "Targets")}<input type="number" min={1} max={scenario === "aoe" ? 8 : 1} step={1} value={targets} disabled={formLocked || scenario !== "aoe"} onChange={event => { setTargets(Number(event.target.value)); invalidate({ targets: Number(event.target.value) }); }} required /></label>
        <div className={tools.actions}>
          {running && !cancellation ? <button className={tools.quiet} type="button" onClick={() => void editParameters()}>{t("Изменить параметры", "Change parameters")}</button> : null}
          {!cancellation && running && (transport?.mode === "search" || !search) ? <button className={tools.quiet} type="button" onClick={cancel}>{transport?.mode === "assembly" ? t("Отменить сборку", "Cancel assembly") : t("Отменить поиск", "Cancel search")}</button> : null}
          <MaterialButton kit={CHARACTERS_KIT} fit="stack" variant="primary" type="submit" disabled={formLocked || !validBudget} icon={<Search aria-hidden="true" />}>{running && transport?.mode === "search" ? t("Ищем вещи…", "Searching…") : search ? t("Новый поиск", "New search") : t("Найти улучшения", "Find upgrades")}</MaterialButton>
        </div>
      </div>
      <fieldset className={styles.slotFieldset} disabled={formLocked}><legend>{t("Сравнить финалистов в других боях", "Compare finalists in other encounters")}</legend>
        <p className={styles.note}>{t("Сравнение выбранных боёв начнётся после завершения перебора. Лучший вариант зависит от боя.", "Selected encounters are compared after traversal finishes. The best option depends on the encounter.")}</p>
        <div className={styles.slots}>{(["single-target", "aoe", "execute"] as const).map(value => <label key={value}><input type="checkbox" checked={compareScenarios.some(e => e.scenario === value)} onChange={event => {
          const next = event.target.checked ? [...compareScenarios, parseAuctionGearEncounter({ scenario: value })] : compareScenarios.filter(e => e.scenario !== value);
          setCompareScenarios(next);
          invalidate({ compareScenarios: next });
        }} /><span>{value === "aoe" ? t("5 целей · 60 с", "5 targets · 60 s") : value === "execute" ? t("1 цель · 90 с", "1 target · 90 s") : t("1 цель · 120 с", "1 target · 120 s")}</span></label>)}</div>
      </fieldset>
      <details className={styles.disclosure}><summary>{t("Слоты экипировки и цель подбора", "Equipment slots and objective")}{selectedSlots.length < auctionGearSlots.length ? ` · ${number(selectedSlots.length)} / ${number(auctionGearSlots.length)}` : ""}</summary>
      <div className={tools.fields}><label className={tools.field}>{t("Цель подбора", "Selection objective")}<select name="objective" value={objective} onChange={event => { setObjective(event.target.value as "value" | "dps"); invalidate({ objective: event.target.value as "value" | "dps" }); }} disabled={formLocked}><option value="value">{t("Цена / прирост DPS", "Price / DPS gain")}</option><option value="dps">{t("Максимум DPS", "Maximum DPS")}</option></select></label></div>
      <fieldset className={styles.slotFieldset} disabled={formLocked}>
        <legend className={tools.srOnly}>{t("Какие слоты искать", "Equipment slots to search")}</legend>
        <div className={tools.actions}><button className={tools.quiet} type="button" onClick={() => { if (sameSelection(selectedSlots, auctionGearSlots)) return; setSelectedSlots([...auctionGearSlots]); invalidate({ selectedSlots: [...auctionGearSlots] }); }}>{t("Выбрать все", "Select all")}</button><button className={tools.quiet} type="button" onClick={() => { if (!selectedSlots.length) return; setSelectedSlots([]); invalidate({ selectedSlots: [] }); }}>{t("Снять выбор", "Clear selection")}</button></div>
        <div className={styles.slots}>{auctionGearSlots.map(slot => <label key={slot}><input type="checkbox" name="selectedSlots" value={slot} checked={selectedSlots.includes(slot)} onChange={event => { const next = event.target.checked ? auctionGearSlots.filter(value => value === slot || selectedSlots.includes(value)) : selectedSlots.filter(value => value !== slot); setSelectedSlots(next); invalidate({ selectedSlots: next }); }} /><span>{slotName(slot)}</span></label>)}</div>
      </fieldset></details>
      {!validBudget ? <p id="auction-budget-error" role="alert" className={tools.alert}><AlertTriangle aria-hidden="true" />{messages.invalid_budget}</p> : null}
    </form>}
    {feedback("search")}
    {!search ? feedback("assembly") : null}
    {search ? <div className={styles.searchResult} data-auction-search-result data-auction-market={search.market.realm}>
      <h4 className={tools.subtitle}>{t("Выгодные улучшения", "Best-value upgrades")}</h4>
      {marketStale ? <p className={tools.status}><AlertTriangle aria-hidden="true" />{t("Цены могли измениться — запустите новый поиск.", "Prices may have changed — run a new search.")}</p> : null}
      {!search.searchComplete && !running && !cancellation ? <div className={tools.actions}><span className={tools.status}>{t("Осталось сравнить", "Left to compare")}: {number(search.pendingItems)}</span><button disabled={!validBudget} className={tools.quiet} type="button" onClick={continueSearch}>{t("Продолжить проверку вещей", "Continue item comparisons")}</button></div> : null}
      {search.searchComplete && (incompleteData || discoveryIncomplete) ? <button className={tools.quiet} type="button" disabled={!validBudget || running || Boolean(cancellation)} onClick={continueSearch}>{t("Обновить варианты", "Refresh options")}</button> : null}
      {recommendationGroups.length
        ? <AuctionGearSuggestions groups={recommendationGroups} locale={locale} excluded={excluded} excludedVariantKeys={excludedVariantKeys} running={selectionLocked} marketStale={marketStale} slotName={slotName} onAllowed={setAllowed} />
        : <p role="status" className={styles.empty}>{excludedUpgrades ? t("Найденные улучшения исключены из подбора.", "The upgrades found are excluded.")
          : !search.searchComplete || search.pendingItems > 0 || discoveryIncomplete
            ? search.items.some(item => item.comparison)
              ? t("Поиск продолжается: среди проверенных вещей улучшений пока нет.", "Search continues: no upgrades among the items compared so far.")
              : t("Пока недостаточно данных для сравнения — поиск продолжается.", "Not enough comparison data yet — search is continuing.")
            : incompleteData ? t("В проверенных вариантах улучшений нет; часть вещей не удалось оценить.", "No upgrades among verified options; some items could not be evaluated.")
              : t("Проверка завершена: отдельных улучшений не найдено.", "Search complete: no single-item upgrades found.")}</p>}
        <section id="auction-assembly" tabIndex={-1} className={styles.assembly} aria-labelledby="auction-assembly-title" data-auction-assembly>
          <div className={tools.head}>
            <h4 className={tools.subtitle} id="auction-assembly-title">{t("Сет под бюджет", "Loadout within budget")}</h4>
            <div className={tools.actions}>
              {!cancellation && running && transport?.mode === "assembly" ? <button className={tools.quiet} type="button" onClick={cancel}>{t("Отменить сборку", "Cancel assembly")}</button> : null}
              <MaterialButton kit={CHARACTERS_KIT} fit="stack" variant="primary" type="button" disabled={selectionLocked || !available.length} aria-describedby={!validBudget ? "auction-budget-error" : !available.length ? "auction-assembly-disabled-reason" : undefined} onClick={startAssembly}>{running && transport?.mode === "assembly" ? t("Собираем сет…", "Building loadout…") : assembly?.exhaustiveComplete ? t("Обновить и пересобрать сет", "Refresh and rebuild loadout") : assembly ? t("Продолжить сборку сета", "Continue loadout assembly") : t("Собрать сет под бюджет", "Build a loadout within budget")}</MaterialButton>
            </div>
          </div>
          {!available.length ? <p id="auction-assembly-disabled-reason" data-assembly-disabled-reason className={tools.status}>{search.items.length ? t("Все варианты исключены.", "All options are excluded.") : t("Вариантов для сборки пока нет.", "No options to build from yet.")}</p> : null}
          <div className={styles.manage}>
          {search.items.length ? <details className={styles.disclosure}><summary>{t("Настроить варианты для сета", "Loadout options")}</summary>
            <div className={tools.actions}><button className={tools.quiet} type="button" disabled={selectionLocked} onClick={() => setAllAllowed(true)}>{t("Разрешить все варианты", "Allow all options")}</button><button className={tools.quiet} type="button" disabled={selectionLocked} onClick={() => setAllAllowed(false)}>{t("Исключить все варианты", "Exclude all options")}</button></div>
          </details> : null}
          {excludedGroups.length ? <details data-auction-exclusions className={`${styles.disclosure} ${styles.excludedLots}`} onToggle={event => setExcludedOpen(event.currentTarget.open)}><summary>{t("Исключения", "Exclusions")}: {number(excludedGroups.length)}</summary>
            {excludedOpen ? <><ul>{excludedGroups.slice(0, excludedLimit).map(([key, group], index) => {
              const facts = gearPlannerItemStatDescription(group.item, locale);
              const context = [`${t("Вариант", "Variant")} ${index + 1}`, group.item.itemLevel !== undefined ? `${t("Уровень предмета", "Item level")} ${number(group.item.itemLevel)}` : "", ...facts].filter(Boolean).join(" · ");
              return <li key={key}><div className={styles.excludedItem}><GearPlannerItem item={group.item} locale={locale} /><span className={styles.note}>{context}</span></div><button data-excluded-restore type="button" disabled={selectionLocked} className={tools.quiet} aria-label={`${t("Вернуть вариант в подбор", "Restore variant to assembly")}: ${group.item.name}; ${context}`} onClick={() => setAllowed(group.item.optionId, true)}>{t("Вернуть", "Restore")}</button></li>;
            })}</ul>{excludedGroups.length > excludedLimit ? <button type="button" className={tools.quiet} onClick={() => setExcludedLimit(limit => limit + 20)}>{t("Показать ещё 20", "Show 20 more")}</button> : null}</> : null}
          </details> : null}
          </div>
          {feedback("assembly")}
          {assembly && displayed ? <div className={styles.result} data-auction-assembly-result data-exhaustive={assembly.exhaustiveComplete} data-price-state={assemblyStale ? "stale" : "verified"}>
            <h4 className={tools.subtitle}>{enhancedGain || enhancementsPending ? t("Сравнение комплектов", "Loadout comparison") : confirmed ? t("Лучший сет", "Best loadout") : t("Подтверждённого улучшения нет", "No confirmed upgrade")}</h4>
            {assemblyStale ? <p role="status" className={styles.staleResult}>{t("Цены не подтверждены — пересоберите сет перед покупкой.", "Prices are not verified — rebuild the loadout before buying.")}</p> : null}
            <dl className={styles.totals}><div><dt>{t("Бюджет", "Budget")}</dt><dd>{money(assembly.budgetCopper)}</dd></div><div><dt>{t("Стоимость вещей", "Item cost")}</dt><dd>{money(displayed.spentCopper)}</dd></div><div><dt>{t("Останется", "Remaining")}</dt><dd>{money(displayed.remainingCopper)}</dd></div>{confirmed && displayed.comparison.deltaDps > 0 ? <div><dt>{t("Цена за +1 DPS", "Cost per +1 DPS")}</dt><dd>{cost(displayed.spentCopper, displayed.comparison.deltaDps)}</dd></div> : null}</dl>
            {!assembly.enhancementOptimization?.recommendations.length ? <p className={styles.note}>{assembly.enhancementOptimization?.status === "pending"
              ? t("Подбираем камни и чары в оставшийся бюджет…", "Selecting gems and enchants within the budget…")
              : assembly.enhancementOptimization?.status === "no_affordable_configuration"
                ? t("Среди проверенных вариантов не найден комплект с камнями и чарами в пределах бюджета.", "No fully enhanced loadout within budget was found among checked configurations.")
                : t("Камни и чары не подобраны: совместимость не подтверждена, полная стоимость неизвестна.", "Gems and enchants are not selected: compatibility is unverified and full cost is unknown.")}</p> : null}
            {assembly.enhancementOptimization?.recommendations.map(recommendation => <section key={recommendation.label} data-auction-enhanced-result>
              <h4 className={tools.subtitle}>{t("Комплект с камнями и чарами", "Loadout with gems and enchants")}</h4>
              <p className={styles.note}>{t("Улучшения подобраны для одного из лучших найденных комплектов. Уже надетые вещи сохраняются.", "Enhancements are selected for one of the best loadouts found. Retained equipment stays unchanged.")}</p>
              <dl className={styles.totals}>
                <div><dt>{t("Предметы", "Equipment")}</dt><dd>{money(recommendation.configuration.itemsCopper)}</dd></div>
                <div><dt>{t("Камни", "Gems")}</dt><dd>{enhancementSubtotal(recommendation.configuration.consumables.filter(c=>c.kind==="gem"))}</dd></div>
                <div><dt>{t("Чары", "Enchants")}</dt><dd>{enhancementSubtotal(recommendation.configuration.consumables.filter(c=>c.kind==="enchant"))}</dd></div>
                <div><dt>{t("Полная стоимость", "Total cost")}</dt><dd>{recommendation.configuration.totalCopper === null ? t("Неизвестна", "Unknown") : money(recommendation.configuration.totalCopper)}</dd></div>
              </dl>
              <p className={recommendation.comparison.deltaDps>0 && recommendation.comparison.uncertainty.significant ? styles.gain : styles.note}>{signed.format(recommendation.comparison.deltaDps)} ± {number(recommendation.comparison.uncertainty.marginDps)} DPS · {signed.format(recommendation.comparison.deltaPercent)}%</p>
              {!recommendation.comparison.uncertainty.significant ? <p className={styles.note}>{t("Разница в пределах погрешности.", "The difference is within the margin of error.")}</p> : null}
              <ul>{recommendation.purchases.map(purchase => {
                const configuration = recommendation.configuration.slots.find(slot => slot.slotType === purchase.slotType);
                const gems = configuration?.gemIds.filter(id => id > 0).map(id => recommendation.enhancementNames?.gems[id] ?? recommendation.consumableNames[id] ?? t("Камень", "Gem")) ?? [];
                const enchant = configuration?.enchantId ? recommendation.enhancementNames?.enchants[configuration.enchantId] ?? t("Чары", "Enchant") : null;
                return <li key={purchase.slotType} data-auction-enhanced-slot>{slotName(purchase.slotType)}: <GearPlannerItem item={purchase} locale={locale} />
                  {gems.length ? <p className={styles.note}>{t("Камни", "Gems")}: {gems.join(" · ")}</p> : null}
                  {enchant ? <p className={styles.note}>{t("Чары", "Enchants")}: {enchant}</p> : null}
                </li>;
              })}</ul>
              <ul>{recommendation.configuration.consumables.map(consumable=><li key={consumable.itemId}>{recommendation.consumableNames[consumable.itemId] ?? (consumable.kind==="gem" ? t("Камень", "Gem") : t("Чары", "Enchant"))} × {number(consumable.quantity)} — {consumable.quotedCopper===null ? t("Цена неизвестна", "Price unknown") : money(consumable.quotedCopper)}</li>)}</ul>
            </section>)}
            {assembly.scenarioComparisons?.map(({ encounter, baseline, candidates }) => <div key={JSON.stringify(encounter)}>
              <h4 className={tools.subtitle}>{encounter.targets} {t("целей", "targets")} · {encounter.fightLengthSeconds} {t("с", "s")}</h4>
              <p>{t("Текущая экипировка", "Current gear")}: {number(baseline.dps)} DPS</p>
              <ul>{candidates.map(candidate => <li key={candidate.finalist}>{candidate.finalist.startsWith("enhanced-") ? t("Комплект с камнями и чарами", "Loadout with gems and enchants") : candidate.finalist === "confirmed" ? t("Статистически подтверждённый лучший сет", "Statistically confirmed best loadout") : candidate.finalist === "measured" ? t("Лучший измеренный сет", "Measured best loadout") : t("Сравниваемый сет", "Compared loadout")}: {signed.format(candidate.comparison.deltaDps)} ± {number(candidate.comparison.uncertainty.marginDps)} DPS</li>)}</ul>
            </div>)}
            <dl className={styles.dpsMetrics}><div><dt>{t("Сейчас", "Current gear")}</dt><dd>{number(displayed.comparison.baselineDps)} <span>DPS</span></dd></div><div><dt>{assembly.enhancementOptimization?.recommendations.length ? t("Без новых камней и чар", "Before new gems and enchants") : t("С этим сетом", "With this loadout")}</dt><dd>{number(displayed.comparison.candidateDps)} <span>DPS</span></dd></div><div className={significantGain ? styles.gain : undefined}><dt>{t("Изменение", "Change")}</dt><dd>{signed.format(displayed.comparison.deltaPercent)}% <span>{signed.format(displayed.comparison.deltaDps)} DPS</span></dd></div></dl>
            {significantGain && lots.length ? <><h4 className={tools.subtitle}>{t("Что купить", "Items to buy")}</h4><ul className={styles.lots}>{lots.map(lot => {
              const replacements = confirmed?.purchases.filter(item => item.auctionId === lot.auctionId) ?? [];
              return <li className={styles.lot} key={lot.auctionId}><div className={styles.lotHeader}><div className={styles.purchase}><GearPlannerItem item={lot} locale={locale} /></div><div className={styles.price}><strong>{money(lot.lotCostCopper)}</strong>{lot.quantity > 1 ? <span>× {lot.quantity}</span> : null}</div></div><ul className={styles.replacements}>{replacements.map(item => <li key={item.slotType}><span className={styles.replacementLabel}>{slotName(item.slotType)}</span>{item.currentItem ? <GearPlannerItem item={item.currentItem} locale={locale} /> : null}</li>)}</ul><button type="button" className={tools.quiet} disabled={selectionLocked} aria-label={`${t("Исключить лот из сборки", "Exclude lot from loadout")}: ${lot.name}`} onClick={() => setLotAllowed(lot.auctionId, false)}>{t("Исключить лот", "Exclude lot")}</button></li>;
            })}</ul></> : enhancedGain || enhancementsPending ? null : <p className={tools.status}>{assembly.purchases.length ? t("Прирост в пределах погрешности — покупать не стоит.", "The gain is within the margin of error — not worth buying.") : t("Текущая экипировка уже лучше.", "Your current gear is already better.")}</p>}
            {significantGain && displayed.removedSlots.includes("OFF_HAND") ? <p className={tools.status}>{t("Левая рука снимается ради двуручного оружия.", "The off-hand is removed for the two-handed weapon.")}</p> : null}
          </div> : null}
        </section>
    </div> : null}
  </section>;
}
