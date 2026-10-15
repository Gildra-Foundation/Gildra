# Auction slot search and exact assembly — verified deployment

Release: `auction-slots-20261015-ca51c38`.
Code source: `ca51c38621790f9f8b91ad00d62d316dd883bdef`.
Web image: `sha256:0cb85ef712290c60453c66bfd7b801fcabb962a5eece1cef84c8c13d799e178a`.
Deployed: **2026-10-15 23:08:31 UTC**. Final verification: **23:17:49 UTC**, with 101 evidence files and a verified operation ledger.

This release changes web only. The existing native worker is unchanged. It makes
no database, backend API-write or import operation. Independent enrichment may
continue; there is no claim that global database data remains unchanged.

## Behaviour

Players select combat slots, budget and encounter type, then receive every
retained real lot/slot option with native item properties, actual price, current
replacement and an individual DPS comparison. The list can sort by price or DPS;
display pagination does not remove options from the server pool. Genuine framed
icons and click/hover/focus tooltips remain shared with the character page.

Assembly is a separate action over the options the player allows, using the
original budget. The server owns the immutable character/market context; the
client submits option IDs rather than item statistics or prices. Unselected
slots remain unchanged. Before continuing, the server verifies ownership, the
current canonical character snapshot and every retained lot's identity, price,
quantity and exact variant. Changed facts require a new search.

The old 28-option shortlist and beam are removed. Exact enumeration visits every
keep-current/replacement assignment in the allowed pool. Only proven monotone
budget/lot-quantity constraints prune partial assignments; unique/category and
hand compatibility are checked after complete assignments. Equal-effect lots
remain distinct financial choices while native full-loadout results are reused.

Each chunk checkpoints its next assignment and best measured result. Partial
results say “best evaluated so far”; only `exhaustiveComplete: true` establishes
the highest simulated DPS among the allowed found options, with minimum lot cost
as tie-break. Confidence is reported separately; no sum of individual gains is
used to predict a combined loadout.

## Actual predeployment character verification

Trusted host-source checks used actual public Blizzard snapshots, the production
catalog/market and unchanged SimulationCraft worker for Элкардия, level 81 Fury.
They did not execute inside the candidate web or establish a signed-in browser
session. All 18 captured backend/script file hashes in each locale match the
committed source byte-for-byte; earlier recorded HEAD values are preserved.

| Check | EN | RU |
| --- | ---: | ---: |
| Selected slots / retained rows | 16 / 608 | 16 / 608 |
| Native search simulations / genuine chunks | 134 / 3 | 134 / 3 |
| Confirmed upgrade rows | 10 | 10 |
| Recommended/current icons | 608 / 608 | 608 / 608 |
| Complete HEAD/WRIST options / assignments | 11 / 22 | 11 / 22 |
| Assignments after explicit selected-option exclusion | 20 | 20 |

Both locales find a 15-gold wrist purchase within the original 10,000-gold budget:
item `245344`, item level 174, replaces equipped wrist `248043`, item level 120.
Measured DPS is 14,273 → 14,645, +372 (+2.606%), above the 95% margin of 63 DPS
(0.441%). Excluding the selected lot permits another genuine lot at the same
maximum and price.

Mechanical fields, lot prices, current statistics and DPS agree across all 608
EN/RU rows; localized names and generated response IDs are excluded from this
equality check. All 47 distinct RU candidate names match fresh official Russian
item controls exactly; current names match the Russian equipment snapshot.

The separate synthetic offline 16-slot oracle checks all 65,536 Cartesian states:
54,951 are valid and 10,585 exceed its synthetic budget. Independent bit-mask
enumeration matches the exact maximum and cost. It uses no real character,
market, API or native-worker data. An initial metadata-only writer failure is
preserved separately; the corrected bounded oracle passes in 2.47 seconds.

## Limits and preserved failures

The market/catalog discovery remains bounded: 6,000 scanned affordable IDs,
240 detailed catalog items, 256 variant probes and three variants per item.
All-slot discovery therefore retains `searchLimited: true`. The exact live
maximum proof covers the entire found HEAD/WRIST pool and its explicit exclusion;
full 16-slot assembly and a whole-market maximum are not claimed. Every actual
focused assignment fits the original budget; over-budget rejection is exercised
by the offline regressions and synthetic oracle.

The original `live-en/` failure is preserved: its full 16-slot search passed, then
a focused request hit HTTP400 because the catalog API disallows combining
`externalIds` with `category`. Four bounded genuine GETs proved that contract.
Corrected successful evidence is separate in `live-fixed-en/` and
`live-fixed-ru/`; no failed proof was overwritten or relabelled as verified.

## Release verification

The same immutable image passed the production build (762 routes), integrated
TypeScript, scoped lint, eight regression groups and the private API suite
(74 HTTP responses, 16 freshness/abort checks, two blocked-profile cancellation
cases). Full lint has zero errors and 273 existing warnings. Atlas tokens,
route-language parity and Atlas tests pass. A separate frozen-source review
found no blocking owner/budget/compatibility/cursor failure.

All seven official staging gates passed: unchanged landing/book, inner-page
visual comparison, accessibility, motion, resource budgets, route smoke and page
transitions. The image/source-bound staging contract verifies nine official
instance images by Git/local/HTTP hash and eight private/cache/origin boundaries.

The new auction UI was checked using the actual components and saved real
Elkardia results: EN/RU at 320/390/768/1024/1440 px, price/DPS sorting, explicit
slot and item selection, partial results, actual full/excluded assembly, current
and replacement tooltips, late-created cancellation, poll-error retry and
snapshot/locale cleanup. Fresh EN/RU 320/390 all-touch checks record only touch
pointer events, one pinned dialog and zero competing hovers. The original
mixed mouse-setup/touch screenshot remains preserved separately.

After deployment, fresh public-character runs reproduced the full table above:
608 retained options, 134 native search evaluations in three chunks per locale,
the complete 22-assignment HEAD/WRIST maximum and 20-assignment exclusion. Both
locales retain actual whole-lot prices and exact variant/stat facts; all icons
and all 47 distinct Russian names pass official controls. These runs use trusted
host source matching the deployed commit, actual production API/worker and
public Blizzard snapshots. They do not create an authenticated browser job or
execute inside the web container. Deployed web identity is checked separately.

Production checks pass for 28 standard route cases, eight guest EN/RU views at
1440/390, nine public official images and eight authentication/cache/origin
boundaries. All eight saved public viewports were reviewed without a visible
defect. Browser errors and unresolved verification failures are zero.

The final observation covers **527.975 seconds** after rollout. Web is healthy
with zero restarts. All nine protected containers retain their image/container
identity, start time, health and restart count; the native worker and API were
not redeployed. Logs have zero fatal or other runtime errors and zero response
listener warnings. One exact existing `Internal: NoFallbackError` was observed
for the expected unknown-raid404 check. The strict first observation preserves
that failure; the reviewed proof links it through immutable historical GET
control, prior review and exact previous web image `1b260d1b`. No other runtime
condition is exempted.

The public-boundary helper's first invocation could not read the root-owned
release record and stopped before network requests. That diagnostic is preserved;
the same helper passes under the intended privileged evidence-reader context.

## Identity, recovery and evidence

- Source: `ca51c38621790f9f8b91ad00d62d316dd883bdef`.
- Web: `gildra-web:auction-slots-20261015-ca51c38`, image
  `sha256:0cb85ef712290c60453c66bfd7b801fcabb962a5eece1cef84c8c13d799e178a`.
- Web container: `4fa27a226520911fde5f6fe48c3e4680c3e21c69cdf6f09b7b2846a53dd446ac`.
- Unchanged worker: `sha256:3d3209821ccec0fe2f77b3dc389ededb51ce1251e49de74ce3d1204ca5cdf0d6`.
- Unchanged API: `sha256:28df99ef1c178f65328e816da0d103f189e03e4040fb2bf2ddc994d944c924c7`.
- Plan: `sha256:4b5e502673c7c07fcced48a01955c0dd1ea5952de0c665ecf6a162474f2d7103`.
- Current release manifest: `sha256:276d404dd43e176c567d8420b9cb0529257c638f1f6567a11088f78487b05077`.
- Ledger tip: `sha256:7c7534814ec22e3e0353d0e47c44d8327dbfb5d1a56c520205dbc3caf6ebc575`.
- Recovery: previous immutable web `gear-ui-20261015-2ae23b1`, image
  `sha256:1b260d1bf6a48a1fd7a83c61c23052f4b45a19a8ee086256667dae49492a00af`;
  `/opt/gildra/auction-slots-20261015-ca51c38-previous.env` and the scoped saved
  `rollout.py --rollback`. It refuses a different/newer manifest or image.

Final evidence and the operation ledger are retained at
`/opt/gildra/releases/auction-slots-20261015-ca51c38/`. Working proof files are in
`.artifacts/auction-slot-plans-20261015/`, including the fresh
`production-en/` and `production-ru/`, `postdeploy-real-data-verification.json`,
`postdeploy-real-summary.json`, public/browser/source bindings, all native
checkpoints/reference controls and the separate offline oracle.

The release changes only web and web manifest fields. It performs no database,
backend API-write or import operation, and makes no data-count invariance claim
while independent enrichment continues. Existing schema171 recovery evidence
remains available; rollback requires no database restore. Full16 live assembly,
a whole-market maximum and a signed-in browser calculation are not claimed.
