# Auction gear search and exact loadout assembly

Implementation: `apps/web/lib/wow/auctionGear*`, `auctionMarket*`,
`gearCompatibility.ts`, `/api/wow/auction-gear-plans` and the character equipment page.

Latest verified deployment: [six auction planner review fixes](reports/auction-fixes-deployment-20261016.md). Fresh WRIST exact results and bounded 16-slot checks are reported separately.

## Behaviour

An authenticated player selects combat slots, a gold budget and encounter type. The server
resolves an owned Battle.net character, active specialization, talents, equipped
items and the character's connected realm. Prices come from the regional Blizzard
connected-realm auctions endpoint. There are no purchases or inventory mutations.

Search and assembly are separate actions. The server retains every found real
lot/slot option with its classification. The interface displays and selects
only confirmed upgrades: evaluation=upgrade, positive individual DPS gain and
a gain above the 95% comparison margin. Negative, inconclusive, pending and
individually incompatible rows remain in the private raw pool. Assembly checks
the complete verified pool, including combinations that repair an individual
conflict or improve DPS despite individually weak ingredients. These ingredients
appear in a purchase list only when the measured whole set is a confirmed
improvement. All genuine
positive financial choices remain available without deduplication. Default
ordering is price ascending, then DPS gain descending for equal prices.
Sorting and incremental display never truncate the server pool. Actual icons, native
variant properties and the actual equipped replacement appear in the shared
character tooltip, including independently localized current-item names.

The private server context binds the original budget, selected slots, character,
equipment, talents, encounter and market. Assembly accepts only retained option
IDs known to the owner; client prices or statistics are never accepted.
The current UI sends excludedOptionIds; an empty exclusion list considers the
entire verified pool with the same original budget. Legacy allowedOptionIds
remain supported for older callers. The two selection modes are mutually
exclusive, and forged or foreign IDs are rejected. New searches,
selection changes clear the assembly because its allowed pool changes. Resumed
searches, cancellation and errors retain the previous confirmed assembly as a
read-only snapshot with unverified prices until a successful current result arrives.
Unselected slots retain their current items. A non-Fury two-handed replacement
can remove an equipped offhand only when OFF_HAND is also selected. Before each
continuation/assembly, the server checks ownership, the canonical character
snapshot and the current lot prices, quantities and exact variants against a
fresh conditional market read. Sold lots are removed, changed prices/quantities
replace the old facts, and new effects enter discovery. Economic changes reset
the affected traversal while preserving mechanical simulation results. An
authoritative updatedSearch replaces stale visible rows after assembly.

The 28-option shortlist and beam have been removed. Assembly deterministically
enumerates keep-current or one distinct item effect for every selected slot.
Groups share both native input identity and equipment constraints. An exact
allocator chooses real lots for each effect assignment, including shared-lot
quantity and whole-buyout cost. Ten equivalent offers in four slots therefore
require 16 effect assignments rather than 14,641 lot assignments, while every
offer remains available for procurement and explicit exclusions.
Only monotone total-lot-cost/quantity constraints prune incomplete states; unique
categories and hand compatibility are checked on the completed loadout. Equal
item effects share native simulations without collapsing lot cost/quantity
choices. Combined DPS is measured directly, never summed from individual gains.
Bounded full-set seeds and an early pair pass find useful simultaneous swaps
before the full cursor reaches them. These change evaluation order without
truncating the exhaustive domain. Before a pool or exclusion reset, previous
measured/confirmed effect choices become warm-start proposals. Each proposal is
reallocated to currently allowed real lots and rechecked for current price,
quantity, budget and compatibility before its cached measurement can be reused.

A serializable cursor, compact five-field simulation cache and separate best
measured/best confirmed results survive a chunk boundary. Assembly checkpoint
version 3 records full-set seeds, the pair cursor and both best choices;
combinationKind=effects identifies the count semantics. The default chunk allows
48 new native calls, 100,000 visited assignments
and a 90-second runner window. These are continuation boundaries, not permanent
pool or combination caps. Cache-only traversal yields cooperatively for
cancellation. The highest measured DPS is claimed only when exhaustiveComplete
is true; partial results show the best evaluated result so far. Equal maximum
DPS uses the lowest total lot cost. Statistical significance is reported
separately from the measured maximum. A noisy positive maximum is inconclusive
and cannot erase a lower, confirmed upgrade. `bestConfirmed` contains the
actionable shopping list and its own cost/comparison; the existing main result
fields continue to describe the highest measured result. The UI labels both.

The planner identifies an auction variant by **item ID + context + exact bonus ID
set + every modifier type/value pair**. Auction ID, price and quantity stay on
the offer, separate from item identity. The variant key is stable regardless of
bonus/modifier ordering. Same-ID variants are never collapsed into the base item.

Published catalog records supply equipment restrictions and acquisition evidence.
Their imported variant list is no longer the authority for live auction variants.
The offline worker resolves the actual auction payload with the same pinned
SimulationCraft database used for DPS comparisons. It returns effective item
level, required character level, stats, quality, equip type, uniqueness, set and
exact weapon damage/DPS/speed when available. Displayed weapon DPS is the mean
of resolved minimum/maximum damage divided by swing time, matching the official
preview's endpoint rounding; the unrounded DBC combat value is not substituted
for tooltip DPS. This presentation conversion leaves native combat unchanged. The optional weapon report is
backwards compatible with workers that do not yet expose it. Effect descriptions
come only from a localized official reference with the same context, bonuses and
modifiers after native control verification. Missing descriptions/weapon details
are explicit in the tooltip; base descriptions never substitute for scaled facts.
The planner checks native/catalog equip types agree and excludes items above the
character's level. Unknown bonuses, content tuning or redirected stat sources
exclude the variant rather than silently substituting base stats.

Before accepting an item's auction variants, the planner fetches its official
Blizzard `preview_item` and resolves that exact control payload in the native
engine. Effective tooltip ilvl, required level and reported primary/secondary
stats must agree, including hybrid primary stats. The top-level API `level` is
not used as the current tooltip level: live item 224620 reports 545 there but 73
in `preview_item.level.value`. The live check caught the pinned engine producing
532 and greatly inflated stats for that old auction item. Its family is now
excluded when the control cannot be reproduced. This check validates native
support for the item's control variant; Blizzard does not expose the complete
live auction tooltip, so it is not a direct server verification of every lot.
The actual lot is still resolved independently with all its raw modifiers.
Unsigned-underflow levels and zero-level results for a control that requires a
positive level are also excluded. No guessed scale conversion or ilvl override
is applied. Reference reads use four concurrent requests, a 15-minute bounded
public-data cache, cancellation and a 512 KiB per-response limit. HTTP failures
stop the job; missing or malformed references exclude the item with coverage
recorded. No authenticated character/session data is stored in that cache.

Supported item modifiers follow the official SimC add-on exporter:

- 9 → `drop_level`; 28 → `content_tuning`.
- 29/30 → ordered `crafted_stats` (crit/haste/versatility/mastery).
- 64 → `redirected_base_stats`, with a verified source item in the native DB.
- 38–51 → crafting reagent identities: retained in exact matching and result
  details. Their applied combat effects come from the bonus list, as in the
  official add-on; they are not interpreted as stat values.

Unknown types, duplicate types, invalid values and oversized lists are rejected.
Context is preserved and serialized; SimC itself treats it as context metadata,
while bonus IDs and supported modifiers determine the combat item. Server results
retain the raw bonuses/context/modifiers; the purchase interface presents the
resolved item properties, whole-lot price and equipped-item replacement.

Equipment rules cover slot, class proficiency, armor specialization, weapon
specialization, class/race/faction/level restrictions, unique equipped IDs and
limit categories. Fury two-handed pairs are handled separately; other two-handed
replacements remove the off-hand item from the candidate snapshot only if that
slot was selected. Profession,
ability, reputation and holiday requirements that cannot be confirmed from the
snapshot exclude the candidate. Catalog limit-category quantities are respected.

All prices and budget calculations use integer copper. Buying a quantity-two lot
costs its whole buyout once; a quantity-one lot cannot fill both ring slots.
Alternatives and simultaneous swaps are simulated against the same immutable
armory, talent and encounter snapshot. Results require the SimulationCraft
engine; estimated training
engines are rejected. Search marks a positive single replacement as confirmed
only when its gain exceeds the 95% comparison margin. Exact assembly ranks
measured full-loadout DPS and reports the margin independently.
The existing single-slot comparison now also validates the complete loadout.
Replacing an item with the same item ID/bonus list still goes through native
simulation: modifiers, gems, enchants and the actual replacement snapshot can
differ. A superficially equal item never aborts the entire search.
The worker accepts structured multiple-slot replacements and real-size armory
JSON bodies (2 MiB HTTP limit; each armory section remains limited to 512 KiB).

## Result presentation

Release `gear-ui-20261015-2ae23b1` shows framed genuine new/current item icons and
the shared character equipment tooltip with the exact native auction variant.
Budget/spend/remaining gold, whole-lot quantity and price, current/candidate DPS
and the measured whole-loadout gain are separately labelled. The interface
explains DPS and the 95% comparison margin. Unknown properties are not replaced
by catalog base stats. Late-created cancelled jobs are deleted, failed polls
allow retry, and character/snapshot/specialization/locale changes clear results.
Fresh postdeployment Elkardia EN/RU checks reproduced 15 gold within a 10,000-gold
budget and 14,273 → 14,645 DPS (+2.6063%). See the
[verified UI release report](reports/gear-planner-ui-deployment-20261015.md)
for source/image identities, browser coverage and its authentication limit.

The current confirmed-upgrade interface places one **Build a loadout within
budget** panel immediately after the original-budget/current-DPS/upgrade-count
summary, before the item list. The action becomes available when the verified
internal pool has candidates, even if no individual replacement is an upgrade.
Partial searches show already confirmed upgrades and aggregate remaining
progress; they do not display unfinished or unconfirmed rows.

Whole-loadout baseline/candidate DPS, total lot cost and remaining budget are
separately labelled. **Items to buy for this loadout** lists replacements;
other slots keep their equipped items. A return link below the list focuses
the single assembly panel. A maximum is claimed only after exhaustive
enumeration of the selected verified discovered pool, including
keeping current equipment. It is not a whole-market maximum. Partial
results and statistical significance remain explicit. One click runs one bounded
assembly chunk, displays its best measured result and offers Continue when more
work remains. Completion describes the verified discovered pool; missing data
never becomes a claim that no upgrades exist. See the historical
[confirmed-upgrade release report](reports/auction-improvements-deployment-20261016.md).

## Historical slot-search verification

Code source ca51c38621790f9f8b91ad00d62d316dd883bdef is bound to the actual QA by
file hashes; the checks ran trusted host source rather than inside candidate web
and did not create an authenticated browser session. Fresh Elkardia EN/RU checks
returned all 608 retained lot/slot rows across 16 selected slots, naturally paused
and continued over three chunks and 134 native simulations, and found ten
confirmed wrist improvements. All 608 recommended/current icons are present.
All 47 distinct Russian candidate names match fresh official Russian controls;
current names match the official Russian equipment snapshot. Mechanical fields,
prices and DPS match across locales independently of translated text.

For the complete found HEAD/WRIST pool, an independent recursion checks all 22
assignments against actual cached native results, proving a 15-gold maximum at
14,645 DPS from the 14,273 baseline. An explicit selected-option exclusion checks
all remaining 20 assignments and finds an alternative real lot at the same
maximum. Locked slots remain unchanged. Full 16-slot assembly was not attempted.

The existing normal auction regression entry point includes the exhaustive suite
(ten-slot nonlinear synergy, resumability, shared-lot economics, repaired unique
pairs, locking, uncertainty, engine drift and cancellation). A separate explicitly
synthetic offline 16-slot oracle covers 65,536 states with an independent nonlinear
objective and budget; 54,951 are valid and 10,585 are over budget. It makes no
native or API request and is not real-character evidence.

The first focused QA failure is preserved separately: the published catalog API
rejects externalIds combined with category. Corrected code uses the supported externalIds contract. Release
`auction-slots-20261015-ca51c38` was deployed at 23:08:31 UTC and verified at
23:17:49 UTC. Fresh production EN/RU repeated the 608-row search and complete
22/20-assignment focused/excluded assemblies. The seven staging gates, public
checks and 527.975-second observation pass. See the
[verified slot-search release report](reports/auction-slot-plans-deployment-20261015.md)
for image identities, exact scope, recovery and evidence.

## Bounds and operational requirements

- DPS optimization supports melee and ranged damage specializations. Tank,
  healer and support optimization need their own objective functions.
- Blizzard auction snapshots must have a verified Last-Modified timestamp no
  older than two hours. Same-realm snapshots are reused for five minutes and
  conditionally refreshed. No stale fallback is used on upstream failure.
- Equipment auctions only; regional commodities and bid-only auctions are excluded.
  Unpublished/missing catalog items and variants the native DB cannot verify are
  excluded. Coverage reports distinguish unsupported modifiers and failed native
  resolutions. A later SimC data refresh can be needed for newly added bonuses.
- Discovery has no permanent item-ID, detail, per-item variant or global variant
  cap. Persisted cursors process catalog IDs in batches of 100, details in batches
  of eight and exact variants in batches of four. Known slot summaries filter
  irrelevant records before expensive detail/native work; actual restrictions
  remain authoritative. One continuation performs bounded work and yields.
  Effective ilvl is always resolved natively before recommendation. Every retained
  lot/slot option remains in the server result; the UI displays confirmed singles.
  discoveryComplete describes completed traversal; dataComplete separately reports
  unresolved references, variants, modifiers and missing catalog records. IDs not
  matched by the equipment catalog are reported as unknown, not assumed to be
  equipment or silently counted as verified. Missing equip metadata and skill,
  reputation or other equip requirements absent from the character snapshot are
  counted separately as eligibilityUnverifiedItems. These items remain excluded
  and make dataComplete false. Search and exact assembly continue
  in bounded chunks. exhaustiveComplete proves the highest measured DPS over the
  selected verified discovered pool, including keeping current equipment.
  A large Cartesian pool can require many continuations; no full-market or
  uncompleted maximum is claimed.
- Baseline constraints must be available for every equipped combat item. Missing
  constraints stop the calculation rather than assume equipment is compatible.
- Whole-lot prices exclude new enchants and gems. The unchanged slots retain
  their current enchants and gems. Offers are snapshots and cannot be reserved.
- Jobs are private to the authenticated owner. One active job per owner, eight
  queued jobs, start throttling (three new searches and sixty continuations per
  minute), cancellation, a ten-minute execution deadline and thirty-minute result
  expiry bound resource use. Private search contexts expire after thirty inactive
  minutes and are limited to three per owner and forty globally; inactive contexts
  can be evicted. Continuation refreshes the active context lifetime.
- Reload recovery uses private owner-bound GET with searchId, characterSlug and
  locale. Session storage retains opaque job/search IDs and exclusion IDs, never
  credentials or authoritative prices. Recovery restores the original server
  budget and marks prices unverified; the next continuation refreshes them.
  An initial request ID is stored before POST, so reload can recover an accepted
  search even when its202response has not arrived. Repeating the same owned
  request cannot create a duplicate calculation or change its original budget.
  Unsaved local exclusions survive reload and cancel incompatible active work.
  Exhausted polling can reconnect to the same job; changing exclusions retires
  that job before starting a new assembly. A delayed POST cannot erase its
  intended search/assembly mode during reload. Brief network failure retries
  polling without duplicate POSTs. Character/locale/profile changes invalidate
  the corresponding client scope and cancel outstanding work.
- Snapshot fingerprints cover native mechanical inputs, exact gear, talents and
  quantitative stats. Presentation names, links, achievements and JSON ordering
  do not reset work. Legacy Azerite projection follows the pinned native importer.
- Shared market requests have a bounded upstream lifetime; an individual caller
  can stop waiting without cancelling another consumer. Negative item references
  retry after15minutes, requeueing affected variants while preserving good work.
- Jobs/cache are **in process**, following the current optimizer architecture.
  A restart loses them. Multiple replicas require sticky routing or a shared
  durable queue before horizontal scaling. Browser cancellation does not cancel
  unrelated users' work.
- The slot-search release changes web only and uses the existing API/worker. No
  database migration or import is needed.
  The worker must include `infra/simc/gear-metadata.patch` and the existing
  `POST /v1/wow/gear/variants` endpoint. An old binary fails explicitly with
  `variant_metadata_worker_upgrade_required`; it is never accepted as a resolver.
  The patch exports native metadata, includes active proc-only items in that
  export, and initializes the pinned engine's otherwise uninitialized content
  tuning field to zero. SimulationCraft stays pinned at `18428cd3902412abc8ee274d19567d603e674e66`.
  Existing catalog/API/Battle.net
  configuration are required. This change does not deploy or import data.

## Verification

From `apps/web`, with Node 24:

```sh
node --experimental-strip-types --no-warnings --import ./tests/atlas/resolve.mjs scripts/test-gear-candidates.mjs
node --experimental-strip-types --no-warnings --import ./tests/atlas/resolve.mjs scripts/test-gear-simulation.mjs
node --experimental-strip-types --no-warnings --import ./tests/atlas/resolve.mjs scripts/test-auction-gear.mjs
node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-services.mjs
node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-variants.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-gear-api.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-gear-search-store.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-gear-equipment.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-gear-recommendations.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-discovery.mjs
node --experimental-transform-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-gear-review-fixes.mjs
```

The recommendation guard has synthetic offline cases. An explicitly supplied
saved-result replay is historical evidence, not a fresh market calculation.

From `backend`: `go test ./internal/rotationlab ./internal/catalog ./internal/httpapi`.
The test-first reliability suite is `npm run test:auction-reliability` from
`apps/web`; it exercises actual modules with synthetic offline transports.
`npm run qa:auction-reliability-ui -- --phase green --label <unique-label>` runs
versioned Playwright regressions in a generated private loopback project. No QA
route is added to the published application. Set `PLAYWRIGHT_BROWSERS_PATH` to the
installed browser cache when it is outside the default location. The complete
14-finding acceptance matrix and preserved RED baseline are documented in
[the reliability plan](auction-reliability-plan-20261016.md).

The regression checks cover raw modifier identity/order, crafted stats, native
metadata requirements, unknown native bonuses, native level underflow, Blizzard control-variant
level/stat mismatches, resolver response binding, old
worker rejection, exact/ambiguous variants, base items, same-ID upgrades,
weapon rules, unique categories, two-handed removal, stack quantity, joint swaps,
integer budgets, uncertainty, freshness, realm binding, ownership and cancellation.
UI smoke checks use mocked API responses strictly on temporary local harness
pages; these pages are removed after testing and are not product fixture routes.
A live public-character calculation was subsequently completed; see
[the real-character verification report](auction-gear-live-verification.md).
Browser sign-in/ownership verification remains separate from that public-armory check.

References: [Blizzard Game Data APIs](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis),
[SimulationCraft equipment](https://github.com/simulationcraft/simc/wiki/Equipment),
[official SimC add-on item exporter](https://github.com/simulationcraft/simc-addon/blob/master/core.lua),
[pinned item parsing](https://github.com/simulationcraft/simc/blob/18428cd3902412abc8ee274d19567d603e674e66/engine/item/item.cpp),
[pinned item scaling](https://github.com/simulationcraft/simc/blob/18428cd3902412abc8ee274d19567d603e674e66/engine/dbc/sc_item_data.cpp).

Verified locally on 2026-10-15: the four regression scripts, targeted Go tests,
TypeScript, targeted ESLint (no errors), atlas token checks and route parity.
The production build completed. The shared local node_modules installation
required a temporary Next tracing/Turbopack root override for that build; the
original project configuration was restored afterward. Browser checks covered
RU/EN at 320, 390, 768 and 1440 px, loading/results/empty/stale-error/cancel states,
keyboard submission, visible focus and reduced motion; no page errors occurred.
The initial implementation was verified locally; production publication at
2026-10-15 18:40 UTC is recorded in the
[deployment report](reports/auction-gear-deployment-20261015.md). The subsequent live public-armory verification is recorded in auction-gear-live-verification.md.

The fourteen-finding reliability repair is deployed as runtime source `764210f`.
Test-first regressions, fresh postdeployment Elkardia EN/RU, actual-result UI
replay, scoped web/worker rollout and recovery are recorded in
[the verified reliability release](reports/auction-reliability-deployment-20261016.md).
