# Auction completion — verified release, 2026-10-16

Release `auction-completion-20261016-79d203c` was deployed 18:20:07 UTC and verified 18:29:01 UTC. Runtime web source is `79d203c96ebb42c230399948e0239c624bc9bfd6`; unchanged native worker inputs use actual source `9067cbb72019c4d03d76dac924c5bda0885bcf37`. Normal atomic publication updated remote master, feature branch and the runtime tag. Documentation follows runtime without another deployment.

Web image `sha256:c29281f2fc213c8b574ce13e9f2b1e65ff7be550476bb7f222988c1dccaf4236`; worker `sha256:79669d0ec0dae5701700afebff3043ee5b8515ac9f41671863a302347b1701bf`. Both healthy/0 restarts; eight protected containers unchanged. No API, database, CMS or import rollout. Existing nginx was tested/reloaded.

All audited fixes and two reproduced discovery delays are integrated. Native gear APL retains item activations. Private versioned checkpoints/intents survive web replacement; tokens/functions are excluded. Request recovery, cancellation, reservations, catalog repair and locale money parsing are covered. Metadata-first discovery schedules wearable required-level fit before incomparable historical base item levels; native facts remain authoritative and all candidates remain reachable.

Final 32 offline suites pass on the exact clean runtime tree, plus 176 completion/legacy browser cases, eight actual DTO views and eight public postdeployment views. Fresh postdeployment Элкардия EN/RU: three CHEST/FEET/WRIST pieces,840.89 gold under 10,000 gold,20,222→22,382/22,377 DPS (about 10.7%,95%confirmed). Cold default search first found an improvement in 33.3/35.9 seconds. Farm:12 confirmed upgrades,2 non-upgrades,74 explicitly unresolved variants. Whole-market optimum and authenticated browser execution are not claimed.

See [release report](docs/reports/auction-completion-deployment-20261016.md), [implementation plan](docs/auction-completion-20261016.md), [durability decision](docs/agdr/AgDR-0001-auction-checkpoints.md), and [discovery decision](docs/agdr/AgDR-0002-auction-discovery-priority.md). Evidence: `.artifacts/auction-completion-20261016/` and `/opt/gildra/releases/auction-completion-20261016-79d203c/verification-final`. The verified three-record local ledger tip is `sha256:4be56463e61aea9d0031dd550ec948b7cb0cb0e4bb453c5883384801d4222afb`;356 new evidence files are archived.

Rollback: acquire production/web/worker/edge/state coordination locks, then use this retained worktree's `.artifacts/auction-completion-20261016/ops/rollout.py --rollback` under its bounded operation gate. It restores exact previous runtime/environment and web `e77e773b` before worker `3d676fd9`; preserve `/var/lib/gildra/auction-state`. Old images and root-only backups remain. The state mount is UID/GID 1001,0700, files 0600; single web writer only. No host-disk disaster recovery or multi-replica queue is claimed. The historical release below is superseded by this section.

---

Older release notes (auction reliability, 2026-10-16) are archived in [docs/reports/handoff-archive-auction-reliability-20261016.md](docs/reports/handoff-archive-auction-reliability-20261016.md); all release reports live in `docs/reports/`. Keep only the latest verified release here; archive the previous section when a new one is added.
