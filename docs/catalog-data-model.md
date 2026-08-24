# Game catalog data model

The catalog is intentionally split into four layers. Importers must move data
through these layers instead of writing UI-shaped documents directly.

## 1. Immutable source layer

- `catalog_snapshots` is one atomic source/build publication unit.
- `catalog_source_artifacts` records every downloaded file, locale, URL, hash,
  parser version and fetch status.
- `catalog_source_records` preserves individual Raidbots and other generic
  source records.
- `catalog_entity_source_documents` preserves hashed, localized source documents
  append-only by content hash. Same-build server hotfixes remain auditable, and
  official API enrichment cannot replace a DB2 canonical version or detach
  normalized facts from its `version_id`.
- `catalog_db2_rows` preserves build-pinned Wago DB2 rows as JSON.
- `catalog_import_runs` records attempts, counters, errors and the snapshot used.

A snapshot is built in `staging`. It becomes visible only after validation and
publication succeed. A failed run is retained for diagnostics but cannot move
`game_entities.latest_version_id`. This prevents a partial import from mixing
old and new game builds.

## 2. Canonical identity and version layer

- `game_products` and `game_builds` identify the game and exact client build.
- `game_entities` gives an entity a stable identity: product, type and external
  game ID.
- `game_entity_versions` stores a source-aware payload for an exact build.
- `game_entity_localizations` stores locale-specific names, descriptions and
  attributes without cloning the canonical entity.

Items, spells, talents, PvP talents, classes, specializations, creatures, quests, recipes,
professions, instances, encounters, mounts, pets, toys, transmog sets,
achievements, maps, areas, factions and currencies all use the same identity
model. A new entity type therefore does not require another top-level identity
table.

Ordinary trait-node talents and `PvpTalent` rows deliberately use distinct
entity types (`talent` and `pvp_talent`) because their numeric IDs come from
different DB2 namespaces. Both are linked to canonical spell entities and the
shared class/specialization taxonomy.

## 3. Normalized fact and relationship layer

Typed tables exist only for facts that need constraints, joins, filtering or
calculation. Important groups are:

- items: `catalog_items`, item variants, variant scaling allocations/effects,
  bonus rules, level curves, conversions and usable/drop specialization rules;
- spells and talents: spell details, normalized effects, talent/tree records and
  many-to-many talent-to-spell relations (`grants`, `modifies`, `replaces`);
- crafting: professions, recipes, reagents, outputs and currencies;
- world data: creatures, displays/models/difficulties, quests, journal instances
  and encounters;
- provenance: every normalized import can point back to its snapshot and source
  artifact;
- graph: `game_entity_links` represents `owned_by`, `grants`, `teaches`,
  `uses_reagent`, `creates`, `obtained_from`, `modifies` and `belongs_to`
  relations.

`catalog_item_acquisition_sources` stores structured acquisition facts. A source
ID is kept even when it cannot yet be resolved to a canonical entity. A drop
chance is public only when `chance_source` identifies DB2, the official API or
an auditable observation sample. Blocked third-party evidence may remain in a
private archive but is never copied into the public projection; unresolved data
is never guessed.

Multiple item forms are rows in `catalog_item_variants`, not duplicate items.
Context, bonus list, item level, quality, upgrade track, effects and stats belong
to the variant. The base item remains the shared canonical identity.

`catalog_quest_package_items` normalizes the client `QuestPackageItem` table as
package-to-item membership. `PackageID` is not a quest ID, so these rows must not
be copied into `catalog_quest_rewards` until an official API or another audited
server-side source supplies the package-to-quest relationship. Keeping the two
concepts separate prevents plausible-looking but false quest rewards.

`catalog_quest_rewards` stores build-pinned reward facts from explicit
quest-to-reward sources. Battle.net reward names are retained per locale in
`attributes.names`, while `reward_type`, `external_id`, `amount` and
`is_choice` remain normalized columns. The graph resolves those IDs to canonical
entities only within the reward build's product; unresolved IDs stay visible in
the tooltip as sourced text without inventing a relationship.

## 4. Rebuildable presentation and read-model layer

- `catalog_categories` is a path-based hierarchy.
- `game_entity_categories` is a many-to-many assignment, allowing an item to be
  armor, leather, chest equipment and profession-related at the same time.
- `catalog_entity_tooltips` and `catalog_item_tooltips` are ordered semantic
  blocks used by the web UI.
- `catalog_entity_icons` and DB2 file-data IDs provide icon resolution.
- `catalog_entity_type_registry` and its localizations define public entity
  families, grouping, order and UI symbols without hard-coded frontend lists.
- `catalog_relation_types` defines the versioned graph ontology. The foreign key
  from `game_entity_links` prevents an importer from inventing an unregistered
  relation name.
- `catalog_entity_aliases` adds source-attributed former names, abbreviations and
  exact search keywords without changing canonical identity.
- `catalog_entity_type_stats`, `catalog_category_stats` and
  `catalog_field_coverage` are atomic, rebuildable aggregates for navigation,
  data-quality dashboards and API totals.
- `catalog_read_model_state` exposes refresh generation, status and timestamp so
  a deployment can distinguish a healthy but stale projection from current data.
- `catalog_projection_watermarks` records the build and snapshot completed by
  each projector; `catalog_build_update_checks` records lightweight upstream
  build checks separately from heavy imports.

Presentation tables are projections. They can be rebuilt after taxonomy or UI
changes without downloading source data again and without mutating canonical
versions.

Refresh cached counts and field coverage after any import or projection rebuild:

```powershell
docker compose run --rm --entrypoint catalog-index api -stats-only -confirm
```

Every row in `game_entity_versions` has a mandatory `source` foreign key to
`catalog_source_policies`. `snapshot_id` and `source_artifact_id` provide the
fine-grained immutable audit trail, while `source` is the stable indexed key for
publication policy checks. A database trigger derives it from the artifact,
snapshot or a recognized official source URL for legacy-compatible importers
and rejects a version whose provenance cannot be established.

The refresh runs in one PostgreSQL transaction. Readers keep seeing the previous
generation until the replacement generation commits.

## Source governance layer

`catalog_source_policies` records the reviewed homepage, terms URL, asserted
software license, retention, attribution and separate decisions for commercial
use, public API redistribution and asset caching. `pending`, `restricted` and
`permission_required` are deliberate fail-closed states. This registry is an
engineering control and audit trail, not legal advice or permission by itself.

An importer may preserve raw evidence from a pending source in private staging,
but public projections, bulk exports and cached assets must not be enabled until
the applicable policy is reviewed. See [catalog-commercialization.md](catalog-commercialization.md).

## Source precedence

`catalog_source_priorities` defines the default trust order:

1. Blizzard game-data API for official localized API fields;
2. Wago DB2 for exact-build client tables;
3. Raidbots/SimulationCraft for curated simulation and variant facts.

The most trusted source is selected per field, not per whole entity. Raw values
from lower-priority sources are retained for audit and can fill fields that a
higher-priority source does not publish.

## Update workflow

1. Detect and pin a game build.
2. Create a staging snapshot.
3. Register and hash every source artifact.
4. Load immutable raw rows.
5. Upsert canonical versions and normalized facts in the same build.
6. Validate counts, foreign keys and required locales.
7. Publish the snapshot atomically.
8. Rebuild taxonomy, relationships, spell effects and tooltip projections.
9. Smoke-test the API and web page before deployment.
10. Refresh coverage, inspect zero/conflict counts and record the read-model
    generation used by the release.

The scheduled path performs a lightweight Wago HEAD check first. If the active
build is current, systemd skips the expensive import. If a new build is seen,
the ordinary snapshot/content-hash pipeline runs and advances projector
watermarks only after successful commits.

Never mix build-sensitive facts from different `build_id` values when
calculating or rendering a tooltip. A missing localized name, description, or
official icon may use the newest older Battle.net API namespace only as an
explicit provenance-bearing display fallback; it must not overwrite existing
text from the active build. Never carry numeric stats, effects, item levels,
cooldowns, or acquisition chances across builds. Never turn an allocation
coefficient, a missing drop chance or an unresolved source ID into a displayed
value.

## Known source boundary

Client DB2 can describe the client-visible catalog but does not contain every
server-side fact. Complete quest rewards, vendor inventories, NPC spawn points,
live drop statistics and some hotfix/scaling values require a build-compatible
official API response or another explicitly licensed server-side dataset.
Battle.net calls also require project credentials. The schema already has the
identity, graph, acquisition-observation and provenance tables for these facts;
they can be added without redesigning the catalog.
