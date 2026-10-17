# Auction recovery and repeated-search release

Deployed `auction-three-repeat-release-20261017-cf0f347` to gildra.net at 2026-10-17T23:40:01.236245+00:00.
Postdeployment verification completed at 2026-10-17T23:42:25.557278+00:00. The deployed application source is
`cf0f34741d0daded7891440e32e0e23916bb68c1`; the subsequent report-only commit does not require a rebuild.
The six new implementation/merge commits use Shpuntyara's GitHub noreply identity
for both author and committer. Existing published motion changes were merged and
preserved. Master and the feature branch were pushed normally without rewriting history.

## Fixed behavior

- An already completed job restored from storage no longer makes old prices look
  freshly verified. Price age is checked while the page remains open and when it
  regains focus. Active work observed from the server remains distinguishable even
  when it completes before the first poll, including recovery and retry paths.
- “Change parameters” safely retires background work and focuses the unlocked
  budget input. Existing results remain until the user edits the parameters.
  A failed cancellation retains ownership and offers retry.
- The global client retirement promise resolves to void, releasing completed
  Response objects and their history while retaining cancellation ordering.

Repeated searches poll the first four times at 250 ms, then at 1,500 ms. Durable
checkpoints coalesce asynchronous updates within a bounded 500 ms window; final
publication expedites and awaits the write. Positive raw catalog facts remain
warm for five minutes so a long initial calculation can reuse them; negative
lookups still expire after one minute. Current profile, market, item eligibility
and native variant checks remain part of each search.

## Fresh Элкардия check after deployment

Character: Элкардия, Eversong, level
81; Fury, single target, 120 seconds, 10,000-gold budget.
Fresh public Blizzard profile/realm auction data and the published native worker
produced these confirmed results:

| Objective | Set price, gold | Baseline DPS | Set DPS | Gain | 95% margin, DPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Value | 20.00 | 20222.083 | 20913.624 | +3.420% | ±84 |
| Maximum DPS | 843.76 | 20222.083 | 21757.289 | +7.592% | ±84 |

The first confirmed choices appeared after **6.668 s**.
Three warm searches, including changed budgets, published their first confirmed
choices after **0.642, 0.606, 0.625 s**, with **zero new DPS simulations** and respectively
2, 2, 2 durable snapshots. These are server calculation-stage measurements
after public snapshot resolution, not complete-market enumeration time or a
signed-in browser latency SLA. They are not a controlled percentage comparison
against earlier runs under different load.

Both set gains exceed the reported simulation uncertainty. Full native `dpsMean`
values match the comparison DTO exactly. Cost-per-additional-DPS ranking, up to
two alternatives, exact-variant exclusion, compatibility and budget checks passed.
The bounded search is not exhaustive and does not establish a global market optimum.

The live calculation runs host server functions whose bytes match the deployed
clean Git archive, using the actual production stateless worker and private fresh
QA state. Twelve UI replay cases use byte-identical real-character result DTOs.
Only their auth/job timing envelope is synthetic; no authenticated production
planner browser execution is claimed.

## Verification and production

- All 52 offline suites passed, including freshness boundaries, client Response
  release/order, asynchronous checkpoint coalescing, expedited final durability,
  warm catalog lifetimes, recovery, native precision and set selection.
- Full UI **308/308**, legacy **84/84**, and real-result replay **12/12** passed
  in EN/RU at 390 and 1440 pixels. TypeScript and scoped ESLint passed with zero
  errors; three pre-existing lint warnings remain.
- A prior overloaded run had 307 passes and one browser hydration setup timeout
  before any feature POST. Its trace remains preserved. The complete final
  308-case run passed with the normal two workers; no timeout or assertion was
  relaxed and no case was skipped.
- The exact Git archive image passed seven published-route checks, nine static
  asset hash/HTTP checks and eight anonymous/cross-site auth boundary checks in
  private staging and again during rollout.
- The public planner JS matched the image byte-for-byte: `c4b01d859b93d48fc4eea5659dce1e87614842c8edd5b5a9507b50622eb0da60`.
  Actual anonymous public character pages passed EN/RU mobile and desktop browser
  checks with no page errors or horizontal overflow.
- A 123.1-second, 13-sample observation found the
  new web healthy, zero restarts and zero runtime-error matches. Worker, API,
  CMS, database, cache, proxy and importer container identities and restart counts
  remained unchanged. Only web was recreated; existing nginx was reloaded.
- Private QA containers and listeners were removed by exact ownership checks.
  There were no schema migrations or data imports.

Web image: `sha256:362632f1d7d3e3f91d9d5f47d4bd6005839f9d99d32d5fa0d7a4a703783e2b75`.
Web container: `6589882d87e7f58c260cdf4324402e09ac66f949657ec52f21fa14710606ba7f`.

The source and report commits use `[skip ci]` to prevent the repository's CI-success
hook from initiating a separate full-service deployment; the local gates and the
guarded web-only deployment above were completed. See GitHub's
[skip-workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

Rollback preserves previous web image
`sha256:f0ff29842ac89c7081dafe54ba163054b2f1b36ca80e38a850b261b3dc585881` and the byte-exact manifest at
`/opt/gildra/auction-three-repeat-release-20261017-cf0f347-previous.env`. The guarded runner is
`/opt/gildra/releases/auction-three-repeat-release-20261017-cf0f347/rollout.py --rollback`.
No production rollback was needed. Private evidence is stored in
`.artifacts/auction-three-repeat-release-20261017/` and remains untracked.
