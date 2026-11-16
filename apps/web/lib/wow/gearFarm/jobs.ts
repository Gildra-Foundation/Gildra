import "server-only";
import { randomUUID } from "node:crypto";
import type { FarmProgress, GearFarmJob, GearFarmResult } from "./types";
import { farmJobActive, sameFarmScope, validateFarmRequestId, type GearFarmScope } from "./recovery";
export type { GearFarmJob } from "./types";
type Task = (signal: AbortSignal, progress: (p: FarmProgress) => void) => Promise<GearFarmResult>;
type Identity = { scope: GearFarmScope; clientRequestId: string };
type Job = GearFarmJob & Partial<Identity> & {
  owner: string;
  controller: AbortController;
  task?: Task;
  createdAt: number;
  expiresAt: number;
  cancelledBeforeAcceptance?: boolean;
};
function view(j: Job) {
  return { id: j.id, status: j.status, progress: j.progress, result: j.result, error: j.error,
    createdAt: j.createdAt, expiresAt: j.expiresAt,
    ...(j.scope ? { scope: { ...j.scope }, clientRequestId: j.clientRequestId! } : {}) };
}
/** Single-process queue. Browser lifetime and request transport never own task cancellation. */
export function createGearFarmJobStore(options: { now?: () => number; retentionMs?: number; deadlineMs?: number } = {}) {
  const now = options.now ?? Date.now, retention = options.retentionMs ?? 30 * 60_000, deadline = options.deadlineMs ?? 10 * 60_000;
  const jobs = new Map<string, Job>(), queue: string[] = [];
  let running = false;
  const retainUntil = (job: Partial<Identity>) => Math.max(now(), Number(job.clientRequestId?.split(":", 1)[0]) || 0) + retention;
  function cleanup() {
    for (const [id, job] of jobs) if (job.expiresAt <= now()) {
      job.controller.abort(new Error("plan_timed_out"));
      if (job.status === "running") {
        job.status = "failed";
        job.error = "plan_timed_out";
        job.expiresAt = retainUntil(job);
      } else jobs.delete(id);
    }
    for (let i = queue.length - 1; i >= 0; i--) if (jobs.get(queue[i])?.status !== "queued") queue.splice(i, 1);
  }
  function owned(owner: string, id: string, scope?: GearFarmScope) {
    const job = jobs.get(id);
    return job?.owner === owner && (!scope || job.scope && sameFarmScope(job.scope, scope)) ? job : undefined;
  }
  function requestJob(owner: string, identity: Identity) {
    const existing = [...jobs.values()].find(job => job.owner === owner && job.clientRequestId === identity.clientRequestId);
    if (existing && (!existing.scope || !sameFarmScope(existing.scope, identity.scope))) throw new Error("plan_request_conflict");
    return existing;
  }
  function create(owner: string, identity?: Identity): Job {
    // Never evict an unexpired cancellation identity: an in-flight POST could otherwise resurrect it.
    if (jobs.size >= 200) throw new Error("plan_queue_full");
    const job: Job = { id: randomUUID(), owner, ...identity, ...(identity ? { scope: { ...identity.scope } } : {}),
      controller: new AbortController(), createdAt: now(), expiresAt: retainUntil(identity ?? {}),
      status: "queued", progress: null, result: null, error: null };
    jobs.set(job.id, job);
    return job;
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        cleanup();
        const job = jobs.get(queue.shift()!);
        if (!job || job.status !== "queued") continue;
        job.status = "running";
        job.expiresAt = now() + deadline;
        const timeout = setTimeout(() => job.controller.abort(new Error("plan_timed_out")), deadline);
        let abort: (() => void) | undefined;
        try {
          const signal = job.controller.signal;
          const interrupted = new Promise<never>((_, reject) => {
            abort = () => reject(signal.reason ?? new Error("cancelled"));
            signal.addEventListener("abort", abort, { once: true });
          });
          const task = job.task!(signal, progress => {
            if (!signal.aborted && job.status === "running" && jobs.get(job.id) === job) job.progress = progress;
          });
          // A late/non-cooperative task cannot hold the queue forever or republish after cancellation.
          const result = await Promise.race([task, interrupted]);
          signal.throwIfAborted();
          if (jobs.get(job.id) !== job || job.status !== "running") continue;
          job.result = result;
          job.status = "completed";
        } catch (error) {
          if (jobs.get(job.id) !== job || !farmJobActive(job)) continue;
          job.status = "failed";
          const message = error instanceof Error ? error.message : "";
          job.error = /^[a-z_]{3,80}$/.test(message) ? message : "farm_plan_unavailable";
        } finally {
          clearTimeout(timeout);
          if (abort) job.controller.signal.removeEventListener("abort", abort);
          delete job.task;
          if (jobs.get(job.id) === job) job.expiresAt = retainUntil(job);
        }
      }
    } finally { running = false; }
  }
  return {
    enqueue(owner: string, task: Task, identity?: Identity) {
      cleanup();
      if (identity) {
        const existing = requestJob(owner, identity);
        if (existing) return view(existing);
        validateFarmRequestId(identity.clientRequestId, now());
      }
      if ([...jobs.values()].some(job => job.owner === owner && farmJobActive(job))) throw new Error("plan_already_running");
      if (queue.length >= 8) throw new Error("plan_queue_full");
      if ([...jobs.values()].filter(job => job.owner === owner && !job.cancelledBeforeAcceptance && job.createdAt > now() - 60_000).length >= 3) throw new Error("plan_rate_limited");
      const job = create(owner, identity);
      job.task = task;
      queue.push(job.id);
      const result = view(job);
      void drain();
      return result;
    },
    get(owner: string, id: string, scope?: GearFarmScope) {
      cleanup();
      const job = owned(owner, id, scope);
      return job ? view(job) : null;
    },
    discover(owner: string, scope: GearFarmScope, clientRequestId?: string) {
      cleanup();
      const matches = [...jobs.values()].filter(job => job.owner === owner && job.scope && sameFarmScope(job.scope, scope) &&
        (!clientRequestId || job.clientRequestId === clientRequestId)).reverse();
      const job = matches.find(farmJobActive) ?? matches[0];
      return job ? view(job) : null;
    },
    cancel(owner: string, id: string, scope?: GearFarmScope) {
      cleanup();
      const job = owned(owner, id, scope);
      if (!job) return null;
      if (farmJobActive(job)) {
        job.status = "cancelled";
        job.error = "cancelled";
        job.expiresAt = retainUntil(job);
        job.controller.abort(new Error("cancelled"));
        delete job.task;
        const index = queue.indexOf(job.id);
        if (index !== -1) queue.splice(index, 1);
      }
      return view(job);
    },
    cancelRequest(owner: string, identity: Identity) {
      cleanup();
      const existing = requestJob(owner, identity);
      if (existing) return this.cancel(owner, existing.id, identity.scope)!;
      validateFarmRequestId(identity.clientRequestId, now());
      if ([...jobs.values()].filter(job => job.owner === owner && job.cancelledBeforeAcceptance).length >= 20) throw new Error("plan_rate_limited");
      const job = create(owner, identity);
      job.cancelledBeforeAcceptance = true;
      return this.cancel(owner, job.id, identity.scope)!;
    },
  };
}
const state = globalThis as typeof globalThis & { __gildraFarmJobStoreV2?: ReturnType<typeof createGearFarmJobStore> };
const store = state.__gildraFarmJobStoreV2 ??= createGearFarmJobStore();
export const enqueueGearFarmJob = store.enqueue.bind(store);
export const getGearFarmJob = store.get.bind(store);
export const discoverGearFarmJob = store.discover.bind(store);
export const cancelGearFarmJob = store.cancel.bind(store);
export const cancelGearFarmRequest = store.cancelRequest.bind(store);
