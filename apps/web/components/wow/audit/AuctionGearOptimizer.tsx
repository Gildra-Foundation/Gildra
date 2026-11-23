"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuctionGearJob } from "@/lib/wow/auctionGearJobs";
import type { AuctionGearAssemblyResult, AuctionGearSearchResult, AuctionPlanProgress } from "@/lib/wow/auctionGearTypes";
import { auctionGearSlots, parseAuctionGearSlots, type AuctionGearSlot } from "@/lib/wow/auctionGearSelection";
import { encodeAuctionGearSelectionTransport } from "@/lib/wow/auctionGearSelectionTransport";
import { parseAuctionGearEncounter, parseAuctionGearCompareScenarios, type AuctionGearEncounter } from "@/lib/wow/auctionGearScenarios";
import { normalizeAuctionBudgetGold } from "@/lib/wow/auctionGearBudget";
import { auctionGearMarketExpiry, auctionGearPricesAreFresh } from "@/lib/wow/auctionGearFreshness";
import { auctionGearVariantSelectionKey } from "@/lib/wow/auctionGearExclusions";
import { auctionGearCoverageReasons } from "@/lib/wow/auctionGearCoverage";
import { getAuctionGearRecommendationGroups, getAuctionGearRecommendations, type AuctionGearRecommendationGroup } from "@/lib/wow/auctionGearRecommendations";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { AuctionClientError, auctionClientCacheKey, auctionClientDelay, auctionClientJobUrl, auctionClientRequestUrl, clearAcknowledgedAuctionClientCache, fetchAuctionClientResult, fetchAuctionClientUpdate,
  forgetAuctionClientJob, forgetAuctionClientRequest, hasPendingAuctionClientJob, readAuctionClientCache, parseAuctionClientFormIntent, releasePriorAuctionClientJob, rememberAuctionClientJob, rememberAuctionClientRequest,
  removeAuctionClientJob, removeAuctionClientRequest, retireAuctionClient, waitForAuctionClientRetirement, writeAuctionClientCache,
  parseAuctionClientActiveRecovery, parseAuctionClientRecentRecovery, type AuctionClientActiveRecovery, type AuctionClientCache, type AuctionClientBuildMode } from "@/lib/wow/auctionGearClient";
import { auctionGearServiceMessage } from "@/lib/wow/auctionGearCopy";
import { GearPlannerItem, gearPlannerItemStatDescription } from "./GearPlannerItem";
import { AuctionGearSuggestions } from "./AuctionGearSuggestions";
import { AuctionGearResult } from "./AuctionGearResult";
import { advanceAuctionGearRunPolicy, createAuctionGearRunPolicy, auctionGearSearchRunPhase, type AuctionGearRunPolicy } from "@/lib/wow/auctionGearRunPolicy";
import { auctionGearResultMatchesIntent as intentMatchesSearch } from "@/lib/wow/auctionGearResult";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { AuctionProgress } from "./AuctionProgress";
import { AlertTriangle, Search } from "lucide-react";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import styles from "./auctionGearOptimizer.module.css";
import tools from "./characterTools.module.css";
import { auctionFormats, formatGold } from "./auctionFormat";
import { upgradeSlotName } from "./characterUpgradesCopy";

export type ProfileControls = (form: {budget: string; locked: boolean; setBudget: (value:string)=>void}) => React.ReactNode;
type Props = {profileControls?: ProfileControls; characterSlug: string; snapshotKey: string; specializationSlug: string; localePrefix?: "" | "/ru";
  /** Confirmed single-item upgrades (best value per slot) for the slot overview; null when there is no search. */
  onRecommendations?: (groups: AuctionGearRecommendationGroup[] | null, marketAt?:string) => void };
type Metadata = { enhancementMode?: "equipment" | "enhanced"; fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[] } & Pick<NonNullable<AuctionGearJob["result"]>, "market" | "profileFingerprint" | "scenario" | "coverage" | "objective">;
type SearchResult = AuctionGearSearchResult & Metadata;
type AssemblyResult = AuctionGearAssemblyResult & Metadata;
type PlannerJob = Omit<AuctionGearJob, "result"> & { result: SearchResult | AssemblyResult | null };
type Mode = "search" | "assembly";
type Transport = { mode: Mode; status: PlannerJob["status"] | "starting"; progress: AuctionPlanProgress | null; error: string | null };
type SearchRequest = { enhancementMode?: "equipment" | "enhanced"; fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[]; action: "search"; clientRequestId?: string; characterSlug: string; budgetGold: string; selectedSlots: AuctionGearSlot[]; scenario: string; objective: "value" | "dps"; locale: "ru" | "en" };
type RequestBody = (SearchRequest | { action: "resume"; searchId: string; clientRequestId?: string } | { action: "assemble"; searchId: string; excludedOptionIds: string[]; excludedVariantKeys: string[]; clientRequestId?: string } | { action: "poll"; id: string; observedActive?: boolean }) & { runMode?: "full" };
type ActiveRequest = { mode: Mode; controller: AbortController; background?: boolean; cancelled?: boolean; id?: string; observedActive?: boolean; done: Promise<void>; finish: () => void };
const jobIsActive = (job: Pick<PlannerJob, "status">) => job.status === "queued" || job.status === "running";
const sameSelection = (a: readonly string[] = [], b: readonly string[] = []) => { const left = new Set(a), right = new Set(b); return left.size === right.size && [...left].every(key => right.has(key)); };
type Recovery = { kind: "recovery"; search: SearchResult; assembly: AssemblyResult | null;
  excludedOptionIds: string[]; excludedVariantKeys?: string[]; activeJob: PlannerJob | null; needsRefresh: true };

export function AuctionGearOptimizer(props: Props) {
  return <AuctionGearOptimizerContent key={`${props.characterSlug}:${props.snapshotKey}:${props.specializationSlug}:${props.localePrefix ?? "/ru"}`} {...props} />;
}
function AuctionGearOptimizerContent({ characterSlug, snapshotKey, specializationSlug, localePrefix = "/ru", profileControls, onRecommendations }: Props) {
  const locale = localePrefix === "/ru" ? "ru" : "en";
  const ru = locale === "ru";
  const t = (r: string, e: string) => ru ? r : e;
  const [initializing, setInitializing] = useState(true);
  const [discovered, setDiscovered] = useState<AuctionClientActiveRecovery | null>(null);
  const [ownerLookupFailed, setOwnerLookupFailed] = useState(false);
  const [restoredSnapshot, setRestoredSnapshot] = useState(false);
  const recoverySpecCheck = useRef<string | null>(null);
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
  const [buildMode, setBuildMode] = useState<AuctionClientBuildMode>("quick");
  const [objective, setObjective] = useState<"value" | "dps">("value");
  const [excludedVariantKeys, setExcludedVariantKeys] = useState<Set<string>>(new Set());
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [excludedLimit, setExcludedLimit] = useState(20);
  const [fightLengthSeconds, setFightLengthSeconds] = useState(120);
  const [targets, setTargets] = useState(1);
  const [compareScenarios, setCompareScenarios] = useState<AuctionGearEncounter[]>([]);
  const [scenario, setScenario] = useState("single-target");
  function restoreEncounter(value: { enhancementMode?: "equipment" | "enhanced"; scenario: string; fightLengthSeconds?: number; targets?: number; compareScenarios?: AuctionGearEncounter[] }) {
    const encounter = parseAuctionGearEncounter(value);
    setScenario(encounter.scenario); setFightLengthSeconds(encounter.fightLengthSeconds); setTargets(encounter.targets);
    setCompareScenarios(parseAuctionGearCompareScenarios(value.compareScenarios));
    setBuildMode(value.enhancementMode !== "equipment" ? "enhanced" : cache.current?.buildMode === "quick" || cache.current?.buildMode === "full"
      ? cache.current.buildMode : cache.current?.orchestration?.kind === "full" ? "full" : "quick");
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
  const objectivePreferenceKey = `${cacheKey}:${snapshotKey}:objective`;
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
  const { numeric } = auctionFormats[ru ? "ru" : "en"];
  const number = (value: number) => numeric.format(value);
  const money = (value: number) => formatGold(value, ru ? "ru" : "en");
  const slotName = (slot: string) => upgradeSlotName(slot, ru);
  const recommendationGroups = useMemo(() => getAuctionGearRecommendationGroups(search?.items ?? [], { excludedOptionIds: excluded, excludedVariantKeys }), [search, excluded, excludedVariantKeys]);
  // Stale prices stay visible here with their warning; the slot overview only shows current ones.
  useEffect(() => { onRecommendations?.(search && !marketStale ? recommendationGroups : null,search?.market?.updatedAt); }, [onRecommendations, recommendationGroups, search, marketStale]);
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
  const canBuildLoadout = available.length > 0 || search?.searchComplete && search.enhancementMode === "enhanced";
  const selectionLocked = !validBudget || Boolean(cancellation || running && transport?.mode !== "search");
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
    market_stale: t("Цены аукциона устарели. Повторите расчёт после обновления цен.", "Auction prices are out of date. Retry after the prices update."),
    market_timestamp_unverified: t("Не удалось подтвердить время обновления аукциона.", "The auction update time could not be verified."),
    equipment_constraints_unverified: t("Не хватает данных о надетых вещах.", "Data about your equipped items is incomplete."),
    damage_specialization_required: t("Сравнение DPS доступно для специализаций, наносящих урон.", "DPS comparisons are available for damage specializations."),
    plan_already_running: t("Предыдущий расчёт ещё выполняется.", "Your previous calculation is still running."),
    plan_rate_limited: t("Слишком много запусков. Подождите минуту и продолжите расчёт.", "Too many searches. Wait a minute and continue."),
    plan_waiting_for_quota: t("Ждём очереди…", "Waiting in queue…"),
    plan_timeout: t("Расчёт остановился по лимиту времени. Полный перебор не завершён.", "The calculation reached its time limit before the search finished."),
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
          if (pendingRequestId && cache.current?.runMode !== "full") retireAuctionClient(removeAuctionClientRequest(pendingRequestId, { characterSlug, locale }));
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
      if (!saved?.formIntent) {
        try {
          const preference = localStorage.getItem(objectivePreferenceKey);
          if (preference === "value" || preference === "dps") setObjective(preference);
        } catch { /* A blocked browser store does not prevent searching. */ }
      }
      if (!saved) {
        if (stored) { setInitializing(false); return; }
        recoveryController.current = controller;
        try {
          const query = new URLSearchParams({ latest: "1", characterSlug, locale });
          const found = parseAuctionClientRecentRecovery(await fetchAuctionClientResult<unknown>(`/api/wow/auction-gear-plans?${query}`, controller.signal, () => {}), { characterSlug, locale });
          if (!mounted || controller.signal.aborted || !found) return;
          const { job, formIntent } = found;
          if (found.specializationSlug && found.specializationSlug !== specializationSlug) return;
          recoverySpecCheck.current = found.specializationSlug ? null : job.id;
          setRestoredSnapshot(true);
          const mode = job.mode ?? "search";
          remember({ jobId: job.id, runMode: "full", mode, formIntent,
            buildMode: formIntent.enhancementMode === "equipment" ? "full" : "enhanced",
            excludedOptionIds: found.excludedOptionIds, excludedVariantKeys: found.excludedVariantKeys,
            orchestration: createAuctionGearRunPolicy("full", mode) });
          setBudget(formIntent.budgetGold); restoreEncounter(formIntent); setObjective(formIntent.objective); setSelectedSlots(formIntent.selectedSlots);
          setExcluded(new Set(found.excludedOptionIds)); setExcludedVariantKeys(new Set(found.excludedVariantKeys));
          rememberAuctionClientJob({ characterSlug, locale }, job.id);
          await runRef.current?.({ action: "poll", id: job.id, observedActive: jobIsActive(job) }, mode);
        } catch (error) {
          if (mounted && !controller.signal.aborted) {
            setTransport({ mode: "search", status: "failed", progress: null, error: error instanceof Error ? error.message : "plan_connection_interrupted" });
          }
        } finally {
          if (recoveryController.current === controller) recoveryController.current = null;
          if (mounted) setInitializing(false);
        }
        return;
      }
      setInitializing(false);
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
          let checkpointMatchesIntent = true;
          if (saved.searchId) {
            const query = new URLSearchParams({ searchId: saved.searchId, characterSlug, locale });
            const previous = await fetchAuctionClientResult<Recovery>(`/api/wow/auction-gear-plans?${query}`, controller.signal, () => {});
            if (!mounted || controller.signal.aborted) return;
            if (previous.kind !== "recovery" || previous.search.searchId !== saved.searchId) throw new Error("invalid_plan_result");
            checkpointMatchesIntent = !saved.formIntent || intentMatchesSearch(saved.formIntent, previous.search);
            if (checkpointMatchesIntent) {
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
            } else {
              // The nonce can belong to a newer search. Its old checkpoint must
              // neither overwrite the new objective nor prevent polling that job.
              setSearch(null); setAssembly(null); setAssemblyStale(false); setMarketStale(false);
            }
          }
          const recoveredMode = job.mode ?? saved.mode;
          cache.current = { ...saved, searchId: checkpointMatchesIntent ? saved.searchId : undefined, jobId: job.id, mode: recoveredMode };
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
        else {
          if (saved.jobId) forgetAuctionClientJob(saved.jobId);
          if (saved.orchestration && saved.orchestration.phase !== "done" && !selectionChanged) {
            const policy = saved.orchestration;
            const canAssemble = result.search.enhancementMode === "enhanced" || result.search.items.some(item =>
              !restoredExclusions.has(item.optionId) && !(saved.excludedVariantKeys ?? []).includes(auctionGearVariantSelectionKey(item)));
            const phase = policy.phase === "search" ? auctionGearSearchRunPhase(policy, result.search.searchComplete, canAssemble) : "assembly";
            remember({ orchestration: { ...policy, phase }, ...(phase === "done" ? {} : { mode: phase }) });
            if (phase !== "done") await runRef.current?.(phase === "search" ? { action: "resume", searchId: result.search.searchId }
              : { action: "assemble", searchId: result.search.searchId, excludedOptionIds: [...restoredExclusions], excludedVariantKeys: [...(saved.excludedVariantKeys ?? [])] }, phase);
          }
        }
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
            if (saved.formIntent && !intentMatchesSearch(saved.formIntent, previous.search)) {
              setSearch(null); setAssembly(null); setAssemblyStale(false); setMarketStale(false);
              setHasRecovery(false); setTransport(null);
              return;
            }
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
        const deletion = current.background && !current.cancelled ? Promise.resolve()
          : current.id ? removeAuctionClientJob(current.id) : cache.current?.clientRequestId ? removeAuctionClientRequest(cache.current.clientRequestId, { characterSlug, locale }) : Promise.resolve();
        retireAuctionClient(current.done, deletion);
      }
    };
  }, [cacheKey, characterSlug, locale, objectivePreferenceKey, recoveryAttempt, setBudget, snapshotKey, specializationSlug]);

  function remember(update: Partial<AuctionClientCache>) {
    cache.current = { version: 1, profileKey: snapshotKey, mode: "search", excludedOptionIds: [], ...cache.current, ...update };
    writeAuctionClientCache(cacheKey, cache.current.searchId || cache.current.jobId || cache.current.clientRequestId ? cache.current : null);
  }
  function invalidate(draft: Partial<{ enhancementMode: "equipment" | "enhanced"; buildMode: AuctionClientBuildMode; budget: string; scenario: string; fightLengthSeconds: number; targets: number; compareScenarios: AuctionGearEncounter[]; objective: "value" | "dps"; selectedSlots: AuctionGearSlot[] }> = {}): Promise<boolean> | null {
    const needsRetirement = Boolean(retryJob || hasRecovery || cache.current?.jobId || cache.current?.clientRequestId || cache.current?.cancellationRequested);
    let retirement: Promise<boolean> | null = null;
    if (needsRetirement) {
      try {
        const intent = parseAuctionClientFormIntent({ characterSlug, locale, enhancementMode: draft.enhancementMode ?? (buildMode === "enhanced" ? "enhanced" : "equipment"),
          budgetGold: normalizeAuctionBudgetGold(draft.budget ?? budget, locale), scenario: draft.scenario ?? scenario,
          fightLengthSeconds: draft.fightLengthSeconds ?? fightLengthSeconds, targets: draft.targets ?? targets, compareScenarios: draft.compareScenarios ?? compareScenarios,
          objective: draft.objective ?? objective, selectedSlots: draft.selectedSlots ?? selectedSlots });
        if (intent) remember({ formIntent: intent, buildMode: draft.buildMode ?? buildMode });
      } catch { /* Invalid drafts are not restored from storage. Keep the owned handles until acknowledgement. */ }
      retirement = cancel();
    }
    setSearch(null); setAssembly(null); setAssemblyStale(false); setMarketStale(false); setExcluded(new Set()); setExcludedVariantKeys(new Set()); setExcludedOpen(false); setExcludedLimit(20);
    setRestoredSnapshot(false); recoverySpecCheck.current = null;
    if (!needsRetirement) {
      setTransport(null); setRetryJob(null); setHasRecovery(false);
      cache.current = null; writeAuctionClientCache(cacheKey, null);
    }
    return retirement;
  }
  async function run(initial: RequestBody, mode: Mode) {
    if (!scopeAlive.current || active.current || cache.current?.cancellationRequested) return;
    const inheritedPolicy = Boolean(cache.current?.orchestration);
    if (!inheritedPolicy) remember({ orchestration: createAuctionGearRunPolicy(cache.current?.formIntent?.enhancementMode === "enhanced" ? "full" : "quick", mode) });
    const generation = mountGeneration.current;
    const ownsScope = () => scopeAlive.current && mountGeneration.current === generation;
    let finish!: () => void;
    const background = initial.action === "poll" ? cache.current?.runMode === "full" : cache.current?.orchestration?.kind === "full";
    const request: ActiveRequest = { mode, background, controller: new AbortController(), observedActive: initial.action === "poll" && initial.observedActive === true,
      done: new Promise(resolve => { finish = resolve; }), finish: () => finish() };
    const isCurrent = () => ownsScope() && active.current === request && !request.controller.signal.aborted;
    const cleanup = waitForAuctionClientRetirement();
    active.current = request;
    setTransport({ mode, status: "starting", progress: null, error: null });
    // Keep useful measured facts while making previous market prices explicitly stale.
    setAssemblyStale(true);
    setMarketStale(true); setRetryJob(null); setHasRecovery(false);
    let body: RequestBody = background && initial.action !== "poll" ? { ...initial, runMode: "full" } : initial;
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
        remember({ mode, runMode: body.runMode, clientRequestId: body.clientRequestId, formIntent });
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
          remember({ mode, runMode: body.runMode, clientRequestId: body.clientRequestId });
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
          // Navigation detaches observation of full work. Only explicit
          // cancellation may delete a late accepted server job.
          if (request.background && !request.cancelled) return;
          const removed = await removeAuctionClientJob(payload.id);
          if (removed?.ok || removed?.status === 404) {
            if (transportOwner.clientRequestId) forgetAuctionClientRequest(transportOwner.clientRequestId);
            clearAcknowledgedAuctionClientCache(cacheKey, transportOwner);
          }
          return;
        }
        request.background = payload.runMode === "full";
        remember({ jobId: payload.id, mode, runMode: payload.runMode });
        rememberAuctionClientJob({ characterSlug, locale }, payload.id);
        // Reattaching an already completed job is recovery, not a new market
        // check. An observed active job may publish newly verified facts later.
        request.observedActive = body.action !== "poll" || body.observedActive === true || jobIsActive(payload);
        const recoveredCompleted = body.action === "poll" && payload.status === "completed" && !request.observedActive;
        let publishedSearchId = body.action === "resume" || body.action === "assemble" ? body.searchId : body.action === "poll" ? cache.current?.searchId : undefined;
        const acceptedEncounterIntent = cache.current?.formIntent;
        const verifyRecoverySpecialization = async () => {
          if (recoverySpecCheck.current !== payload.id || !payload.result) return;
          const query = new URLSearchParams({ latest: "1", characterSlug, locale });
          const found = parseAuctionClientRecentRecovery(await fetchAuctionClientResult<unknown>(`/api/wow/auction-gear-plans?${query}`, request.controller.signal, onReconnect), { characterSlug, locale });
          if (!found || found.job.id !== payload.id || found.specializationSlug !== specializationSlug) throw new Error("recovery_profile_mismatch");
          recoverySpecCheck.current = null;
        };
        const applyResult = (result: SearchResult | AssemblyResult, pricesStale: boolean) => {
          if (payload.runMode === "full") { mode = result.kind; request.mode = mode; }
          if (!isCurrent() || payload.id !== request.id || (result.kind !== mode && !(mode === "assembly" && result.kind === "search")) ||
              (publishedSearchId && result.searchId !== publishedSearchId) ||
              (acceptedEncounterIntent && !intentMatchesSearch(acceptedEncounterIntent, result))) {
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
                profileFingerprint: result.profileFingerprint, enhancementMode: result.enhancementMode, scenario: result.scenario, fightLengthSeconds: result.fightLengthSeconds, targets: result.targets, compareScenarios: result.compareScenarios, objective: result.objective, coverage: result.coverage });
              setMarketStale(pricesStale);
            }
          }
        };
        let pollAttempt = 0;
        while (payload.status === "queued" || payload.status === "running") {
          await verifyRecoverySpecialization();
          if (payload.result) applyResult(payload.result, !auctionGearPricesAreFresh(payload.result.market));
          setTransport({ mode, status: payload.status, progress: payload.progress, error: null });
          payload = await fetchAuctionClientUpdate(payload, { characterSlug, locale }, request.controller.signal, onReconnect, pollAttempt++);
          if (!isCurrent()) return;
        }
        if (!isCurrent()) return;
        if (payload.status === "failed") {
          if (payload.runMode === "full" && (payload.error === "plan_timeout" || payload.error === "market_stale") && payload.result) {
            await verifyRecoverySpecialization();
            applyResult(payload.result, true);
            remember({ searchId: payload.result.searchId, mode });
          }
          throw new Error(payload.error ?? "auction_plan_unavailable");
        }
        if (payload.status === "cancelled") {
          setAssemblyStale(true); setMarketStale(true);
          remember({ jobId: undefined, clientRequestId: undefined }); forgetAuctionClientJob(payload.id); request.id = undefined;
          setTransport({ mode, status: "cancelled", progress: null, error: null }); return;
        }
        const result = payload.result;
        await verifyRecoverySpecialization();
        if (payload.runMode === "full" && result) { mode = result.kind; request.mode = mode; }
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
            enhancementMode: result.enhancementMode, scenario: result.scenario, fightLengthSeconds: result.fightLengthSeconds, targets: result.targets, compareScenarios: result.compareScenarios, objective: result.objective ?? "dps", selectedSlots: parseAuctionGearSlots(result.selectedSlots) }) ?? undefined : cache.current?.formIntent });
        forgetAuctionClientJob(payload.id);
        request.id = undefined;
        const policy = cache.current?.orchestration ?? createAuctionGearRunPolicy("quick", mode);
        if (payload.runMode === "full") {
          remember({ orchestration: { ...policy, kind: "full", phase: "done" } });
          setTransport({ mode, status: "completed", progress: null, error: null });
          return;
        }
        const measuredOptions = result.kind === "search" && (result.enhancementMode === "enhanced" || result.items.some(item =>
          !assemblySelection.excludedOptionIds.includes(item.optionId) && !assemblySelection.excludedVariantKeys.includes(auctionGearVariantSelectionKey(item))));
        // A legacy completed-job read restores facts only. Explicit ongoing
        // intent may advance; re-reading a job must not reset its turn budget.
        const transition = advanceAuctionGearRunPolicy(recoveredCompleted && !inheritedPolicy ? { ...policy, phase: "done" } : policy,
          result, { jobId: payload.id, canAssemble: measuredOptions });
        remember({ orchestration: transition.policy, mode: transition.next ?? mode });
        if (!transition.next) { setTransport({ mode, status: "completed", progress: null, error: null }); return; }
        mode = transition.next;
        request.mode = mode;
        body = mode === "search" ? { action: "resume", searchId: result.searchId, ...(policy.kind === "full" ? { runMode: "full" as const } : {}) }
          : { action: "assemble", searchId: result.searchId, ...assemblySelection, ...(policy.kind === "full" ? { runMode: "full" as const } : {}) };
        setTransport({ mode, status: "starting", progress: null, error: null });
      }
    } catch (reason) {
      if (isCurrent()) {
        // A later step may have observed changed lots before it failed.
        setAssemblyStale(true); setMarketStale(true);
        if (reason instanceof Error && reason.message === "recovery_profile_mismatch") {
          // Another specialization's owned work must remain untouched.
          setSearch(null); setAssembly(null); setRestoredSnapshot(false);
          cache.current = null; writeAuctionClientCache(cacheKey, null);
          if (request.id) forgetAuctionClientJob(request.id);
          setTransport({ mode, status: "failed", progress: null, error: "character_snapshot_changed" });
          return;
        }
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
      remember({ jobId: job.id, clientRequestId: undefined, mode: job.mode, formIntent: intent,
        runMode: job.runMode, buildMode: intent.enhancementMode !== "equipment" ? "enhanced" : job.runMode === "full" ? "full" : "quick",
        ...(job.runMode === "full" || intent.enhancementMode === "enhanced" ? { orchestration: createAuctionGearRunPolicy("full", job.mode) } : {}), ...restoredContext });
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
  function revealSettingsField(field: HTMLElement | null) {
    for (let details = field?.closest("details"); details; details = details.parentElement?.closest("details") ?? null) details.open = true;
  }
  async function startSearch(kind: AuctionGearRunPolicy["kind"] = buildMode === "quick" ? "quick" : "full") {
    if (!validBudget || initializing || active.current || discovered?.activeJob || ownerLookupFailed || cache.current?.cancellationRequested) return;
    try {
      const budgetGold = normalizeAuctionBudgetGold(budget, locale);
      const slots = parseAuctionGearSlots(selectedSlots);
      const generation = mountGeneration.current;
      const retirement = invalidate();
      if (retirement && !await retirement) return;
      if (!scopeAlive.current || mountGeneration.current !== generation) return;
      const selectedMode = buildMode === "enhanced" ? "enhanced" : kind;
      setBuildMode(selectedMode);
      remember({ buildMode: selectedMode, orchestration: createAuctionGearRunPolicy(kind) });
      void run({ action: "search", enhancementMode: selectedMode === "enhanced" ? "enhanced" : "equipment", characterSlug, budgetGold, selectedSlots: slots, scenario, fightLengthSeconds, targets, compareScenarios, objective, locale }, "search");
    } catch (reason) {
      if (reason instanceof Error && reason.message === "invalid_equipment_slots") {
        const field = panel.current?.querySelector<HTMLInputElement>('input[name="selectedSlots"]') ?? null;
        revealSettingsField(field); field?.focus();
      }
      setTransport({ mode: "search", status: "failed", progress: null, error: reason instanceof Error ? reason.message : "invalid_plan_request" });
    }
  }
  async function startAssembly() {
    if (!validBudget || !search || !canBuildLoadout || cache.current?.cancellationRequested) return;
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
    remember({ buildMode, orchestration: createAuctionGearRunPolicy(buildMode === "quick" ? "quick" : "full", "assembly") });
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
    if (current) current.cancelled = true;
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
    remember({ jobId: ownedId, mode, cancellationRequested: true, orchestration: { ...(cache.current?.orchestration ?? createAuctionGearRunPolicy("quick", mode)), phase: "done" } });
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
  function changeBuildMode(value: string) {
    if (value !== "quick" && value !== "full" && value !== "enhanced" || value === buildMode || formLocked) return;
    const changedGoal = (value === "enhanced") !== (buildMode === "enhanced");
    setBuildMode(value);
    if (changedGoal) invalidate({ buildMode: value, enhancementMode: value === "enhanced" ? "enhanced" : "equipment" });
    else if (cache.current) remember({ buildMode: value });
  }
  function continueSearch() {
    if (!validBudget || active.current || cache.current?.cancellationRequested) return;
    const selectedMode = buildMode === "enhanced" ? "enhanced" : "full";
    setBuildMode(selectedMode);
    if (hasRecovery) {
      // Recovery can fail before its owned search DTO reaches this browser.
      // Full continues that identity instead of invalidating/cancelling it.
      remember({ buildMode: selectedMode, orchestration: { ...(cache.current?.orchestration ?? createAuctionGearRunPolicy("full")), kind: "full", phase: "search" } });
      setRecoveryAttempt(value => value + 1);
      return;
    }
    if (!search) { void startSearch("full"); return; }
    // Full search reuses all owned candidates, exclusions and assembly caches.
    // Resume discovery/comparisons first, even after a quick loadout was shown.
    remember({ buildMode: selectedMode, orchestration: { ...(cache.current?.orchestration ?? createAuctionGearRunPolicy("full")), kind: "full", phase: "search" } });
    void run({ action: "resume", searchId: search.searchId }, "search");
  }
  const progress = transport?.progress;
  const waiting = ["plan_reconnecting", "plan_cancelling", "plan_waiting_for_quota"].includes(transport?.error ?? "");
  const stageLabel = waiting ? failureText(transport?.error ?? null)
    : transport?.status === "queued" ? t("Расчёт в очереди", "Calculation queued")
    : progress?.phase === "market" ? t("Загружаем цены аукциона", "Loading auction prices")
    : progress?.phase === "catalog" ? t("Проверяем подходящие предметы", "Checking eligible items")
    : progress?.phase === "variants" ? t("Проверяем варианты предметов", "Checking item variants")
    : progress?.phase === "enhancements" ? t("Подбираем камни и чары", "Selecting gems and enchants")
    : progress?.phase === "scenarios" ? t("Сравниваем комплекты в дополнительных боях", "Comparing loadouts in additional encounters")
    : transport?.mode === "assembly" ? t("Сравниваем комплекты", "Comparing loadouts")
    : progress ? t("Сравниваем замены по DPS", "Comparing replacement DPS") : t("Готовим поиск", "Preparing search");
  const counted = !waiting && progress && progress.total > 0 && ["catalog", "variants", "scenarios"].includes(progress.phase) ? progress : null;
  const feedback = (mode: Mode) => transport?.mode !== mode ? null : <>
    {transport.status === "failed" ? <p role="alert" className={tools.alert}><AlertTriangle aria-hidden="true" />{failureText(transport.error)}</p> : null}
    {transport.status === "cancelled" ? <p role="status" className={tools.status}>{search ? t("Расчёт остановлен.", "Calculation stopped.") : t("Поиск отменён.", "Search cancelled.")}</p> : null}
    {transport.status === "failed" && cancellation === "failed" ? <button type="button" className={tools.quiet} onClick={() => void cancel()}>{t("Повторить отмену", "Retry cancellation")}</button> : null}
    {transport.status === "failed" && !cancellation && retryJob ? <button type="button" className={tools.quiet} disabled={!validBudget} onClick={() => void run({ action: "poll", id: retryJob.id, observedActive: retryJob.observedActive }, retryJob.mode)}>{t("Повторить подключение", "Reconnect to calculation")}</button> : null}
    {transport.status === "failed" && !cancellation && !retryJob && hasRecovery ? <button type="button" className={tools.quiet} disabled={!validBudget} onClick={() => setRecoveryAttempt(value => value + 1)}>{t("Повторить восстановление", "Retry recovery")}</button> : null}
    {transport.status === "failed" && !search && !cancellation && !retryJob && hasRecovery ? <button type="button" className={tools.quiet} disabled={formLocked || !validBudget} onClick={continueSearch}>{t("Искать дальше", "Search further")}</button> : null}
  </>;
  const incompleteData = Boolean(search && auctionGearCoverageReasons(search.coverage, search.dataComplete, locale).length);
  const discoveryIncomplete = Boolean(search && (search.discoveryComplete === false || search.discoveryComplete === undefined && search.searchLimited));
  const sameScope = discovered?.activeJob ? discovered.activeJob.scope.characterSlug === characterSlug && discovered.activeJob.scope.locale === locale : false;


  return <section ref={panel} className={`${tools.tool} ${styles.panel}`} aria-labelledby="auction-gear-title" data-auction-gear data-auction-run-kind={cache.current?.orchestration?.kind ?? "quick"}>
    <h3 className={tools.title} id="auction-gear-title">{t("Улучшения с аукциона", "Auction House upgrades")}</h3>
    {profileControls?.({budget:validBudget ? normalizeAuctionBudgetGold(budget,locale) : "",locked:formLocked,setBudget:value=>{
      if(formLocked)return;
      setBudget(value);
      void invalidate({budget:value});
    }})}
    {discovered?.activeJob ? <div className={styles.recovery} data-auction-owned-recovery>
      <p role="status" className={tools.status}>{t("У вас есть незавершённый расчёт", "You have an unfinished calculation")}{discovered.formIntent ? ` · ${money(Number(discovered.formIntent.budgetGold) * 10000)}` : ""}</p>
      <div className={tools.actions}>{discovered.formIntent && sameScope ? <MaterialButton kit={CHARACTERS_KIT} variant="primary" type="button" disabled={running || Boolean(cancellation)} onClick={() => void openOwnedCalculation()}>{t("Открыть расчёт", "Open calculation")}</MaterialButton> : null}
      {!cancellation ? <button type="button" className={tools.quiet} disabled={running} onClick={() => void cancelOwnedCalculation()}>{t("Отменить и изменить параметры", "Cancel and change parameters")}</button> : null}</div>
    </div> : null}
    {ownerLookupFailed && !discovered?.activeJob ? <button type="button" className={tools.quiet} disabled={running || Boolean(cancellation)} onClick={() => void findOwnedCalculation()}>{t("Найти активный расчёт", "Find active calculation")}</button> : null}
    {!supported ? <p className={tools.status}>{messages.damage_specialization_required}</p> : <form className={styles.form} onSubmit={event => { event.preventDefault(); void startSearch(); }} onInvalidCapture={event => {
      revealSettingsField(event.target as HTMLElement);
    }}>
      <fieldset className={styles.slotFieldset} disabled={formLocked} data-auction-build-modes>
        <legend id="auction-build-mode-label">{t("Режим подбора", "Selection mode")}</legend>
        <AtlasSegmented className={styles.buildModeControl} aria-labelledby="auction-build-mode-label" aria-describedby="auction-build-mode-help" value={buildMode} disabled={formLocked} options={[
          { value: "quick", label: <span data-auction-build-mode="quick">{t("Быстрый подбор вещей", "Quick gear selection")}</span> },
          { value: "full", label: <span data-auction-build-mode="full">{t("Полный подбор вещей", "Full gear selection")}</span> },
          { value: "enhanced", label: <span data-auction-build-mode="enhanced">{t("Полный подбор с камнями и чарами", "Full gear, gems and enchants")}</span> },
        ]} onValueChange={changeBuildMode} />
        <p id="auction-build-mode-help" className={styles.note}>{buildMode === "quick"
          ? t("Проверим часть вариантов и предложим комплект вещей.", "Check a limited set of options and suggest a gear loadout.")
          : buildMode === "full" ? t("Проверим все доступные варианты вещей в пределах бюджета.", "Check all available gear options within your budget.")
          : t("Сравним покупки и улучшения надетых вещей в выбранных слотах. Камни и чары входят в общий бюджет.", "Compare gear purchases and upgrades to equipped items in the selected slots. Gems and enchants count toward your budget.")}
          {buildMode !== "quick" ? <> {t("Если выбрать много слотов, полный перебор может не уложиться в 6 часов. Для меньшего поиска выберите слоты в дополнительных настройках. Вкладку можно закрыть. Результат доступен у персонажа 30 минут после завершения.", "With many slots, a full search can exceed the six-hour limit. Select fewer slots in advanced settings to narrow the search. You can close this tab. Return to your character within 30 minutes of completion to see the result.")}</> : null}</p>
        {restoredSnapshot ? <p className={styles.note} data-auction-restored-snapshot>{t("Восстановлен расчёт по сохранённой экипировке. После её изменения запустите новый подбор.", "Restored a calculation for the saved equipment. Start a new selection if your gear has changed.")}</p> : null}
      </fieldset>
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
          <option value="single-target">{t("Одна цель", "Single target")}</option><option value="aoe">{t("Несколько целей", "Multiple targets")}</option><option value="execute">{t("Короткий бой", "Short fight")}</option>
        </select></label>
        <div className={tools.actions}>
          {running && !cancellation ? <button className={tools.quiet} type="button" onClick={() => void editParameters()}>{t("Изменить параметры", "Change parameters")}</button> : null}
          {!cancellation && running && (transport?.mode === "search" || !search) ? <button className={tools.quiet} type="button" onClick={cancel}>{transport?.mode === "assembly" ? t("Отменить сборку", "Cancel assembly") : t("Отменить поиск", "Cancel search")}</button> : null}
          <MaterialButton kit={CHARACTERS_KIT} fit="stack" variant="primary" type="submit" disabled={formLocked || !validBudget} icon={<Search aria-hidden="true" />}>{running ? t("Подбираем улучшения…", "Finding upgrades…") : buildMode === "quick" ? t("Быстро подобрать вещи", "Find gear quickly") : buildMode === "full" ? t("Подобрать вещи полностью", "Run full gear selection") : t("Подобрать вещи, камни и чары", "Find gear, gems and enchants")}</MaterialButton>
        </div>
      </div>
      {running && <AuctionProgress label={stageLabel} counted={counted} locale={locale}
        stageKey={`${transport?.mode}-${progress?.phase}-${cache.current?.orchestration?.searchTurns}-${cache.current?.orchestration?.assemblyTurns}`} />}
      {running && search && assembly && !assemblyStale && !assembly.exhaustiveComplete && transport?.mode === "assembly" ?
        <p className={styles.note}>{t("Проверено сочетаний", "Combinations checked")}: {assembly.combinationsChecked.toLocaleString(locale)}.{" "}
          {t("Вариантов до проверки бюджета и совместимости", "Combinations before budget and compatibility checks")}: {BigInt(assembly.combinationCount).toLocaleString(locale)}.{" "}
          <a href="#auction-assembly">{t("Посмотреть текущий комплект", "View current loadout")}</a></p> : null}
      <details className={styles.disclosure} data-auction-advanced-settings><summary>{t("Дополнительные настройки", "Advanced settings")}</summary>
      <div className={styles.advancedSettingsContent}>
        <div className={tools.fields}>
        <label className={tools.field}>{t("Длительность, с", "Duration, seconds")}<input type="number" min={30} max={300} step={1} value={fightLengthSeconds} disabled={formLocked} onChange={event => { setFightLengthSeconds(Number(event.target.value)); invalidate({ fightLengthSeconds: Number(event.target.value) }); }} required /></label>
        <label className={tools.field}>{t("Цели", "Targets")}<input type="number" min={1} max={scenario === "aoe" ? 8 : 1} step={1} value={targets} disabled={formLocked || scenario !== "aoe"} onChange={event => { setTargets(Number(event.target.value)); invalidate({ targets: Number(event.target.value) }); }} required /></label>
        </div>
      <fieldset className={styles.slotFieldset} disabled={formLocked} data-auction-objective>
        <legend id="auction-objective-label">{t("Цель подбора", "Selection objective")}</legend>
        <AtlasSegmented aria-labelledby="auction-objective-label" aria-describedby="auction-objective-help" value={objective} disabled={formLocked} options={[
          { value: "value", label: t("Цена / прирост DPS", "Cost / DPS gain") },
          { value: "dps", label: t("Максимум DPS", "Maximum DPS") },
        ]} onValueChange={value => {
          if (value !== "value" && value !== "dps" || value === objective) return;
          setObjective(value);
          try { localStorage.setItem(objectivePreferenceKey, value); } catch { /* The selected objective still applies to this visit. */ }
          invalidate({ objective: value });
        }} />
        <input type="hidden" name="objective" value={objective} />
        <p id="auction-objective-help" className={styles.note}>{objective === "value"
          ? t("Больше прироста на потраченное золото. Полный бюджет тратить необязательно.", "More gain for your gold. The full budget need not be spent.")
          : t("Наибольший подтверждённый DPS в пределах бюджета. Другая цель потребует нового поиска.", "Highest confirmed DPS within budget. Changing the objective requires a new search.")}</p>
      </fieldset>
      <fieldset className={styles.slotFieldset} disabled={formLocked}><legend>{t("Сравнить финалистов в других боях", "Compare finalists in other encounters")}</legend>
        <p className={styles.note}>{t("Дополнительные бои сравниваются после подбора комплекта.", "Additional encounters are compared after the loadout is selected.")}</p>
        <div className={styles.slots}>{(["single-target", "aoe", "execute"] as const).map(value => <label key={value}><input type="checkbox" checked={compareScenarios.some(e => e.scenario === value)} onChange={event => {
          const next = event.target.checked ? [...compareScenarios, parseAuctionGearEncounter({ scenario: value })] : compareScenarios.filter(e => e.scenario !== value);
          setCompareScenarios(next);
          invalidate({ compareScenarios: next });
        }} /><span>{value === "aoe" ? t("5 целей · 60 с", "5 targets · 60 s") : value === "execute" ? t("1 цель · 90 с", "1 target · 90 s") : t("1 цель · 120 с", "1 target · 120 s")}</span></label>)}</div>
      </fieldset>
      <details className={styles.disclosure}><summary>{t("Слоты экипировки", "Equipment slots")}{selectedSlots.length < auctionGearSlots.length ? ` · ${number(selectedSlots.length)} / ${number(auctionGearSlots.length)}` : ""}</summary>
      <fieldset className={styles.slotFieldset} disabled={formLocked}>
        <legend className={tools.srOnly}>{t("Какие слоты искать", "Equipment slots to search")}</legend>
        <div className={tools.actions}><button className={tools.quiet} type="button" onClick={() => { if (sameSelection(selectedSlots, auctionGearSlots)) return; setSelectedSlots([...auctionGearSlots]); invalidate({ selectedSlots: [...auctionGearSlots] }); }}>{t("Выбрать все", "Select all")}</button><button className={tools.quiet} type="button" onClick={() => { if (!selectedSlots.length) return; setSelectedSlots([]); invalidate({ selectedSlots: [] }); }}>{t("Снять выбор", "Clear selection")}</button></div>
        <div className={styles.slots}>{auctionGearSlots.map(slot => <label key={slot}><input type="checkbox" name="selectedSlots" value={slot} checked={selectedSlots.includes(slot)} onChange={event => { const next = event.target.checked ? auctionGearSlots.filter(value => value === slot || selectedSlots.includes(value)) : selectedSlots.filter(value => value !== slot); setSelectedSlots(next); invalidate({ selectedSlots: next }); }} /><span>{slotName(slot)}</span></label>)}</div>
      </fieldset></details>
      </div></details>
      {!validBudget ? <p id="auction-budget-error" role="alert" className={tools.alert}><AlertTriangle aria-hidden="true" />{messages.invalid_budget}</p> : null}
    </form>}
    {feedback("search")}
    {!search ? feedback("assembly") : null}
    {search ? <div className={styles.searchResult} data-auction-search-result data-auction-market={search.market.realm}>
      {marketStale && !assembly ? <p className={tools.status}><AlertTriangle aria-hidden="true" />{t("Цены могли измениться — запустите новый поиск.", "Prices may have changed — run a new search.")}</p> : null}
        <section id="auction-assembly" tabIndex={-1} className={styles.assembly} aria-label={t("Результат подбора", "Selection result")} data-auction-assembly>
          {!assembly || running && transport?.mode === "assembly" && !cancellation || !running && (assemblyStale || marketStale) ? <div className={tools.head}>
            {!assembly ? <h4 className={tools.subtitle} id="auction-assembly-title">{t("Комплект", "Loadout")}</h4> : null}
            <div className={tools.actions}>
              {!cancellation && running && transport?.mode === "assembly" ? <button className={tools.quiet} type="button" onClick={cancel}>{t("Отменить сборку", "Cancel assembly")}</button> : null}
              {!running && (!assembly || assemblyStale || marketStale) ? <button className={tools.quiet} type="button" disabled={selectionLocked || !canBuildLoadout} aria-describedby={!validBudget ? "auction-budget-error" : !canBuildLoadout ? "auction-assembly-disabled-reason" : undefined} onClick={startAssembly}>{assembly ? t("Обновить и пересобрать сет", "Refresh and rebuild loadout") : t("Собрать комплект", "Build loadout")}</button> : null}
            </div>
          </div> : null}
          {!canBuildLoadout ? <p id="auction-assembly-disabled-reason" data-assembly-disabled-reason className={tools.status}>{search.items.length ? t("Все варианты исключены.", "All options are excluded.") : search.searchComplete && !running ? t("Вариантов для сборки не найдено. Измените бюджет или слоты экипировки.", "No options found for a loadout. Change your budget or equipment slots.") : t("Вариантов для сборки пока нет.", "No options to build from yet.")}</p> : null}
          {feedback("assembly")}
          {assembly ? <AuctionGearResult marketAt={profileControls ? assembly.market?.updatedAt : undefined} characterSlug={characterSlug} snapshotKey={snapshotKey} assembly={assembly} locale={locale} stale={assemblyStale} selectionLocked={selectionLocked} onExcludeLot={auctionId => setLotAllowed(auctionId, false)} /> : null}
          <div className={styles.manage}>
          {search.items.length ? <details className={styles.disclosure}><summary>{t("Настроить варианты для сета", "Loadout options")}</summary>
            <div className={tools.actions}>{assembly && !running && !assemblyStale && !marketStale ? <button className={tools.quiet} type="button" disabled={selectionLocked || !canBuildLoadout} onClick={startAssembly}>{assembly.exhaustiveComplete ? t("Обновить и пересобрать сет", "Refresh and rebuild loadout") : t("Продолжить сборку сета", "Continue loadout assembly")}</button> : null}<button className={tools.quiet} type="button" disabled={selectionLocked} onClick={() => setAllAllowed(true)}>{t("Разрешить все варианты", "Allow all options")}</button><button className={tools.quiet} type="button" disabled={selectionLocked} onClick={() => setAllAllowed(false)}>{t("Исключить все варианты", "Exclude all options")}</button></div>
          </details> : null}
          {excludedGroups.length ? <details data-auction-exclusions className={`${styles.disclosure} ${styles.excludedLots}`} onToggle={event => setExcludedOpen(event.currentTarget.open)}><summary>{t("Исключения", "Exclusions")}: {number(excludedGroups.length)}</summary>
            {excludedOpen ? <><ul>{excludedGroups.slice(0, excludedLimit).map(([key, group], index) => {
              const facts = gearPlannerItemStatDescription(group.item, locale);
              const context = [`${t("Вариант", "Variant")} ${index + 1}`, group.item.itemLevel !== undefined ? `${t("Уровень предмета", "Item level")} ${number(group.item.itemLevel)}` : "", ...facts].filter(Boolean).join(" · ");
              return <li key={key}><div className={styles.excludedItem}><GearPlannerItem item={group.item} locale={locale} /><span className={styles.note}>{context}</span></div><button data-excluded-restore type="button" disabled={selectionLocked} className={tools.quiet} aria-label={`${t("Вернуть вариант в подбор", "Restore variant to assembly")}: ${group.item.name}; ${context}`} onClick={() => setAllowed(group.item.optionId, true)}>{t("Вернуть", "Restore")}</button></li>;
            })}</ul>{excludedGroups.length > excludedLimit ? <button type="button" className={tools.quiet} onClick={() => setExcludedLimit(limit => limit + 20)}>{t("Показать ещё 20", "Show 20 more")}</button> : null}</> : null}
          </details> : null}
          </div>
        </section>
      <div className={tools.actions}><button type="button" className={tools.quiet} disabled={formLocked || !validBudget} onClick={continueSearch}>{t("Искать дальше", "Search further")}</button>{!search.searchComplete && search.pendingItems > 0 && !running && !cancellation ? <span className={tools.status}>{t("Осталось сравнить", "Left to compare")}: {number(search.pendingItems)}</span> : null}</div>
      <details className={styles.disclosure} data-auction-single-options><summary>{t("Отдельные улучшения по слотам", "Individual slot upgrades")}</summary>
      {recommendationGroups.length
        ? <AuctionGearSuggestions marketAt={profileControls ? search?.market?.updatedAt : undefined} groups={recommendationGroups} locale={locale} excluded={excluded} excludedVariantKeys={excludedVariantKeys} running={selectionLocked} marketStale={marketStale} slotName={slotName} onAllowed={setAllowed} />
        : <p role="status" className={styles.empty}>{excludedUpgrades ? t("Найденные улучшения исключены из подбора.", "The upgrades found are excluded.")
          : !search.searchComplete || search.pendingItems > 0 || discoveryIncomplete
            ? search.items.some(item => item.comparison)
              ? t("Среди проверенных вещей улучшений пока нет.", "No upgrades among the items compared so far.")
              : t("Пока недостаточно данных для сравнения. Нажмите «Искать дальше».", "Not enough comparison data yet. Select “Search further”.")
            : incompleteData ? t("В проверенных вариантах улучшений нет; часть вещей не удалось оценить.", "No upgrades among verified options; some items could not be evaluated.")
              : t("Проверка завершена: отдельных улучшений не найдено.", "Search complete: no single-item upgrades found.")}</p>}
      </details>
    </div> : null}
  </section>;
}
