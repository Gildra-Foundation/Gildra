# Auction completion — verified release, 2026-10-16

Release `auction-completion-20261016-79d203c` was deployed 18:20:07 UTC and verified 18:29:01 UTC. Runtime web source is `79d203c96ebb42c230399948e0239c624bc9bfd6`; unchanged native worker inputs use actual source `9067cbb72019c4d03d76dac924c5bda0885bcf37`. Normal atomic publication updated remote master, feature branch and the runtime tag. Documentation follows runtime without another deployment.

Web image `sha256:c29281f2fc213c8b574ce13e9f2b1e65ff7be550476bb7f222988c1dccaf4236`; worker `sha256:79669d0ec0dae5701700afebff3043ee5b8515ac9f41671863a302347b1701bf`. Both healthy/0 restarts; eight protected containers unchanged. No API, database, CMS or import rollout. Existing nginx was tested/reloaded.

All audited fixes and two reproduced discovery delays are integrated. Native gear APL retains item activations. Private versioned checkpoints/intents survive web replacement; tokens/functions are excluded. Request recovery, cancellation, reservations, catalog repair and locale money parsing are covered. Metadata-first discovery schedules wearable required-level fit before incomparable historical base item levels; native facts remain authoritative and all candidates remain reachable.

Final 32 offline suites pass on the exact clean runtime tree, plus 176 completion/legacy browser cases, eight actual DTO views and eight public postdeployment views. Fresh postdeployment Элкардия EN/RU: three CHEST/FEET/WRIST pieces,840.89 gold under 10,000 gold,20,222→22,382/22,377 DPS (about 10.7%,95%confirmed). Cold default search first found an improvement in 33.3/35.9 seconds. Farm:12 confirmed upgrades,2 non-upgrades,74 explicitly unresolved variants. Whole-market optimum and authenticated browser execution are not claimed.

See [release report](docs/reports/auction-completion-deployment-20261016.md), [implementation plan](docs/auction-completion-20261016.md), [durability decision](docs/agdr/AgDR-0001-auction-checkpoints.md), and [discovery decision](docs/agdr/AgDR-0002-auction-discovery-priority.md). Evidence: `.artifacts/auction-completion-20261016/` and `/opt/gildra/releases/auction-completion-20261016-79d203c/verification-final`. The verified three-record local ledger tip is `sha256:4be56463e61aea9d0031dd550ec948b7cb0cb0e4bb453c5883384801d4222afb`;356 new evidence files are archived.

Rollback: acquire production/web/worker/edge/state coordination locks, then use this retained worktree's `.artifacts/auction-completion-20261016/ops/rollout.py --rollback` under its bounded operation gate. It restores exact previous runtime/environment and web `e77e773b` before worker `3d676fd9`; preserve `/var/lib/gildra/auction-state`. Old images and root-only backups remain. The state mount is UID/GID 1001,0700, files 0600; single web writer only. No host-disk disaster recovery or multi-replica queue is claimed. The historical release below is superseded by this section.

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

The historical process-local restart limitation is fixed by the completion release above.
Multiple replicas still require shared writer/queue coordination. Full-market optimum is not asserted.
Node24 `/tmp/gildra-audit-python/playwright/driver/node`; browser cache
`/home/debian/.cache/ms-playwright`. No package dependencies were added.
