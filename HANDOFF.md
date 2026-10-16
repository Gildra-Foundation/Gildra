# Auction completion — 2026-10-16

Active branch `fix/auction-completion-20261016`, based on `2db7c04`; implementation and meaningful RED/GREEN tests are integrated. See [implementation plan](docs/auction-completion-20261016.md) and [durability decision](docs/agdr/AgDR-0001-auction-checkpoints.md). New evidence is `.artifacts/auction-completion-20261016/`; previous worktrees/evidence are retained.

Native APL preserves item activations in auction, farm and single-item gear comparisons. Web persists private versioned checkpoints and owned restartable intents; tokens and executable tasks are never stored. Deploy the worker first, then web with the private single-writer checkpoint bind mount. Roll back web before worker and preserve the state directory. No API/database/import rollout is needed.

Final offline/browser/image/release verification is in progress. Do not infer publication from this implementation handoff; require the final production evidence and exact image identities.

---

# Auction reliability repair — verified release

User requested tests first, then repair all fourteen review findings. Completed
on branch `fix/auction-reliability-20261016`, isolated worktree
`/home/debian/Gildra-auction-reliability-20261016`. Existing worktrees and original
RED proofs remain unchanged. Test-first commit `127d22b`; runtime source
`764210f7e26b51546e0b602f8f87d9b955872530`, tagged
`auction-reliability-20261016-764210f`. Documentation publication follows runtime.

All fourteen findings and additional regression-discovered request/scope/Azerite/
weapon paths are repaired. Original barrier:56 cases,41 expected failures and15
controls before implementation. Final65 focused checks and80 StrictMode browser
checks passed; existing regressions, Go, TypeScript,151atlas tests, routes and both
production builds passed. Full lint0errors/273existing warnings; changed files
pass scoped lint. See `docs/auction-reliability-plan-20261016.md`.

Release is verified on gildra.net: final web `e77e773b` and worker `3d676fd9`, both
healthy/0restarts, deployed10:22:19UTC, verified10:30:21UTC. Fresh actual deployed
native EN/RU on Элкардия:63 verified WRIST options,36 effect states,64 independent
lot assignments; confirmed14,776DPS, +503/+3.524%, cost300.89gold under10,000gold.
Exclusion and recovery passed. Separate16slot traversal is partial. Missing data
remains explicit; no whole-market optimum or authenticated browser claim.
Actual results replayed in4 EN/RU390/1440 views/12PNGs;999source hashes unchanged.
Public16views/9assets/8boundaries and424.714seconds observation passed with0errors;
eight protected containers unchanged. Existing nginx reloaded; no DB/API/CMS/
import rollout, queries, migration or data-invariance claim.

Exact-image staging7gates passed. Staging now uses final web and productionworker.
Own QA worker and UI process removed;58088/58089closed; rollback images retained.
Retained worktree runner `.artifacts/auction-reliability-20261016/rollout.py --rollback`
restores previous worker3d320982/web571a7537 and exact previous manifest after
acquiring prod/service/edge locks. Operation gate, pinned TLS CA and foreign-state
checks remain active. Use this retained worktree invocation for rollback.

Evidence is in `.artifacts/auction-reliability-20261016/` and
`/opt/gildra/releases/auction-reliability-20261016-764210f/verification-final`.
The verified local journal continues prior chain to2records, tip
`sha256:51521661d45e7bf8efb6023f27cfe6437aa7d2d88c0b979b964877cde16f58c1`;
all455new-record archive hashes independently checked. Source/runtime proof,
plan, policy authority, initial/helper failures and passing corrections are saved.
No external immutable audit sink or fresh DB restore is claimed.

Full release/result/limitations/recovery:
`docs/reports/auction-reliability-deployment-20261016.md`.
Source commits use `[skip ci]` to avoid unrelated full-stack GitHub deployment.
Runtime and documentation are published by normal fast-forward to remote master
and this feature branch; the release tag points at runtime764210f. Final remote
refs and coordination completion are recorded in ignored publication evidence
and the canonical coordinator. Session `auction-reliability-20261016` releases
its locks after recording the verified release. Future work must read the live
canonical state first. Do not mutate other worktrees, DB/API/CMS/import services,
old evidence or deploy again for documentation.

Jobs remain process-local and do not survive a web restart; multiple replicas
need shared durable queue/sticky routing. Full-market optimum is not asserted.
Node24 `/tmp/gildra-audit-python/playwright/driver/node`; browser cache
`/home/debian/.cache/ms-playwright`. No package dependencies were added.
