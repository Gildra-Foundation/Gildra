# Guided auction selection, 17 November 2026

The auction optimizer now starts with budget, encounter and one primary “Find upgrades” action. Duration, target count, objective, extra encounter comparisons and slot selection remain available in a closed Advanced settings disclosure. Their values and existing request contracts are preserved. Invalid hidden controls reveal their containing disclosures; an empty slot selection reveals and focuses the slot controls.

The selected loadout now precedes individual item suggestions and selection management. Its first metrics are equipment/loadout cost and DPS gain with uncertainty. Shopping follows immediately, with the existing availability-and-price check above the item list. Exact budget, gem/enchant costs, remaining budget, baseline DPS and candidate DPS are available in a breakdown disclosure. Alternative loadouts and single-slot suggestions remain accessible below the recommendation. Purchase checkboxes retain an accessible item-specific name without repeating the item name visibly.

Quick search still uses the same policy and precision. “Search further” is a secondary action on the existing checkpoint. Manual build/rebuild, exclusion controls, cancellation, reconnection and recovery remain reachable. A stale loadout has a visible refresh action. A recommendation is not described as globally optimal: partial traversal, incomplete item data, unknown full cost, stale prices and non-significant results remain explicitly identified.

No API, native simulation, persistence, ranking, candidate coverage or search-policy implementation changed. Existing material buttons, segmented control, typography and atlas tokens are reused; no new dependencies, assets or shared theme changes.

## Validation

Typecheck, production build, targeted ESLint and atlas token checks passed. The two existing Optimizer effect-dependency warnings remain. Planner regressions passed (17 suites), as did all 66 reliability suites. Browser checks passed 192 unique case/language/viewport combinations across guided flow, quick/full orchestration, recovery, parameter editing and shopping. Desktop/mobile EN/RU were tested at 390/1440, with additional layout checks at 768/1280. Old test assumptions about manual-only orchestration and always-visible settings were updated; final targeted reruns passed. No cases were removed.

Browser checks use the actual components in a private loopback harness with local fonts and material assets. Market data, characters, jobs and DPS are synthetic and are never mounted by the public application. Authenticated account behavior on the live site is not asserted by those checks.
