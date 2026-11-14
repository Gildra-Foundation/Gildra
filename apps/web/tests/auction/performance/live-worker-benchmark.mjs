import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Explicit local diagnostic, never part of automated unit tests. No account data.
// The deployed worker rejects actionListMode:native; this legacy custom-APL probe
// measures its resource only, and is NOT a production auction compatibility test.
const endpoint = 'http://127.0.0.1:58082/v1/wow/rotation/simulations';
const input = { spec: 'fury-warrior', scenario: 'single-target', fightLengthSeconds: 30, targets: 1,
  rules: ['rampage', 'bloodthirst', 'raging-blow', 'execute', 'whirlwind'] };
const measurements = [];
let expectedPrecision;
async function request(index, start) {
  const began = performance.now();
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(15_000) });
    const data = await response.json();
    const precision = { engine: data.engine, iterations: data.iterations, confidence: data.confidence };
    const successful = response.status === 201 && response.headers.get('x-gildra-engine') === 'simulationcraft' &&
      Number.isFinite(data.dps) && data.dps > 0 && Number.isFinite(data.dpsError) && data.dpsError >= 0;
    expectedPrecision ??= successful ? precision : undefined;
    return { index, status: response.status, wallMs: performance.now() - began, completedAfterMs: performance.now() - start,
      serverTiming: response.headers.get('server-timing'), engineHeader: response.headers.get('x-gildra-engine'),
      ...precision, dps: data.dps, dpsError: data.dpsError, dpsMeanPresent: Number.isFinite(data.dpsMean),
      valid: successful && JSON.stringify(precision) === JSON.stringify(expectedPrecision),
      ...(successful ? {} : { errorCode: data.code ?? 'invalid_response' }) };
  } catch (error) {
    return { index, wallMs: performance.now() - began, completedAfterMs: performance.now() - start,
      valid: false, errorCode: error.name };
  }
}
let stopped = false;
for (let repeat = 1; repeat <= 5 && !stopped; repeat++) {
  // Alternate ordering to reduce warmup/time-of-run bias; no cache invalidation.
  for (const concurrency of repeat % 2 ? [1, 2] : [2, 1]) {
    const started = performance.now();
    let requests;
    if (concurrency === 1) {
      requests = [await request(0, started)];
      if (requests[0].valid) requests.push(await request(1, started));
    } else requests = await Promise.all([request(0, started), request(1, started)]);
    const row = { repeat, concurrency, totalMs: performance.now() - started,
      firstCompletionMs: Math.min(...requests.map(r => r.completedAfterMs)), requests };
    measurements.push(row);
    console.log(JSON.stringify({ repeat, concurrency, totalMs: row.totalMs, valid: requests.every(r => r.valid) }));
    if (requests.some(r => !r.valid)) { stopped = true; break; }
    await delay(500);
  }
}
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, ...(sorted.length >= 3 ? { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1) } : { samples: sorted, insufficientForSummary: true }) };
}
const result = { generatedAt: new Date().toISOString(), endpoint, input, method: 'Existing deployed worker; bundled public Fury profile; legacy custom APL; no user/account data. Up to five planned paired repeats, two requests each, alternating order, 500ms spacing; stop immediately after any failed batch. No server cache flushing, restarts, configuration changes or deployment. No before/after code measurement. No client result cache. Native queue/compute timings unavailable when Server-Timing is absent.',
  precision: expectedPrecision, stopped, measurements,
  summary: [1, 2].map(concurrency => {
    const batches = measurements.filter(m => m.concurrency === concurrency);
    const completed = batches.filter(m => m.requests.length === 2 && m.requests.every(r => r.valid));
    return { concurrency, attemptedBatches: batches.length, completedBatches: completed.length, failedRequests: batches.flatMap(m => m.requests).filter(r => !r.valid).length,
      completedBatchTotalMs: summary(completed.map(m => m.totalMs)), completedBatchFirstResultMs: summary(completed.map(m => m.firstCompletionMs)) };
  }) };
await writeFile(new URL('./live-worker-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
if (stopped) process.exitCode = 1;
