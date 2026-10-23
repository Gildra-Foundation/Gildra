# Auction recovery, exclusions and warm-result release

Deployed `auction-four-fixes-release-20261018-469a016` to gildra.net at 2026-10-18T15:08:40.802040+00:00.
Verification completed at 2026-10-18T15:16:20.811745+00:00. Application source `469a0161aed6a4cce6968d0a3e6bf7e47c6ed231`; a subsequent report-only commit does not require rebuilding web. Commits created for this auction release use Shpuntyara's GitHub noreply identity for author and committer. Publication uses ordinary fast-forward pushes.

## Behavior fixed

- A new tab can explicitly open or cancel its owner's active initial search or assembly without old browser storage. The original budget, character, locale, objective, slots and accepted exclusions are restored. Merely discovering work does not resume it. Wrong-scope work remains cancel-only; cancellation is acknowledged only after persistence succeeds.
- Excluded lots and variants are removed before deduplication and price/DPS ranking. The next allowed best is promoted; all-excluded results provide a restoration control. Full native assembly candidates remain available subject to the submitted exclusions.
- Repeat searches process unexpired positive catalog facts and verified choices before repairing unknown catalog IDs. The unknown tail survives checkpoints and continuation; negative facts still expire after one minute, positive facts after five. Current profile, market and native variant checks remain required.
- The market coverage disclosure explains all six missing/unsupported-data reasons in EN/RU and provides a nonempty fallback.

## Fresh Elkardia check after deployment

The first postdeployment attempt, saved as v2, stopped before assembly because Blizzard realm metadata returned a non-2xx response other than 429. Its exact HTTP status was not recorded; the failed raw output remains preserved. The complete fresh v3 result below is required for release verification. The v3 probe keeps the same requests, budgets, limits and assertions; only output names and safe non-2xx status logging were added.

Character Элкардия, Eversong, level 81; specialization fury-warrior, single target, 120 seconds, budget 10,000 gold. Fresh public Blizzard profile/auction data and the existing published native worker produced:

| Objective | Price, gold | Baseline DPS | Set DPS | Gain | 95% margin, DPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Value | 20.0000 | 20222.083009 | 20957.871684 | +3.6385% | ±83 |
| Maximum DPS | 843.7600 | 20222.083009 | 21777.386311 | +7.6911% | ±84 |

Three warm first results: 0.715, 0.714, 0.631 seconds, zero new DPS simulations, zero catalog HTTP before the first result, at most four full checkpoint serializations each. This is server-function timing using private test state, not an authenticated production browser measurement. Both sets respect the budget and their gains exceed simulation uncertainty. Wire `dpsMean` is preserved exactly in comparisons. Real variant exclusions and price/DPS recommendation ranking were checked. Search remains bounded; these results are confirmed improvements, not proof of a global optimum over the entire auction.

## Separate catalog index repair

Before web rollout, the separately authorized database operation applied additive migration172: `backend/migrations/postgres/00172_spell_misc_text_lookup_index.sql` (SHA256 `69e93730911474f8f9851cb63f5e9da1a4419f4e3a09b8e9758cb4782d427c25`). Schema version171 became172; the existing API query now has a valid, ready text lookup index. Existing indexes and catalog application rows were preserved; the migration ledger changed. The fresh schema-only backup SHA256 `69b2fec63efb707839aae299e94e0a0077d95de196ed64b6063e35db893ca705` restored 4108 valid schema objects in an isolated empty database. PostgreSQL's dump omitted 7 explicitly recorded, pre-existing invalid River `_ccnew` indexes; those indexes were left untouched in production. One known Genshin CHECK constraint was verified through an exact PostgreSQL 17 parser round-trip because its equivalent AND expression deparsed differently. The effective inventory matched after these exact exclusions and that single canonicalization; this does not claim byte equality for all 4,115 source objects or a full-data restore. API, worker and import container identities remained unchanged. The immutable database operation proof is hash-bound to the web plan.

## Validation

- All 57 offline suites passed on final application source `469a0161aed6a4cce6968d0a3e6bf7e47c6ed231`, plus TypeScript and scoped ESLint with zero errors. The actual offline command, clean source before/after and exact raw summary hash are bound by the final quality proof.
- Full UI 404/404, legacy 84/84, and fresh actual-result UI replay 12/12 passed in EN/RU at 390 and 1440 pixels. The added cases also exercise 320-pixel layout, keyboard focus, original-intent recovery, cancellation failure/retry and exact accepted exclusions. Earlier red and test-setup failure attempts remain preserved; no per-test deadlines were raised and no cases skipped.
- The successful full matrix used unchanged per-test deadlines. Its waiting Python launcher had an incorrectly short 18-minute outer budget; only that waiting launcher was suspended while the existing Node/Playwright runner continued under a separate 45-minute orchestration guard. The external monitor and waiting launcher ended with status143; root independently verified the original Node runner's OS exit status0, all404 passing cases, the closed private listener and every unchanged-source postcondition before resuming/reaping the launcher. These external orchestration statuses are preserved and are not represented as successful wrapper exits. The repair and exact process identities are hash-bound to the deployment plan.
- Full/legacy UI execution commits: ui-completion.json at `67da17e06a2fbd8b233bb5127ae18df55af7c3ae`; ui-legacy.json at `469a0161aed6a4cce6968d0a3e6bf7e47c6ed231`. The reports are bound to final source by an immutable `ui-source-equivalence.json`, which verifies all 18 UI product files and all versioned auction test/runner inputs. Fresh actual-result UI replay and native checks also executed final application source `469a0161aed6a4cce6968d0a3e6bf7e47c6ed231`.
- An immutable clean Git archive image passed seven published routes, nine asset byte/hash contracts and ten anonymous/cross-site auth boundaries in private staging and rollout. The public planner JavaScript matched that image byte-for-byte. Published anonymous character pages passed four EN/RU mobile/desktop browser checks with no page errors or horizontal overflow.
- 122.9 seconds of observation, 13 samples: web healthy, zero restarts, zero runtime-error matches. All nine protected container identities, images, start times and restart counts stayed unchanged. The web rollout recreated only web and reloaded existing nginx. The separate prerequisite operation added the catalog lookup index in migration172; API, worker and import containers and application data rows stayed unchanged.
- The published transition fix32a5bcb is preserved: committed motion sources and runtime/public renderer bytes match that release exactly.
- Private staging container/listeners were removed using exact ownership checks. Source commits use `[skip ci]` to avoid a second automated deployment; the complete local checks and guarded web-only rollout above actually ran.

Web image `sha256:20087c988d07c52a7abed72753dc6fc336f527187f1678e79bf115c5021e3bb0`. Web container `81262662e423cbb261f88aeed542538b2afc16630b6c31b97f3ed751975c8dd8`.
Rollback retains previous immutable web image `sha256:2c64e342cf185fab4d22da75547d6e5d30b922dc96fd5ec63f22e1a40b90502f` and byte-exact release manifest `/opt/gildra/auction-four-fixes-release-20261018-469a016-previous.env`. Guarded rollback runner `/opt/gildra/releases/auction-four-fixes-release-20261018-469a016/rollout.py --rollback`. No web rollback was required. Web rollback does not remove the separate additive index172; its recovery is governed by the separate database operation.
Private evidence: `.artifacts/auction-four-fixes-release-20261018/`; credentials are not included. Actual-result UI tests replay fresh DTOs with synthetic HTTP timing/auth envelopes, and do not claim authenticated production planner interaction.
