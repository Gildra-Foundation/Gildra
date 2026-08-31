# Gildra Warcraft library: production plan

## Product boundary

The public library contains canonical World of Warcraft game data only. Tier-list datasets from Wowhead, Archon, wow.gg, Icy Veins, MythicStats and similar sources are not joined to the Warcraft foundation catalog.

The canonical entity is stored once. Named datasets such as Weapons and Armor are stable, curated views over published entity versions and taxonomy membership; they do not duplicate payloads.

## Public experience

- `/library` and `/ru/library`: product switcher, curated datasets, exact record counts, build, freshness, tooltip coverage and image coverage.
- `/library/{dataset}`: searchable and filterable entity directory pinned to the selected dataset.
- `/library/{dataset}/{type}/{id}/{slug}`: complete entity page with verified media, game-style tooltip, normalized facts, relations, provenance, quality report, version history and raw source-backed fields.
- Every dataset card exposes a keyboard-accessible status tooltip. Every entity card loads a source-backed game tooltip on hover, focus or explicit tap.
- Images use verified, locally cached catalog media when available. A proven icon name remains searchable provenance until its bytes are legally cacheable; missing images use an explicit decorative state and never an unrelated placeholder.
- English and Russian routes have canonical and alternate-language metadata.
- The landing page is grouped into Items & Equipment, Classes & Combat, Dungeons & Raids, Professions & Crafting, World & Quests and Collections, using the same graphite, gold and blue visual language as `api.gildra.net`.
- Each dataset card reports three different coverages: source-proven text, available structured tooltip and source-backed image. English fallback is never counted as verified Russian text.
- A record with no game-specific image uses the dataset's decorative SVG symbol. The symbol is deliberately not counted as source-backed media.

## Public dataset registry

The production registry contains 29 views and covers every entity type that currently has a published version plus the source-backed quest reward package candidate type:

- Items & equipment: all items, weapons, armor, consumables, gems, reagents, trade goods and item enhancements.
- Classes & combat: spells, classes, specializations and PvP talents.
- Dungeons & raids: instances and encounters.
- Professions & crafting: professions and recipes.
- World & quests: quests, quest reward packages, NPCs, internal world/instance maps, client UI maps, areas and factions.
- Collections: currencies, mounts, battle pets, toys, transmog sets and achievements.

Adding a new canonical entity type requires a dataset definition, English and Russian dataset copy, a real-data membership test and a public detail renderer before release. A release gate fails when a published entity type has no public dataset.

## Visual and tooltip contract

1. Dataset cards, directories, entity pages and tooltips reuse the existing `api.gildra.net` graphite surfaces, gold accents, blue focus states, spacing scale and typography. The library must feel like one product, not an embedded second site.
2. Desktop tooltips open from hover and keyboard focus. Touch layouts use an explicit tap target and never depend on hover. Expanded tooltips trap focus, close with Escape and restore focus to the triggering record.
3. The compact tooltip shows the verified icon, localized name, core game facts and freshness. The detail page extends the same component with variants, effects, rewards, NPC roles, locations, loot tables and provenance rather than maintaining a second renderer.
4. Every displayed game image must resolve through a cached `catalog_entity_media` row with local URL, ready artifact, content hash and byte size. `catalog_entity_icons` and versioned listfile observations may discover the icon but may not bypass the local cache. Decorative SVG dataset symbols are labelled as interface decoration and excluded from coverage.
5. Icons reserve their dimensions before loading, use lazy loading outside the first viewport and expose a deliberate missing-media state. Galleries deduplicate URLs, retain source kind and dimensions and never replace missing source media with unrelated artwork.
6. English and Russian pages preserve the selected product and canonical entity ID in every link. Locale fallback is visible in the data contract and is not counted as verified Russian coverage.
7. Initial library rendering performs one datasets request plus one products request. Adding datasets must not create per-card API fan-out. Search and pagination operate against summary read models; full tooltips load only for visible or selected entities.
8. Accessibility acceptance includes visible focus, semantic headings, keyboard-accessible status tooltips, 4.5:1 body-text contrast, reduced-motion support and usable layouts at 320 px width and 200% zoom.
9. Performance acceptance on the server target: cached library data p95 below 300 ms, uncached dataset list p95 below 1 s, entity summary p95 below 500 ms and detail p95 below 1 s under the agreed concurrency smoke test. Image failures must not block text or navigation.

## Page architecture and visual composition

The library is implemented inside the existing `api.gildra.net` shell. It uses
the same header, navigation, graphite background, gold emphasis, blue focus
ring, border treatment, typography, spacing tokens and responsive breakpoints.
There is no independent theme, second navigation system or iframe.

| Surface | Required composition | Image behaviour | Tooltip behaviour |
| --- | --- | --- | --- |
| Library landing | product and locale switchers, last successful publication, grouped dataset list, exact counts, freshness and three coverage indicators | one real preview icon when coverage is non-zero; otherwise a clearly decorative dataset symbol | status tooltip explains freshness, build, last success, last failure and missing coverage |
| Dataset directory | breadcrumbs, dataset description, product/build status, search, type-specific filters, sorting, cursor pagination and entity list | fixed-size source-backed icon/thumbnail with reserved space; no cumulative layout shift | compact entity tooltip on hover/focus; explicit details button on touch |
| Entity detail | identity header, media, structured game tooltip, normalized sections, relations, provenance, quality and version history | primary icon/render plus deduplicated gallery; missing kinds are labelled, not fabricated | the same structured renderer expands into full sections instead of maintaining conflicting tooltip markup |
| Relationship rows | relation label, direction, linked entity, evidence and unresolved state | linked entity icon only when source-backed | preview of the linked entity without navigating away |
| Data quality and provenance | completeness, locale/fallback, build, artifact, observed time, content hash and freshness | no decorative image is counted as evidence | short explanations on labels; full evidence remains visible on the entity page |

The first viewport prioritizes finding data. It must not contain invented
metrics, marketing filler or a wall of equal cards. Dataset groups provide the
page rhythm; search, product and locale remain visible while browsing. Desktop
uses a readable list/grid chosen per dataset density, while mobile becomes a
single-column directory with filters in a labelled sheet.

## Tooltip profiles and interaction states

There are two deliberately different primitives:

1. A non-interactive status tooltip for freshness and coverage. It uses the
   semantic tooltip pattern and is opened by hover or keyboard focus.
2. An entity preview popover for structured game data. It can contain links and
   actions, so it uses the accessible popover/dialog pattern rather than
   pretending to be a simple tooltip.

Every entity preview contains, when supported by source data:

- verified icon, localized name, canonical type and external game ID;
- product, build and locale, including a visible fallback marker;
- the small set of identifying game facts for that entity type;
- freshness and a link to the full record;
- explicit `unknown`, `not applicable` and `unresolved source reference`
  states instead of blank labels or guessed values.

Type-specific preview profiles are versioned in the API contract:

| Profile | Compact facts |
| --- | --- |
| Item | quality, item level, required level, bind type, slot, class/subclass and base stats |
| Spell/talent | school, cast time, cooldown, range, resource cost and effect summary |
| NPC | creature type/family, known roles, primary map/location and source-proven loot count |
| Quest | level/type, zone, chain state and guaranteed/choice reward summary |
| Quest reward package | package ID, contained items, quantity and display mode; never an inferred quest link |
| Recipe | profession, skill requirement, output and principal reagents |
| Encounter/instance | content type, map, difficulty and encounter order |
| Collection entity | collection type, requirement, related spell/item and acquisition summary |
| Map/area/faction | hierarchy, parent, principal related content and localized name |

Desktop previews open after a short intentional delay, remain open while the
pointer moves between trigger and popover, and close without flicker. Keyboard
users can open, traverse and close them with Escape; focus returns to the exact
trigger. Touch users open the same preview with an explicit control. Requests
are cancelled when a trigger is abandoned, successful responses are cached by
entity/version/locale, and a fixed-size skeleton prevents layout shift. Errors
show a retry action without breaking the directory.

## Media pipeline and image presentation

1. The source priority is entity-specific: a verified game icon first for
   compact rows, then a verified portrait/render for the detail header, then a
   gallery or map texture only when that media kind is actually available.
2. Source artifacts and media metadata remain immutable. Public media URLs use
   a content hash/version key so they can be cached for a year without showing
   a newer image for an older published entity version.
3. Where redistribution is permitted, image bytes are mirrored into the local
   server media store. The browser must not depend on a third-party host for a
   production page. The original URL remains provenance, not the delivery URL.
4. The media service validates MIME type, byte size, dimensions and hash before
   publication. SVG and HTML responses from an unexpected upstream are never
   served as raster game media.
5. The frontend requests responsive sizes, reserves the stored aspect ratio,
   lazy-loads below the fold and preloads only the primary first-viewport image.
6. Broken or absent media uses a branded, type-specific missing-media state.
   It never uses an unrelated Warcraft image and never increments image
   coverage.
7. Each entity gallery identifies media kind, source, build and observation
   date. Duplicate content hashes collapse into one visual while retaining all
   provenance observations.
8. Image delivery reports decode failures, missing local objects and excessive
   payload size to operational telemetry. Release checks sample every media
   kind with non-zero coverage.

## Public API and read-model expansion

The UI must be a thin consumer of the stable v1 contract rather than embedding
catalog SQL or reconstructing game facts in React.

- `GET /v1/library/datasets` remains the single landing-page request for
  dataset identity, applicability, exact counts, build, freshness, coverage and
  preview media.
- `GET /v1/game/entity-summaries` gains an explicit dataset membership filter
  so a curated dataset cannot drift from the API directory. It remains cursor
  paginated and returns only list-safe identity, compact facts and media.
- `GET /v1/game/entities/{id}` remains the canonical detail/preview resource
  and exposes a `tooltipProfileVersion`, structured blocks, media, fallback and
  freshness. The frontend does not parse raw tooltip HTML.
- Relationship, quality, version and comparison endpoints remain separately
  paginated so opening one record does not materialize an unbounded graph.
- Every collection filter is represented in OpenAPI, uses stable field names
  and returns RFC 7807 errors. Go and TypeScript clients are regenerated with
  `oapi-codegen`; handwritten duplicate response types are forbidden.
- Dataset and summary responses receive strong ETags keyed by published
  generation, product, locale, filters and cursor. Publication changes the key;
  a failed import does not invalidate the last good public generation.
- The API returns immutable public media URLs plus width, height, MIME type,
  media kind and accessibility label. It never exposes a server filesystem
  path.

Required read models are a dataset membership view, a lightweight localized
entity summary, a structured tooltip/detail projection, per-dataset coverage
and a media manifest. They are refreshed inside the candidate generation and
become visible only through the atomic publication pointer.

## Frontend delivery increments

1. Freeze the current `api.gildra.net` visual tokens and shared shell as the
   reference; capture desktop and mobile baselines before changing the library.
2. Finish the library landing with grouped datasets, product/locale controls,
   freshness tooltips, real preview icons and honest missing-media states.
3. Finish the dataset directory with API-backed membership, search, filters,
   sort, cursor pagination, URL-preserved state and responsive rows/cards.
4. Implement the accessible entity preview popover and each type-specific
   profile using the same structured tooltip renderer as the detail page.
5. Complete entity pages family by family: items, spells/talents, NPCs, quests,
   recipes/professions, encounters, collections and geography.
6. Add source-backed galleries, media metadata and local immutable image
   delivery; regenerate image and tooltip coverage from the published read
   models.
7. Add Russian copy and visible fallback labels through `next-intl`, including
   tooltip controls, empty states, freshness and data-quality explanations.
8. Add visual regression, keyboard, touch, mobile, broken-image and slow/error
   response tests before the production release gate.

Frontend completion is accepted only when desktop and mobile screenshots match
the established `api.gildra.net` system, every interactive control works with a
keyboard, no entity preview displays unsupported facts, and deliberately
missing media is visually distinct from a network failure.

## Data completion workstreams

1. Retail core: close missing descriptions, item acquisition sources, quest rewards, NPC roles and NPC coordinates against recorded denominators.
2. Classic family: import and release creatures, quests, spells, recipes and item facts independently for Classic, Classic Era and Hardcore.
3. Item variants: preserve bonuses, contexts, scaling, stats, sockets and effect chains per build without overwriting the base item.
4. NPC graph: build proved `NPC -> loot table -> item` edges with difficulty, quantity and drop chance, plus vendor, trainer, quest-giver, repair, flight and other roles.
5. Quest graph: objectives, chains, guaranteed rewards, choice rewards, currency, reputation, money, spells and source build.
6. Crafting graph: recipe outputs, reagents, currencies, profession ownership, skill requirements and recraft quantities.
7. Media: one universal, version-aware media registry for icons, renders and galleries; every media observation requires a ready source artifact and source URL.
8. Localization: measure Russian coverage separately from English fallback and never claim an untranslated English value as Russian.
9. Provenance: every published version, localization, fact, relation and media observation must resolve to a ready artifact with content hash and byte size.
10. Recovery: keep encrypted server-local dumps, checksums and manifests; verify restoration into a disposable database before a release is eligible for production.

## What “show absolutely everything” means

The public page is a projection of source-backed facts, not a JSON dump. Each
dataset has a compact card, a searchable directory, a tooltip and a complete
detail page. Fields which are not applicable and fields which are not yet known
are separate states.

| Dataset family | Directory and tooltip | Full detail page | Required media |
| --- | --- | --- | --- |
| Items, weapons, armor and consumables | quality, item level, bind/equip slot, class/subclass, icon | all variants, contexts, bonuses, stats, sockets, requirements, effects, acquisition sources and provenance | inventory icon; render/gallery when source-backed |
| Spells and talents | school, cast/cooldown/range, icon | effects, coefficients, targets, power costs, triggered spells, class/spec relations and source build | spell icon |
| NPCs | type, family, roles, primary locations, portrait | all displays, difficulties, roles, coordinates, phases, quest relations and source-proven loot tables | portrait/model render when available |
| Quests | title, level/type, zone, reward summary | descriptions, objectives, chain, POIs, required/reward entities, money/currency/reputation/spells and provenance | quest image only when a source actually provides one |
| Recipes and professions | profession, category, skill requirement, output | every output, reagent, currency, quantity, recraft context, taught spell and acquisition source | recipe/spell icon |
| Instances and encounters | type, expansion, map, difficulty | encounter order, bosses, journal sections, loot relations and map/area links | journal/map image when available |
| Collections | collection type, requirement and icon | source, spell/item relation, achievement criteria, faction/expansion restrictions and variants | verified icon, render or gallery |
| Maps, areas and factions | hierarchy and localized name | parent/child graph, coordinates, zones, NPCs, quests and related content | map texture only when source-backed |

Every tooltip and detail page must expose a provenance block with product,
build, locale/fallback state, artifact source, observation time and freshness.
Raw source fields remain available through the API for audit, while the visual
page uses normalized labels and units.

## Remaining execution queue

1. Resolve the missing creature identities behind explicit ATT `crs` evidence;
   re-project loot after each creature import and report the denominator.
2. Import remaining Classic-family creatures, quests, spells and recipes as
   separate candidate generations; never clone Retail identities across games.
3. Complete NPC role and location projectors with source-specific confidence,
   phase and difficulty rather than inferring roles from names.
4. Add source-proven vendor inventories and trainer offerings as their own
   relation kinds; do not mix them into creature drop tables.
5. Complete quest objectives, chains and every reward kind, then link each
   resolvable reward to a canonical entity.
6. Finish item bonus/context variants and effect chains, including explicit
   `not_applicable` classification for game generations without a system.
7. Consolidate icons, portraits, renders and galleries into the versioned media
   registry and regenerate per-dataset image coverage.
8. Close Russian localization gaps from permitted sources and retain visible
   fallback metadata for anything still untranslated.
9. Publish an applicability matrix for all 29 datasets × 4 products so an
   intentional empty dataset is never reported as an import failure.
10. Run clean/upgrade migrations, real-data contracts, accessibility, load,
    same-server encrypted backup/restore and atomic API/web release gates.

## Detailed execution order

### Phase A — truthful public contract

1. Keep all public reads pinned to `published_version_id`.
2. Publish the dataset registry, exact membership and per-product freshness.
3. Separate available localization from source-proven localization.
4. Count tooltip availability from the actual structured detail response, not only the legacy stored-tooltip table.
5. Reject a release when any coverage count exceeds dataset membership or when a published entity type has no dataset.

### Phase B — item foundation

1. Project one immutable base variant for every published item version.
2. Preserve raw sentinel values in source facts and expose only normalized values in public tooltips.
3. Fill stats, sockets, requirements, item effects, scaling, quality and item level with artifact provenance.
4. Add bonus/context variants when their source tables are complete; never overwrite the base variant.
5. Expose every variant, stat and effect in the item detail tooltip and API response.

Acceptance: every published item has a base variant; every variant fact either has a ready artifact or is explicitly marked unresolved.

### Phase C — quests

1. Materialize all `QuestV2` identities for Retail, Classic, Era and Hardcore.
2. Keep registry-only quests without invented names; render `Quest #ID` until a permitted source supplies text.
3. Import objectives, POIs, lines, prerequisites and follow-up links.
4. Project `QuestPackageItem` as a separate versioned reward-package identity. `PackageID` is not a `QuestID`; expose package contents without inventing an edge.
5. Enrich titles, descriptions and rewards from permitted official responses with locale and source-build provenance.
6. Link reward items, currencies, reputation, money, spells and choices to canonical entities.

Acceptance: registry denominator equals published quest membership; unknown text remains unknown; reward source build and artifact are queryable.

### Phase D — NPC and loot graph

1. Resolve creature display models and portraits from DB2 and listfile.
2. Normalize roles: vendor, trainer, quest giver, repair, flight master and other supported roles.
3. Normalize locations by map, UI map, coordinates, phase and difficulty.
4. Introduce a versioned loot-table entity with entries, quantity bounds, difficulty and independently observed drop chance.
5. Build the auditable chain `NPC -> loot table -> item`; do not infer a direct edge when the intermediate table is unknown.

Acceptance: role/location/loot coverage publishes explicit denominators; every edge points to its evidence artifact.

### Phase E — remaining domains and media

1. Complete recipe outputs, reagents, currencies, ownership and recraft quantities.
2. Complete encounter, map, area, faction and collection relationships.
3. Build version-aware media observations for icon, portrait, render and gallery assets.
4. Resolve every FileDataID through the local listfile; never substitute unrelated artwork.
5. Add a visible missing-media state and keep image coverage honest for quests, maps and other types that have no native icon.

### Phase F — production release

1. Run clean and upgrade migration tests, Go tests, Testcontainers suites, TypeScript check, production build, accessibility and load smoke tests.
2. Create a same-server PostgreSQL dump, SHA-256 manifest and catalog backup manifest.
3. Restore the dump into a disposable database and execute the real-data contract tests there.
4. Apply migrations and deploy API/web atomically during the controlled release window.
5. Smoke-test dataset API, English/Russian library, search, detail, tooltip, image, provenance and rollback.
6. Retain the previous application image, previous published generation and verified local backup until the new release passes observation.

## Freshness and failure behavior

- Imports write observations and candidate versions; public readers use `published_version_id` only.
- Dataset statistics are rebuilt after canonical read models and include record, localization, tooltip and image counts.
- A dataset is `fresh` only when the product read model is fresh, coverage was recalculated within 36 hours and at least one published entity exists.
- `refreshing`, `stale`, `failed` and `empty` are first-class public states with a human-readable reason.
- A failed import or failed projection leaves the prior published generation and its media available.

## Release gates

1. All PostgreSQL migrations apply from an empty database and upgrade from the current production baseline.
2. OpenAPI generation, Go unit/integration tests, TypeScript checks and Next.js production build pass.
3. Real-data checks cover every product and dataset, including at least one entity detail, tooltip, media record and provenance chain where coverage is non-zero.
4. No dataset reports counts greater than its published membership; coverage counts never exceed entity count.
5. Accessibility checks cover keyboard navigation, tooltip focus behavior, contrast, reduced motion and mobile layouts.
6. Load checks cover dataset listing, entity search and entity detail at production-like cardinality.
7. A same-server backup is created, checksummed and test-restored immediately before release.
8. Deployment is atomic, health checks pass, smoke tests verify `/v1/library/datasets`, `/library`, `/ru/library` and a detail page, and rollback keeps the previous published generation.

## Current implementation slice

- Migration `00091` defines the original 27 datasets, item-class views and materialized per-product coverage. Migration `00097` adds the 28th `ui-maps` dataset without changing the existing DB2 `maps` semantics.
- Migration `00092` defines the versioned, source-proven loot graph. Public NPC tooltips expose only loot tables and entries backed by ready artifacts; unresolved items and unstated chances remain explicit instead of being inferred.
- Migration `00093` represents unstated loot quantity as `NULL` with an `unknown` basis instead of inventing a one-item drop.
- Migration `00094` stores successful and failed fact-projection runs with evidence/output/unresolved counts.
- Migration `00095` gives every dataset/product pair an operator-reviewed `applicable`, `pending_source` or `not_applicable` state and localized reason.
- Migration `00096` materializes the source dependencies of published versions, facts and media. The public `/v1/game/*`, `/v1/library/*` and GraphQL guards read this small registry and fail closed; the registry is rebuilt atomically during publication.
- Migrations `00098`–`00100` add a content-addressed, server-local media store, shared-object deduplication, immutable SHA-256/size proof, run history and explicit deny-by-default `asset_cache` grants for every source and environment. A failed asset remains retryable, and revoking a grant immediately removes public access without deleting provenance. The media handler additionally requires a ready artifact and an entity version selected by the public release pointer, so a cached candidate image cannot leak before publication.
- Migration `00101` adds the 29th `quest-reward-packages` dataset and a canonical `quest_reward_package` identity. The projector aggregates only proven `QuestPackageItem` rows, retains unresolved item IDs and deliberately records `package_only` until a separate source proves a quest-to-package edge.
- Migration `00102` recalculates image coverage as a deduplicated union of proven entity icons, FileDataID assets and version-compatible media observations. It adds the entity/build media index required to keep atomic publication bounded and excludes any observation newer than the published entity build.
- Migrations `00103` and `00104` add a fail-closed local preview pointer. A dataset preview is selected only from an image whose bytes are cached on this server, whose hash and size are recorded, whose artifact is ready and whose observation is no newer than the published entity build.
- Migration `00097` corrects ATT map references to DB2 `UiMap`, invalidates stale numeric-collision links and adds source-proven UI-map identities to the release and localization contracts.
- The ATT reference-identity projector creates only missing, source-backed `registry_only` candidates for explicit game-object, item, spell, quest and currency evidence. It stores every artifact observation, creates required typed registry rows and never adds names, descriptions, media, roles, locations, acquisition facts or publication pointers.
- The ATT loot projector accepts only explicit item `crs` references, excludes semantically ambiguous provider references, writes atomically and reports unresolved owner/item identities.
- The backup engine supports an immutable encrypted server-local object store with atomic publication, `file://` manifests, signed evidence and full restore comparison; R2/S3 is optional.
- `GET /v1/library/datasets` exposes the public dataset contract.
- `GET /v1/game/entity-summaries?dataset={slug}` resolves type, taxonomy and item-class membership on the server. Unfiltered totals come from the same atomically refreshed dataset read-model shown on the library card, so frontend filters cannot silently redefine a dataset.
- `GET /v1/game/entities/{id}?dataset={slug}` fails with `404` when the published entity is not a member of that public dataset; library detail URLs cannot cross dataset boundaries.
- Public English and Russian library landing, dataset and detail routes are implemented.
- The existing source-backed media gallery and Warcraft tooltip renderer are reused instead of creating a second visual/data implementation.
- Public summary, relationship, detail, tooltip and dataset-preview images now use only immutable `/v1/media/{id}` URLs backed by the local server cache. `icon_name` and original source URLs remain provenance metadata; the browser no longer constructs a World of Warcraft CDN URL from them.
- Staging now contains quest identities for all four products, base item variants for all published items and rebuilt Classic-family icons.
- Real-data integration tests verify directory/count equality for all 29 datasets across Retail, Classic, Era and Hardcore, reject cross-dataset detail membership, and verify structured quest, reward-package, provenance and item-variant tooltip blocks.

### Verified staging snapshot (2026-08-28)

- Quest entities: Retail 66,902; Classic 17,137; Era 4,807; Hardcore 4,807. Every current quest version has a source artifact; registry-only records have no fabricated localization.
- Base item variants: Retail 175,164; Classic 88,709; Era 24,442; Hardcore 24,442.
- Variant projection: 312,757 variants, 834,874 stat rows and 106,319 effect groups; zero projected effects without artifact provenance.
- Classic-family images after icon projection: items 99.8–99.9%, spells 99.4–99.9%, recipes 100%; Classic mounts and toys 100% where those entities exist.
- Remaining largest measured gaps: Classic quest localization, quest-native media (normally absent in the game client), enrichment of reference-only NPC identities, NPC portraits, complete item acquisition methods and independently observed drop chances/quantities.
- ATT creature identity projection preserved 73,472 explicit source observations as 28,989 new reference-only Retail NPC identities and 30,826 artifact observations. No name, role, location, display or loot fact is fabricated. They remain unpublished candidate versions until source policy and release gates pass.
- ATT map resolution now targets `ui_map`: 11,202 map references resolve to the correct canonical type and 29 remain honestly unresolved across five source IDs. No resolved map reference points to DB2 `Map`.
- Retail UI-map coverage matches the complete DB2 denominator: 1,961 identities, including three intentionally unnamed registry-only rows, and 1,958 source-backed English localizations. The unnamed rows remain addressable for coordinates without fabricated display text.
- The reference-identity projector processed 490,837 explicit observations into 32,477 missing build versions: 8,774 game objects, 20,317 items, 2,133 quests, 1,251 spells and 2 currencies. It created 32,073 new entities and 32,594 artifact observations, with zero fabricated localizations, media or published pointers.
- The complete Retail DB2 `Item` registry now enriches every client item ID that has no `ItemSparse` row. It created 38,185 source-backed `client_registry` candidate versions (including 17,540 former ATT item references and 20,645 new canonical item identities), with typed class/subclass/inventory facts and artifact observations but zero localizations and zero public pointers. All 38,185 are categorized on the candidate version: 19,288 armor, 10,102 weapons and 1,849 consumables among the largest classes. The 175,164 named item candidates now observe both `ItemSparse` and `Item`; public membership remains pinned to the previous 175,164 published versions.
- A guarded `db2-import -project-existing-items` mode performs this backfill only when `db2.item` completeness is `complete`, reuses the source row snapshot, creates no import run or empty snapshot and never changes `published_version_id`.
- Item API responses now assemble an `item_registry` tooltip block from typed class, subclass, inventory and icon FileDataID facts. The public renderer and API console display these fields explicitly; registry-only status never fabricates a name, quality or item level.
- Overall reference resolution is now 271,186/271,215. Only the 29 unsupported map references remain unresolved; ambiguity is zero and every resolved target type matches the source mapping.
- Source-proven NPC facts now contain 12,892 role rows and 27,300 location rows. Neutral acquisition evidence contains 1,320 rows and does not classify an unknown provider as a vendor or drop.
- Full explicit ATT `crs` loot slice: 4,934 observations produce 2,830 source-proven tables and 4,927 deduplicated entries. All creature owners resolve; 4,863 entries resolve to canonical items and 64 truthfully retain `source_missing` across 19 item IDs. Chance and quantity remain unknown because the source does not state them.
- Library readiness before candidate dataset 29 is published: Retail has 28/28 populated prior datasets, Classic 26/28, Era 17/28 and Hardcore 17/28. Dataset 29 correctly remains absent from public counts until an atomic governed release.
- Quest reward package candidates: Retail 3,233 packages / 13,368 item rows (13,076 canonical item links, 292 preserved unresolved IDs); Classic 210 packages / 1,481 item rows (all item links resolved). Every package version and row has ready artifact provenance. Era and Hardcore remain `pending_source` because their current client builds contain no `QuestPackageItem` rows.
- The dataset-scoped API contract was exercised against the staging snapshot for all 29 definitions and four products. The full directory/count, applicability, freshness and coverage contract passed against real data.
- Empty-view audit: Classic currently has no reagent-class items or PvP talents. Era/Hardcore currently have no gems, item enhancements, specializations, PvP talents, journal instances/encounters, currencies, mounts, battle pets, toys or transmog sets. Before release each empty combination must be classified as `not_applicable` for that game generation or filled from a permitted source; it must not remain an unexplained zero.
- Current same-server recovery proof: manifest `87f4d729-69ff-4d39-8912-85db545b7358` is `verified` for schema 104. The encrypted 2,335,865,226-byte archive has SHA-256 `e3849a9a09b9682663a70e2d73248f34917db1b55a2f384e27e384bd0bb3e3a1`; its isolated restore completed in 1,376,105 ms and matched the migration version plus every user-table row count. The disposable restore container and volume were removed after verification; the immutable archive and signed evidence remain on this server. The verified schema-102 archive is retained as the pre-migration rollback point.
- The current schema-105 recovery proof is manifest `29356f2f-e9f6-455b-985c-50552db29a26`. Its 2,335,882,193-byte age-encrypted archive has SHA-256 `4a032582afeac3749de9d9f158d28964dcf7940b1f82b0c5a6f7c78e03ec716b`; an isolated PostgreSQL 17 restore completed in 1,439,598 ms and exactly matched schema 105 plus every critical table, including immutable policy reviews, publication grants and grant events. The archive and signed evidence are present on this server with mode `0600`; the disposable restore container and disk volume were removed. The schema-104 and schema-102 archives remain rollback points but no longer satisfy the current-schema release gate.
- The recovery drill found and fixed two operational defects before release: standard commented `age-keygen` identity files are now accepted, and `pg_dump`/`pg_restore` receive parsed libpq host/user/password/database settings without placing a credential-bearing connection URL in process arguments.
- Schema-104 readiness reports `dataReady=true`: 818,220 active entities, zero without a current version, 22/22 required Retail entity types above their minimum, 149/149 DB2 scopes complete and zero missing provenance for current entities, English localizations, normalized facts, creature facts, quest rewards or icon references. The two non-blocking data warnings are 14,574 explicit English fallbacks on Russian requests and 174 recipe item references absent from the source item catalog.
- Readiness with the owner-selected `verified_same_host` policy passes the recovery gate. `productionReady=false` remains fail-closed on the three unapproved source policies used by the candidate (`all_the_things`, `wago_tools`, and `wow_listfile`), explicit production public-API grants for all contributing sources, and the Blizzard asset-cache grant required for images. These reviews and grants cannot be self-approved by the importer or deployment.
- Local-media proof: staging is on schema 104 with 16,360 remote Blizzard media observations, zero cached images and explicit deny-by-default grants. A confirmed cache run completed with zero eligible assets and zero network downloads. Clean Testcontainers proofs verify local-only summary/detail/tooltip/dataset URLs, older-image carry-forward, future-image rejection, deduplicated coverage and objects, SSRF/symlink defenses and immediate grant revocation. No source is silently authorized; game image bytes remain absent until source-specific reviewed `asset_cache` and `public_api` grants are recorded.
- Desktop and 390 px mobile production builds were exercised against the real staging API. Dataset status tooltips work by pointer, keyboard and explicit touch control; the mobile popover stays fully inside the viewport, supports Escape and preserves a readable fallback when local media is unavailable.
- The backend image now includes `catalog-load-check`, a bounded read-only journey gate that discovers a real dataset entity, records status counts and p50/p95/p99/max latency as JSON, and fails on any HTTP error or a breached endpoint threshold. It accepts HTTP only for loopback targets and caps concurrency at 32 to prevent an accidental load spike.
- The schema-104 in-process database gate (60 requests per endpoint, concurrency 4, HTTP cache disabled) passes for the general item catalog in both locales with zero failures. English p95 was 8.7 ms for datasets, 80.8 ms for summaries and 292.1 ms for details; Russian p95 was 8.6 ms, 62.2 ms and 312.8 ms. Focused 30-request gates also pass for `weapons` (188.5/626.9 ms summary/detail p95) and `ui-maps` (91.5/509.8 ms) while running concurrently. The formerly generic no-search query is now an index-ordered path; its first-page latency fell from 14.4 seconds to well inside the 500 ms release threshold.
- The production migration contract now tracks schema 105 rather than stopping at 100. Testcontainers proves a clean 1→105 install, the immutable production-baseline 15→105 upgrade, isolated 105 down/up recovery and the 96→97→105 UI-map correction. Migration 105 adds immutable terms evidence, linked owner/legal approvals and append-only grant events; an allowed grant without a matching, current review is rejected by PostgreSQL itself.
- The CI migration-baseline step invokes its non-executable repository script through `sh`, so GitHub Actions no longer fails before validation. The immutable release-input validator, rollback test, backup wrapper and secret-reference tests pass; the fully merged production Compose configuration validates with digest-shaped image references and explicit secrets.
- Fresh local release images build successfully for API, web and CMS. The CMS build-only placeholder is no longer stored in a Docker `ENV` layer, and the generated TypeScript API schema exactly matches the current OpenAPI document.
- The production proxy now routes `/library`, localized library pages and Next.js assets on `api.gildra.net` to the web application while preserving the exact API-console root and the more-specific API routes. The immutable deployment script verifies the dataset API plus both library locales on `api.gildra.net` and `gildra.net`, requires a fail-closed production-readiness audit, then runs the bounded catalog load gate for English and Russian before automatic rollback is disarmed. Audit and latency JSON remain in the deploy log, and the rollback test asserts that these gates stay inside the atomic release boundary.
- The former schema-104 backend image is superseded by migration 105 and must not be deployed. The strict audit remains intentionally fail-closed until the accountable owner/legal reviewer records current decisions for every contributing source and surface. Carry-forward media from earlier compatible builds is included in the image-grant denominator, and PostgreSQL 17 Testcontainers proofs verify denial, linked explicit approval, carry-forward inclusion, future-build exclusion and immediate revocation.
- The current local backend candidate is `sha256:1e2dbef489bd23c8c36145ea5cdcfea28023d84ded6de1fdc0dd526314e3fa96`. Its in-image strict audit against the schema-105 staging catalog reports `dataReady=true` for 818,220 active Retail entities, accepts exactly one current-schema verified same-server recovery proof, and remains `productionReady=false` only for four missing production public-API grants (`all_the_things`, `blizzard_api`, `wago_tools`, `wow_listfile`) plus the Blizzard asset-cache grant. The two data warnings remain non-blocking and explicit: 14,574 Russian fallbacks and 174 unresolved recipe item references.

### Current local verification (2026-08-31)

- The latest same-host backup/restore drill completed successfully against schema 114. Manifest `248c1f7d-d9a6-4ceb-88d1-1fc01377e74e` records a 3,549,922,520-byte encrypted archive (SHA-256 `32866b5f7ae02ba581ce91e2373070bfd0a9105a1bca954004bffe1cedb0ad01`), `restoreVerified=true` and `sourceRestoreMatch=true`. The disposable restore container and volume were removed after verification; the archive and signed evidence remain on the server.
- The published Retail projection is build `12.1.0.69497` with 743,967 public entities. Tooltip coverage is 175,164/175,164 for items and 413,962/413,962 for spells in both supported locales. This is projection coverage, not a claim that every source description is complete: 120,703 English and 121,014 Russian spell descriptions still contain unresolved Blizzard template tokens, and Retail quests have no materialized tooltip projection yet.
- The current strict audit reports `dataReady=true` and `productionReady=false`. Recovery proof now passes; publication remains blocked by four explicit production public-API grants and two asset-cache grants. These are policy decisions, not importer failures, and must be recorded by the accountable owner before deployment.
- The API source now resolves supported templates in both list and detail responses and resolves item effect blocks using their build-pinned `spell_id`. The candidate tooltip rebuild is product-scoped and targets `latest_version_id` before atomic publication, while the audit intentionally measures only `published_version_id`.

Production deployment remains a separate controlled operation. Repository policy permits local implementation and verification but prohibits changing production infrastructure or production data from this worktree.
