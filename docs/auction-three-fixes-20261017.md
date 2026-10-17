# Auction planner: cancellation, lifecycle and exact-budget fixes

This release fixes three reproducible issues in the auction planner. Changing only the spelling of a budget preserves results and exclusions. Leaving a character/profile/locale while discovery cancellation is pending prevents the detached controller from starting assembly. Pre-admission cancellation can use capacity occupied by completed results, and its owner limit is a rolling request rate rather than the number of acknowledgements retained for thirty minutes.

## Behavior and compatibility

- Budget normalization validates the existing input length, range and precision before removing leading integer zeros and trailing decimal zeros. It uses exact decimal text, with no floating-point rounding. `10000`, `10000.0`, RU `10000,0` and `010000` share the same canonical amount.
- The client checks ownership before admitting work and after asynchronous retirement barriers. Assembly rechecks ownership after discovery cancellation. Late responses for a retired request do not mutate another scope. A late successful cancellation or cleanup clears saved handles only if profile, job ID and request nonce still match. It preserves newer saved form intent and exclusions and cannot overwrite another snapshot.
- Cancellation and ordinary job admission share durable terminal-result replacement. Active work and unexpired cancellation acknowledgements are never replaceable. A process exit between the new record rename and old terminal deletion can leave 201 files; restart trimming now preserves acknowledgements and interrupted work ahead of terminal results. Search checkpoint trimming is unchanged.
- At most 60 new cancellation identities per owner may be admitted in a rolling minute. Existing identity retries and cancellation of accepted work remain available. Rate history restores from existing timestamps after restart. Acknowledgements remain valid for thirty minutes.
- The global retained-job limit remains 200. If every record is protected or active, new work and new cancellation both fail closed; acknowledged barriers are preserved. Underlying storage failures still prevent acknowledgement.

No public API, durable metadata schema, search/assembly checkpoint version, database schema or native worker contract changes are required. Previously published auction fixes and the current site performance release are retained in the source ancestry.

## Verification before publication

The regressions first reproduce the original defects, then test their corrected behavior. Coverage includes numeric-equivalent budgets, departure/snapshot/locale changes during delayed cancellation, late acknowledgements crossing a snapshot change, completed-result capacity, rolling quota boundaries and free retries, owner isolation, persistence failures and an actual process exit at the 201-file boundary.

Independent review additionally checks exact budget amounts against a BigInt reference and preserves a separate crash-boundary reproduction. Final source-bound full-suite, browser, real-character, image and deployment evidence is recorded in the release report below after execution.

## Release evidence

Published to [gildra.net](https://gildra.net/ru/wow/characters) and verified at **2026-10-17T21:15:23+02:00 (Europe/Warsaw)**.

- Application source: `2950e8e49f5b85cb7678ee20af58ea7ab6fb5e19`; immutable web image: `sha256:1bc12864fcf668c4739afe8b15637a137b156d88f7a9cc2480ce820c1708ccfd`. Code commits [f94b844](https://github.com/Gildra-Foundation/Gildra/commit/f94b8442a8fc11803f8d1b4838879cea72c5cc0b) and [2950e8e](https://github.com/Gildra-Foundation/Gildra/commit/2950e8e49f5b85cb7678ee20af58ea7ab6fb5e19) were pushed to `master` and `fix/auction-value-speed-20261017`. GitHub confirms **Shpuntyara** as author and committer of both. Source tag: `release/auction-three-fixes-20261017-2950e8e`.
- Final source-bound gates passed: **46/46 offline suites; 248/248 completion UI, 84/84 legacy UI and 4/4 fresh real-DTO UI cases**, across English/Russian and 390/1440px. The 44 new completion scenarios are included in 248, not counted twice. TypeScript, route parity/mirrors, atlas tokens and scoped lint passed; lint has zero errors and two existing warnings. Independent review checked exact decimal money against 15,014 BigInt-reference cases and the real process-exit persistence boundary.
- An earlier offline attempt passed 45/46 with empty child logs and was rejected. A separate sentinel proved that sandboxed Node child pipes suppressed output. The unchanged isolated API suite then passed 10/10, followed by the complete unchanged 46/46 run outside that sandbox, with all logs retained. The original exit-1 assertion cannot be recovered; an internal deadline under load remains an inference. Original failure evidence is preserved separately and was not used as a release gate.

Fresh public profile and market data confirmed **Elkardia, level81, Eversong EU**, baseline **20,222 DPS**, single target, budget **10,000 gold**:

| Objective | Confirmed purchases | Cost | Confirmed DPS | Improvement |
| --- | --- | ---: | ---: | ---: |
| Price/DPS | Кровокаленые наголенники (237917) | 32 gold | 20,943 | +721 / +3.5654% |
| Maximum DPS | Кровокаленый нагрудник (237918) + наголенники | 531.96 gold | 21,922 | +1700 / +8.4067% |

Both improvements exceed simulation uncertainty (83 and84 DPS margins). They were reconfirmed **after deployment with four uncached native calls** in total: baseline plus complete selected loadout for each objective. A further actual continuation made 5 native calls, checked additional combinations, preserved the confirmed value result and stayed within budget and unique-auction quantities. Search remains explicitly non-exhaustive; these results do not claim the global market optimum.

The fresh initial search took 15.40s in this run; the changed-budget repeat took 4.55s and reused existing DPS results. These are individual measurements under concurrent verification load, not a latency guarantee.

All 11 UI source hashes match the committed application, and all 2,916 source archive entries match the tested worktree. The immutable deployment plan freezes 15 QA files, including the exact five public-character DTOs and their copy provenance. Actual-component browser replay verifies both objectives, exact price/DPS/item identities, tooltips, exclusions and layout; published anonymous RU/EN character pages and the publicly served new planner JavaScript also passed checks. Real calculation uses the existing production native worker with private verification state. This evidence does not claim access to an authenticated production account/browser.

The exact image passed isolated seven-route, nine-asset, eight-auth-boundary and writable-private-state checks before deployment. Production web was healthy with zero restarts throughout the two-minute observation (13 samples), with zero matching runtime errors. All nine protected container IDs, images, start times and restart counts stayed unchanged. The owned QA container was removed after verification.

Release evidence and the verified operation ledger are archived at `/opt/gildra/releases/auction-three-fixes-release-20261017-2950e8e`. Rollback restores the previous immutable web image and the byte-exact manifest `/opt/gildra/auction-three-fixes-release-20261017-2950e8e-previous.env`; no database restore is required. This later documentation-only commit records the release; the running application source remains `2950e8e49f5b85cb7678ee20af58ea7ab6fb5e19`.
