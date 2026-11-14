# Existing local native worker probe — 2026-11-13

The worker at `http://127.0.0.1:58082` is reachable and actually executes SimulationCraft. Earlier absence of a locally visible executable was **not** evidence that the service was unavailable. No restart, deployment, configuration change, database operation or account credential was used.

## Current auction compatibility fails

`live-worker-probe.json`: a current request with `actionListMode: "native"` returns HTTP 400 `invalid_request` in 70.6 ms. The same public bundled Fury specialization with an explicit legacy custom rule list is accepted. This does not support falling back to a custom APL in the auction product.

`live-worker-legacy-probe.json`: HTTP 201 in 1168.1 ms, engine `SimulationCraft 1210-01 · 18428cd`, 750 iterations, confidence 95, DPS error 462.957. `dpsMean` is absent, whereas the current auction measurement validator requires it. No `Server-Timing` is returned. Thus the running service is not compatible with the current checkout's native auction contract and does not expose queue/native durations. Updating it requires a separately authorized deployment; this task did not perform one.

## Bounded concurrency experiment

`live-worker-benchmark.mjs` uses exactly the same 30-second, one-target public bundled Fury profile, legacy rule list and unchanged precision for every request. There is no client result cache, no server cache flush, no user character, no attempt to change the worker permit count. Planned upper bound: five paired repetitions, two requests per batch, concurrency 1 then 2 with order alternating per repetition; 500 ms between batches. Each request has a 15-second timeout. Any error stops subsequent batches after all current requests settle.

The first concurrency-2 batch failed, so execution stopped after four requests instead of running twenty:

| Batch | Complete successful simulations | Observed wall time | Outcome |
|---|---:|---:|---|
| concurrency 1 | 2/2 | 2095.1 ms | Both HTTP 201 |
| concurrency 2 | 1/2 | 947.2 ms | One HTTP 201; other HTTP 503 `simulation_unavailable` after 15.5 ms |

The faster failed batch is **not** a throughput improvement. There is only one attempted batch per setting; no median/range/p95 or general performance conclusion is warranted. The HTTP failure does not independently establish its precise internal cause. All three successful benchmark responses report the same engine/750 iterations/95% confidence, no `dpsMean`, and no timing header. The current deployment provides no evidence for enabling concurrency 2; keep 1.

Raw results: `live-worker-results.json`. Quiet log: `.artifacts/logs/auction-live-worker-concurrency-20261113-194648.log`. The benchmark exits 1 intentionally when it encounters a failed request. This is service evidence, not a failing unit test. No requests remain in flight.

Reproduce explicitly (this sends bounded requests to an existing local worker):

```sh
npm run quiet -- auction-live-worker-concurrency -- node apps/web/tests/auction/performance/live-worker-benchmark.mjs
```

This is neither a before/after deployment comparison nor a cold/warm application-cache benchmark. Existing synthetic cache fixtures remain the evidence for cache behavior. Native queue time, compute-only time, process CPU/memory and other clients' load were not observable here.
