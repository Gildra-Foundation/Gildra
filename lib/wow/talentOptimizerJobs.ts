import "server-only";

import { randomUUID } from "node:crypto";
import {
  runTalentOptimization,
  talentOptimizerTotal,
  type TalentOptimizerProgress,
  type TalentOptimizerRunInput,
  type TalentOptimizerRunResult,
  type TalentOptimizerSimulation,
  type TalentOptimizerSimulationRequest,
} from "./talentOptimizer";

export type TalentOptimizerJobStatus = "queued" | "running" | "completed" | "cancelled" | "failed";
export type PublicTalentOptimizerJob = {
  id: string;
  status: TalentOptimizerJobStatus;
  phase: TalentOptimizerProgress["phase"] | "queued";
  completed: number;
  total: number;
  results: TalentOptimizerProgress["results"];
  result: TalentOptimizerRunResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
type Job = PublicTalentOptimizerJob & {
  owner: string;
  input: TalentOptimizerRunInput;
  simulate: (request: TalentOptimizerSimulationRequest) => Promise<TalentOptimizerSimulation>;
  controller: AbortController;
  expiresAt: number;
};

const state = globalThis as typeof globalThis & {
  __gildraTalentOptimizerJobs?: Map<string, Job>;
  __gildraTalentOptimizerQueue?: string[];
  __gildraTalentOptimizerRunning?: boolean;
};
const jobs = state.__gildraTalentOptimizerJobs ??= new Map<string, Job>();
const queue = state.__gildraTalentOptimizerQueue ??= [];
const ttl = 30 * 60_000;

function publicJob(job: Job): PublicTalentOptimizerJob {
  return {
    id: job.id, status: job.status, phase: job.phase, completed: job.completed, total: job.total,
    results: job.results, result: job.result, error: job.error, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}

function cleanup() {
  const now = Date.now();
  for (const [id, job] of jobs) if (job.expiresAt <= now) jobs.delete(id);
}

function errorCode(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "simulation_unavailable";
}

async function drainQueue() {
  if (state.__gildraTalentOptimizerRunning) return;
  state.__gildraTalentOptimizerRunning = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      const job = jobs.get(id);
      if (!job || job.status !== "queued") continue;
      job.status = "running";
      job.phase = "baseline";
      job.updatedAt = new Date().toISOString();
      try {
        job.result = await runTalentOptimization(job.input, job.simulate, job.controller.signal, (progress) => {
          job.phase = progress.phase;
          job.completed = progress.completed;
          job.total = progress.total;
          job.results = progress.results;
          job.updatedAt = new Date().toISOString();
          job.expiresAt = Date.now() + ttl;
        });
        job.results = job.result.results;
        job.completed = job.total;
        job.status = "completed";
      } catch (error) {
        job.error = errorCode(error);
        job.status = job.controller.signal.aborted ? "cancelled" : "failed";
      }
      job.updatedAt = new Date().toISOString();
      job.expiresAt = Date.now() + ttl;
    }
  } finally {
    state.__gildraTalentOptimizerRunning = false;
  }
}

export function enqueueTalentOptimization(
  owner: string,
  input: TalentOptimizerRunInput,
  simulate: (request: TalentOptimizerSimulationRequest) => Promise<TalentOptimizerSimulation>,
) {
  cleanup();
  if (queue.length >= 20) throw new Error("optimizer_queue_full");
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(), owner, input, simulate, controller: new AbortController(),
    status: "queued", phase: "queued", completed: 0, total: talentOptimizerTotal(input.candidates.length),
    results: [], result: null, error: null, createdAt: now, updatedAt: now, expiresAt: Date.now() + ttl,
  };
  jobs.set(job.id, job);
  queue.push(job.id);
  void drainQueue();
  return publicJob(job);
}

export function getTalentOptimizationJob(owner: string, id: string) {
  cleanup();
  const job = jobs.get(id);
  return job?.owner === owner ? publicJob(job) : null;
}

export function cancelTalentOptimizationJob(owner: string, id: string) {
  cleanup();
  const job = jobs.get(id);
  if (!job || job.owner !== owner) return null;
  if (job.status === "queued" || job.status === "running") {
    job.controller.abort();
    job.status = "cancelled";
    job.error = "cancelled";
    job.updatedAt = new Date().toISOString();
    job.expiresAt = Date.now() + ttl;
  }
  return publicJob(job);
}
