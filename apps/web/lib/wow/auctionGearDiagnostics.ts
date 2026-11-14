type AuctionGearStepKind = "search" | "assembly";
const retainedStepLimit = 64;
/** Private per-run diagnostics. Durations are milliseconds; totalMs is elapsed wall
 * time including idle between continuations, activeStepMs sums only step lifetimes. */
export function createAuctionGearDiagnostics(clock: () => number = () => performance.now()) {
  const started = clock();
  const counters = { discovery: 0, queue: 0, compute: null as number | null, workerQueue: null as number | null, simulation: 0, candidates: 0, simulations: 0, task: 0, aborts: 0, timeouts: 0, steps: 0, cacheHits: 0, errors: 0, comparisons: 0 };
  let firstComparisonMs: number | null = null;
  let completedStepMs = 0;
  const activeSteps = new Map<object, number>();
  const stepDurations: Array<{ kind: AuctionGearStepKind; durationMs: number }> = [];
  const failure = (error: unknown) => {
    const name = error && typeof error === "object" && "name" in error ? error.name : "";
    if (name === "TimeoutError") counters.timeouts++;
    else if (name === "AbortError") counters.aborts++;
    else counters.errors++;
  };
  return {
    failure,
    duration(phase: "discovery" | "queue" | "compute" | "simulation" | "task", ms: number) { counters[phase] = (counters[phase] ?? 0) + Math.max(0, ms); },
    async measure<T>(phase: "discovery" | "queue" | "compute" | "simulation", work: () => Promise<T>): Promise<T> {
      const began = clock();
      try { return await work(); }
      catch (error) { failure(error); throw error; }
      finally { counters[phase] = (counters[phase] ?? 0) + clock() - began; }
    },
    /** Only pass headers from the configured trusted worker, never client input. */
    workerTiming(header: string | null | undefined) {
      if (!header || header.length > 4096) return;
      for (const metric of header.split(",")) {
        const match = /^\s*(queue|native)\s*;\s*dur=([0-9]+(?:\.[0-9]+)?)\s*$/.exec(metric);
        if (!match) continue;
        const value = Number(match[2]);
        if (!Number.isFinite(value)) continue;
        const key = match[1] === "native" ? "compute" : "workerQueue";
        counters[key] = (counters[key] ?? 0) + value;
      }
    },
    candidates(count = 1) { counters.candidates += count; },
    candidate(count = 1) { counters.candidates += count; },
    simulation() { counters.simulations++; },
    comparison() { counters.comparisons++; firstComparisonMs ??= clock() - started; },
    beginStep(kind: AuctionGearStepKind) {
      const key = {}, began = clock();
      counters.steps++;
      activeSteps.set(key, began);
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        activeSteps.delete(key);
        const durationMs = Math.max(0, clock() - began);
        completedStepMs += durationMs;
        stepDurations.push({ kind, durationMs });
        if (stepDurations.length > retainedStepLimit) stepDurations.shift();
      };
    },
    /** Legacy counter-only callers do not contribute duration measurements. */
    step() { counters.steps++; },
    cacheHit() { counters.cacheHits++; },
    snapshot() {
      const now = clock();
      return { ...counters, firstComparisonMs, totalMs: Math.max(0, now - started),
        activeStepMs: completedStepMs + [...activeSteps.values()].reduce((sum, began) => sum + Math.max(0, now - began), 0),
        stepDurations: stepDurations.map(step => ({ ...step })) };
    },
  };
}

export type AuctionGearDiagnosticsSnapshot = ReturnType<ReturnType<typeof createAuctionGearDiagnostics>["snapshot"]>;
/** Opt-in structured emission with an explicit allow-list: no identity, inputs,
 * tokens, arbitrary error messages or attached properties may reach logs. */
export function logAuctionGearDiagnostics(snapshot: AuctionGearDiagnosticsSnapshot, scope: "run" | "job" = "run") {
  if (process.env.AUCTION_GEAR_DIAGNOSTICS !== "1") return;
  const { discovery, queue, compute, workerQueue, simulation, candidates, simulations, task,
    aborts, timeouts, steps, cacheHits, errors, comparisons, firstComparisonMs, totalMs, activeStepMs } = snapshot;
  console.info(JSON.stringify({ event: "auction_gear_diagnostics", scope, discovery, queue, compute, workerQueue,
    simulation, candidates, simulations, task, aborts, timeouts, steps, cacheHits, errors, comparisons,
    firstComparisonMs, totalMs, activeStepMs,
    stepDurations: snapshot.stepDurations.slice(-retainedStepLimit).map(({ kind, durationMs }) => ({ kind, durationMs })) }));
}
