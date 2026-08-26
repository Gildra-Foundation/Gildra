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
2. PostgreSQL is on catalog schema version 75 or newer;
3. a compressed PostgreSQL backup is encrypted and stored off-host in R2, S3,
   or Swift;
4. its SHA-256 and byte size are recorded;
5. that exact backup was restored into an isolated disposable database within
   the last 24 hours;
6. critical table counts and migration version matched the source database;
7. `catalog_backup_manifests` records the evidence with status `verified`, an
   off-host URI, and verification flags `restore_verified=true` and
   `source_restore_match=true`;
8. a bounded proof import and all validation checks pass before the unbounded
   import is approved.

A local-only dump does not satisfy the production gate. It is useful recovery
evidence, but loss of the server could destroy both the database and the dump.

## Safe sequence

```text
read-only inventory
-> off-host backup
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

## Known blocker before production import

The repository now includes `catalog-backup`, which creates an age-encrypted
off-host PostgreSQL archive, restores the downloaded object into an isolated
empty database, compares critical state, uploads signed evidence, and only then
records a verified manifest. Its unit and disposable-database integration tests
do not constitute a production recovery point. Therefore the production
recovery gate must remain closed until the backup job
uploads the artifact, verifies a restore from that remote copy, and registers
the resulting manifest. Do not bypass the gate with a manual status change.
