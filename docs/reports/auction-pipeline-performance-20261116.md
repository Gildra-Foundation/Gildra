# Auction pipeline performance, 16 November 2026

The auction pipeline now loads the same catalog and item facts with less idle network time, avoids duplicate serialization of clean checkpoints, and omits worker-capacity requests when no parallel comparison can run. Native precision, candidate coverage, freshness/ownership checks and exhaustive cursors are unchanged.

## Scheduling and durability

- Catalog chunks contain 800 IDs: complete 100-ID pages fill the existing four-request limit in two waves. A 4,603-ID fixture still sends 47 catalog requests, but no longer leaves the second wave mostly idle on every chunk.
- Item references use a rolling pool of four requests. A failed request cancels and drains its siblings; region/locale cache scope and TTL are unchanged.
- `scheduleAuctionGearSearchSave` marks dirty revisions. `flushPendingAuctionGearSearch` waits for all marked revisions without manufacturing another write. Existing `flushAuctionGearSearch` remains a force-save API. Runner phase changes are explicitly marked; direct verifier/scenario/enhancement mutations retain force-save barriers.
- Render-only and single-simulation updates use concurrency one without a health round trip. Real parallel batches still query live worker capacity, including after worker downgrade.

## Controlled measurements

These are synthetic-input measurements through actual production code, not authenticated account or production timing claims.

| Segment | Before | After | Invariants |
|---|---:|---:|---|
| Discovery, first candidates | 769 ms | 529 ms | Same input and candidate priority |
| Complete discovery | 2,045 ms | 1,783 ms | Same 752 options, coverage, 47 catalog / 376 detail / 376 reference / 95 native metadata requests |
| Eight references with uneven responses | 162 ms | 90 ms | Eight requests; peak concurrency four |
| Two checkpoint barriers, 60,000 offers and 900 result rows | 705 ms | 329 ms | Same restored data; serializations/writes two → one |

Times are local medians and vary with host load. A preceding checkpoint run measured 727 → 386 ms. The robust invariant is removal of one whole serialization/compression/atomic write when state is already durable. A final phase change still requires a write. No timing thresholds are used as correctness tests.

## Whole client loop

An offline harness executes the actual component's `run()` loop, client polling, run policy, job queue, runner, planner and disk persistence. Upstream/HTTP/native responses have explicit synthetic delays; there is no DOM, authenticated account or native process. Baseline sources come from commit `e6edaa47985e8a689ca29bf706f626fa313a52e1`; shared unchanged sources are checked byte-for-byte. Each mode/profile was repeated three times with 24 verified variants and 25 simulation fixture calls. Timings below start at the first POST dispatch, excluding fixture setup.

| Synthetic timing profile | Mode | Baseline total | Current total |
|---|---|---:|---:|
| Native 80 ms, health 25 ms | Quick | 2.43 s | 2.43 s |
| Native 80 ms, health 25 ms | Full | 2.44 s | 2.43 s |
| Native 300 ms, health 5 ms | Quick | 10.32 s | 8.80 s |
| Native 300 ms, health 5 ms | Full | 7.56 s | 7.57 s |

Health requests fell from 11 to 2 in quick mode and 7 to 3 in full mode. Polling quantization masks server savings in the fast fixture; in the slower quick fixture one 1,500-ms polling interval disappears. This is not a general 15% production speedup: the full-mode totals are unchanged and the fixture is too small to exercise the catalog batching gain. Native calls, complete variant coverage, final measurements and selected loadouts remain equal. An earlier client observation may contain an earlier partial snapshot: first browser-observed snapshot identity is not asserted equal. Poll delays overlap server work and are not additive idle time.

To reproduce from `apps/web` (baseline Git object must exist locally; script never fetches):

```sh
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/performance/pipeline-phase-benchmark.mjs baseline
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/performance/pipeline-phase-benchmark.mjs current
```

Set `AUCTION_PIPELINE_HEALTH_MS=5 AUCTION_PIPELINE_NATIVE_MS=300 AUCTION_PIPELINE_LABEL=controlled-native300` for the second profile. Reports include source hashes and distinguish server publication from client observation.

## Diagnostics

Private per-run `stages` record ownership, armory, market, equipped metadata, catalog, details, references, variants, capacity, search, assembly, enhancements, scenarios and checkpoint waits. `operationMs` sums requests; `wallMs` measures the union of overlapping work within a stage. Parent stages include children: do not add different stages to calculate end-to-end time. `totalMs` includes time between continuations; job diagnostics separately expose queue/task time. Diagnostics retain no request inputs/results or identity and logging remains opt-in through `AUCTION_GEAR_DIAGNOSTICS=1`.

Production diagnostics were disabled during investigation, so no live per-stage attribution is claimed. Browser poll sleeps overlap server work and must not be counted wholesale as idle time.

## Verification

Run from repository root:

```sh
npm run typecheck
npm run test:gear-planner
npm run test:auction-reliability -w @gildra/web
```

Run from `apps/web`:

```sh
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs --test tests/auction/performance/*.test.mjs
```

New checks cover rolling-pool refill/cancellation/cache isolation, full discovery across more than 10,000 IDs, exact restored checkpoints, concurrent write failures, mutations during compression, deleted-state resurrection, phase recovery, and live-capacity downgrade. Optional wall-time benchmarks are evidence rather than acceptance thresholds.
