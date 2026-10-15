import "server-only";
import { randomUUID } from "node:crypto";
import type { FarmProgress, GearFarmResult } from "./types";
import type { GearFarmJob } from "./types";
export type { GearFarmJob } from "./types";
type Task = (signal: AbortSignal, progress: (p: FarmProgress) => void) => Promise<GearFarmResult>;
type Job = GearFarmJob & {
  owner: string;
  controller: AbortController;
  task?: Task;
  expires: number;
};
const state = globalThis as typeof globalThis & {
  __gildraFarmJobs?: Map<string, Job>;
  __gildraFarmQueue?: string[];
  __gildraFarmRunning?: boolean;
};
const jobs = state.__gildraFarmJobs ??= new Map<string, Job>(),
  queue = state.__gildraFarmQueue ??= [];
function view(j: Job): GearFarmJob {
  return {
    id: j.id,
    status: j.status,
    progress: j.progress,
    result: j.result,
    error: j.error
  };
}
function cleanup() {
  for (const [id, j] of jobs) if (j.expires < Date.now()) {
    j.controller.abort();
    jobs.delete(id);
  }
  // Cancelled or expired queued jobs must not consume queue capacity while
  // another character's long simulation is still running.
  for (let index = queue.length - 1; index >= 0; index--) {
    if (jobs.get(queue[index])?.status !== "queued") queue.splice(index, 1);
  }
}
async function drain() {
  if (state.__gildraFarmRunning) return;
  state.__gildraFarmRunning = true;
  try {
    while (queue.length) {
      const j = jobs.get(queue.shift()!);
      if (!j || j.status !== "queued") continue;
      j.status = "running";
      try {
        const signal = AbortSignal.any([j.controller.signal, AbortSignal.timeout(10 * 60_000)]);
        const result = await j.task!(signal, p => {
          if (!signal.aborted) {
            j.progress = p;
            j.expires = Date.now() + 30 * 60_000;
          }
        });
        signal.throwIfAborted();
        j.result = result;
        j.status = "completed";
      } catch (error) {
        j.status = j.controller.signal.aborted ? "cancelled" : "failed";
        // Only fixed internal identifiers reach clients, never upstream URLs or tokens.
        const message = error instanceof Error ? error.message : "";
        j.error = /^[a-z_]{3,80}$/.test(message) ? message : "farm_plan_unavailable";
      } finally {
        delete j.task;
        j.expires = Date.now() + 30 * 60_000;
      }
    }
  } finally {
    state.__gildraFarmRunning = false;
  }
}
export function enqueueGearFarmJob(owner: string, task: Task) {
  cleanup();
  if ([...jobs.values()].some(j => j.owner === owner && (j.status === "queued" || j.status === "running"))) throw new Error("plan_already_running");
  if (queue.length >= 8) throw new Error("plan_queue_full");
  if ([...jobs.values()].filter(j => j.owner === owner && j.expires > Date.now() + 29 * 60_000).length >= 3) throw new Error("plan_rate_limited");
  // Bound retained results as well as active work.
  if (jobs.size >= 200) {
    const old = [...jobs].find(([, j]) => !["queued", "running"].includes(j.status));
    if (old) jobs.delete(old[0]);else throw new Error("plan_queue_full");
  }
  const j: Job = {
    id: randomUUID(),
    owner,
    task,
    controller: new AbortController(),
    expires: Date.now() + 30 * 60_000,
    status: "queued",
    progress: null,
    result: null,
    error: null
  };
  jobs.set(j.id, j);
  queue.push(j.id);
  const result = view(j);
  void drain();
  return result;
}
export function getGearFarmJob(owner: string, id: string) {
  cleanup();
  const j = jobs.get(id);
  return j?.owner === owner ? view(j) : null;
}
export function cancelGearFarmJob(owner: string, id: string) {
  cleanup();
  const j = jobs.get(id);
  if (!j || j.owner !== owner) return null;
  if (j.status === "queued" || j.status === "running") {
    j.controller.abort();
    j.status = "cancelled";
    j.error = "cancelled";
    delete j.task;
    const queuedIndex = queue.indexOf(id);
    if (queuedIndex !== -1) queue.splice(queuedIndex, 1);
  }
  return view(j);
}
