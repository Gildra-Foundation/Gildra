import "server-only";
import { randomUUID } from "node:crypto";
import type { AuctionPlanProgress } from "./auctionGearPlanner";
import type { AuctionGearRunResult } from "./auctionGearRunner";
export type AuctionGearJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: AuctionPlanProgress | null;
  result: AuctionGearRunResult | null;
  error: string | null;
};
type Task = (signal: AbortSignal, progress: (p: AuctionPlanProgress) => void) => Promise<AuctionGearRunResult>;
type Job = AuctionGearJob & {
  owner: string;
  controller: AbortController;
  task?: Task;
  expires: number;
};
const state = globalThis as typeof globalThis & {
  __gildraAuctionJobs?: Map<string, Job>;
  __gildraAuctionQueue?: string[];
  __gildraAuctionRunning?: boolean;
};
const jobs = state.__gildraAuctionJobs ??= new Map<string, Job>(),
  queue = state.__gildraAuctionQueue ??= [];
function view(j: Job): AuctionGearJob {
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
        j.error = /^[a-z_]{3,80}$/.test(message) ? message : "auction_plan_unavailable";
      } finally {
        delete j.task;
        j.expires = Date.now() + 30 * 60_000;
      }
    }
  } finally {
    state.__gildraAuctionRunning = false;
  }
}
export function enqueueAuctionGearJob(owner: string, task: Task) {
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
export function getAuctionGearJob(owner: string, id: string) {
  cleanup();
  const j = jobs.get(id);
  return j?.owner === owner ? view(j) : null;
}
export function cancelAuctionGearJob(owner: string, id: string) {
  cleanup();
  const j = jobs.get(id);
  if (!j || j.owner !== owner) return null;
  if (j.status === "queued" || j.status === "running") {
    j.controller.abort();
    j.status = "cancelled";
    j.error = "cancelled";
    delete j.task;
  }
  return view(j);
}
