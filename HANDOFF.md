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

Current phase: preserve tests/docs in a separate commit, then release the
parallel product implementation streams. No product file has yet changed.

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
