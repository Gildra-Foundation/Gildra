# Auction gear planner: first stage

Implementation: `apps/web/lib/wow/auctionGear*`, `auctionMarket*`,
`gearCompatibility.ts`, `/api/wow/auction-gear-plans` and the character equipment page.

## Behaviour

An authenticated player enters a gold budget and encounter type. The server
resolves an owned Battle.net character, active specialization, talents, equipped
items and the character's connected realm. Prices come from the regional Blizzard
connected-realm auctions endpoint. There are no purchases or inventory mutations.

The planner identifies an auction variant by **item ID + context + exact bonus ID
set + every modifier type/value pair**. Auction ID, price and quantity stay on
the offer, separate from item identity. The variant key is stable regardless of
bonus/modifier ordering. Same-ID variants are never collapsed into the base item.

Published catalog records supply equipment restrictions and acquisition evidence.
Their imported variant list is no longer the authority for live auction variants.
The offline worker resolves the actual auction payload with the same pinned
SimulationCraft database used for DPS comparisons. It returns effective item
level, required character level, stats, quality, equip type, uniqueness and set.
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
replacements remove the off-hand item from the candidate snapshot. Profession,
ability, reputation and holiday requirements that cannot be confirmed from the
snapshot exclude the candidate. Catalog limit-category quantities are respected.

All prices and budget calculations use integer copper. Buying a quantity-two lot
costs its whole buyout once; a quantity-one lot cannot fill both ring slots.
Alternatives and simultaneous swaps are simulated against the same immutable
armory, talent and encounter snapshot. Set interactions can beat an individually
negative swap. Results require the SimulationCraft engine and a gain greater
than the comparison uncertainty; estimated training engines are rejected.
The existing single-slot comparison now also validates the complete loadout.
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
- The search scans at most 6,000 affordable item IDs, details at most 240 catalog
  items and resolves at most 256 distinct variants, up to three per item. Cheap
  and high-base-ilvl catalog items seed that bounded pool; effective ilvl is always
  resolved natively before recommendation. Native resolution batches contain at
  most 16 items and have a 60-second deadline. At most 28 options across slots and
  48 DPS simulations test singles, paired weapon/category swaps and a beam of
  combined loadouts. This is the best tested loadout, not proof of a global optimum.
  The UI discloses bounds and matched-lot coverage.
- Baseline constraints must be available for every equipped combat item. Missing
  constraints stop the calculation rather than assume equipment is compatible.
- Whole-lot prices exclude new enchants and gems. The unchanged slots retain
  their current enchants and gems. Offers are snapshots and cannot be reserved.
- Jobs are private to the authenticated owner. One active job per owner, a bounded
  queue, start throttling, cancellation, a ten-minute execution deadline and
  thirty-minute result expiry bound resource use.
- Jobs/cache are **in process**, following the current optimizer architecture.
  A restart loses them. Multiple replicas require sticky routing or a shared
  durable queue before horizontal scaling. Browser cancellation does not cancel
  unrelated users' work.
- Deploy the web and backend changes together. No database migration is needed.
  The worker must include `infra/simc/gear-metadata.patch` and the new
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
```

From `backend`: `go test ./internal/rotationlab ./internal/catalog ./internal/httpapi`.
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
