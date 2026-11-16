# Exact auction selection performance — 16 November 2026

The quick/full search policy is unchanged. This change executes the same native comparisons and exact procurement work more efficiently.

## Independent native comparisons

The worker can admit two separate SimulationCraft processes within its existing two-CPU/2-GiB limit. `SIMC_CONCURRENCY` defaults to one, accepts only one or two, and Compose explicitly selects two. Both DPS and metadata requests share these permits and the existing bounded queue. Each process retains `threads=1`, deterministic settings, 750 configured iterations, native APL, and full precision. Changing the number of threads inside a simulation was deliberately not used.

The auction search may overlap at most two distinct, compatible effects. It skips duplicate lots during bounded lookahead, respects the remaining simulation and assignment budgets, drains cancelled siblings, and persists successful measurements even if their sibling fails. The cursor cannot skip a failed effect. The first useful comparison still has its own durable publication. Assembly enumeration remains sequential.

The worker health response advertises actual process capacity. The simulator adapter rechecks this lightweight endpoint before each search batch. Missing/unknown capacity or an unavailable probe selects one; cancellation propagates. Capacity is never persisted, so a warm search can continue after a rollback to a legacy one-permit worker without repeatedly overflowing its queue.

Three alternating isolated native batch pairs (public Fury reference, no network/account, two CPU/two GiB) measured median batch wall time **6.451 s sequential → 3.718 s parallel (42.4% less)**. All twelve DPS means, standard errors, sample counts, confidence settings, and engine identities matched exactly. Peak cgroup memory rose from about 113 MB to 205 MB; median CPU cost rose from 6.447 s to 7.238 s. This is a two-comparison throughput result, not a whole-search or authenticated-user latency measurement.

An additional integration benchmark compiled the updated Go worker and exercised real HTTP requests with two distinct public-fixture loadouts. Across three alternating pairs, batch median fell **8.031 s → 4.513 s (43.8% less)**. All 12 simulation requests succeeded; per-input mean, standard error and native sample count were identical, health advertised two permits, and in-flight cancellation drained. An earlier repeat measured 36.9% less time; absolute timing varies with shared-host load. Neither result is a live-account search measurement.

## Exact lot allocation

Partition lots into their connected slot components once. Independent single slots use a direct cheapest-feasible selection; overlapping ring/weapon lots retain exact subset dynamic programming. Quantity, budget, invalid-cost checks, tie ordering, and cooperative cancellation remain.

Five paired runs of 250 allocations across 16 slots measured 303.46→56.74ms for 640 independent lots and 306.60→118.45ms for 560 lots including overlapping rings/weapons (81.3%/61.4% less).720 randomized comparisons against the previous implementation and 100 independent brute-force cases returned identical purchases and costs. These are component measurements, not native or end-to-end claims.

## Rejected experiment

Compact native reports reduced JSON 481975→17630bytes and Go decoding/projection by about 10.8 ms, but native wall medians were 3.130 s full versus 3.259 s compact. No convincing whole-operation improvement: report settings and API projection were left unchanged.

## Validation

TypeScript and targeted ESLint pass. Gear-planner 17 suites and auction-reliability 63 suites pass. Performance contracts: 56 passed, one optional timing benchmark skipped. Rotationlab tests pass with the race detector, including capacity, queue saturation, shared metadata admission, cancellation and timeout. CI now runs the offline performance contracts. Additional actual-worker integration evidence is recorded with the release report.

A language rewrite is not justified by these measurements: numerical simulation already runs in C++, the native worker is Go, and the identified bottlenecks were serialized independent work and repeated exact allocation overhead.
