# Auction performance handoff

Follow-up: `live-worker-report.md` supersedes the inference that native measurement was unavailable merely because no binary was visible. The running endpoint supports a legacy request but not the current auction contract. New runtime changes and verification are documented in `docs/reports/auction-followup-20261113.md`; historical before/after hashes below remain historical.

Workspace: `/home/debian/Gildra-atlas` (authorized shared fallback, no worktree).
Base: `e3cc7e82f4d2171b8a5cf3fc775640236c49c769`; no base divergence at start. No commits, pushes, production changes or purchases.

Owned changes:
- `apps/web/lib/wow/auctionGearRunner.ts`: cooperative ten-second turns, five-second discovery share, retained alternating phase; initial 12 / continuation four discovery batches; callback path advances one comparison and flushes/publishes before the next. Runner subsequently handed to root for scenario/cost integration.
- `apps/web/lib/wow/auctionGearJobs.ts`: fenced running-result publication, no expired-job resurrection, preserve explicit encounter settings.
- `apps/web/lib/wow/auctionGearSearchStore.ts`: persist scheduling phase.
- `apps/web/lib/wow/auctionGearWork.ts`: recovered tasks wire publication callbacks.
- `apps/web/lib/wow/auctionGearDiagnostics.ts`: opt-in private timing/counter collector; wired into Jobs queue/task timing with separate abort/timeout/error counts; owner-scoped internal accessor, no public response telemetry.
- `apps/web/tests/auction/completion/priority-refresh.test.mjs`: replace former batch-size assumptions with pending-pool prerequisites, retain priority/convergence/dedup assertions.
- `backend/internal/rotationlab/engine_admission.go`, `simc.go`, `gear_variants.go`, `worker_handler.go`, `worker_timing.go`, `worker_timing_test.go`: request-local queue/native Server-Timing, including failures, preserving capacity and race behavior.
- This directory: `benchmark.py`, `concurrency-benchmark.mjs`, `first-result-benchmark.mjs`, `first-result-results.json`, `intent-restart.test.mjs`, `diagnostics.test.mjs`, `fair-turns.test.mjs`, `job-publication.test.mjs`, `before-after-results.json`, `before-after-prior-results.json`, `concurrency-results.json`, `README.md`.

Reproduce through quiet wrapper:

```sh
node scripts/quiet.mjs auction-before-after -- python3 apps/web/tests/auction/performance/benchmark.py
node scripts/quiet.mjs auction-concurrency -- node --experimental-transform-types --no-warnings apps/web/tests/auction/performance/concurrency-benchmark.mjs
node scripts/quiet.mjs auction-performance -- node --experimental-transform-types --no-warnings --import ./apps/web/tests/auction/resolve.mjs --test apps/web/tests/auction/performance/*.test.mjs
```

Before harness extracts tracked HEAD sources into a temporary directory and reuses installed dependencies. It does not switch branches or modify checkout state. Five cold-process runs per version execute warm/cold fixture assertions. Saved before/after results include final publication-loop and coordinator Runner instrumentation; runnerHash identifies the measured source and runnerUnchanged confirms stability during the five repetitions. These are synthetic transport tests with real Runner/catalog/persistence, not live speedup evidence.

Concurrency fixture has one serialized timer worker, a 20ms competing task and eight 10ms tasks (four cached warm). Records queue/compute durations, first comparison, steps, cache/error/comparison counts and total. This tests scheduling accounting only: neither native precision nor real worker saturation is measured. Backend remains one native permit, eight waiters, five-second admission timeout. Native executable was not found in inspected local paths. Worker now emits queue/native Server-Timing on standalone handler routes; native wraps process execution, not fetch. Database-backed service routes are not wrapped.

Checks passed: publication and fairness tests (including first result while next call pending); diagnostics test; lifecycle/restart/queue reservation suite 8/8; cancellation admission 7/7; worker Admission tests; priority-refresh; five-run fixture before/after. Initial strip-only invocation was invalid for project parameter properties; use transform-types. Active-recovery integration initially failed three assertions because route injected optional defaults; reported to quality owner. Full integration gate remains coordinator-owned. Own explicit encounter/compareScenarios disk-restart test passes.

Integration: changes are already in shared checkout; do NOT reapply a patch. Preserve other owners' edits. For transfer, export an explicit-path `git diff --binary` for owned tracked files and separately include new files above; do not capture unrelated shared changes. API route callbacks must pass `hooks.publishResult` as final argument to start/continue/assemble. UI must retain polling while status is running, inspect result.kind, and fence current job/search/scenario. No uncontrolled Promise.race. Native calls remain non-preemptible beyond their existing abort contracts, so cooperative turn budget is not a hard response deadline.

Final helper contract: simulation(), candidates(count), duration("simulation", ms), workerTiming(trustedHeader). Simulation includes transport/queue/native. Unknown native compute and workerQueue remain null. Worker header format: queue;dur=2.125, native;dur=37.500 (milliseconds). Job diagnostics are process-local and owner-scoped, not restart-persisted telemetry.

The first-result harness extracts actual HEAD/current Runner orchestration and substitutes a planner boundary with fixed 20ms/200ms comparison delays. It measures time to publication before the second call completes; this is scheduling evidence, not native throughput. Explicit compareScenarios and encounter fields have a separate actual disk-restart/form-intent test.

Final checks: integrated performance tests 7/7, diagnostics outcomes 3/3 (overlapping diagnostics coverage), full rotationlab suite, final 5x before/after fixture suite all passed. Results include shared-host contention; ranges overlap and no live/native speedup is claimed.

Production Runner firstComparisonMs starts when snapshot context is created, before market/bootstrap work but after Battle.net character/snapshot fetch. The isolated first-result benchmark starts immediately before executing extracted continuation orchestration and includes VM setup; its clock scope is narrower and must not be compared as end-to-end HTTP latency.

Final report status: complete. Measured Runner SHA-256 is `8e4ac0d035035c8334486903fc81809891a69d7d1ead10d7e4808df111cd411e`, matching `before-after-results.json`; see the post-measurement assembly-only change below.

Measurement history is retained explicitly:
- Earlier integrated source `d96c0d4aea7e0c7cfbb7254deae239cc6898f2e6b996607a32d4e94640c350fd` measured median suite time 5.391s before versus 7.959s after: an observed regression in that run. Ranges were 4.781–8.212s and 7.211–10.713s. See `before-after-prior-results.json`.
- Final source above measured median suite time 9.738s before versus 6.927s after, ranges 7.066–10.685s and 6.519–9.477s. The direction changed under shared-host load and the ranges overlap. Neither run establishes an overall speedup; the earlier regression is not discarded or attributed conclusively to host load.
- Controlled first-result fixture measured median 269.921ms before versus 27.983ms after (ranges 222.477–281.952ms and 22.822–71.852ms). This demonstrates publication before a synthetic delayed second comparison, not faster overall computation or live latency.

Cancellation coverage: job-publication.test.mjs cancels a running task, rejects a subsequent publishResult call, then lets the held task resolve and verifies it remains cancelled. Durable intent coverage: intent-restart.test.mjs uses separate processes and disk persistence, verifies compareScenarios/duration/targets, and checks returned form mutations do not alter retained work.

Post-measurement coordinator change: final Runner adds assembly-only starvation prevention using persisted nextAssemblyPhase, skipping discovery on the next assembly turn when a prior slow discovery exhausted its budget. The measured warm-search and initial-result paths are unchanged; these harnesses do not exercise that assembly fairness path. No benchmark rerun was performed for this unrelated path. The exact measured Runner SHA-256 remains `8e4ac0d035035c8334486903fc81809891a69d7d1ead10d7e4808df111cd411e`; it must not be described as the final post-fix source hash. The coordinator/test-map owns the additional assembly regression test.
