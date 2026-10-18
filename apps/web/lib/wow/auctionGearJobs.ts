import "server-only";
import { randomUUID } from "node:crypto";
import type { AuctionPlanProgress } from "./auctionGearPlanner";
import type { AuctionGearRunInput, AuctionGearRunResult, AuctionGearAssemblySelection } from "./auctionGearRunner";
import { auctionMeasurementContract, auctionPersistenceEnabled, listAuctionStateHeaders, readAuctionState, removeAuctionState, writeAuctionState } from "./auctionGearPersistence";
import { auctionGearSlots, parseAuctionGearSlots } from "./auctionGearSelection";
export type AuctionGearJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: AuctionPlanProgress | null;
  result: AuctionGearRunResult | null;
  error: string | null;
  scope?: { characterSlug: string; locale: "en" | "ru" };
  searchId?: string;
  /** Safe intent kind for recovery across tabs; no private work payload. */
  mode?: "search" | "assembly";
};
export type AuctionGearWork = { action: "search"; input: AuctionGearRunInput }
  | { action: "resume"; searchId: string }
  | { action: "assemble"; searchId: string; selection: AuctionGearAssemblySelection };
/** Form fields copied only from validated, server-owned work or context. */
export type AuctionGearFormIntent = AuctionGearRunInput & {
  objective: "value" | "dps";
  selectedSlots: ReturnType<typeof parseAuctionGearSlots>;
};
export type AuctionGearActiveRecovery = { activeJob: AuctionGearJob | null; formIntent: AuctionGearFormIntent | null };
export type AuctionGearTask = (signal: AbortSignal, progress: (p: AuctionPlanProgress) => void,
  hooks: { searchCreated: (searchId: string) => void }) => Promise<AuctionGearRunResult>;
type Job = AuctionGearJob & {
  owner: string;
  /** Private idempotency identity; never include these fields in view(). */
  clientRequestId?: string;
  requestFingerprint?: string;
  controller: AbortController;
  task?: AuctionGearTask;
  work?: AuctionGearWork;
  onSettled?: () => void;
  expires: number;
  createdAt: number;
  continuation: boolean;
  cancelledBeforeAcceptance?: boolean;
  recency: number;
  lazy?: boolean;
  recoverable?: boolean;
  /** Memory cancellation is immediate; a public ACK still requires its write. */
  cancellationPending?: boolean;
  resultMeasurementContract?: string;
};
type Starts = { searches: number[]; continuations: number[]; cancellations?: number[] };
const state = globalThis as typeof globalThis & {
  __gildraAuctionJobs?: Map<string, Job>;
  __gildraAuctionQueue?: string[];
  __gildraAuctionRunning?: boolean;
  __gildraAuctionStarts?: Map<string, Starts>;
  __gildraAuctionJobsRestored?: boolean;
  __gildraAuctionJobRecency?: number;
};
const jobs = state.__gildraAuctionJobs ??= new Map<string, Job>(),
  queue = state.__gildraAuctionQueue ??= [],
  starts = state.__gildraAuctionStarts ??= new Map<string, Starts>();
type StoredJob = Omit<Job, "task" | "controller" | "onSettled" | "lazy" | "recoverable" | "cancellationPending">;
type JobMetadata = Omit<StoredJob, "result" | "progress" | "work"> & { hasWork: boolean };
const lastPersisted = new WeakMap<Job, number>();
function nextRecency() { return state.__gildraAuctionJobRecency = (state.__gildraAuctionJobRecency ?? 0) + 1; }
function copyWork(work: AuctionGearWork | undefined): AuctionGearWork | undefined {
  if (!work) return;
  if (typeof work !== "object" || !["search", "resume", "assemble"].includes(work.action)) throw new Error("invalid_plan_request");
  if (work.action === "search") {
    if (!work.input || typeof work.input !== "object") throw new Error("invalid_plan_request");
    const { characterSlug, budgetCopper, scenario, objective, locale, selectedSlots } = work.input;
    if (typeof characterSlug !== "string" || !characterSlug || characterSlug.length > 180 ||
        !Number.isSafeInteger(budgetCopper) || budgetCopper < 0 || budgetCopper > 999_999_999_999 ||
        !["single-target", "aoe", "execute"].includes(scenario) || objective !== undefined && objective !== "value" && objective !== "dps" || !["en", "ru"].includes(locale)) throw new Error("invalid_plan_request");
    return { action: "search", input: { characterSlug, budgetCopper, scenario, locale, ...(objective ? { objective } : {}),
      ...(selectedSlots !== undefined ? { selectedSlots: parseAuctionGearSlots(selectedSlots) } : {}) } };
  }
  if (typeof work.searchId !== "string" || !work.searchId || work.searchId.length > 100) throw new Error("invalid_plan_request");
  if (work.action === "resume") return { action: "resume", searchId: work.searchId };
  const selection = work.selection;
  const ids = Array.isArray(selection) ? selection : selection?.excludedOptionIds;
  if (selection !== undefined && (!Array.isArray(ids) || ids.length > 20000 || new Set(ids).size !== ids.length ||
      ids.some(id => typeof id !== "string" || !id || id.length > 180))) throw new Error("invalid_plan_request");
  const variants = !Array.isArray(selection) ? selection?.excludedVariantKeys : undefined;
  if (variants !== undefined && (!Array.isArray(variants) || variants.length > 20000 || new Set(variants).size !== variants.length || variants.some(key => typeof key !== "string" || !key || key.length > 240))) throw new Error("invalid_plan_request");
  return { action: "assemble", searchId: work.searchId, selection: Array.isArray(selection) ? [...selection]
    : selection ? { excludedOptionIds: [...selection.excludedOptionIds], ...(variants ? { excludedVariantKeys: [...variants] } : {}) } : undefined };
}
export function auctionGearFormIntent(input: AuctionGearRunInput | undefined, scope: AuctionGearJob["scope"]): AuctionGearFormIntent | null {
  if (!input || !scope || input.characterSlug !== scope.characterSlug || input.locale !== scope.locale) return null;
  try {
    const copied = copyWork({ action: "search", input });
    if (!copied || copied.action !== "search") return null;
    return { ...copied.input, objective: copied.input.objective ?? "dps",
      selectedSlots: copied.input.selectedSlots ?? [...auctionGearSlots] };
  } catch { return null; }
}
function metadata(j: Job): JobMetadata {
  return { id: j.id, owner: j.owner, status: j.status, error: j.error, scope: j.scope, searchId: j.searchId,
    expires: j.expires, createdAt: j.createdAt, continuation: j.continuation, recency: j.recency,
    clientRequestId: j.clientRequestId, requestFingerprint: j.requestFingerprint,
    cancelledBeforeAcceptance: j.cancelledBeforeAcceptance, hasWork: Boolean(j.work ?? j.recoverable), mode: j.mode,
    resultMeasurementContract: j.resultMeasurementContract };
}
function hydrate(j: Job) {
  if (!j.lazy) return true;
  const record = readAuctionState<StoredJob, JobMetadata>("job", j.id), data = record?.data;
  if (!record || !data || data.id !== j.id || data.owner !== j.owner || data.expires !== record.expiresAt ||
      data.clientRequestId !== j.clientRequestId || data.requestFingerprint !== j.requestFingerprint || data.recency !== j.recency ||
      data.resultMeasurementContract !== j.resultMeasurementContract) {
    removeAuctionState("job", j.id); jobs.delete(j.id); return false;
  }
  try { j.work = copyWork(data.work); }
  catch { removeAuctionState("job", j.id); jobs.delete(j.id); return false; }
  j.recoverable = Boolean(j.work);
  const legacyResult = data.resultMeasurementContract !== auctionMeasurementContract;
  j.result = legacyResult ? null : data.result; j.progress = data.progress; j.lazy = false;
  if (data.status === "completed" && legacyResult) { j.status = "failed"; j.error = "simulation_version_changed"; }
  return true;
}
function persist(j: Job, replaceId?: string) {
  if (!hydrate(j)) throw new Error("auction_storage_unavailable");
  writeAuctionState("job", j.id, j.expires, { ...publicData(j), owner: j.owner, expires: j.expires,
    createdAt: j.createdAt, continuation: j.continuation, work: j.work,
    clientRequestId: j.clientRequestId, requestFingerprint: j.requestFingerprint,
    cancelledBeforeAcceptance: j.cancelledBeforeAcceptance, recency: j.recency,
    resultMeasurementContract: j.resultMeasurementContract } satisfies StoredJob,
  { replaceId, metadata: metadata(j) });
  delete j.cancellationPending;
  lastPersisted.set(j, Date.now());
}
function restore() {
  if (state.__gildraAuctionJobsRestored || !auctionPersistenceEnabled()) return;
  for (const record of listAuctionStateHeaders<JobMetadata>("job").reverse()) {
    const data = record.metadata;
    if (!data || data.id !== record.id || typeof data.owner !== "string" || !data.owner || data.expires !== record.expiresAt ||
        !["queued", "running", "completed", "failed", "cancelled"].includes(data.status) || !Number.isFinite(data.createdAt) ||
        !Number.isSafeInteger(data.recency) || data.recency <= 0) {
      removeAuctionState("job", record.id); continue;
    }
    const interrupted = data.status === "queued" || data.status === "running";
    const legacyResult = data.status === "completed" && data.resultMeasurementContract !== auctionMeasurementContract;
    const j: Job = { ...data, result: null, progress: null, controller: new AbortController(), lazy: true, recoverable: data.hasWork,
      ...(interrupted ? { status: data.hasWork ? "queued" : "failed", error: data.hasWork ? null : "plan_interrupted" } : {}),
      ...(legacyResult ? { status: "failed", error: "simulation_version_changed" } : {}) };
    state.__gildraAuctionJobRecency = Math.max(state.__gildraAuctionJobRecency ?? 0, data.recency);
    jobs.set(j.id, j);
    if (j.createdAt > Date.now() - 60_000) {
      const history = starts.get(j.owner) ?? { searches: [], continuations: [] };
      if (j.cancelledBeforeAcceptance) (history.cancellations ??= []).push(j.createdAt);
      else history[j.continuation ? "continuations" : "searches"].push(j.createdAt);
      starts.set(j.owner, history);
    }
  }
  state.__gildraAuctionJobsRestored = true;
}
function settle(j: Job) {
  const callback = j.onSettled;
  delete j.onSettled;
  callback?.();
}
/** Protected cancellation ACKs and active work are never replaceable. */
function availableReplacement() {
  if (jobs.size < 200) return;
  const replaced = [...jobs].find(([, j]) => !j.cancelledBeforeAcceptance && !["queued", "running"].includes(j.status));
  if (!replaced) throw new Error("plan_queue_full");
  return replaced;
}
function retainJob(j: Job, replaced: [string, Job] | undefined) {
  persist(j, replaced?.[0]);
  if (replaced) {
    try { removeAuctionState("job", replaced[0]); }
    catch (error) { removeAuctionState("job", j.id); throw error; }
    jobs.delete(replaced[0]);
  }
  jobs.set(j.id, j);
}
function view(j: Job): AuctionGearJob {
  // GET and nonce replay must not turn a failed DELETE write into a false ACK.
  if (j.cancellationPending) { j.error = "cancelled"; persist(j); }
  return publicData(j);
}
function publicData(j: Job): AuctionGearJob {
  return {
    id: j.id,
    status: j.status,
    progress: j.progress,
    result: j.result,
    error: j.error,
    ...(j.scope ? { scope: { ...j.scope } } : {}),
    ...(j.searchId ? { searchId: j.searchId } : {}),
    ...(j.mode ? { mode: j.mode } : {}),
  };
}
function cleanup() {
  restore();
  const now = Date.now();
  for (const [id, j] of jobs) if (j.expires < now) {
    j.controller.abort();
    if (j.status === "queued") settle(j);
    removeAuctionState("job", id);
    jobs.delete(id);
  }
  for (const [owner, history] of starts) {
    history.searches = history.searches.filter(time => time > now - 60_000);
    history.continuations = history.continuations.filter(time => time > now - 60_000);
    history.cancellations = history.cancellations?.filter(time => time > now - 60_000);
    if (!history.searches.length && !history.continuations.length && !history.cancellations?.length) starts.delete(owner);
  }
  // Cancelled and expired jobs must not occupy capacity while another
  // character's simulation keeps the queue waiting.
  for (let index = queue.length - 1; index >= 0; index--) {
    if (jobs.get(queue[index])?.status !== "queued") queue.splice(index, 1);
  }
}
async function drain() {
  if (state.__gildraAuctionRunning) return;
  state.__gildraAuctionRunning = true;
  try {
    while (queue.length) {
      const j = jobs.get(queue.shift()!);
      if (!j || j.status !== "queued") continue;
      j.status = "running";
      try {
        persist(j);
        const signal = AbortSignal.any([j.controller.signal, AbortSignal.timeout(10 * 60_000)]);
        const result = await j.task!(signal, p => {
          if (!signal.aborted) {
            j.progress = p;
            j.expires = Date.now() + 30 * 60_000;
            if (Date.now() - (lastPersisted.get(j) ?? 0) >= 30_000) persist(j);
          }
        }, { searchCreated: searchId => {
          signal.throwIfAborted(); j.searchId = searchId; persist(j);
        } });
        signal.throwIfAborted();
        j.result = result;
        j.resultMeasurementContract = auctionMeasurementContract;
        j.searchId = result.searchId;
        j.status = "completed";
        j.expires = Date.now() + 30 * 60_000;
        persist(j);
      } catch (error) {
        j.status = j.controller.signal.aborted ? "cancelled" : "failed";
        // Only fixed internal identifiers reach clients, never upstream URLs or tokens.
        const message = error instanceof Error ? error.message : "";
        j.error = /^[a-z_]{3,80}$/.test(message) ? message : "auction_plan_unavailable";
        j.expires = Date.now() + 30 * 60_000;
        try { persist(j); } catch { j.error = "auction_storage_unavailable"; }
      } finally {
        delete j.task;
        settle(j);
        j.expires = Date.now() + 30 * 60_000;
      }
    }
  } finally {
    state.__gildraAuctionRunning = false;
  }
}
export function enqueueAuctionGearJob(owner: string, task: AuctionGearTask, options: {
  continuation?: boolean;
  scope?: AuctionGearJob["scope"];
  searchId?: string;
  clientRequestId?: string;
  requestFingerprint?: string;
  onSettled?: () => void;
  work?: AuctionGearWork;
  beforeAcceptance?: () => void;
} = {}) {
  cleanup();
  if (options.clientRequestId !== undefined || options.requestFingerprint !== undefined) {
    if (!validAuctionGearClientRequestId(options.clientRequestId) || !/^[a-f0-9]{64}$/.test(options.requestFingerprint ?? "") ||
        !options.scope?.characterSlug || !["en", "ru"].includes(options.scope.locale)) throw new Error("invalid_plan_request");
    // An accepted request remains recoverable even if its response was lost,
    // the queue filled, or this owner has since exhausted the search quota.
    const existing = replayAuctionGearJob(owner, options.clientRequestId, options.requestFingerprint!);
    if (existing) { options.onSettled?.(); return existing; }
  }
  if ([...jobs.values()].some(j => j.owner === owner && (j.status === "queued" || j.status === "running"))) throw new Error("plan_already_running");
  if (queue.length >= 8) throw new Error("plan_queue_full");
  const history = starts.get(owner) ?? { searches: [], continuations: [] };
  const kind = options.continuation ? "continuations" : "searches";
  if (history[kind].length >= (options.continuation ? 60 : 3)) throw new Error("plan_rate_limited");
  // Bound retained results as well as active work.
  const replaced = availableReplacement();
  const j: Job = {
    id: randomUUID(),
    owner,
    task,
    ...(options.work ? { work: copyWork(options.work) } : {}),
    ...(options.work ? { mode: options.work.action === "assemble" ? "assembly" as const : "search" as const } : {}),
    ...(options.onSettled ? { onSettled: options.onSettled } : {}),
    controller: new AbortController(),
    expires: Date.now() + 30 * 60_000,
    createdAt: Date.now(), continuation: Boolean(options.continuation),
    recency: nextRecency(),
    status: "queued",
    progress: null,
    result: null,
    error: null,
    ...(options.scope ? { scope: { ...options.scope } } : {}),
    ...(options.searchId ? { searchId: options.searchId } : {}),
    ...(options.clientRequestId ? { clientRequestId: options.clientRequestId, requestFingerprint: options.requestFingerprint } : {}),
  };
  options.beforeAcceptance?.();
  retainJob(j, replaced);
  history[kind].push(Date.now());
  starts.set(owner, history);
  queue.push(j.id);
  const result = view(j);
  void drain();
  return result;
}
export function getAuctionGearJob(owner: string, id: string) {
  cleanup();
  const j = jobs.get(id);
  return j?.owner === owner && hydrate(j) ? view(j) : null;
}
export function validAuctionGearClientRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(value);
}
/** Private fingerprint comparison also permits replay after context eviction. */
export function replayAuctionGearJob(owner: string, clientRequestId: string, requestFingerprint: string) {
  cleanup();
  const job = [...jobs.values()].find(job => job.owner === owner && job.clientRequestId === clientRequestId);
  if (!job || !hydrate(job)) return null;
  if (job.cancelledBeforeAcceptance) return view(job);
  if (job.requestFingerprint !== requestFingerprint) throw new Error("invalid_plan_request");
  return view(job);
}
export function getAuctionGearJobByRequest(owner: string, clientRequestId: string, scope: NonNullable<AuctionGearJob["scope"]>) {
  cleanup();
  const job = [...jobs.values()].find(job => job.owner === owner && job.clientRequestId === clientRequestId &&
    job.scope?.characterSlug === scope.characterSlug && job.scope.locale === scope.locale);
  return job && hydrate(job) ? view(job) : null;
}
export function getActiveAuctionGearJob(owner: string, searchId: string) {
  cleanup();
  const job = [...jobs.values()].find(job => job.owner === owner && job.searchId === searchId &&
    (job.status === "queued" || job.status === "running"));
  return job ? view(job) : null;
}
/** Discovery never queues or resumes work; the owner must explicitly open it. */
export function getOwnerActiveAuctionGearJob(owner: string): AuctionGearActiveRecovery {
  cleanup();
  const job = [...jobs.values()].find(job => job.owner === owner && (job.status === "queued" || job.status === "running"));
  if (!job || !hydrate(job)) return { activeJob: null, formIntent: null };
  return { activeJob: view(job), formIntent: job.work?.action === "search" ? auctionGearFormIntent(job.work.input, job.scope) : null };
}
export function cancelAuctionGearJob(owner: string, id: string) {
  cleanup();
  const j = jobs.get(id);
  if (!j || j.owner !== owner || !hydrate(j)) return null;
  if (j.status === "queued" || j.status === "running") {
    const queued = j.status === "queued";
    j.cancellationPending = true;
    j.controller.abort();
    j.status = "cancelled";
    j.error = "cancelled";
    delete j.task;
    if (queued) settle(j);
    const queuedIndex = queue.indexOf(id);
    if (queuedIndex !== -1) queue.splice(queuedIndex, 1);
    persist(j);
  }
  return view(j);
}

/** Cancel even when its launching POST has not reached the queue yet. */
export function cancelAuctionGearRequest(owner: string, clientRequestId: string, scope: NonNullable<AuctionGearJob["scope"]>) {
  cleanup();
  if (!validAuctionGearClientRequestId(clientRequestId) || !scope.characterSlug || !["en", "ru"].includes(scope.locale)) throw new Error("invalid_plan_request");
  const existing = [...jobs.values()].find(j => j.owner === owner && j.clientRequestId === clientRequestId);
  if (existing) {
    if (existing.scope?.characterSlug !== scope.characterSlug || existing.scope.locale !== scope.locale) throw new Error("invalid_plan_request");
    return cancelAuctionGearJob(owner, existing.id);
  }
  const replaced = availableReplacement();
  const history = starts.get(owner) ?? { searches: [], continuations: [] };
  // Admission is a short rate window, independent of the thirty-minute ACK
  // lifetime. Existing identities above bypass it, including accepted jobs.
  if ((history.cancellations?.length ?? 0) >= 60) throw new Error("plan_rate_limited");
  const j: Job = { id: randomUUID(), owner, clientRequestId, scope: { ...scope },
    status: "cancelled", progress: null, result: null, error: "cancelled", cancelledBeforeAcceptance: true,
    controller: new AbortController(), expires: Date.now() + 30 * 60_000, createdAt: Date.now(), continuation: false, recency: nextRecency() };
  retainJob(j, replaced);
  (history.cancellations ??= []).push(j.createdAt); starts.set(owner, history);
  return view(j);
}

/** Only an authenticated owner's route may attach a fresh token to parked work. */
export function getAuctionGearPendingWork(owner: string, id: string) {
  cleanup();
  const j = jobs.get(id);
  return j?.owner === owner && j.status === "queued" && !j.task && hydrate(j) ? j.work ?? null : null;
}

export function resumeAuctionGearJob(owner: string, id: string, task: AuctionGearTask,
  options: { onSettled?: () => void } = {}) {
  cleanup();
  const j = jobs.get(id);
  if (!j || j.owner !== owner || j.status !== "queued" || j.task || !hydrate(j) || !j.work) return false;
  if (queue.length >= 8) throw new Error("plan_queue_full");
  j.task = task; j.onSettled = options.onSettled;
  queue.push(j.id);
  void drain();
  return true;
}
