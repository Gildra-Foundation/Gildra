# Real-character verification — 2026-10-15

Status: real auction variants/modifiers are supported and the repeated live run
found a verified improvement for Elkardia. Results below are bounded search
results, not exhaustive market optimization. Production deployment completed later at 18:40 UTC; see the
[deployment report](reports/auction-gear-deployment-20261015.md). No purchase occurred. The original run is retained as history; the repeat verification at the
end supersedes its modifier-support limitation.

## Source and setup

- Real public character: Элкардия / Eversong (Вечная Песня), EU, level 81,
  active Fury specialization 72, 16 equipped items.
- Profile, equipment, active talents and connected-realm auction data were fetched
  from Blizzard with an application token. No account/session token was invented.
- Connected realm: 1925. Verified market timestamp: 2026-10-15 17:36:06 UTC.
  The snapshot had 18,560 buyout lots; 2,207 had no item modifiers.
- Current worktree catalog code ran on loopback port 58085 against the existing
  catalog. PostgreSQL was forced read-only on every connection; the probe checked
  `SHOW default_transaction_read_only` before accepting requests. No migration,
  import, publication or shared-service restart was performed.
- Current worktree worker ran separately on port 58084, using the existing SimC
  binary, 750 iterations and no database. The maintained Fury preset was read
  from the existing public preset endpoint on port 58082; responses were not mocked.
- Engine: `SimulationCraft 1210-01 · 18428cd`. Single target, 120 seconds.
- Test called the internal snapshot runner with the real armory. The production
  HTTP route still resolves owned characters before calling that runner. This
  check does **not** verify browser sign-in or the user-scoped ownership endpoint.

## Defects found and corrected

1. `item_registry.inventory_type` contains numeric DB2 values **and** Battle.net
   codes such as `CHEST`, `WEAPON` and `TWOHWEAPON`. The numeric-only parser silently
   made the latter zero. Added explicit normalization for both catalog formats,
   including equipped-loadout constraints, with regression checks.
2. Fury's Titan's Grip incorrectly excluded polearms. The real character already
   wore polearm 248074 with two-handed sword 251255. Corrected the Retail two-handed
   weapon proficiency list, including polearms/staves, and added the observed pair
   to regression coverage. Blizzard's current spell API for 46917 confirms dual
   wielding two-handed weapons; its official 5.4 notes also document polearm support.

The first exploratory calculation used a preview APL fallback because the isolated
worker had no profile directory; it is not the final verification result. Subsequent
runs used the maintained public preset and produced a repeatable 14,273 baseline DPS.

## Original results before modifier support

| Budget | Catalog matching | Search | Result |
| --- | --- | --- | --- |
| 10,000 gold | 321 item IDs scanned, 98 detailed, 443 lots matched | 21 options, 48 simulations, bounded search | 0 purchases, 0 gold spent; no measured improvement beyond uncertainty |
| 0 gold | 0 affordable lots | baseline only | 0 purchases, 0 gold spent |

The unchanged baseline was 14,273 DPS in both final runs. The baseline-versus-itself
comparison margin was about 63 DPS (0.435%); this is comparison uncertainty, not an
observed improvement. At most 22 runs could be baseline/singles for 21 options,
so the 48-run pass necessarily exercised simultaneous replacements as well.
Budget, remaining currency, genuine engine and positive DPS assertions passed.

## What this does and does not establish

The corrected compatibility checks, actual catalog reads and SimC execution work
on the real character. It does **not** establish that the entire live market has no
upgrades. Most live equipment lots carry modifiers, while that implementation
rejected every nonempty modifier list. Inspected catalog items also commonly have
only the base variant (context 0, empty bonuses), which cannot represent the live
lot's bonus/context/scaling combination.

The next priority at that point was resolving effective auction variants and supporting the common
modifier semantics, especially observed types 9 and 28, without dropping their
meaning. Validate the resulting effective item level/stat values against the source
and SimC, then repeat this exact character/budget search. This is a data-coverage
and variant-resolution task; changing DPS ranking cannot restore excluded lots.

## Checks and evidence

- `test-auction-gear.mjs`, `test-gear-candidates.mjs`, `test-gear-simulation.mjs`
  and `test-auction-services.mjs` passed after the fixes.
- TypeScript and targeted ESLint passed (the repository emits its existing Pages
  directory warning). Targeted catalog, rotationlab and HTTP Go tests passed;
  the read-only probe command compiled.
- Local raw evidence is under `.artifacts/auction-live/` (gitignored): live public
  armory/market snapshot, coverage diagnostics and results for budgets 10,000 and 0.
  Credentials and OAuth tokens were not written into those reports.
- The automatic reviewer rejected copying an entire shared profile directory due
  to the potential presence of other users' data. That operation was not executed.
  Reading the public preset API was sufficient; no action remains blocked by it.

Reproducible probe entry points: `scripts/qa-auction-market-live.mjs`,
`scripts/qa-auction-coverage-live.mjs`, `scripts/qa-auction-gear-live.mjs`, with Node's
`--experimental-transform-types --import ./tests/auction/resolve.mjs` and the
existing environment credential references. The Go catalog probe listens only on
loopback and rejects non-GET requests. Do not use a read-write DB connection.

References:
[Blizzard spell endpoint documentation](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis),
[official polearm support notes](https://worldofwarcraft.blizzard.com/en-gb/news/10158897/54-ptr-now-live-updated-september-4).

## Repeat verification with real modifiers — 18:14 UTC

Same character, talents, encounter, maintained preset, market snapshot and budget.
A separate locally built worker used the pinned SimC source plus the checked-in
metadata patch. The public catalog remained read-only. The patch and the compiled
source files were compared by SHA-256; both matched. Existing production workers
were not replaced or restarted.

The first expanded search exposed a false positive: old item 224620 with drop
level 77/content tuning 2808 resolved to ilvl 532, required level zero and 1,193
primary stat. Blizzard's official control tooltip for that item is ilvl 73,
requires level 70, and has 16 primary stat. Even the top-level API `level` is 545,
so blindly trusting that field would not catch the problem. Added mandatory
native-versus-Blizzard control checks for effective tooltip level, requirements
and primary/secondary stats. The unsupported item family is excluded. Also found
and rejected an unsigned-underflow item level, 4,294,967,291. The exploratory
+360% result was invalid and is **not** the recommendation.

Final run completed at **2026-10-15 18:14:37 UTC**:

| Metric | Result |
| --- | --- |
| Budget | 10,000 gold |
| Selected auction | #1071542782, item 245344, Evercore Gear Weight, wrists |
| Effective item/required level | 174 / 81 |
| Exact lot price / quantity | 15 gold / 1 |
| Remaining budget | 9,985 gold |
| Baseline → selected DPS | 14,273 → 14,645 |
| Measured gain | +372 DPS, +2.606% |
| Comparison uncertainty | ±63 DPS, ±0.441%; significant at the worker's 95% confidence |
| Search | 28 options, 48 simulations; bounded |
| Market | EU/Eversong connected realm 1925, snapshot 17:36:06 UTC |

The lot has bonuses `4785/12248/12249/12496/12667`, context 13 and modifiers
`28=3615, 29=40, 38=7, 39=52425, 40=2841, 42=231, 48=246211`.
Its resolved stats are 24 strength/intellect, 301 stamina and 41 versatility.
The control variant independently agrees with Blizzard at ilvl 165, required
level 81, 22 strength/intellect, 258 stamina and 39 crit. Actual lot metadata is
resolved separately; no control stats are substituted into the recommended lot.
Auction ID, full buyout price, quantity, all bonuses/context/modifiers, native
stats, character level, total spend and significant gain were independently
asserted against the saved real market/native responses.

Coverage: 14,358 affordable lots; modifier semantics supported for 14,030,
328 unsupported. Scanned 4,449 item IDs, detailed 240 published catalog entries.
Of 90 item families probed, 50 reproduced the official control and 40 did not.
Of 119 actual variants probed, 72 passed verification and 47 were excluded;
339 real lots matched the resulting eligible variants. This is intentionally
conservative. Neither those excluded lots nor the bounded search can establish
that the recommendation is globally best across the entire auction house.

The zero-budget control also passed with the final code: 14,273 baseline DPS,
one simulation, no purchases, zero spent. Browser authentication/ownership was
not exercised: the QA entry point still uses a trusted **real public** snapshot,
while the production HTTP route requires the authenticated owned character.

Final evidence is local and gitignored under `.artifacts/auction-live/`:
`plan-result-10000.json`, `plan-result-0.json`, `resolved-variants-10000.json`,
`item-references-10000.json`, and the real armory/market snapshot. Logs, build
checks, source hashes and RU/EN browser screenshots are under
`.artifacts/auction-variants/`. No OAuth tokens or credentials are in these files.

Regression checks cover modifier serialization/identity, unknown modifiers and
bonuses, stale workers, response binding, hybrid stats, current tooltip parsing,
old-scale false positives and native level underflow. Targeted Go tests,
TypeScript and ESLint passed. RU/EN browser checks covered 320/390/768/1440 px,
keyboard expansion of raw lot details, focus, reduced motion and result/error/
cancel states with no page errors. The production web build passed. Temporary
local harness pages/configuration were removed/restored after verification.

Sources: [Blizzard Item API](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis),
[official SimC add-on exporter](https://github.com/simulationcraft/simc-addon/blob/master/core.lua),
[pinned native scaling implementation](https://github.com/simulationcraft/simc/blob/18428cd3902412abc8ee274d19567d603e674e66/engine/dbc/sc_item_data.cpp).

Production publication and verification are recorded in the [deployment report](reports/auction-gear-deployment-20261015.md).
