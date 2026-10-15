# Farming gear deployment — 2026-10-15

Status: **verified**. Published to https://gildra.net at **20:43:18 UTC**. Fresh EN/RU character checks, public checks and the reviewed observation passed.

Release: `farm-gear-20261015-dcce589`. Deployed code revision: `dcce589ea6e05051e42a51ffe2a25103f0d7060b`; later documentation commits do not change that image revision. `e2792a2` records the earlier auction release and `dcce589` adds source-scaled farming rewards and native corrections. Both were pushed to `feature/auction-gear-budget-20261015`.

Only **web and rotation-sim-worker** were replaced; nginx reloaded its existing configuration to refresh upstream addresses. This deployment performed no API rollout, database migration/data operation or import. Independent catalog enrichment imports continued. Existing runtime secret references and volumes were preserved.

| Component | Immutable release tag | Image ID |
| --- | --- | --- |
| web | `gildra-web:farm-gear-20261015-dcce589` | `sha256:45c80a0c88d82afa164df8210268722d65185bebfc15a1fc4ec3b2b560de0cae` |
| rotation-sim-worker | `gildra-rotation-sim-worker:farm-gear-20261015-dcce589` | `sha256:3d3209821ccec0fe2f77b3dc389ededb51ce1251e49de74ce3d1204ca5cdf0d6` |

Images derive from a clean `git archive`. Native SimC is pinned to `18428cd3902412abc8ee274d19567d603e674e66`; binary SHA256 is `2b8d1658c2fbab2981711a942a319454571302d7ccb56b51c85828f9e8b96940`. The worker retains the complete maintained MID2 Fury profile, exports ten preset rules and preserves required 78 for the actual level 139 reward. Unknown bonuses are rejected.

## Verification

- Next production build, TypeScript, gear/auction/farm regressions, Go rotationlab, 22 source reward checks and queue capacity after sixteen cancellations passed. Release-source lint passed with zero errors and 273 warnings; atlas tokens, six atlas tests and RU/EN route contract passed.
- All seven staging gates passed: home/book, inner pages, accessibility, motion, route budgets, status/hydration smoke and transitions. All 24 saved internal-page visual comparisons had zero changed pixels. Staging report: `apps/web/.artifacts/release-gate/2026-10-15-20-33/report.md`.
- After deployment, all eight public browser page views passed: four published RU/EN URLs at 1440/390px, with no browser errors or horizontal overflow. The broader smoke passed 28 route/status checks, including expected 404 responses; this is not a claim of 28 published pages.
- Both private job routes returned 401 and `Cache-Control: private, no-store` for guest GET/POST/DELETE; cross-site POST returned 403. Eight boundary checks passed.
- After 133.6 seconds, both updated containers were healthy with zero restarts; all eight protected containers retained their recorded identities/restart states, and schema was 171. One `Error: Internal: NoFallbackError` was logged for the expected 404 route `/wow/raids/no-such-raid`. The same GET against the previous immutable web image returned 404 and logged the same exception, establishing a pre-existing Next fallback diagnostic. The original strict log-counter failure is preserved alongside the reviewed classification. A follow-up at 434.8 seconds confirmed the same healthy containers and unchanged protected services. Nonfatal ServerResponse listener warnings were also retained in the observation; this report does not claim zero server log errors or warnings.

## Fresh Elkardia verification

Production EN/RU runs completed after deployment and identified the exact web and worker image IDs above. They used current public Blizzard snapshots, committed release source and the actual deployed API/worker through the internal trusted-snapshot runner. **An authenticated browser job was not exercised.**

Elkardia, EU/Eversong: level 81, Fury 72, equipped 120. Both locales produced the same profile fingerprint, variants and DPS: **14,273 baseline DPS**, 9 exact variants, 15 simulations (one unchanged baseline and 14 independent replacements), 10 statistically positive replacements and 4 tested non-upgrades. Published loot coverage was 214 EN / 215 RU; search remains explicitly bounded.

| Independent replacement | DPS gain | Combined 95% margin |
| --- | ---: | ---: |
| Kroluk’s Warbanner `250227` → TRINKET_1 | +4.39% (+627) | ±0.45% |
| Kroluk’s Warbanner `250227` → TRINKET_2 | +3.61% (+515) | ±0.44% |
| Fletcher’s Faded Faceplate `251098` → HEAD | +2.76% (+394) | ±0.44% |
| Heart of Wind `250256` → TRINKET_1 / TRINKET_2 | +2.55% / +2.05% | ±0.42% / ±0.44% |

These are separate replacements against the same equipped baseline; **their gains must not be added together**. Simulations used 750 iterations, one target and 120 seconds, SimulationCraft 1210-01 /18428cd. All positive rewards are source-generated Normal/context17, ilvl 139 / required 78, seasonal bonus 13660 and modifier 9=81. Windrunner Spire meets the level alternative and queue 100 requirement. Seven other Normal sources retain unknown quest/Warband access; both endgame entries require 90.

## Limits and recovery

Only supported **Normal/context17** rewards are confirmed. Level 90/context1, endgame sequences, unsupported bonus type 26 on the neck and unknown conditions remain unverified. Damage comparisons do not establish tank/healer readiness or solo completion of group encounters. The in-process job store assumes one web replica. Browser checks cover public pages and rendering of saved real results, not signed-in account operation.

Previous images remain available: `gildra-web:auction-gear-20261015-57f74f1` and `gildra-rotation-sim-worker:auction-gear-20261015-57f74f1`. The scoped runner restores their exact recorded image IDs and `/opt/gildra/farm-gear-20261015-dcce589-previous.env`, then checks health and origin routes. It requires the saved plan and coordination locks and refuses to overwrite a later release:

```sh
sudo python3 /opt/gildra/releases/farm-gear-20261015-dcce589/rollout.py --rollback
```

Rollback was not run. Root-owned release proof is retained under `/opt/gildra/releases/farm-gear-20261015-dcce589/`. Local ignored evidence: `.artifacts/farm-deploy-20261015/`, including `source-proof.json`, image identities, `postdeploy-elkardia-summary.json`, production EN/RU results, `public-smoke.json`, `public-boundaries.json`, `after-observation.json`, `old-web-control.json` and `after-observation-reviewed.json`. OAuth credentials remained in process memory/runtime references and are absent from checked-in data and reports.
