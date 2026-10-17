# Auction value recommendations — verified web release

Deployed `auction-value-speed-20261017-d2fe4db` to gildra.net on 2026-10-17 at
10:04 UTC and completed postdeployment verification at 10:12 UTC. Runtime source
is `d2fe4dba67de5ed80c3e9e6f087e78bebab7760e`; the subsequent documentation commit
does not require another deployment. Commits and release tag use Shpuntyara's
verified GitHub noreply identity. Normal atomic fast-forward published master,
the feature branch and the release tag; no history was rewritten.

The default list now shows one confirmed best-value upgrade per slot using
whole-lot price divided by additional DPS. Duplicate lots and financially
inferior choices are grouped away. Up to two useful alternatives open through a
separate button. Exact item frames/tooltips remain; equipped-item comparison,
confidence and inclusion controls start folded. Recommendations precede the full
assembly area, accessible beside the search action. Repeated budget counters
and long introductory explanations were removed.

Fresh searches publish the baseline and two single-item comparisons after the
first usable variant batch. Later automatic responses use eight new comparisons;
the first set uses eight new set simulations. Complete enumeration remains
resumable with the original native precision. Building from published choices
safely retires background discovery before starting assembly. The complete
financial/native option pool is retained for compatibility, quantity and budget
checks; display grouping does not prune the assembly domain. Individual value
ranking and whole-set maximum-DPS optimization remain separate objectives.

## Actual Элкардия evidence

Character: Элкардия, Eversong EU, level 81. Fresh public Blizzard armory/auction
data and the unchanged native engine `SimulationCraft 1210-01 · 18428cd` were used.
After loading the public armory snapshot, the final RU host-source check published
its first confirmed choices in **12.022 seconds**. A continuation produced the
next useful slots by 28.272 seconds; the first assembly then took **16.824 seconds**.
These are separate calculation-stage timings, not a signed-in browser latency SLA.

An earlier fresh EN comparison demonstrated why price alone is insufficient:
Blood-Tempered Greaves at 30 gold measured +744 DPS; another exact variant at
393.76 gold measured +791 DPS. Both gains exceeded baseline uncertainty; the
small difference between those point estimates is not claimed to be significant.
The 30-gold variant has much better cost per additional DPS.

After deployment, profile and lot availability/prices were revalidated, then two
new baseline/set calls bypassed the retained web comparison cache through the
actual production worker. The confirmed CHEST + FEET + WRIST set cost
**832.85 gold** within the 10,000-gold budget:
**20,222 → 22,245 DPS**, **+2,023 / +10.004%**, 95% margin **±85 DPS**.

These calculations execute current host server functions whose source bytes match
the deployed Git archive, using private copied QA checkpoints. They do not claim
an authenticated production-browser run or execution inside the web container.

## Verification and deployment scope

- 33 offline suites passed, including a 250-pool independent value oracle,
  exact variants, compatibility, budget/quantity allocation, complete eventual
  optimum, private ownership, restart recovery and durable cancellation.
- The latency guard reproduced 10 metadata batches / 40 measured choices before
  first feedback on a synthetic 120-effect pool; it now publishes after one
  usable batch and two fresh single-item comparisons. All 120 effects remain
  reachable and the complete optimum is preserved.
- 108 completion and 80 existing reliability browser cases passed. Twelve cases
  then rechecked formatter reuse and 24 cases verified the final presentation:
  EN/RU, 320/390/1440 widths, alternatives, keyboard, first-viewport placement,
  empty/error states, changed exclusions and build-during-discovery cancellation.
- TypeScript, scoped ESLint (no errors), atlas token and route/mirror checks
  passed. React Doctor's remaining findings concern module-initialization
  formatters and deterministic test fixtures/sequential continuation tests;
  no rule suppression or dependency was added to the application.
- The production image was built from the exact clean Git archive. Its private
  loopback container passed seven published-route checks, nine official static
  asset hash/HTTP checks and eight anonymous/cross-site auth boundary checks.
- After deployment, the new public planner JS matched the image byte-for-byte
  (`37b7b20545d93b847e02cc51111b882fba77c1fb91bd8a6201ac47f673509222`).
  Anonymous public character pages passed EN/RU mobile browser checks without
  page errors or horizontal overflow. A 123.5-second, 13-sample observation found
  a healthy web, zero restarts and zero runtime-error matches.

Only web was recreated; existing nginx was reloaded to resolve its address.
Protected worker, API, CMS, database, cache and import containers retained their
identities and restart counts. There were no migrations or data imports, and no
claim of database-data invariance is made.

Web image: `sha256:623b9618239a92acfcb1ecbfac405789c4c43425a0e823b48947fda3a41b186c`.
Container: `9542660bbf74a66531db05746e3f41768e3135e8bd8d16ef585a1b85801b884c`.
Worker image remains `sha256:79669d0ec0dae5701700afebff3043ee5b8515ac9f41671863a302347b1701bf`.

Rollback restores previous web `sha256:c29281f2fc213c8b574ce13e9f2b1e65ff7be550476bb7f222988c1dccaf4236`
and the exact manifest saved at
`/opt/gildra/auction-value-speed-20261017-d2fe4db-previous.env`, using the guarded
`/opt/gildra/releases/auction-value-speed-20261017-d2fe4db/rollout.py --rollback`.
It refuses a different/newer manifest or image. No production rollback was needed.
