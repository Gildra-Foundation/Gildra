# Auction reliability repair — active handoff

User: add regression tests for all fourteen detailed review findings, then fix
them fully; use branches, agents and documentation as needed.

Worktree `/home/debian/Gildra-auction-reliability-20261016`, branch
`fix/auction-reliability-20261016`, base `ff9bf18`. Existing worktree and release
proofs remain unchanged. Installed packages are linked inside an ignored real
`node_modules` directory; no dependencies were installed.

Read `docs/auction-reliability-plan-20261016.md` for acceptance criteria,
ownership and contracts. Root session `auction-reliability-20261016` holds narrow
source claims and private UI port58088 in the canonical
`/var/lib/gildra/codex-team` store. Use sudo for the coordinator; unprivileged
fallback state is a different store. No production locks have been acquired.

Test-first barrier passed at 2026-10-16 09:07:58 UTC on unchanged product source:
56 cases, 41 expected failures, 15 passing controls. Six immutable per-suite RED
proofs and their hashes are in `.artifacts/auction-reliability-20261016/red-baseline.json`.
UI baseline covers all 13 desired behaviours at EN390; full 52-case EN/RU ×
390/1440 GREEN matrix is required after repair. Initial UI setup failures were
preserved and are not counted as product regressions.

Current phase: all known repairs implemented and frozen for final commit/build.
Test-first commit127d22b precedes product changes. Core focused cases65/65 pass:
market26,optimizer9,root10,Azerite3,nativeparser4,initialrequest13. Existing
auction/gear/API/store checks pass; full TypeScript, ESLint0errors (273existing
warnings),151atlas tests, atlas/routes pass. Final browser ui-final-green.json
is a single80/80PASS run:76 regressions+4capture observers, StrictMode true,
EN/RU390/1440,8PNGs, no browser errors,975product hashes unchanged. All RED,
old failed setup/focus proofs and older68/72 matrices remain immutable.

Additional nonce request recovery is complete: lost initial202/POSTtimeout,
owner+scope GET, canonical request idempotency, immutable budget, queue/quota
replay, scope cleanup and StrictEffects replay all tested. Backend/market/
optimizer/UI agents are frozen. Root owns commit/build/release integration.

Fresh native weapon QA found raw SimC DBC DPS differs from Blizzard tooltip DPS
for rounded damage endpoints. Durable extraGo RED then API-only normalization
(avg resolved min/max /speed), full rotationlab GREEN. Native candidate-v2 build
and fresh four weapon/control comparisons PASS with original tolerances (DPS
error<0.000001). Native mechanics/pin18428cd remain unchanged. Private worker
name gildra-auction-reliability-worker-qa, containerf1179dc6..., image9039918e...,
loopback58089 on gildra_default; no credentials/data mounts. Prior candidate-v1
failure/proofs preserved. Source405file build manifests are in evidence.

Next: commit clean source [skip ci] (full-stack GitHub deploy must not run for
this scoped web/worker release), pushfeaturebranch, freezeGitarchive, buildweb
and final labeledworker (native cache). Replace only ownQAworker withfinalimage,
run fresh weapon+mainEN private native QA. Bind allfunctional source/test hashes,
stage sameweb+privateworker, run7officialgates, then claimprod4locks andprepare/
review/apply scopedplan under persistent user authorization. Fresh deployed
Elkardia EN/RU/publicchecks+observation+ledger+docs+normalFFmasterpublication
remain required. No production changes yet. Staging locks owned but no stage
changes yet. Do not touch DB/API/CMS/imports or otherworktrees.

Agents: `review_optimizer` owns planner/effects/types after the barrier;
`review_market` owns discovery/provider/reference; `review_ui_jobs` owns
optimizer UI/client helpers/copy and browser tests. Root owns runner,
fingerprint, recovery store/jobs/API, item presentation and integration. Shared
types and recovery contracts are in the plan; ask root before changing them.

Node: `/tmp/gildra-audit-python/playwright/driver/node` (v24).
Node test cwd: `apps/web`, flags `--experimental-strip-types --no-warnings
--import ./tests/auction/resolve.mjs`.
rg: `/home/debian/.codex/packages/standalone/releases/0.162.1-x86_64-unknown-linux-musl/codex-path/rg`.
Browser cache: `/home/debian/.cache/ms-playwright` (headless shell available).
New evidence: `.artifacts/auction-reliability-20261016/`.

Keep the user updated in Russian at meaningful milestones and at least roughly
once a minute. Do not ask again for permissions already granted. Do not send a
final answer until the requested repairs and required verification are complete.
