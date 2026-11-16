# Auction result delivery, 16 November 2026

A completed server step used to wait for the next browser poll (250 ms initially, then 1,500 ms). This delayed both visible results and the next automatic search/assembly step. Revision-aware long polling now returns immediately after a durable result or status publication. Planner policy, candidate coverage and native measurements are unchanged.

## Protocol

- Every public job view has an optional opaque runtime `revision`. Normal GET and existing clients retain their original behavior.
- An authenticated, same-origin GET with job `id`, character scope and `after=<revision>` waits only while that owned job is active and unchanged. A different revision or terminal state returns immediately.
- Successful publications within one event-loop turn share one `setImmediate` notification, so same-turn completion can replace a redundant intermediate response. No callback is scheduled without waiters. Cancellation, failure and storage errors wake urgently; the last reader leaving clears the pending notification. Cross-turn checkpoint I/O can still produce separate responses.
- A wait expires after five seconds and returns the latest progress. Progress ticks do not independently wake listeners. Timer/listener cleanup runs on completion, timeout, deletion, error and HTTP abort; disconnecting never cancels the independently owned calculation.
- Eight waiters per job and 256 globally bound memory. Excess waits return private `429 plan_wait_limit`; the client uses its previous bounded polling delay and a normal GET.
- Revisions are not persisted. Recovery generates a new token, so a client with an old process token gets current state immediately. Peers without revision support use legacy polling.
- Durable publication errors cannot acknowledge an unsaved result: prior valid result fields are retained and waiting readers see a terminal failure or storage error.
- Ordinary GET timeout remains ten seconds. Revision-aware GET allows fifteen seconds: five for the server hold plus the previous ten-second network/response budget. External cancellation remains immediate; reconnect attempts and backoff are unchanged.

No storage schema, ownership rule, native precision, queue concurrency or deployment infrastructure changes.

## Controlled whole-path measurement

Actual component request loop (without DOM paint), client, jobs, runner, planner and disk checkpoints. Only upstream/native/HTTP transport boundaries use explicit synthetic timings. Baseline is `b0a977b96dac1f005a5bcd2ee0fb48b8fe4c8463`; each final profile uses three runs per mode/version. Times begin at first POST, excluding fixture setup. All rows below use one-second native fixture calls and the final coalesced-notification implementation.

| Payload and transfer model | Mode | Before total | After total | GET count before → after |
|---|---|---:|---:|---:|
| 24 rows, fixed 10-ms RTT | Quick | 22.41 s | 17.52 s | 28 → 21 |
| 24 rows, fixed 10-ms RTT | Full | 19.66 s | 14.58 s | 27 → 20 |
| 960 rows, gzip, 1 MiB/s | Quick | 21.62 s | 18.33 s | 27 → 21 |
| 960 rows, gzip, 1 MiB/s | Full | 20.43 s | 15.30 s | 27 → 20 |
| 960 rows, uncompressed, 1 MiB/s | Quick | 24.30 s | 22.22 s | 23 → 21 |
| 960 rows, uncompressed, 1 MiB/s | Full | 20.66 s | 21.47 s | 22 → 20 |

Each run retains the same 24 mechanical effects, 25 native-fixture calls, exact final scores, selected loadout and exhaustive completion. The large profile contains 40 lots per effect, all 960 rows retained. Earlier client observation can see an earlier partial snapshot; first client-observed item identity is not asserted equal. These are delivery/orchestration measurements, not production-account latency or native-compute benchmarks.

The traffic tradeoff is material. Earlier uncoalesced experiments with very fast 80-ms calculations increased GET counts and response bytes because intermediate results were delivered rather than hidden between old polls. In the final one-second profile total bytes decrease 18.4%/28.5%; in the large gzip profile encoded bytes decrease 18.2%/31.4%. Do not claim universally fewer requests or a fixed production speedup.

The uncompressed large full-mode regression is repeatable (about 3.9%) and remains a documented worst case. Same-turn coalescing removes one 870 KB duplicate in quick mode; it does not merge publications separated by checkpoint I/O in full mode. On the deployed web container, `.next/required-server-files.json` has `compress:true`; installed Next middleware enables negotiated compression for JSON. Gzip-size transfer modeling is configuration-supported, but no authenticated production response was captured. Uncompressed results remain disclosed rather than discarded.

Attempts retained: bounded owned long polling (measured delivery/overall latency improvement), separate server-wait/network deadlines, same-turn notification coalescing (one fewer real quick-mode duplicate). A fixed arbitrary notification delay and changes to runner fairness/checkpoint sequencing were not introduced. Raw reports distinguish the historical immediate-notification candidate from the final coalesced implementation and preserve hashes for both.

## Verification and reproduction

Local checks: typecheck; targeted ESLint (zero errors, two pre-existing component dependency warnings); 17 planner suites; 66 reliability suites; 70 performance tests with one optional timing test skipped. The 39 focused transport/API/job-wait tests cover owner/scope/origin enforcement, missed-wakeup races, reconnect/rollback compatibility, abort without job cancellation, durable cancellation, both listener limits, five-second timeout, write failures, revision reset on restart, and preserved transfer deadline.

From `apps/web`:

```sh
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs --test tests/auction/completion/{api-long-poll,client-long-poll,job-wait}.test.mjs
AUCTION_PIPELINE_REPEATS=3 node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/performance/pipeline-phase-benchmark.mjs baseline
AUCTION_PIPELINE_REPEATS=3 node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs tests/auction/performance/pipeline-phase-benchmark.mjs current
```

Set `AUCTION_PIPELINE_LABEL=delivery-native1000 AUCTION_PIPELINE_HEALTH_MS=5 AUCTION_PIPELINE_NATIVE_MS=1000` for the longer profile. The benchmark checks frozen baseline code locally and does not fetch Git history or contact accounts/native processes. For the gzip stress profile also set `AUCTION_PIPELINE_LOTS_PER_EFFECT=40 AUCTION_PIPELINE_TRANSFER_BYTES_PER_SECOND=1048576 AUCTION_PIPELINE_TRANSFER_ENCODING=gzip`; use `identity` to reproduce the uncompressed worst case. Full reports include raw/encoded request/response bytes, first publication/observation, completion tails, source hashes and exact-result comparisons.
