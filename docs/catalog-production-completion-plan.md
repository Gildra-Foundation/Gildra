# WoW catalog: production completion plan

## Goal and definition of 100%

The catalog is complete only relative to an immutable, build-pinned source
snapshot. “100%” means:

1. the source denominator was recorded with a hash and artifact reference;
2. every source record was imported or has an explicit, reviewable exclusion;
3. every normalized fact points to its source artifact;
4. validation passed before the published snapshot pointer changed;
5. the last-known-good snapshot and a restore-tested backup remain available.

This definition deliberately does not claim that a community source contains
every fact that exists on Blizzard's private servers.

## Implemented foundation (this change)

- `catalog_completeness_expectations`, exclusions, measurements, and the
  `catalog_completeness_latest` view establish a real denominator and history.
- `catalog-completeness` measures entities, official documents, icons, media,
  and quest registry coverage. It is dry-run by default and writes only with
  `-record`.
- `catalog_entity_media` stores all official Media API assets, their kind,
  dimensions, FileDataID when present, source URL, cache state, and artifact.
- Battle.net media ingestion now preserves every allowlisted
  `*.worldofwarcraft.com` image rather than discarding everything except icon.
- Normalized rewards, NPC facts, acquisition facts, effects, and recipe facts
  now have additive artifact provenance columns and online indexes.
- `catalog_entity_version_artifacts` records every immutable artifact that
  observed an entity version. A complete import can therefore prove a version
  first seen by a bounded diagnostic without creating a duplicate revision or
  rewriting last-known-good provenance.
- `catalog_entity_localization_artifacts` records the immutable inputs for each
  locale. Compound Wago spell projections retain both `SpellName` and `Spell`
  proofs instead of attributing the text to only one file.
- Battle.net quest reward writes now set their direct artifact reference.
- `catalog_backup_manifests` records dump hashes, sizes, build/snapshot IDs, and
  isolated restore evidence. A JSON copy must live beside each backup.
- The `retail-foundation` pipeline profile excludes Raidbots and all tier-list
  datasets. Production applies require a pinned build, explicit confirmation
  for an unbounded run, and a fresh verified off-host restore manifest before
  the first importer process starts.
- Schema 69 adds release candidates and a separate public version pointer.
  Source snapshots remain private until all stages validate and one transaction
  publishes the snapshots, entity versions, active build, and product release
  state. Failure restores the previous entity pointers instead of exposing a
  partial refresh.
- Public entity, relationship, mention, history, summary, and sitemap reads use
  published versions. Graph edges are restricted to the published build.
- The publication gate now evaluates sources requested by the candidate release,
  so a newly introduced unapproved source cannot hide behind the old catalog.
- Classic DB2 gaps are now profile-scoped. A Wago artifact marked
  `unavailable` is still a publication blocker unless the active product
  profile has an explicit `not_applicable` rule for that exact table/source;
  the approved exceptions are surfaced as warnings in the readiness API.
  This prevents a missing export from being mistaken for an empty table.

### Current Classic availability policy

The Classic, Classic Era, and Hardcore profiles currently mark only the
Dragonflight crafting tables (`CraftingData*`), PvP talent data, and the
modern Trait talent tables as `not_applicable`. Item bonus/level tables,
quest lines/objectives, and all other unavailable exports remain blocking
until their applicability is verified for the exact client build. This is
intentional: the catalog must not publish an apparently complete Classic
release while silently dropping item, quest, or relationship data.

## Source hierarchy

| Priority | Source | Use | Rule |
| --- | --- | --- | --- |
| 1 | Blizzard Game Data and Media APIs | localized names, supported entity details, quest rewards, official media | authoritative for fields actually returned |
| 2 | build-pinned client DB2/CASC | identities, typed game data, links, FileDataIDs, effects | definitions pinned to the exact build |
| 3 | verified wow-listfile names | resolving FileDataID to paths | keep verified/community confidence separate |
| 4 | auditable community data, e.g. ATT or TrinityCore | gaps such as acquisition, NPC service and legacy data | never overwrite higher-priority facts; preserve source license and snapshot |
| 5 | first-party telemetry/add-on observations | drop rates, spawn observations, phase/difficulty variants | store as observations, never as timeless facts |

WoWDBDefs supplies machine-readable definitions for build-specific DB2 files.
The wow-listfile project warns that community filenames can change, therefore
the catalog must key assets by FileDataID and hash rather than filename alone.

## Delivery waves

### Wave 0 — recovery gate (2–3 days)

- Add an operations job that creates a compressed PostgreSQL dump and
  ClickHouse backup, calculates SHA-256, and writes encrypted copies plus
  sidecar JSON manifests. Production may temporarily use a verified same-host
  backup when `CATALOG_RECOVERY_POLICY=verified_same_host` is explicit; this
  accepts total-loss risk if the OVH server fails and must be replaced by
  off-host storage before a high-availability launch.
- Restore each backup into isolated disposable containers, apply read-only
  integrity queries, compare build/snapshot IDs and critical row counts, then
  mark the manifest `verified`.
- Keep daily backups for 14 days, weekly for 8 weeks, monthly for 12 months.
- Block publication when the newest successful catalog import has no verified
  backup within 24 hours (under the selected recovery policy).

Acceptance: one-button restore has measured RTO, zero missing migrations, and
matching counts for entities, versions, source records, relations, and media.

### Wave 1 — provenance closure (3–5 days)

- Pass `source_artifact_id` through every existing DB2 and Raidbots projector.
- Store whole-artifact SHA-256 and byte size at fetch completion; reject a
  `ready` artifact without both values.
- Add an audit that reports normalized rows without artifact provenance by
  table and importer.
- Backfill only from deterministic joins to existing raw rows; ambiguous rows
  remain unresolved instead of receiving guessed provenance.

Acceptance: 100% of newly written normalized rows have a valid artifact; legacy
gaps are visible and trend toward zero.

### Wave 2 — images and other media (3–7 days)

- Continue collecting official remote URLs immediately.
- Add a separate streaming media worker. It must enforce HTTPS host allowlists,
  response size and MIME limits, timeouts, retries, and SHA-256 while streaming.
- Store image bytes outside PostgreSQL on the dedicated encrypted media volume
  (`/var/lib/gildra/catalog-media`) used by the current OVH production host.
  PostgreSQL stores FileDataID, dimensions, MIME, hash, remote URL, and object
  key. S3/R2 remains an optional disaster-recovery target, not a production
  prerequisite for this deployment.
- Generate WebP/AVIF derivatives for UI only; retain the original hash and never
  rewrite the source record.
- Cache Blizzard assets only after the `asset_cache` publication grant and
  current terms review permit it. Until then, use the recorded official URL.
- Resolve DB2 portrait/model/texture FileDataIDs through verified listfile and
  CASC extraction. Unknown filenames remain addressable by FileDataID.
- Treat operator cancellation/timeouts as an interrupted run: leave `remote`
  and previously `cached` observations intact so retries do not manufacture
  false `failed` media rows.
- The API resolves every validated icon name to the same official render URL
  used by the worker while a local object is still `remote`; cached media always
  wins and malformed names are rejected. This is a temporary display fallback,
  not a claim that bytes were retained locally.

Acceptance: media coverage is measured per entity type; broken URLs are queued
for retry; the UI always has a deterministic placeholder and never shows a
broken image element.

### Description rendering contract

DB2 descriptions can contain numeric formulas and player-context conditionals.
The API resolves values that are provable from the selected build (effects,
durations, ticks and nested spell descriptions) and exposes the resolved value
for both `en_US` and `ru_RU`. A conditional block is rendered as both labelled
branches (for example “If …; otherwise …”) because static catalog data cannot
know which talent or aura a player has active. The source-backed text remains in
`rawDescription`/`localizations.*.description`, and unresolved client tokens
never receive a “complete” quality state.

### Wave 3 — quests and rewards (5–10 days)

- Import the complete quest registry denominator for each product/build.
- Normalize guaranteed/choice items, currency, money, experience, reputation,
  spells, titles, and package rewards.
- Materialize graph links `quest -> grants -> entity` with reward index,
  quantity, choice requirements, class/spec restrictions, and artifact ID.
- Validate that every referenced item/currency/spell is resolved or explicitly
  listed as an unresolved foreign identity.

Acceptance: denominator-based quest coverage is 100%; a failed refresh keeps
the previously published reward set.

### Wave 4 — recipes and item variants (1–2 weeks)

- Materialize first-class `recipe` entities while retaining spell IDs as their
  canonical game identity during the compatibility period.
- Project profession, category, reagents, currencies, outputs, quality tiers,
  required skill, and learned-by relations.
- Populate item variant effects from build-pinned bonus/effect tables, keyed by
  context and sorted bonus list; never copy base effects blindly to variants.
- Add idempotency tests: a repeated import must produce no new versions or
  duplicate relations.

Acceptance: every recipe row is reachable as an entity and every component is
source-linked; variant effect counts match their source rows.

### Wave 5 — NPC roles, locations, loot and acquisition (2–4 weeks)

- Derive roles independently from explicit vendor, trainer, quest giver/end,
  taxi, repair, gossip, transport, and service evidence. One NPC may have many
  roles, each with its own source.
- Store locations as observations with map/UI map, coordinates, phase,
  difficulty, spawn group, source, and observation time. Do not collapse
  multiple spawns to one point.
- Normalize `NPC/container/encounter/quest/vendor/profession -> item` edges.
  Preserve difficulty, loot mode, group, min/max quantity, quest requirement,
  and nullable chance. A missing chance is not zero.
- Keep observed attempts/drops separate from configured/static chance.
- Use community sources only under reviewed policy and label their confidence.

Acceptance: every acquisition edge is reproducible from a source artifact;
contradictory sources coexist as observations and are surfaced by audit.

### Wave 6 — Russian localization (1–2 weeks)

- Measure name, description, tooltip, and media alt-text independently.
- Distinguish `not provided by source`, `not yet imported`, and `failed parse`.
- Use official `ru_RU` first. Never machine-translate game terms into canonical
  fields; optional generated text belongs to a separately labeled editorial
  layer.
- Prioritize toys, gems, enchantments, food, potions, recipes, quests, and NPCs.

Acceptance: locale coverage is denominator-based, fallback is explicit in the
API response, and English text is never presented as a Russian source value.

### Wave 7 — Classic, Classic Era and Hardcore (4–8 weeks)

- Remove hardcoded `wow` product assumptions from DB2, Raidbots, taxonomy, and
  pipeline commands; make product/namespace/build mandatory inputs.
- Give every product independent builds, snapshots, source policies,
  expectations, public pointers, and backups.
- Reuse schemas and importer interfaces, not Retail IDs. Cross-product identity
  mappings must be explicit and many-to-many.
- Implement Classic Era first, derive Hardcore only where the data is proven
  identical, then add Classic progression as a separate product history.

Acceptance: no query or import can mix products without an explicit crosswalk;
each product passes the same completeness and restore gates independently.

## Pipeline contract

```text
discover build -> fetch immutable artifacts -> hash/store raw records
-> normalize into staging snapshot -> measure completeness/provenance/media
-> compare with last-known-good -> verify backup -> publish pointer atomically
```

Failures before publication mark only the candidate snapshot as failed. They do
not delete or replace the current snapshot. Retry is idempotent by artifact
hash, record key, and build identity.

## Required checks before production

- unit tests for parsers, normalizers, media allowlists, and completeness math;
- Testcontainers migration/import tests against PostgreSQL and ClickHouse;
- golden fixtures for every source response and DB2 layout;
- minimum-count and relative-delta alerts per scope;
- unknown enum/field counters instead of silent drops;
- duplicate, orphan, provenance, localization, and media integrity audits;
- one successful isolated restore drill for the exact release candidate;
- source-policy review and explicit publication grants for website/API/cache.

## Immediate next implementation order

1. Backup job plus isolated restore verifier and retention.
2. Propagate artifact IDs through current DB2/Raidbots facts.
3. Add policy-gated streaming media worker and broken-image UI fallback.
4. Materialize recipe entities and variant effects.
5. Implement quest denominator/reward closure.
6. Add source-specific NPC role/location/acquisition importers.
7. Parameterize every importer for Classic products.
