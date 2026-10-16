# Auction reliability repair — implementation and verification plan

Base: `ff9bf1894963339256924cfbe43c0386cf47b90b` (runtime source `8a5f3eb`).
Branch: `fix/auction-reliability-20261016`.
Worktree: `/home/debian/Gildra-auction-reliability-20261016`.
Coordination session: `auction-reliability-20261016`.

The user requested regression tests first, then complete repair of the fourteen
findings from the detailed review. Original review proofs remain immutable in
the previous worktree's `.artifacts/auction-deep-review-20261016/`.
New execution evidence belongs to `.artifacts/auction-reliability-20261016/`.

## Completion criteria

- Every reproduced functional bug has a durable regression test that fails on
  the base code for the intended reason and passes with the repair.
- Useful full loadouts and confirmed purchases are available early. Partial
  traversal is never labelled a proven global maximum.
- Previously verified valid results survive pool changes, cancellation,
  transient transport errors and page reload, with price freshness explicit.
- Ownership, character scope, original server budget, actual lot quantities,
  compatibility, exact variants and native uncertainty remain enforced.
- Missing item properties remain explicit; base tooltip values never stand in
  for unverified scaled properties.
- Existing auction, gear simulation, API, discovery and store checks pass;
  TypeScript, lint, atlas, routes and production build pass.
- EN/RU browser regressions cover desktop/mobile, keyboard/focus, reduced
  motion, loading/empty/error/cancel/reconnect and reload recovery. No test
  routes enter the published application.
- Independent review examines the final contracts and failure paths. Final
  verification distinguishes synthetic regressions, replayed real results,
  fresh live native checks and authenticated browser checks.

## Test-first barrier

Before changing product code, record all desired-behaviour failures against the
unchanged base. Preserve per-case failures rather than stopping at the first
assertion. Tests must execute actual modules/components, with transport/data
fixtures clearly marked synthetic. Controls for already correct behaviour run
alongside the new cases. Root records the combined red baseline before releasing
the parallel implementation streams.

Barrier completed **2026-10-16 09:07:58 UTC**, unchanged base product:
56 cases, 41 expected behavioural failures, 15 passing controls. Separate
algorithm, market, item-presentation, root/API, Go-parser and browser proofs are
hashed in `.artifacts/auction-reliability-20261016/red-baseline.json`. Browser
baseline exercises all 13 regressions at EN390; final GREEN covers the full
52-case EN/RU × 390/1440 matrix. Setup failures were preserved separately and
excluded from the behavioural baseline.

## Finding matrix

| # | Desired behaviour / regression | Implementation owner |
| --- | --- | --- |
| 1 | Useful affordable 16-slot seed in the first bounded step; exhaustive domain retained | optimizer |
| 2 | Keep best measured and best confirmed separately; uncertainty cannot erase confirmed shopping | optimizer + UI |
| 3 | Pool growth preserves previous still-feasible compound incumbent after reallocation | optimizer + root runner |
| 4 | Exclude a lot directly from a confirmed shopping list; undo, multi-slot aliases and server ID checks | UI + root API |
| 5 | Cancel/error retains previous result with honest stale-price state | UI |
| 6 | Reload restores owned search/job, exclusions and results; expired/foreign/wrong-character recovery fails safely | UI + root API/store/jobs |
| 7 | Cosmetic/order-only snapshot changes preserve search; mechanical changes invalidate | root fingerprint + market tests |
| 8 | Poll timeout/retry reconnects to the same job without duplicate calculations | UI |
| 9 | Consumer cancellation releases queue without aborting another consumer's shared market request | market provider |
| 10 | Relisted unknown requirements remain counted as incomplete data | market discovery |
| 11 | Negative reference state retries after TTL and recovers affected variants | market discovery/reference |
| 12 | Simulation caches retain only the five required numeric/engine fields | root runner + optimizer |
| 13 | Tooltip conveys verified exact weapon/effect facts or explicit unavailable state | root item contract/render/native metadata if required |
| 14 | Known market/reference/presentation failures have localized causes and recovery actions | UI copy |

## Parallel ownership and contracts

All streams share this isolated worktree. The root owns coordination claims and
integration. Agents do not commit, push, deploy, or edit another stream's files.

- Optimizer: `auctionGearPlanner.ts`, `auctionGearEffects.ts`,
  `auctionGearTypes.ts`, optimizer regression files.
- Market: `auctionGearDiscovery.ts`, `auctionMarketProvider.ts`,
  `auctionItemReference.ts`, market regression files.
- UI: `AuctionGearOptimizer.tsx`, its stylesheet, `auctionGearClient.ts`,
  `auctionGearCopy.ts`, versioned UI tests and private-harness QA runner.
- Root: runner, fingerprint, store/jobs/API recovery and security tests, item
  presentation, integration, package scripts, documentation and release work.

Assembly adds `bestConfirmed` containing purchases, cost, remaining copper,
removed slots and comparison, or null. Existing result fields retain measured
maximum semantics. The UI clearly distinguishes actionable confirmed results
from an unconfirmed measured leader.

`AuctionGearIncumbent` stores per-slot effect identities plus a compact native
simulation. `captureAuctionGearIncumbents(checkpoint, oldOptions)` captures the
previous measured/confirmed choices before a cursor reset. The new planner
reallocates current allowed real lots and validates budget/compatibility before
reusing a measurement.

Market provider accepts `{refresh?, signal?}`. Shared upstream work and a
consumer's cancellation lifetime are distinct. Negative reference retry uses
bounded TTL/backoff and preserves verified mechanics.

Recovery uses owner-authenticated private/no-store GET with `searchId`,
`characterSlug`, and locale. It returns public search/result snapshots,
excluded option IDs, active job if any, and `needsRefresh:true`. Old prices are
never presented as newly validated. Opaque IDs stored in sessionStorage grant
no access without server ownership checks. Initial job recovery also validates
character/locale scope; no credentials enter browser persistence.

Exact weapon facts use `weapon:{minDamage,maxDamage,dps,speedSeconds}`;
`effects` contain only exact verified descriptions. Missing descriptions are
communicated explicitly. Native or reference extensions require their own
tests and build verification, never guessed numbers.

## Verification and publication sequence

1. Durable tests and preserved red baseline on unchanged base.
2. Parallel repairs, focused green checks and cross-stream integration.
3. Existing regressions, static checks, independent review and final UI QA.
4. Commit coherent verified increments, publish the branch, and preserve
   final source identity for build/native verification.
5. If publishing the completed feature under the user's standing deployment
   authorization: acquire production/service locks only after final artifacts
   are reviewable; verify current baseline, rollback and backup evidence; use
   the existing scoped release process and record postdeployment checks.

Deployment evidence is recorded separately from implementation completion;
do not claim signed-in browser verification from private fixture tests.
