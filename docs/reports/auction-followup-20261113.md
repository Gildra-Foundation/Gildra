# Auction follow-up: requirement gaps found after the initial report

Historical checkpoint: the enhancement-data blocker below was subsequently narrowed. See [the integrated enhancement implementation](auction-enhancement-implementation-20261113.md) and the build-pinned catalog README for the current status. Earlier test results here describe that earlier source state.

The initial implementation did not fulfill the complete request. This follow-up inspected actual paths rather than accepting the earlier handoff as completion. Changes remain uncommitted in the shared checkout; no deployment, service restart or purchases.

## Newly fixed

1. Assembly now persists and publishes each completed planner slice before starting another native comparison, up to eight new slices per step. Previously this worked only for single-item search; a good set waited behind the remaining native calls. Current-pool completion prevents useless repeated cached slices while discovery is incomplete.
2. Optional scenario comparison obeys the same cooperative step budget. Finished measurements remain cached; continuation reuses baselines and exact finalist effects. `scenarioComparisonsComplete=false` makes the UI continue even when the primary exhaustive traversal has finished. Each completed scenario candidate publishes independently. Publications are separate objects, avoiding mutation of already published job results. A currently running request can still outlast the cooperative budget; no hard wall-clock response guarantee is claimed.
3. Empty results distinguish insufficient comparisons, ongoing search, incomplete source data and completed absence of single-item upgrades. Excluded upgrades retain their own state.
4. Production DB-backed simulation route now emits measured queue/native timing, just like the standalone route. Unknown timing is absent, never fabricated zero. Step diagnostics retain the last 64 durations and distinguish active step time from elapsed time including idle. Explicit opt-in `AUCTION_GEAR_DIAGNOSTICS=1` logs allow-listed run/job summaries without identity, tokens or raw error messages. Planner/scenario cache reuse is counted in addition to mechanical cache hits.
5. HEAD and SHOULDER enchant customizations are accepted by the broad transport guard, matching the project's pinned native enchant masks. This is not an arbitrary-ID compatibility validator.

## Live worker finding — current deployment is incompatible

The local worker at port58082 is reachable; the prior search for a binary was insufficient to establish native unavailability. Current native-APL request returned HTTP400 invalid_request. A legacy custom-APL bundled Fury profile worked, but lacked required dpsMean. The current auction runner must not silently fall back to this legacy contract.

The controlled concurrency experiment stopped after four benchmark requests: the sequential pair succeeded, while one request in the concurrent pair returned HTTP503. No repeat distribution or speedup is claimed. The failed concurrent batch is excluded from timing aggregates. Keep concurrency1. See `apps/web/tests/auction/performance/live-worker-report.md`, raw JSON and reproduction script. The service was not rebuilt/restarted: deployment needs the user's separate instruction.

## Full enhancement optimization still not delivered

The previous data audit was too broad. Pinned SimulationCraft tables and local profession recipes establish real candidate IDs, socket/gem fields and enchant equipment/level/profession rules. A concrete gem chain is verified. They do not establish equipment-wide gem unique categories or reliable ranked consumable-to-enchant mapping. Pinned DB2 crafting-table and catalog access returned HTTP403; no database connection is configured in this session. No name/adjacent-ID guessing or fake costs were introduced.

See `auction-enhancement-recheck-20261113.md` for exact primary sources and fields. To close this requirement, supply accessible build-pinned crafting mappings and category/profession data, extend exact variant socket metadata, then connect bounded configuration expansion to quote ladders and native simulation. The current pricing helper is still a tested foundation, not an automatic item+gem+enchant recommendation pipeline. The old character-wide missing-enchant hint also uses a broad slot list; it is not a compatibility resolver.

## Verification

- New assembly-publication tests3/3; fairness/assembly regression9/9.
- Combined performance/scenario regression22/22, including slow scenario yield/resume and immutable partial publication.
- Actual Runner scenario integration3/3, including no duplicate native calls after a slow baseline.
- Browser EN/RU ×390/1440:8/8 for empty-result states and scenario continuation. Real components, synthetic HTTP. Product sources stable during browser run, private harness cleaned up. `.artifacts/auction-reliability-20261016/gap-followup.json`.
- Go rotationlab full suite passed after timing changes. Gear simulation suite passed after enchant-slot fixes.
- Independent review found a published-object mutation; fixed by separate scenario snapshots and completion set only after evaluation finishes.
- Full offline regression gate: **58/58 PASS**, `.artifacts/logs/auction-gap-full-20261113-194603.log` (5m13s). This includes the previously failing ownership checks without weakening their assertions.
- Typecheck PASS; final production build PASS (`.artifacts/logs/build-20261113-194913.log`, 1m40s), including the final job diagnostics wiring. Scoped lint PASS with two existing React hook warnings; explicit-any in the earlier added UI test was corrected.
- Job/publication/diagnostics focused tests8/8 after the final logging integration. Screenshots of insufficient/completed empty states: EN/RU ×390/1440 capture4/4, `.artifacts/auction-reliability-20261016/gap-capture.json`, fonts awaited and harness cleaned up.
- `git diff --check` PASS. No required executor remains running. Full cost optimization and compatible live worker deployment remain unresolved as described above.
