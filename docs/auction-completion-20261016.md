# Auction completion — 2026-10-16

User authorized fixing all seven repeated-audit defects, integrating the work, and publishing/deploying verified changes. Worktree: `/home/debian/Gildra-auction-completion-20261016`; branch `fix/auction-completion-20261016`; base `2db7c04`. Existing worktrees and audit evidence remain untouched.

| Area | Regression before fix | Intended result | Owner |
| --- | --- | --- | --- |
| Native item activation | Go + actual web request contract | Maintained native gear APL; editor custom APL unchanged; real pinned on-use execution | Native agent |
| Budget locale | EN/RU parser + browser requests | Displayed/entered money agrees, precision retained, malformed grouping rejected | UI agent |
| Lost POST response | Actual API idempotence + browser transport failure | Every action recoverable by nonce; accepted work runs once | API/UI agents |
| Recovery cancellation | Held recovery GET + late response | Cancel aborts recovery and unlocks form without late work leakage | UI agent |
| Catalog cancellation | Real queue/repository/client gated HTTP | Abort stops current requests and later batches; next user runs | API agent |
| Queued search eviction | Full store + accepted queued continuation | Context remains reserved until queued/running work settles | API agent |
| Catalog repair | Three missing-data cases + retry bounds | Same retained search incorporates repaired data without repeated native work | Root |
| Web restart | Separate process seed/recover + interrupted task | Durable private checkpoints and recoverable intents; no stored tokens | Root |

New RED/GREEN and browser/native artifacts go only under `.artifacts/auction-completion-20261016/`. Completed audit repros are converted into versioned tests. No test may overwrite prior release evidence.

Integration gates: meaningful focused tests, existing auction/gear/API regressions, independent optimization oracle, full TypeScript and relevant Go suite, scoped lint and repository-required route/atlas checks, production builds, final diff review, actual fonts EN/RU mobile/desktop loading/empty/error/recovery/cancellation tests. Native verification uses the exact pinned binary outside production.

Release gates: committed source and normal non-force publication; current coordination/target/health/backup/rollback verified; isolated exact-image test including durable web replacement; worker first then web; real Элкардия search/assembly and public UI/assets after deployment. Preserve unrelated services and data. Record exact images, results and limits before completion.

Status: verified release `auction-completion-20261016-79d203c`, deployed 18:20:07 UTC and verified 18:29:01 UTC. Final 32 source-bound suites,176 completion/legacy browser cases, eight actual DTO views, eight public postdeployment views and exact-image restart verification passed. See [release evidence and limits](reports/auction-completion-deployment-20261016.md).

Automatic farm and single-item gear comparisons also use the native APL; native cache keys include the semantic contract, while the rotation editor retains custom rules. Additional reproduced races are covered: cancelled requests arriving late, restart quota retention, failed state writes/deletes, expired nonce with retained search, changed exclusions after an unknown response, and cross-tab search/assembly mode recovery.

The complete offline gate is versioned in `apps/web/scripts/test-auction-completion.mjs`; UI reproduction and matrix commands are documented in `apps/web/tests/auction/completion/ui-README.md`. Every run requires a new artifact directory. Final release status and observed limits are recorded in the handoff and release evidence after rollout.

Two further defects were reproduced and fixed before release. Native metadata and DPS requests now share a bounded admission queue rather than rejecting ordinary overlapping requests. Default all-slot discovery first reads bounded summaries, then schedules known wearable required-level fit before raw historical item levels. Real catalog 610 items resolved natively 98/99 and previously delayed current upgrades; the final cold EN/RU searches found confirmed upgrades at 33.3/35.9 seconds and a three-piece affordable set in their first bounded assembly. Unknown/scaled hints never exclude candidates. [Decision and tradeoffs](agdr/AgDR-0002-auction-discovery-priority.md).
