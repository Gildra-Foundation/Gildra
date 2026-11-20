type AuctionGearStepKind = "search" | "assembly";
const retainedStepLimit = 64;
const stageNames = ["ownership", "armory", "market", "equippedPresentation", "equippedCatalog", "catalog", "details", "references", "variants", "capacity", "search", "assembly", "enhancements", "scenarios", "checkpoint"] as const;
export type AuctionGearStage = typeof stageNames[number];
/** Private per-run diagnostics. Durations are milliseconds; totalMs is elapsed wall
 * time including idle between continuations, activeStepMs sums only step lifetimes. */
export function createAuctionGearDiagnostics(clock: () => number = () => performance.now()) {
  const started = clock();
  const counters = { discovery: 0, queue: 0, compute: null as number | null, workerQueue: null as number | null, simulation: 0, candidates: 0, simulations: 0, task: 0, aborts: 0, timeouts: 0, steps: 0, cacheHits: 0, errors: 0, comparisons: 0 };
  let firstComparisonMs: number | null = null;
  let completedStepMs = 0;
  let retriedFinalistPackets = 0, retriedFinalistRows = 0;
  const activeSteps = new Map<object, number>();
  const stepDurations: Array<{ kind: AuctionGearStepKind; durationMs: number }> = [];
  const stages = new Map<AuctionGearStage, { calls: number; errors: number; operationMs: number; wallMs: number;
    wallStarted: number; active: Map<object, number> }>();
  const failure = (error: unknown) => {
    const name = error && typeof error === "object" && "name" in error ? error.name : "";
    if (name === "TimeoutError") counters.timeouts++;
    else if (name === "AbortError") counters.aborts++;
    else counters.errors++;
  };
  return {
    failure,
    /** Per-stage union wall time differs from summed operation cost when work
     * overlaps. Parent stages include their children: never sum different stages
     * to estimate end-to-end latency. No request arguments or results are kept. */
    async measureStage<T>(stage: AuctionGearStage, work: () => Promise<T>): Promise<T> {
      if (!stageNames.includes(stage)) throw new Error("invalid_diagnostic_stage");
      const began = clock(), key = {};
      const record = stages.get(stage) ?? { calls: 0, errors: 0, operationMs: 0, wallMs: 0, wallStarted: began, active: new Map<object, number>() };
      if (!record.active.size) record.wallStarted = began;
      record.calls++; record.active.set(key, began); stages.set(stage, record);
      try { return await work(); }
      catch (error) { record.errors++; throw error; }
      finally {
        const ended = clock();
        record.operationMs += Math.max(0, ended - began); record.active.delete(key);
        if (!record.active.size) record.wallMs += Math.max(0, ended - record.wallStarted);
      }
    },
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
    retryFinalistPacket(rows: number) { retriedFinalistPackets++; retriedFinalistRows += rows; },
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
      return { ...counters, ...(retriedFinalistPackets ? { finalistPacketRetries: { packets: retriedFinalistPackets, rows: retriedFinalistRows } } : {}), firstComparisonMs, totalMs: Math.max(0, now - started),
        activeStepMs: completedStepMs + [...activeSteps.values()].reduce((sum, began) => sum + Math.max(0, now - began), 0),
        stepDurations: stepDurations.map(step => ({ ...step })),
        stages: Object.fromEntries([...stages].map(([name, stage]) => [name, {
          calls: stage.calls, errors: stage.errors, active: stage.active.size,
          operationMs: stage.operationMs + [...stage.active.values()].reduce((sum, began) => sum + Math.max(0, now - began), 0),
          wallMs: stage.wallMs + (stage.active.size ? Math.max(0, now - stage.wallStarted) : 0),
        }])) };
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
    stages: Object.fromEntries(stageNames.flatMap(name => {
      const stage = snapshot.stages?.[name];
      return stage ? [[name, Object.fromEntries(["calls", "errors", "active", "operationMs", "wallMs"].flatMap(key => {
        const value = stage[key as keyof typeof stage];
        return Number.isFinite(value) && value >= 0 ? [[key, value]] : [];
      }))]] : [];
    })),
    stepDurations: snapshot.stepDurations.slice(-retainedStepLimit).map(({ kind, durationMs }) => ({ kind, durationMs })) }));
}
