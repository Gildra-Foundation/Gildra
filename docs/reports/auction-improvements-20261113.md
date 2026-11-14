# Auction selection implementation — 2026-11-13

Follow-up correction: see [auction-followup-20261113.md](auction-followup-20261113.md). Additional runtime gaps were fixed after this initial report. A reachable live worker was found, but rejects the current native request and lacks dpsMean; live legacy concurrency testing also found a rejected concurrent request. The initial report is not a completion claim for the full enhancement pipeline.

Base: `e3cc7e82`. Integrated uncommitted changes in the shared project. No deployment, purchases, commits or pushes.

## Implemented

- Existing durable jobs publish each completed comparison while remaining running; UI consumes partial results with job/search/full encounter identity guards. Cancellation fences late publication. Cooperative steps retain discovery/simulation scheduling phase; the 10-second step budget is not a hard worker-completion deadline.
- Existing combinations, quantity-aware equipment lots, compatibility and significance checks retained.
- Duration 30–300 seconds, AoE targets 1–8; existing presets preserved. User-selected extra scenarios (maximum three) compare measured/confirmed finalists after exhaustive traversal, each against its own baseline. No implicit average score. Primary results publish before extra work. Exact configuration/engine/profile keys persist scenario simulation results across continuation.
- Private diagnostics measure discovery, jobs queue/task, simulation transport/body/validation, native worker admission and process execution when Server-Timing is available, counters and outcomes. Missing native timing remains null. Run diagnostics are process-local; first-comparison clock starts at snapshot-context creation, after character/snapshot lookup. Job timing covers its full task. No tokens or character identity are emitted.
- Real commodity quote adapter exposes exact ladders without the display median tail; quantity-aware quote helper rejects unknown/insufficient prices. Existing installed improvements remain with retained items; no bag inventory credit is inferred.

## Explicitly blocked scope

Automatic item + gem + enchant configuration optimization is NOT delivered. Existing item/native metadata does not establish exact socket count/types, consumable-item to enchantment mapping, profession/unique enhancement restrictions or authoritative applicability. The pricing helper therefore never certifies requested enhancements; product results expose item cost and unknown full enhancement cost. The quote adapter/helper are tested foundations, not a connected automatic recommendation pipeline. Closing this requires an authoritative rule adapter and verified consumable IDs before candidate expansion and simulation. No fabricated prices or compatibility.

Tank/healer survival/healing objectives are NOT implemented. The current auction runner remains damage-specialization-only; native healer execution explicitly rejects unsupported combat models. No HPS/survival metric contract exists. UI states the DPS limitation. Supporting these goals needs validated encounter/triage/incoming-damage models, native metrics and uncertainty extraction, objective ranking and fixtures.

## Measurements

See `apps/web/tests/auction/performance/*results.json` and README for repeat samples and commands. Five repeats, medians and min–max only; no p95. Fixed synthetic delays and identical precision contracts; native/live performance and precision are unmeasured. Shared-host load changes suite runtime, so no general speedup is claimed. Concurrency stays one: worker has one active permit and bounded admission; the 1/2 client test uses a serialized timer stub, not actual two-process native execution.

## Validation

- Offline completion gate: 56/58 suites passed in the full run (`.artifacts/auction-completion-20261016/offline-1794597270430/summary.json`). Both failures were investigated and their suites subsequently passed: active-recovery fixture corrected to the compatible AoE 60-second preset (9/9), and the pre-existing stale roster ownership bug fixed without weakening assertions. This is a full run plus targeted reruns, not a second all-green full run.
- API final: 102 HTTP responses + 16 freshness/abort checks + 2 blocked-profile cancellation cases passed (`.artifacts/logs/auction-ownership-final-20261113-192740.log`). Default roster caching remains unchanged; authorization uses explicit no-store and no stale fallback. Independent review found no blocking issue.
- New scenario integration 2/2; assembly fairness 7/7; performance 7/7; full Go rotationlab suite passed. Existing combination, stock, uniqueness, significance, cache isolation and persistence checks are retained.
- Typecheck passed; full lint passed with 0 errors and 280 existing warnings. Final scoped lint: 0 errors, 2 existing React hook warnings.
- Browser: error-state coverage passed; final EN/RU × 390/1440 matrix 4/4 passed against real components with synthetic transport. Includes partial running result, polling, recovery without duplicate POST, scenario settings, focus, reduced motion, finalist labels and overflow. `.artifacts/auction-reliability-20261016/quality-browser-fixed.json`; product hashes stable during that run; harness cleanup confirmed.
- Production builds passed, including the final frozen product snapshot (`.artifacts/logs/build-20261113-192741.log`, 1m5s). No live service deployment.
- Fresh roster regression tests 4/4 passed (`.artifacts/logs/roster-freshness-final-20261113-192836.log`); Valyro checks 8/8 passed.
- `git diff --check` passed. Strip-only Node invocations failed to load project parameter properties; successful test invocations use `--experimental-transform-types`.

## Recorded fixture results

Five repetitions, median [min–max]; fixed inputs/precision contracts. No p95 and no live/native claim.

| Fixture | Before | After |
|---|---:|---:|
| First publication, fixed 20/200ms comparison delays | 269.9 [222.5–282.0] ms | 28.0 [22.8–71.9] ms |
| Warm fixture suite, shared host | 9.738 [7.066–10.685] s | 6.927 [6.519–9.477] s |

Earlier suite run reversed direction (5.391 → 7.959 s); both runs are retained. Overall acceleration is not established. Exact measured source hash and later changes outside those measured paths are documented in the performance README.

| Serialized stub | Concurrency 1 | Concurrency 2 |
|---|---:|---:|
| Cold | 220.4 [104.8–269.4] ms | 210.3 [189.8–254.5] ms |
| Warm, four hits | 110.2 [89.9–158.4] ms | 99.5 [63.2–158.5] ms |

Concurrency stays 1. These overlapping stub measurements do not prove a benefit on the native resource.

## Additional chat findings and integration

- The implementation chats for performance and quality completed; their changes are integrated in the shared checkout, not pending branches.
- The repaired quality chat completed `auction-enhancement-source-audit-20261113.md`: DB2 projection code exists, but actual data and full rule contracts could not be verified. Missing socket/variant rules, consumable mapping and profession/category restrictions remain a concrete blocker.
- The repair chat completed `auction-ownership-cache-audit-20261113.md`. Its proposed narrow no-store fix was integrated and tested by the coordinator. The proposal file intentionally preserves its original pre-integration status.
- An old restarted performance chat was stopped to avoid duplicating the integrated implementation. Its uncommitted alternative remains preserved in its isolated worktree and must not be reapplied.
- Native test and independent review agents finished their assigned integration/review work. No commits or pushes.
