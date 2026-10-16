# Auction planner review fixes — verified deployment

Release `auction-fixes-20261016-8a5f3eb`; runtime source `8a5f3ebc7d5856d7330bbc7463f375153bf60d75`.
Web `gildra-web:auction-fixes-20261016-8a5f3eb`, `sha256:571a7537f1e4e9dc7784947983937f46aa4b583c11570fd7fd5233f580d7c381`.
Container `ccc04b5ea238178b3c2515e4c29b0071dcfc9eff6f210bedfcd576f8f0d021f5`. Deployed **2026-10-16 06:59:05 UTC**;
verified **2026-10-16 07:08:12 UTC**.

Six fixes are included:

1. An auction variant matching the worn item goes through exact native replacement simulation instead of aborting the entire search; customizations are not assumed equal.
2. The visible list keeps confirmed individual upgrades. Assembly uses all verified allowed candidates, including useful simultaneous swaps; weak ingredients appear only in a confirmed whole-set purchase list.
3. Catalog and variant discovery resume through persisted batches; the old permanent 6,000/240/256/three-variant cutoffs are removed.
4. Before continuation/assembly, sold lots disappear, prices and quantities refresh, and new effects enter discovery. Mechanical results survive economic cursor resets.
5. Exact effect groups share native work; an exact economic allocator retains every real offer, whole-lot cost, shared quantity and exclusions. Early pairs improve the first bounded step; only exhausted traversal claims a maximum over its verified pool.
6. Missing equip metadata and unverified profession/account requirements remain excluded and explicitly count as unknown eligibility. They make dataComplete=false; known incompatibility stays distinct and sold unknown lots stop affecting current coverage.

## Fresh postdeployment Элкардия results

The focused **WRIST** search completed discovery and exact enumeration of its verified pool under the original budget, including an independent raw-lot oracle. These are this release's fresh EN/RU results, not previous-candidate figures.

| Locale | Lot/slot options | Effect states / lot oracle | Spent / budget, gold | Baseline → candidate DPS | Gain DPS / percent | 95% margin DPS |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| EN | 63 | 37 / 64 | 300.89 / 10,000 | 14,273 → 14,796 | +523 / +3.664% | ±62 |
| RU | 63 | 37 / 64 | 300.89 / 10,000 | 14,273 → 14,796 | +523 / +3.664% | ±62 |

Both gains exceed the comparison margin. Explicit exclusion of the original purchase was also independently checked. EN: 14,776 DPS, 300.89 gold, 63 independently checked lot assignments. RU: 14,776 DPS, 300.89 gold, 63 independently checked lot assignments.

The separate **16-slot** run is a bounded check, not a whole-market optimum. EN: 21 discovered lot/slot options, 56 checked effect states, DPS 14,273, cost 0 gold; discoveryComplete=false, exhaustiveComplete=false. RU: 21 discovered lot/slot options, 56 checked effect states, DPS 14,273, cost 0 gold; discoveryComplete=false, exhaustiveComplete=false.

| Locale | Catalog IDs scanned / queued | Variants resolved / rejected | Unsupported-modifier lots | Unmatched / missing catalog IDs | Unknown eligibility items | dataComplete |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| EN | 4804 / 4804 | 36 / 22 | 270 | 1152 / 0 | 31 | false |
| RU | 4804 / 4804 | 36 / 22 | 270 | 1152 / 0 | 31 | false |

Completed discovery describes traversal, not complete knowledge of the market. Unmatched IDs may be non-equipment; no missing scale, restriction or native item effect was guessed.

Calculations ran committed host source with fresh public Blizzard armory/auctions and the actual unchanged production API/native worker. They did not execute inside web or authenticate a browser job. Actual postdeployment results were replayed through the private UI in four EN/RU × 390/1440 px views, binding source/evidence hashes, prices, DPS and tooltips, with zero new native calls. This is not a signed-in browser search/assembly verification.

## Validation and recovery

Ten recorded code/static/regression checks, 24 synthetic UI cases, four actual-result UI replays and all seven final-image staging gates passed. Production checks passed 16 guest desktop/mobile views, nine official asset hashes, 28 standard routes and eight authentication/cache/origin boundaries. Observation covered **525.974 seconds**: web healthy, zero restarts; all nine protected containers retained identity, image, start time, restart count and health. One exact existing Next NoFallbackError is reviewed against the immutable current rollback-image 404 control; strict and reviewed evidence remain separate. No other runtime error is exempted.

This was **web only**. Worker, API, CMS, databases and import containers were not redeployed; no migration or database-data-invariance claim is made. Rollback restores previous web `gildra-web:auction-improvements-20261016-f2fbe4c`, `sha256:a059d0dbfcd33eda1b1cd2387fed4a5c620e72206c4bb48d936d736cd693eadb`, source `f2fbe4c0efbd5f9d1abbad7b1c3bc713618d954f`, using `/opt/gildra/auction-fixes-20261016-8a5f3eb-previous.env` and the saved scoped `rollout.py --rollback`. The runner refuses a different/newer manifest or web image.

Candidate `856aa30` was withdrawn before production for the remaining unknown-requirement coverage case. Its original artifacts remain in `.artifacts/auction-fixes-20261016/`; they are not substituted for this release's native or staging results.

Verified ledger tip `sha256:aa37f034ebd31c3876fcc4fcbe186eeb60758663edc1c0775ddbd7576f51f0a8`; plan `sha256:ad314e4d556e9860c84de12362d619916d24be9f820e09f55fed391f9c19947c`.
Evidence: `.artifacts/auction-fixes-20261016-r2/` and `/opt/gildra/releases/auction-fixes-20261016-8a5f3eb/`, including final postdeploy EN/RU, native/domain/oracle proofs, real/synthetic UI evidence, public checks and strict/reviewed observation.
