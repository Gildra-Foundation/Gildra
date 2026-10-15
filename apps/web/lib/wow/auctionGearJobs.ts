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
type Starts = { searches: number[]; continuations: number[] };
const state = globalThis as typeof globalThis & {
  __gildraAuctionJobs?: Map<string, Job>;
  __gildraAuctionQueue?: string[];
  __gildraAuctionRunning?: boolean;
  __gildraAuctionStarts?: Map<string, Starts>;
};
const jobs = state.__gildraAuctionJobs ??= new Map<string, Job>(),
  queue = state.__gildraAuctionQueue ??= [],
  starts = state.__gildraAuctionStarts ??= new Map<string, Starts>();
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
  const now = Date.now();
  for (const [id, j] of jobs) if (j.expires < now) {
    j.controller.abort();
    jobs.delete(id);
  }
  for (const [owner, history] of starts) {
    history.searches = history.searches.filter(time => time > now - 60_000);
    history.continuations = history.continuations.filter(time => time > now - 60_000);
    if (!history.searches.length && !history.continuations.length) starts.delete(owner);
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
export function enqueueAuctionGearJob(owner: string, task: Task, options: { continuation?: boolean } = {}) {
  cleanup();
  if ([...jobs.values()].some(j => j.owner === owner && (j.status === "queued" || j.status === "running"))) throw new Error("plan_already_running");
  if (queue.length >= 8) throw new Error("plan_queue_full");
  const history = starts.get(owner) ?? { searches: [], continuations: [] };
  const kind = options.continuation ? "continuations" : "searches";
  if (history[kind].length >= (options.continuation ? 60 : 3)) throw new Error("plan_rate_limited");
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
    const queuedIndex = queue.indexOf(id);
    if (queuedIndex !== -1) queue.splice(queuedIndex, 1);
  }
  return view(j);
}
