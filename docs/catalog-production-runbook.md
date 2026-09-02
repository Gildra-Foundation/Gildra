# Retail catalog production runbook

## Scope

This runbook is only for the structured World of Warcraft Retail foundation:
items, armor, weapons, reagents, spells, professions and recipes, quests,
creatures/NPCs, collections, locations, acquisition relations, and official
media. Tier-list datasets and rankings from Wowhead, wow.gg, Archon, Icy Veins,
MythicStats, or similar sites are not inputs to this catalog and must never be
joined into its canonical facts.

The production history still contains older tier-list migrations because an
applied migration is immutable. Preserving those files is database compatibility,
not permission to use those datasets in the Warcraft foundation pipeline.

The machine-readable launch contract is `retail-foundation-v1` in
`catalog_release_profiles`. Its required entity types must all meet their
minimum counts for the exact candidate build. Optional types may be represented
through normalized item or spell facts, and deferred types are explicitly not
part of the v1 completeness claim. Changing that profile requires a new
forward-only migration and review; operators must not edit it directly in a
running database.

Retail v1 requires first-class entities for achievements, areas, battle pets,
classes, creatures/NPCs, currencies, encounters, factions, instances, items,
maps, mounts, professions, PvP talents, quests, recipes, specializations,
spells, toys, and transmog sets. Canonical talent and talent-tree entities are
deferred until a build-pinned denominator is proven. Armor, weapons, reagents,
consumables, gems, enchantments, food, flasks, and potions remain queryable as
typed item facts and categories rather than separate completeness denominators.

## Source profile

The production profile is `retail-foundation`:

1. build-pinned client DB2 data transported through Wago.Tools;
2. Blizzard Game Data and Media API documents in `en_US` and `ru_RU`;
3. verified listfile names for FileDataID resolution.

Raidbots is optional community enrichment and is excluded from this profile.
Production foundation runs reject custom profiles and sources outside this list.

## Release gates

No catalog import may start until all of these are true:

1. the exact Retail build version is supplied;
2. PostgreSQL is on catalog schema version 90 or newer;
3. a compressed PostgreSQL backup is encrypted and stored off-host in R2, S3,
   or Swift, unless the operator explicitly selects the
   `verified_same_host` recovery policy and accepts loss of both database and
   backup when the server is lost;
4. its SHA-256 and byte size are recorded;
5. that exact backup was restored into an isolated disposable database within
   the last 24 hours;
6. critical table counts and migration version matched the source database;
7. `catalog_backup_manifests` records the evidence with status `verified`, a
   URI allowed by the selected recovery policy, and verification flags `restore_verified=true` and
   `source_restore_match=true`;
8. a bounded proof import and all validation checks pass before the unbounded
   import is approved.

Off-host recovery remains the default. A local-only dump satisfies the gate
only when `-recovery-policy verified_same_host` is supplied explicitly and the
same checksum, schema, recency, and isolated-restore checks pass. Loss of the
server can still destroy both the database and this backup.

## Safe sequence

```text
read-only inventory
-> verified backup under the selected recovery policy
-> isolated restore and count comparison
-> schema migration
-> dry-run plan for one pinned build
-> bounded import (100 records per scope)
-> provenance, completeness, orphan, localization and media checks
-> full import with explicit confirmation
-> rebuild read models
-> publication gate
-> atomically move the public release pointer
-> post-release backup and restore drill
```

For the initial deployment, schema migration and catalog import are separate
changes. A successful migration does not authorize an import. The current public
snapshot remains the fallback until the candidate build passes every check.

## Commands

Plan only; no importer is executed:

```bash
catalog-pipeline \
  -mode dry_run \
  -profile retail-foundation \
  -product wow \
  -version 12.1.0.69404 \
  -max-records 100
```

Optional live contract proof in a disposable PostgreSQL container (never part
of ordinary CI because it depends on an external service):

```bash
go test -tags=integration,live ./integration -run TestBoundedLiveWagoCatalogImport -count=1 -v
```

Bounded production proof after the recovery manifest exists:

```bash
catalog-pipeline \
  -mode apply \
  -profile retail-foundation \
  -product wow \
  -version 12.1.0.69404 \
  -max-records 100
```

Full production import after reviewing the proof run:

```bash
catalog-pipeline \
  -mode apply \
  -profile retail-foundation \
  -product wow \
  -version 12.1.0.69404 \
  -max-records 0 \
  -confirm-full-import
```

## Failure behavior

- Missing build or missing full-import confirmation is rejected before a
  pipeline run is created.
- Missing, stale, local-only, or unverified backup evidence fails the
  `recovery-gate` stage before any importer process starts.
- Every stage records its status, safe arguments, bounded error summary, and
  timestamps in `catalog_pipeline_runs` and `catalog_pipeline_stages`.
- Every source snapshot is attached to one `catalog_releases` candidate. The
  importer may advance its private `latest_version_id`, but the website and
  public API read only `published_version_id`.
- Failed or policy-blocked releases are marked failed, their candidate pointers
  are rolled back, and the last-known-good public release remains selected.
- A release is published in one PostgreSQL transaction: all validated snapshots
  become published, entity public pointers move, the build becomes active, and
  `catalog_public_release_state` selects the release together.
- The publication gate evaluates the candidate release's requested sources,
  including sources not present in the old public catalog.
- A run for the exact build already selected in `catalog_public_release_state`
  is recorded as a successful no-op. It does not rewrite same-build DB2 facts.
- Recovery means restoring the verified backup and checking the catalog build,
  snapshots, entities, versions, relations, normalized facts, media, users, and
  migration version before reopening writes.

## Recovery implementation

The repository now includes `catalog-backup`, which creates an age-encrypted
server-local or off-host PostgreSQL archive, restores the stored object into an isolated
empty database, compares critical state, uploads signed evidence, and only then
records a verified manifest. Its unit and disposable-database integration tests
do not constitute a production recovery point. The default production recovery
gate remains closed until that remote-copy drill succeeds. A server-local
installation may instead select `verified_same_host`, but it must still restore
the exact archive into an isolated database, compare critical state, and
register the resulting manifest. The target single-server deployment uses the
protected server-local backend; S3/R2 is not required. Do not bypass either policy with a manual
status change.

## Local media cache

Image bytes live on this server under the absolute directory configured by
`CATALOG_MEDIA_DIRECTORY`; the database stores only the immutable cache key,
SHA-256, byte size, MIME type, observation proof and public API URL. The API
serves a cached object through `/v1/media/{media-id}` only while the source has
reviewed, unexpired `asset_cache=allowed` and `public_api=allowed` grants for
the active environment.
Missing, blocked, expired or revoked permission returns `404` and never falls
back to the upstream host.

Source publication is open by owner decision (2026-09-02): every registered
source in `catalog_source_policies` is public, and the site credits sources
(`attribution_text`) instead of gating them. The former review/grant workflow
(`catalog-source-approval`, `catalog_publication_grants`,
`catalog_source_policy_reviews`) was removed in migration 00131. Media caching
runs in bounded batches; review `catalog_media_cache_runs` before increasing
the limit:

```bash
catalog-media-cache \
  -environment production \
  -limit 100 \
  -confirm
```

The downloader accepts HTTPS only, refuses private and special-purpose
addresses, disables proxy inheritance, limits each file to 32 MiB and accepts
only JPEG, PNG, WebP or GIF after inspecting the actual bytes. Objects are
deduplicated by SHA-256. Per-object failures produce a `partial` run and remain
eligible for a later retry; they do not replace the previous published media.
Public selection carries forward only the newest ready media observation whose
build is not newer than the entity's published build. Future candidate media
is never returned, and revoking either grant immediately closes local delivery.

The server-local release backup must cover both PostgreSQL and the media
directory. Store the media archive/manifest beside the protected local catalog
backup, record a sorted cache-key/SHA-256 manifest, and test-restore both into
an isolated database and directory before a release is eligible. S3/R2 is not
required for this deployment, but loss of the server can destroy both copies
and is an explicitly accepted recovery limitation.

The API exposes both `locale` (requested) and `resolvedLocale` (actual source)
plus `localeFallback`. Recipe reagent and output blocks expose
`resolution_status` and `resolution_reason`, so known source gaps are not
presented as valid empty data.

## Public catalog

Production runs with `CATALOG_ACCESS_MODE=public`: catalog REST routes under
`/v1/game/` and `/v1/library/`, GraphQL and `/v1/media/` are anonymous and
cacheable, and `gildra.net/database` and `/library` render in Next.js. The API
console keeps its own administrator session. Data-readiness, artifact proof,
active-build and verified same-host recovery gates remain mandatory for every
release; the deploy runs the readiness audit with `-require-production-ready`
in this mode.

## Safe projection of existing complete DB2 facts

Projection-only maintenance must never call the normal importer with
`-download=false`: the normal importer begins a new snapshot and would create
an empty import run. Use a dedicated completeness-gated mode instead. For
quest reward packages:

```bash
db2-import \
  -product wow \
  -version 12.1.0.69497 \
  -download=false \
  -project-existing-quest-packages \
  -confirm
```

The command refuses to run unless `db2.questpackageitem` is `complete` for the
exact product/build/locale. It creates only canonical package candidates and
does not publish them. `PackageID` is not a quest ID; the public tooltip labels
the result `package_only` until a separate proved relationship is imported.

## Production observability and source isolation

- Backend and browser Sentry DSNs are optional. When either DSN is absent, the
  corresponding SDK remains disabled and does not block a production release.
  Request completion events still go to the structured container logs.
- The API writes one structured completion event per request using only method,
  fixed route template, status, duration and response byte count. Raw URLs,
  query strings, authorization headers, cookies, request bodies, remote
  addresses and user identifiers are never included. HTTP 5xx responses are
  also reported to Sentry using the fixed route template when Sentry is enabled.
- `/livez` proves that the process can serve HTTP. `/readyz` independently
  pings PostgreSQL, ClickHouse and Redis; container health alone is not accepted
  as proof of service readiness.
- Release validation exercises the dataset directory, an entity list and a
  real detail page in both locales. The release gate requires zero HTTP errors,
  dataset p95 at most 1 second, summary p95 at most 500 ms and detail p95 at
  most 1 second before rollback is disarmed.
- The daily canonical Warcraft refresh uses Wago only as DB2 transport, direct
  DB2 projection, Blizzard Game Data/Media and the verified listfile. Raidbots,
  Wowhead, wow.gg, Archon, Icy Veins and every tier-list dataset are excluded
  from this foundation pipeline.
