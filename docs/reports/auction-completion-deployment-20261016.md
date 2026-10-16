# Auction completion — verified deployment

Release `auction-completion-20261016-79d203c` was deployed **2026-10-16 18:20:07 UTC** and verified **18:29:01 UTC**. Runtime code and tests were published by normal atomic fast-forward to master and `fix/auction-completion-20261016`, tagged `auction-completion-20261016-79d203c`. Documentation follows without another runtime deployment. Commits use `[skip ci]` to avoid the unrelated full-stack deployment workflow.

| Service | Actual source | Immutable image | Container |
| --- | --- | --- | --- |
| web | `79d203c96ebb42c230399948e0239c624bc9bfd6` | `sha256:c29281f2fc213c8b574ce13e9f2b1e65ff7be550476bb7f222988c1dccaf4236` | `156b8011bd8c5cd39b8b04f8d98fa98e8fb76a0e2e072f6120c892f5a99c7a4e` |
| rotation-sim-worker | `9067cbb72019c4d03d76dac924c5bda0885bcf37` | `sha256:79669d0ec0dae5701700afebff3043ee5b8515ac9f41671863a302347b1701bf` | `ee669c722ec0e5ccbe536745edefa6de7ecfb56a8167b5d2c59dd463e707eeb2` |

Worker reuse was allowed only after verifying ancestry, the exact three changed web discovery/test paths and all four native queue source hashes. Each service retains its true build provenance.

## Changes

Auction, farm and single-item gear comparisons use the maintained native SimulationCraft APL, preserving equipment activations. The rotation editor retains custom actions. A pinned on-use control activated twice with the native APL and zero times with the former flat action list. The worker serializes native work behind a bounded cancellable queue, including metadata requests.

Budget parsing respects EN grouping and RU spaces/decimal commas. Launching requests have recoverable identities; lost POST responses, late cancellation, interrupted recovery and cross-tab job modes are handled. Queued contexts remain reserved, cancellation reaches current catalog requests, and repaired catalog facts can join retained searches without repeating valid native work.

Versioned private checkpoints and job intents survive web replacement. Tokens and executable closures are excluded; authenticated owner requests reattach unfinished work. Atomic writes, failed-write handling, bounded retention and ownership checks are tested. New storage is `/var/lib/gildra/auction-state`, UID/GID 1001,0700, records 0600, bound to the non-root read-only web container.

Discovery reads bounded summaries before expensive details/native work and schedules wearable required-level fit before incomparable historical item levels. All variants remain reachable. Two real failed ordering trials were preserved before this repair. Confirmed individual recommendations remain separate from the complete internal pool used to assemble a compatible set under the original budget.

## Actual Элкардия results

Fresh public Blizzard profile/current auction data and the exact deployed worker were verified through committed server functions. These are actual native calculations; no authenticated production browser session or execution inside the web container is claimed.

| Locale | Original budget / actual cost, gold | Confirmed set | Baseline → set DPS | Gain | 95% margin |
| --- | --- | --- | --- | --- | --- |
| EN | 10,000 / 840.89 | CHEST + FEET + WRIST | 20,222 → 22,382 | +2,160 / +10.6814% | ±86 DPS |
| RU | 10,000 / 840.89 | CHEST + FEET + WRIST | 20,222 → 22,377 | +2,155 / +10.6567% | ±86 DPS |

Both postdeployment runs fetched fresh mechanics/market data, reallocated the retained exact effects to currently available lots, preserved all three purchases and executed two uncached native comparisons. Exact bonuses, contexts and modifiers, costs, quantities, compatibility and exclusions were validated independently against raw requests/responses. Native pin: `SimulationCraft 1210-01 · 18428cd`.

Before deployment, cold default 16-slot search found the first confirmed improvement at 33.288 seconds EN /35.883 seconds RU, and multiple upgrade slots by continuation 2. The first bounded assembly produced the set above. Separately, the complete discovered 49-option WRIST pool and independent raw-lot oracle passed, including exclusion of a purchased lot; best confirmed 20,865 DPS at 300.89 gold, +3.1797%.

Fresh postdeployment farm verification passed 15 native DPS calls and 2 metadata calls:12 significant upgrades,2 non-upgrades and 74 explicitly unresolved variants. Unknown scaling carries no fabricated DPS, and unverified access is not presented as a confirmed farm target.

## Verification

- Final 32 offline suites passed against all 2,860 tracked files of the exact clean runtime tree. The 200-job admission suite also passed independently with its original 15-second child deadline.
- Completion 96 and legacy 80 browser cases passed. Actual localized DTO replay passed 8 views at 390/1440,16 purchase/equipped tooltips and 24 screenshots; prices, whole-set DPS, loaded framed icons, item identities and overflow were checked.
- Both production builds, TypeScript, scoped lint, existing gear/auction/API regressions,151 atlas tests and route checks passed. Go rotationlab and its race suite passed, including native admission races.
- Six separate containers of the exact final web image passed completed/interrupted restart, native factory, privacy and 0600/0700 ownership checks under its actual Node 22 runtime. Bundled homepage 200 and anonymous auction 401 were verified.
- Public postdeployment browser checks passed 8 published EN/RU views. Observation lasted 120.12 seconds over 14 samples;22 declared assets and 4 public pages returned valid 200/content types. Both targets stayed healthy with 0 restarts and 0 classified error lines; eight protected containers retained IDs, images, starts, restarts and health.
- The final archive validator passed 21 adversarial checks, then independently revalidated raw native errors/significance/variants, budgets, source/image hashes, active runtime/manifest/environment hashes, state permissions and every acceptance report.

Transient failures remain preserved: one 200-job test timed out while the production build competed for resources; the unchanged isolated suite and fresh complete 32-suite run then passed. A private replay seeded an incorrectly encoded Cyrillic cache key, and the first observer used an unsafe Docker template for missing optional fields; corrected new helpers passed without product changes. One postdeployment Blizzard specialization request was incomplete; a new fresh-snapshot attempt passed. No production rollback was required.

## Scope, limits and recovery

Only web/worker images, the web checkpoint mount/environment/healthcheck and target release provenance changed. Existing nginx was tested/reloaded. API, databases, CMS and imports were not redeployed; no database migration or data-invariance claim is made.

The all-slot search/assembly is bounded, not exhaustive. Full WRIST discovery still reports incomplete data:318 unsupported-modifier lots,1,151 unmatched catalog IDs and 29 unknown-eligibility items in that snapshot. Missing data and partial traversal stay visible. The cold timing is an observation, not a latency SLA. Native results are estimates with reported uncertainty.

Durability is host-local with one web writer,30-minute retention and lazy owned recovery. Uncommitted native work can repeat after restart; scaling web to multiple writers requires shared coordination. Host-disk disaster recovery is not provided.

Rollback retains the exact prior runtime/environment and images: web `sha256:e77e773b4a435cd6bffd70abcee97738f54cd9b98a5b6a5dddf0b8c1b683a910`, worker `sha256:3d676fd9f7d39eacd73aba8f766e4d94bcd2c3a0700c6c1e7ba048b56632f19e`. Acquire production/web/worker/edge/state coordination locks and use this retained worktree's `.artifacts/auction-completion-20261016/ops/rollout.py --rollback` under its operation gate; restore web before worker and preserve checkpoint state. Backups are root-only under `/opt/gildra/releases/auction-completion-20261016-79d203c/`. Rollback rejects unrelated image/file drift; a new bounded authorization window may be needed after expiry.

Evidence: `.artifacts/auction-completion-20261016/` and `/opt/gildra/releases/auction-completion-20261016-79d203c/verification-final`. The archive preserves 356 evidence files and continues the previous local ledger to 3 records, tip `sha256:4be56463e61aea9d0031dd550ec948b7cb0cb0e4bb453c5883384801d4222afb`. Plan `sha256:352d4f0d7fbecf504290cdd99b66da5a42393527d14dde74da7caf3444cbc62f`. Initial and verified deployment records remain separate; no external immutable audit sink or new human signature is claimed.

All 356 archived evidence hashes and the three-record ledger were independently verified after publication. Only the verified owned private QA worker was removed; ports 58091/58092/58093 are closed, and rollback images remain.
