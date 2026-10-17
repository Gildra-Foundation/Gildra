# Auction planner: five regression fixes and faster repeated searches

This release fixes five reproduced defects and removes repeated catalog work from the auction planner. The same budget written as `10000`, `10000.` or `10000.0` preserves completed results. Invalid draft text keeps the last valid result visible while preventing new work until the budget is valid. A genuinely different valid amount starts a separate search.

Cancellation acknowledgements now require a successful durable write on every retry, including reads and replayed requests. A failed write returns a retryable error rather than acknowledging cancellation held only in memory. Restart trimming also preserves search checkpoints referenced by queued or running jobs when a process exits between publishing a replacement checkpoint and deleting its victim.

Pinned item tooltips remain inside the viewport after rotation and resize. Long pinned tooltips can scroll, and the close control remains reachable. Native simulation responses retain their existing rounded `dps` and add the full `dpsMean`. Improvement and uncertainty calculations use that mean and the unrounded standard error, preventing rounding from creating a false significant upgrade. A separate precision fence invalidates old rounded calculation results while preserving cancellation acknowledgements and admission history.

Repeated searches reuse only bounded, cloned public catalog facts for sixty seconds. Market prices, quantities, eligibility and resolved variants remain fresh. Equipment lookup avoids unused English acquisition-source requests, and warmed catalog lookups let checkpoint serialization coalesce. Tests cover price/quantity changes, sold auctions, new variants, engine and slot changes, origin and locale isolation, aborts, cache bounds and serialization limits.

## Verification and publication

Final runtime source: `a1f93cbc06788f9b51314c5b3e0ceccbfef25af3`. Both web and native worker were built from one clean Git archive. The source retains the existing production ancestry. The independently developed, unpublished page-content transition was excluded after its cold-network QA failed; its branch and original evidence remain preserved for a separate release.

Source-bound gates: **50/50 offline suites, 280/280 completion UI and 84/84 legacy UI cases**. The new scenarios are included in those counts. TypeScript, scoped lint, atlas tokens, route parity and route mirrors passed. Lint has zero errors and seven warnings. Independent checks exercised actual executor failure/rollback paths and closed motion-evidence gates.

Two earlier full-suite attempts were rejected: one exceeded the unchanged persistence-test deadline under concurrent host load; another exposed a maintained standalone test fixture missing the new native measurement import and response mean. The fixture was corrected without changing its assertions. A subsequent full run on the final source passed all fifty suites. The original logs and the source-integration cancellation remain preserved separately.

Fresh **Elkardia, level81, Eversong EU**, single target, budget **10,000 gold**, passed both objectives. The baseline mean is **20,222.083009 DPS**.

| Objective | Confirmed purchases | Cost | DPS mean | Improvement |
| --- | --- | ---: | ---: | ---: |
| Price/DPS | Кровокаленые наголенники (237917) | 22 gold | 20,966.234970 | +744.151961 / +3.6799% |
| Maximum DPS | Кровокаленый нагрудник (237918) + наголенники, different auction variant | 893.72 gold | 21,868.209701 | +1646.126692 / +8.1402% |

Both gains exceed the 95% simulation uncertainty margin of83 DPS. Exact auction IDs, bonus/modifier variants and quantities are retained in the frozen DTOs. The search remains explicitly non-exhaustive. These are confirmed improvements within the inspected domain; the continuation control checks additional combinations.

Initial partial results took **9.44 seconds**. Warm searches with changed budgets9,000/8,000/7,000 took **0.836 /0.795 /0.715 seconds** (median0.795). Each made three HTTP requests, zero catalog requests and zero new DPS simulations; checkpoint serialization fell from13 passes in the earlier audit to3, around14.9–15.5MB per repeat. The earlier isolated warm audit measured about2.6–3 seconds and91–93 HTTP calls. These are server-side measurements on a shared host with warmed catalog facts, not end-to-end browser timings or a latency guarantee. The catalog cache expires after sixty seconds; market facts and variant resolution are not reused through that cache.

**4/4 fresh actual-DTO UI cases** passed in EN/RU at390px touch and1440px. All15 product file hashes and6 owned test/document hashes match the committed source; original older report revisions remain intact and are linked by the final byte binding. Replay checked exact item/cost/DPS values, both objectives, exclusions, equivalent budget typing, incomplete-search wording and a pinned tooltip after portrait-to-landscape rotation. All32 screenshots were hashed; representative RU mobile/desktop/landscape screenshots were visually reviewed. Real calculation uses public character and market data with private verification state. This evidence does not claim access to an authenticated production account/browser.

After deployment, **four uncached native calls** through the actual new production worker reconfirmed the baseline and the complete selected loadout for each objective. The publicly served planner JavaScript matches the installed web image byte for byte. Published anonymous EN/RU character pages return200 with no JavaScript errors or horizontal overflow. A further bounded continuation after publication made **7 new native simulations** through the actual production worker, verified current profile/market facts, retained the confirmed value result and respected budget and unique-auction quantities. The pre-deployment continuation also passed with7 native simulations.


Production was verified at **2026-10-17T23:12:13+02:00 (Europe/Warsaw)**. Both new target containers stayed healthy with **zero restarts** over **122.93seconds /13 samples**, with **zero runtime-error matches**. All8 protected containers retained their IDs, images, start times, restart counts and health/status. Only the two owned QA containers were removed after the evidence had been archived. The verified operation ledger and final result are archived with the source/image/QA/rollback evidence.

A preparation-only attempt was rejected before any production mutation because the UI freeze producer and release consumer used different manifest field names. Exact-map aliases were added only after checking all21 source hashes; the original manifest and failed preparation were preserved. The actual-DTO provenance mapping likewise preserves its original inputs and SHA while binding all5 original/copy byte pairs. No source or test result was altered to satisfy those metadata contracts.

## Release identity and recovery

Runtime source: `a1f93cbc06788f9b51314c5b3e0ceccbfef25af3`. Code commits [9bc9966](https://github.com/Gildra-Foundation/Gildra/commit/9bc99662521d66ce643783388e4ea6294bb62acd) and [a1f93cb](https://github.com/Gildra-Foundation/Gildra/commit/a1f93cbc06788f9b51314c5b3e0ceccbfef25af3) were pushed to `master` and `fix/auction-value-speed-20261017`; GitHub verifies Shpuntyara as author and committer of both. Source tag: `release/auction-five-speed-20261017-a1f93cb`.

Web image: `sha256:5e3b54a3b328de682aaf2071bb0c0b91b0558cac51703c8b81fa6d4d92e4b277`. Native worker image: `sha256:a98dc5d17aa74f0261123c110e73201f7b2cf06b5813ed7fa1674e96220a9d70`, SimC1210-01 /18428cd3902412abc8ee274d19567d603e674e66. The worker retains2CPUs,2GB and a read-only filesystem, with no database connection or mounts.

The exact images passed isolated seven-route, nine-asset and eight-auth-boundary checks. All2,925 source archive entries matched the clean tested worktree. The immutable plan freezes all current QA reports and five exact actual-character DTOs with their provenance. Source hashes, full native means and standard errors were checked against40 real wire measurements. No database schema/data migration, API/import restart or production-checkpoint QA access was used.

Release archive: `/opt/gildra/releases/auction-five-speed-release-20261017-a1f93cb`. Rollback uses its frozen `rollout.py --rollback` and the byte-exact previous manifest `/opt/gildra/auction-five-speed-release-20261017-a1f93cb-previous.env`, restoring web before the worker. The previous images and runtime metadata remain available; no database restore is required. Existing cancellation acknowledgements and rate history remain compatible. Previously rounded simulation results require a fresh search under the precision fence.

This documentation-only commit records the completed release; the running application source remains `a1f93cbc06788f9b51314c5b3e0ceccbfef25af3`.
