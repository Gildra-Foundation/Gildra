# Gear planner presentation — verified production release

Status: **verified**. Deployed to `gildra.net` at **2026-10-15 21:49:14 UTC**; final verification completed at **21:54:07 UTC**.

Code revision: `2ae23b15f80acb140936f42bd538d017fa1e4faf` (`8257893` presentation changes plus `2ae23b1` tooltip disclosure fix). Release: `gear-ui-20261015-2ae23b1`. A clean Git archive supplied the build; all 2,771 archived files were independently compared with their Git objects. The same immutable image passed staging and production:

| Service | Image | Immutable image ID |
| --- | --- | --- |
| Web | `gildra-web:gear-ui-20261015-2ae23b1` | `sha256:1b260d1bf6a48a1fd7a83c61c23052f4b45a19a8ee086256667dae49492a00af` |
| Retained worker | `gildra-rotation-sim-worker:farm-gear-20261015-dcce589` | `sha256:3d3209821ccec0fe2f77b3dc389ededb51ce1251e49de74ce3d1204ca5cdf0d6` |

Only web was replaced. Nine protected containers, including the worker and API, retained their container/image IDs, restart counts, start times and health. All non-`WEB_*`/non-`GEAR_UI_RELEASE_ID` manifest lines remained byte-identical. No database, migration or import operation was performed; independent enrichment continued outside this release's data-invariance scope.

## Resulting interface

- Farm results show genuine framed location artwork, reward icons with quality frames, source/boss and the equipped item being replaced. Independent DPS gains and their 95% comparison margins have explicit labels.
- Farm and auction items share the character equipment tooltip: genuine icon, name, quality, verified item/required levels, actual stats/effects and source where available. Hover/focus opens it; click/tap pins it; Escape and the close control dismiss it. Only one description stays pinned. Collapsing its loot section also dismisses it. Unknown scaling never receives guessed native stats or a promised item level.
- Auction results separate budget, spend and remaining gold; current and candidate DPS; absolute and percentage whole-loadout gain. Each purchase shows its whole-lot price/quantity and the current equipment it replaces. Raw modifier dumps are removed from the purchase flow. Each lot is charged once.
- Cancelled/unmounted requests clean up late-created jobs. Poll failures clean up and permit retry. Character, snapshot, specialization and locale changes clear the old result.

Nine location assets use the official client's `JournalInstance.ButtonSmallFileDataID`. Original content hashes were checked and lossless WebP pixels match the decoded BLPs without resizing/cropping. Provenance is checked in beside `apps/web/public/assets/wow/instances/`. Tidebound Grotto uses the existing genuine Nymrissa portrait. Missing item icons use bounded official Blizzard media lookups without changing item properties.

## Verification

The final Docker production build passed TypeScript and generated 762 pages. The broad static suite on `8257893` passed lint (0 errors, 273 existing warnings), atlas tokens/tests, route mirrors, farm/source-generation and auction/native-variant regressions. The narrow `2ae23b1` disclosure correction passed focused lint and EN/RU browser regression; the full static/component matrix was not repeated after that correction.

Component browser checks used the actual components/CSS and saved fresh real character results in an ignored loopback harness. EN/RU passed at 320/390/768/1024/1440 pixels, including touch, 48 rich-tooltip observations, native/current properties, budget/DPS arithmetic and loading/empty/error/cancel states. Fourteen synthetic auction transport/lifecycle cases passed. The main matrix's disclosure branch was skipped because its item was outside the disclosure; a separate test found the defect, then passed on the exact corrected tooltip source in both locales. Original failure evidence is retained. Ten tested source files stayed identical; the eleventh is bound to the focused fix. No browser exceptions remained. The harness was stopped and its port closed.

All **seven** release gates passed on the final image: home/book (0 changed pixels), 24 inner-page comparisons (0 changed pixels), accessibility, motion, route budgets, 28-route smoke and transitions. Exact report: `apps/web/.artifacts/release-gate/2026-10-15-21-39/report.md`, SHA256 `1c23d804160c4c35c4a5b99bd670d273d8ba2721eae8271fa8555ed0119ef771`.

After deployment, eight public EN/RU desktop/mobile views and the standard 28-route/status smoke passed. Nine published WebPs matched committed byte lengths and SHA256. Both private planners rejected guest GET/POST/DELETE with 401 and private/no-store, and cross-site POST with 403. The web runs as `nextjs`; Compose preflight warnings about a tag/nondeclared Compose user were covered by exact image-ID checks and the actual image user.

## Fresh postdeployment Elkardia checks

Actual public Blizzard character: **Элкардия / EU Eversong**, level 81, Fury 72, equipped item level 120. Profile fingerprint: `a19e385688d3d761feef3866389d72e8ef44f747cfb54a2386633069eb80673a`.

| Check | EN and RU result |
| --- | --- |
| Farm | Same baseline 14,273 DPS, 9 exact variants, 15 simulations, 10 confirmed independent replacements; best Warbanner +627 DPS / +4.39% |
| Farm media | All 10 location images, 88 reward icons and 88 current-item icons present in each locale |
| Auction budget | 10,000 gold; spend 15; remaining 9,985 |
| Auction purchase | Lot `1071542782`, item `245344`, wrists level 174 / required 81; replaces `248043`, level 120 |
| Auction gain | 14,273 → 14,645 DPS: +372 / +2.6063%; combined 95% margin 63 DPS / 0.4414%; 48 simulations |

Farm EN/RU profile and positive replacements match exactly; localized published loot coverage is 214/215. The actual farm head is level 139 / required 78; the actual auction tooltip uses native level 174 and its stats. All purchases have genuine new/current icons and correct copper arithmetic. These are fresh committed-source trusted runners against public Blizzard snapshots and the actual deployed API/worker; runtime identities separately match the new web. **An authenticated browser job flow was not exercised.** No purchase was made.

Observation after **274.0 seconds** found the new web healthy with zero restarts, all nine protected baselines unchanged and no unresolved failures. One exact existing Next `NoFallbackError` from the expected raid 404 was recorded; the previous immutable-image reproduction and reviewed classification are hash-bound. The original strict counter failure remains preserved. Other runtime exceptions/fatal errors and ServerResponse listener warnings: zero in this observation.

## Recovery and evidence

Previous web: `gildra-web:farm-gear-20261015-dcce589`, image `sha256:45c80a0c88d82afa164df8210268722d65185bebfc15a1fc4ec3b2b560de0cae`. Previous manifest: `/opt/gildra/gear-ui-20261015-2ae23b1-previous.env`. Scoped rollback runner: `/opt/gildra/releases/gear-ui-20261015-2ae23b1/rollout.py --rollback`, after acquiring the required production/web/edge coordination locks. It restores only the previous web and manifest, and refuses to overwrite a different/newer release. Rollback was not needed. Existing restore-verified schema-171 backup evidence was checked; no database restore was run.

Ignored evidence: `.artifacts/gear-planner-ui-20261015/`. Root-owned release proof: `/opt/gildra/releases/gear-ui-20261015-2ae23b1/`. Operation ledger verified with tip `sha256:c22277bcaaa1e5221f87d7bb0959100aa720eee869c7d99bd340a3dee4a7f853`. Source/image evidence, scoped browser hashes, seven gates, fresh EN/RU runs, public checks and reviewed observation are retained. Later documentation commits do not change deployed code revision `2ae23b1`.
