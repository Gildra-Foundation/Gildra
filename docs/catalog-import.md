# World of Warcraft catalog import

The default source is the public Wago.Tools DB2 CSV API, so the proof import does
not require credentials. `en_US` is the canonical payload; `ru_RU` is stored as
a localization of the same build-aware entity. Battle.net remains available as
an optional enrichment source with `-source battlenet`.

## Build identity

For Wago.Tools, the current Retail build is detected from the CSV response and
pinned for the complete run. You can override it with `-version 12.1.0.69404`.

## Foundation profiles

`catalog-pipeline` defaults to a product-aware foundation profile. Retail uses
`retail-foundation` with Wago DB2 transport, the complete DB2 projection,
Blizzard Game Data/Media APIs and the verified listfile. Classic, Classic Era
and Hardcore use independent `classic-foundation`, `classic-era-foundation`
and `classic-hardcore-foundation` profiles with their own pinned DB2/listfile
builds. Raidbots and every tier-list dataset are outside all foundation
profiles and cannot be selected by a production foundation run.

Preview the exact stages without importing data:

```powershell
docker compose run --rm --entrypoint catalog-pipeline api -mode dry_run -profile retail-foundation -version 12.1.0.69404 -max-records 100
```

A production apply is fail-closed. It requires an explicit build, a recent
PostgreSQL backup whose restore was verified under the configured recovery
policy, and a matching database manifest. An unbounded import additionally
requires `-confirm-full-import`.
The bounded proof run is therefore the first writable step after the recovery
gate:

```powershell
docker compose run --rm --entrypoint catalog-pipeline api -mode apply -profile retail-foundation -version 12.1.0.69404 -max-records 100
```

The full command is deliberately hard to run accidentally:

```powershell
docker compose run --rm --entrypoint catalog-pipeline api -mode apply -profile retail-foundation -version 12.1.0.69404 -max-records 0 -confirm-full-import
```

Writable pipeline runs create a private row in `catalog_releases` before the
first importer starts. Each importer receives that release ID through the
process environment and leaves its snapshot in `validated` state. Public reads
continue to use the previous `published_version_id` while normalization,
indexing, validation, and source-policy checks run. Only the final
`release-publish` transaction moves all public pointers and activates the new
build. A failed or blocked run restores candidate pointers to the last
published versions; candidate snapshots and errors remain available for audit.

Direct importer commands are retained for bounded local diagnostics. They do
not provide the multi-source atomicity of `catalog-pipeline` and must not be
used as a production publication shortcut.

Catalog backup archives use the local `catalog_backups` volume for temporary
encrypted files by default (`-temp-directory /var/lib/gildra/catalog-backups`).
This keeps large production dumps off the container's small `/tmp` tmpfs while
remaining on the same server, as required by the current recovery policy.

The structured client catalog is immutable for a pinned WoW build. If that
exact build is already public, a scheduled pipeline run records a successful
no-op and does not rewrite shared DB2 projections. Server-side enrichments that
can change without a client build require their own versioned release path;
they must not be forced through the client-build pipeline.

## Optional Battle.net credentials

Create a Battle.net API client at <https://develop.battle.net/access>. Put the
following values in the untracked `.env` file; never commit the real values:

```dotenv
BATTLENET_CLIENT_ID=
BATTLENET_CLIENT_SECRET=
BATTLENET_BUILD_NUMBER=
BATTLENET_BUILD_VERSION=
```

The importer discovers the currently published Battle.net static namespace and
pins that build for the run. Configured build values are treated only as a
diagnostic expectation; the importer warns when Blizzard is publishing a
different namespace.

Large Wago DB2 CSV responses are streamed without an `http.Client` whole-body
deadline. Each table is instead bounded by `-wago-table-timeout` (two hours by
default), while connection and TLS phases retain short transport timeouts and
locale export preparation has a separate two-minute response-header bound. A
timeout fails only the candidate artifact and snapshot; the last
published snapshot remains selected.

For Wago projections, `records_seen` and `records_written` are checkpointed in
`catalog_import_runs` every 10,000 source rows and at each artifact boundary.
The same checkpoints are emitted as structured logs, so an operator can tell a
live import from a stalled download without running expensive count queries.
`en_US` is always the canonical projection regardless of flag order; a later
`-locales ru_RU` run can therefore retry localization without rewriting the
canonical version, provided that the pinned build was imported in English
first.

The official importer supports `item`, `spell`, `creature`, `quest`, `talent`,
`pvp_talent`, `profession`, `mount`, `battle_pet`, `class`, `specialization`,
`achievement`, `item_set`, `instance`, `encounter`, and `faction`. Use `all` to
select the complete supported set. Start with a bounded proof run:

```powershell
docker compose run --rm --entrypoint catalog-import api -source battlenet -types all -max-records 25
```

Detail documents are required for the canonical item, spell and creature
records; the search response is only a discovery index. Their official media
links are fetched with bounded workers as optional enrichment. A missing or
forbidden individual media link is recorded as a structured warning and does
not discard the entity detail. Authentication, rate-limit and transport errors
remain fatal to the candidate run, while the release quality gate reports the
resulting media coverage explicitly.

After checking both locales and source provenance, remove the cap:

```powershell
docker compose run --rm --entrypoint catalog-import api -source battlenet -types all -max-records 0
```

The production foundation also runs a bounded missing-field enrichment pass
after DB2 and listfile stages. It queries the current build denominator and
requests only entities whose localized description is empty or still contains
an unresolved Blizzard token; the English pass additionally targets records
without an icon observation. Details are fetched through the build-pinned
Battle.net namespace and merged into the existing version, while the original
DB2 payload remains unchanged. The pass can be run locally or retried after a
partial import with:

```powershell
docker compose run --rm --entrypoint catalog-import api -source battlenet -product wow -version 12.1.0.69497 -build 69497 -types item,spell,creature,quest -locales en_US,ru_RU -missing-only -max-records 0 -allow-build-mismatch
```

`-missing-only` is mutually exclusive with `-media-only`, requires the
Battle.net source, and fails closed on transport/authentication errors. A
not-found detail is logged and skipped because Blizzard can omit retired IDs;
the previous localized value is never deleted. The pipeline records the
targeted artifact and refreshes tooltip/media projections only after the
enrichment stage completes.

Each localized response is hashed and retained in
`catalog_entity_source_documents`, linked to its snapshot and artifact. For an
entity already created from build-pinned DB2, Battle.net enriches official names,
descriptions and typed fields in place; it does not replace the DB2 version or
orphan normalized stats, effects, recipes, and relationships. A detail URL that
is listed by Blizzard but returns `404` is recorded in the run log and skipped so
one unavailable document cannot abort the whole snapshot.

Battle.net can publish an API namespace behind the newest client DB2 build. The
projection may carry only missing localized names, descriptions, and official
media icons forward from the newest API build not newer than the active client
build. It never carries numeric stats, effects, item levels, cooldowns, drop
chances, or other build-sensitive facts. Every carried field retains the source
build number, source build version, and source URL in localization attributes.

Official media can be refreshed independently without downloading entity
details again. Raw Media API documents are retained beside the entity source
documents. An asset whose key is exactly `icon` also becomes the primary entity
icon. Other official assets, including portraits and zone artwork, are stored
separately in `catalog_entity_media` with their original asset key and kind, so
they are available without being mislabelled as icons. Copying image bytes to
our object storage remains a separate source-policy-gated operation.

```powershell
docker compose run --rm --entrypoint catalog-import api -source battlenet -types class,specialization,profession,instance -media-only -max-records 0
```

## Safe proof import

Apply PostgreSQL migrations, then run the importer from the API container:

```powershell
docker compose run --rm --entrypoint catalog-import api -source wago -max-records 100
```

This writes at most 100 items and 100 spells for each configured locale. The
command is idempotent for a product, build and payload hash. Re-running it
updates localizations and does not duplicate unchanged versions.

After checking `/v1/game/entities?product=wow&type=item&locale=ru_RU&limit=20`,
expand the importer to the remaining DB2 tables and a staging/COPY pipeline
before removing the safety cap. The proof path intentionally uses bounded
per-entity transactions for simple verification.

```powershell
docker compose run --rm --entrypoint catalog-import api -source wago -max-records 1000
```

Every run is recorded in `catalog_import_runs`. Canonical source payloads remain
in `game_entity_versions.payload`; source-specific localized API responses are
kept in `catalog_entity_source_documents` and namespaced inside
`game_entity_localizations.attributes`. Common item/spell fields are also
projected into typed tables for efficient filters.

## Raidbots static data

Raidbots provides curated, build-pinned JSON datasets for equippable items,
localized item names, talent trees, instances, enchantments, gems, item sets,
seasons and consumables. The importer reads large arrays as streams and records
the Raidbots `wowBuild`, `contentHash`, generation time and file manifest in the
import run parameters.

Run a bounded local import:

```powershell
docker compose run --rm --entrypoint raidbots-import api -max-records 1000
```

Run the complete supported Raidbots import only after capacity preflight,
database backup and restore verification:

```powershell
docker compose run --rm --entrypoint raidbots-import api -max-records 0
```

English names are canonical. Russian item names from `item-names.json` are
attached to the same item versions. Datasets without Russian localization fall
back to their English names in catalog responses. Raidbots complements rather
than replaces Wago DB2 data: spells and other raw client tables still come from
Wago/CASC.

## Category and tooltip index

Imports store source facts first. The category index is a separate, repeatable
projection so that source payloads stay immutable while the site's navigation
can evolve without rewriting imported records.

Preview the rebuild after every complete import:

```powershell
docker compose run --rm --entrypoint catalog-index api
```

The preview reports how many categories, entity assignments and item tooltips
will be produced. Apply it only after the import itself has completed:

```powershell
docker compose run --rm --entrypoint catalog-index api -confirm
```

The confirmed rebuild runs in one PostgreSQL transaction. It seeds the stable
item taxonomy (armor materials, weapon families, equipment slots and crafting
professions), derives class and specialization paths from talent-tree payloads,
then links entities to those paths. Re-running it replaces only derived
assignments and tooltip projections; canonical entities, versions and
localizations remain untouched.

The current Raidbots payload can classify items and associate talent spells
with classes and specializations. It does not contain a complete spell-to-race
mapping. Race is therefore a supported facet in the schema, but it must be
populated later from an authoritative DB2 source such as
`SkillRaceClassInfo`; the indexer deliberately does not invent those links.

`catalog_item_tooltips` contains normalized display blocks derived from the
pinned item payload and localized description. It is suitable for the current
site tooltip, but it is not a claim of byte-for-byte parity with the official
in-game tooltip. Full effect text, scaling values and race restrictions require
additional build-matched DB2/Battle.net enrichment.

## Long-term data boundaries

- `game_entities`, `game_entity_versions` and localizations are the durable,
  source-aware record of imported facts.
- Typed detail tables expose fields that are queried often; raw payload remains
  available for fields not promoted yet.
- `catalog_categories` and localizations define a path-based taxonomy. A record
  may belong to multiple facets without duplicating the record itself.
- `game_entity_categories` is the many-to-many projection used by filtering and
  recursive category counts.
- `catalog_entity_tooltips` is a rebuildable, localized read model for fast UI
  delivery; source facts remain in the versioned and normalized tables.
- `game_entity_links` is the generic graph for acquisition, crafting, talent,
  ownership, hierarchy and exact description-mention relationships.
- `catalog_entity_mentions` stores only exact quoted or bracketed name matches
  from canonical localized descriptions. It never guesses an ability from
  approximate text.

New categories should be added as paths and assignments, not as new item or
spell tables. New source fields should first be preserved in the versioned raw
payload, then promoted to typed columns only when filtering, sorting or data
integrity requires them.

## Public catalog API

The read-only REST API exposes the same catalog used by the site:

- `/v1/game/entity-types` reports total, localized, tooltip and relationship
  coverage for every imported entity type.
- `/v1/game/entities` searches all current entities with opaque cursor paging;
  `type`, `category`, `locale` and `q` are optional filters.
- `/v1/game/entities/{id}` returns one complete public entity and its
  rebuildable tooltip projection. Immutable raw source payloads remain internal
  provenance and are deliberately not exposed by the public API.
- `/v1/game/entities/{id}/relationships` pages through incoming and outgoing
  graph edges such as `owned_by`, `belongs_to`, `grants`, `obtained_from`,
  `uses_reagent`, `creates` and `mentions`.

The OpenAPI 3.1 contract in `backend/api/openapi.yaml` is the source of truth
for both generated Go handlers and TypeScript clients. Collection endpoints use
cursor pagination so additions do not shift later pages.

## Raw DB2 facts for complete tooltips

The entity importer deliberately keeps the searchable record small. Detailed
tooltip reconstruction also needs build-matched relationship tables. Import
those source rows into the generic DB2 fact store with a dry run first:

```powershell
docker compose run --rm --entrypoint db2-import api -version 12.1.0.69404 -max-records 1000
```

After backup and capacity preflight, import the complete selected table set:

```powershell
docker compose run --rm --entrypoint db2-import api -version 12.1.0.69404 -max-records 0 -confirm
```

The default manifest contains the complete supported set of 111 build-pinned
tables, including `Item`, `ItemSparse`, `ItemEffect`, `ItemXItemEffect`, `SpellName`, `Spell`,
`SpellMisc`, `SpellCooldowns`, `SpellRange`, `SpellCastTimes`, `SpellDuration`, `SpellRadius`,
`SpellPower`, `SpellEffect`, `SpellDescriptionVariables`, `SkillLine`, `SkillLineAbility`,
`SkillRaceClassInfo`, `TradeSkillCategory`, `SpellReagents`, `SpellReagentsCurrency`,
`CraftingData`, `Creature`, `CreatureDisplayInfo`, `CreatureModelData`,
`CreatureType`, `CreatureFamily`, `CreatureDifficulty`, `ChrRaces`, journal,
collection, map, faction, quest and achievement tables. Rows are keyed by
build, table, locale and source ID. Imports use PostgreSQL `COPY` batches and
content hashes, so repeating the same build does not create duplicates.

`PvpTalent` is projected separately from Raidbots trait nodes because the two
tables use different external-ID namespaces. PvP talents are stored as
`pvp_talent` entities and joined to `SpellName`, the matching spell version and
`ChrSpecialization`. This avoids ID collisions while keeping them searchable in
the same class/specialization taxonomy as ordinary talents.

The normalized crafting layer is populated from `SkillLine`, `TradeSkillCategory`,
`SkillLineAbility`, `SpellReagents`, `SpellReagentsCurrency`, and `SpellEffect`.
It keeps professions, recipes, reagents, currencies, and crafted outputs in
separate relational tables; raw DB2 JSON remains an immutable staging source.

`QuestPackageItem` is normalized separately from quest rewards. Its `PackageID`
groups item choices but does not identify a quest. The importer retains package,
item, quantity, display type, resolved canonical item ID and artifact provenance;
it only writes `catalog_quest_rewards` when a source provides an explicit
`QuestID` relationship.

Battle.net quest details are that explicit server-side source. The importer
atomically synchronizes experience, money, currency, reputation, spell, title,
guaranteed-item and choice-item rewards into `catalog_quest_rewards`. Repeated
localized imports merge reward names under `attributes.names`; rows removed by
the official response are removed from the same build. Item specialization
requirements remain structured in `attributes.requirements`. Rebuild the entity
graph after an import so resolvable item, currency, spell, faction and title
rewards receive public `rewards` links.

The creature layer uses `Creature`, `CreatureDisplayInfo`, `CreatureModelData`,
`CreatureType`, `CreatureFamily`, and `CreatureDifficulty`. Creature identity,
localization, display choices, models, taxonomy, and difficulty variants are
normalized independently. NPC roles are intentionally separate because vendor,
trainer, quest, transport, and gossip roles require their owning data sources.

Do not mix builds when rendering a tooltip. Names, effects, cooldowns, ranges,
requirements and restrictions must all resolve against the entity's own
`build_id`. Add another DB2 table to the manifest when a new tooltip field or
taxonomy facet requires it; do not add one-off columns to `game_entities`.

`catalog_entity_tooltips` is the rebuildable read model used by the API for
items and spells. Its ordered JSON blocks represent semantic lines such as
binding, required level, cast time, use/equip effect and flavor text. The web
client controls WoW-compatible color and spacing, while the database retains
the structured values.

For a complete public spell catalog, import `SpellName` with its matching
`Spell` text table:

```powershell
docker compose run --rm --entrypoint catalog-import api -source wago -version 12.1.0.69404 -types spell -max-records 0
docker compose run --rm --entrypoint catalog-index api -confirm
```

The importer joins localized `Spell` descriptions, aura descriptions and
subtexts to the canonical `SpellName` rows. Both streamed files are registered
and receive independent SHA-256/size proofs. Their artifact IDs are attached
to the canonical version and to each localized projection. Exact calculated
item stats and some server-side hotfix values are not derivable from a single static table.
When Battle.net credentials are configured, use its build-matched item detail
and `preview_item` response as an additional source rather than guessing those
numbers from Raidbots allocation coefficients.

## Atomic snapshots and relationship rebuilds

Every complete Wago or Raidbots run creates a staging `catalog_snapshots` row and
registers each downloaded file as a `catalog_source_artifact`.
`catalog_entity_version_artifacts` and
`catalog_entity_localization_artifacts` preserve every contributing file when
a projection combines tables or locales. Canonical entity
versions become current only when the complete snapshot is published. A failed
snapshot remains queryable for diagnostics but cannot expose a half-imported
build.

After source imports, individual projection stages can be rerun independently:

```powershell
docker compose run --rm --entrypoint catalog-index api -items-taxonomy-only -confirm
docker compose run --rm --entrypoint catalog-index api -descriptions-only -confirm
docker compose run --rm --entrypoint catalog-index api -variants-only -confirm
docker compose run --rm --entrypoint catalog-index api -spell-effects-only -confirm
docker compose run --rm --entrypoint catalog-index api -graph-only -confirm
docker compose run --rm --entrypoint catalog-index api -pvp-talents-only -confirm
docker compose run --rm --entrypoint catalog-index api -stats-only -confirm
```

The normalized graph connects acquisition, talent/spell ownership and
modification, crafting inputs/outputs and journal hierarchy. It resolves only
canonical IDs or exact localized source-name matches and deliberately leaves
unmatched sources unresolved.

Every importer must register a new graph relation in `catalog_relation_types`
before writing it. New source names and abbreviations belong in
`catalog_entity_aliases` with locale, alias kind and provenance; they must not
overwrite the official localized name.

Before enabling a new source in a public tooltip or API response, add it to
`catalog_source_policies`, attach the current terms URL and choose a fail-closed
status. A software repository license covers that repository's code; it does not
automatically grant redistribution rights for extracted World of Warcraft data
or assets.

After a complete run, release only if all of these checks pass:

1. the staging snapshot published atomically and every artifact has a hash;
2. no canonical version combines facts from different builds;
3. required foreign keys validate and unresolved IDs remain explicit;
4. `catalog-index -stats-only -confirm` finishes and read-model status is
   `fresh`;
5. coverage regression thresholds, API smoke tests and one real detail tooltip
   pass for both `en_US` and `ru_RU`.

Generate a read-only, machine-readable coverage and relationship audit at any
time:

```powershell
docker compose run --rm --entrypoint catalog-audit api
```

The report includes per-entity-type localization, description, icon and
official-document coverage plus normalized item, spell, talent and crafting
fact counts. Keep the JSON report with the import operation evidence.

See [catalog-data-model.md](catalog-data-model.md) for the layer boundaries,
source precedence, variant model and extension rules.
See [catalog-api.md](catalog-api.md) for the list/detail contract and cache
semantics.

## Automated catalog pipeline

`catalog-pipeline` is the single orchestration entry point for full refreshes.
It acquires a PostgreSQL advisory lock per product, records the run and every
stage, invokes the existing atomic importers, then rebuilds canonical
descriptions, item variants, spell effects, tooltips/taxonomy and the entity
graph in that order. It finally refreshes coverage, validates catalog
invariants and evaluates the publication gate. Database credentials are
inherited through `DATABASE_URL` and are never stored in stage arguments or run
errors.

Inspect a complete plan without downloading or changing catalog data:

```powershell
docker compose run --rm --no-deps --entrypoint catalog-pipeline api -mode dry_run -sources wago,raidbots,db2,battlenet,listfile -publication-environment production
```

Run an approved full refresh:

```powershell
docker compose run --rm --no-deps --entrypoint catalog-pipeline api -mode apply -trigger manual -sources wago,raidbots,db2,battlenet,listfile -max-records 0 -publication-environment production -timeout 8h
```

The `battlenet` source runs the official index/detail import first and then a
media-only pass for entity families that expose official icons. The importer
reads `BATTLENET_CLIENT_ID` and `BATTLENET_CLIENT_SECRET` from the environment;
credentials are never written to the pipeline plan or database stage records.
Dry runs persist the safe stage plan and mark every stage skipped; they never
execute importers or evaluate current catalog invariants. Apply runs validate
that all non-quest entities have a latest version, relation types are valid and
read models are fresh. Registry-only quests are counted as enrichment backlog,
not treated as corrupt entities.

The import can succeed while the run ends as `blocked`: this means the private
catalog and read models are consistent, but at least one contributing source is
not cleared for public delivery. Never turn the gate off to work around that
state. Update `catalog_source_policies` after a current terms review and add an
`allowed` row to `catalog_publication_grants` only with the approver, reason,
review timestamp, exact environment/surface and any expiration date recorded.

The optional host scheduler is in `infra/systemd/gildra-catalog-refresh.*`. It
runs at 04:15 with randomized delay and `Persistent=true`. Its `ExecCondition`
runs `catalog-build-check`, persists the observed build and skips the expensive
pipeline when no new build exists. Installing/enabling those units and
performing the first apply are production changes and require a separate
approved operation with a verified backup and rollback plan.
