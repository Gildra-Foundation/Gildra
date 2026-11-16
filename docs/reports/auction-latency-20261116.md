# Auction selection latency — 16 November 2026

The reported production auction search was slow. A read-only sample showed the web process near one CPU while the native worker was idle at that instant; this is not proof of sustained native utilization. A retained search contained 376 candidate variants and 714 visible options. A separate serialization sample of its 8 MB checkpoint took approximately102 ms, with gzip approximately75 ms. No character identity, credentials or checkpoint contents are published here.

## Changes

- Keep the first useful comparison immediate, then process the remaining per-turn simulation budget together. Avoid rebuilding and persisting every visible lot after each individual comparison. Existing initial3/subsequent8 budgets, cooperative deadline, final durable flush and cancellation remain.
- Cache derived discovery options between unchanged batches, count matched lots directly, and fill subsequent metadata requests with8 candidates plus at most8 reference controls. First-result batches remain4. No candidates are removed.
- After fresh ownership verification, fetch current armory and refreshed market concurrently. Both must pass validation before adopting either; no freshness TTL is weakened.

## Evidence and limitations

Controlled synthetic transport/native-result fixtures exercise real planner and persistence code; these are not end-to-end production latency measurements.

| Workload | Before | After |
| --- | --- | --- |
| 376variants/752lots,300 derived reads, median |526 ms|90 ms|
| Metadata requests for same full domain |94|47|
| 900lots,8 new comparisons, planner passes |8|1|
| Same turn, durable writes/publications |9|2|
| Same turn, measured wall median (local rerun) |360 ms|81 ms|
| Fresh ownership+armory+market,30ms synthetic dependencies |91 ms|61 ms|

All900 result comparisons match. Native simulation count and precision are unchanged. First-result durability, cancellation/resume, price/quantity refresh, missing/changed ownership and profile/realm rejection are tested. The frozen former continuation fixture makes the comparison reproducible without Git history. Historical discovery timings are opt-in with AUCTION_DISCOVERY_BENCHMARK_BASE=37f3cfbea1ea7374b9d0b8efef11e8b8cdb76e86.

Validation: auction gear suites, TypeScript, targeted ESLint and38 performance tests pass. The broader reliability suite exposed an outdated farm test harness; it now binds the current real settings/rules helpers while retaining native-APL assertions (3/3 pass).

Reproduce performance regression gates from apps/web:

```sh
node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs --test tests/auction/performance/*.test.mjs
```

Exhaustive native comparisons still dominate large candidate pools. These changes remove repeated work; they do not claim an instant globally optimal result or a measured whole-search speedup.
