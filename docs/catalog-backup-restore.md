# Encrypted PostgreSQL backup and restore verification

This procedure protects the structured Warcraft catalog and the application
tables in the same PostgreSQL database. It does not back up ClickHouse or media
objects; those components need independent jobs and manifests.

## Safety properties

`catalog-backup` is deliberately fail-closed:

1. it opens a repeatable-read, read-only transaction and exports its snapshot;
2. it measures the migration version and every user-table row count in that
   snapshot, while enforcing a fixed minimum list of critical catalog tables;
3. `pg_dump --format=custom` reads the same exported snapshot;
4. the dump is streamed through age encryption, so no plaintext archive is
   written to disk;
5. the encrypted file is uploaded to an HTTPS S3-compatible endpoint;
6. the command downloads that remote object again, checks its byte size and
   SHA-256, decrypts it, and restores it into a separate empty database;
7. migration version and critical row counts must match the source snapshot;
8. signed JSON evidence is uploaded beside the archive;
9. only after all checks pass is `catalog_backup_manifests.status` changed to
   `verified`.

A failed run records a bounded error summary and never creates valid recovery
gate evidence. `catalog_backup_manifests` itself is intentionally excluded from
the row-count comparison because its status changes during the run.

PostgreSQL custom archives are intended for `pg_restore`, and restoring into an
empty database is the documented safe baseline. The implementation follows the
PostgreSQL 17 [`pg_dump`](https://www.postgresql.org/docs/17/backup-dump.html)
and [`pg_restore`](https://www.postgresql.org/docs/17/app-pgrestore.html)
workflow. The custom S3 endpoint is configured through the AWS SDK's
[`BaseEndpoint`](https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-endpoints.html),
not a legacy endpoint resolver.

## Required secrets and configuration

Keep these values in the deployment secret store, not in Git:

```dotenv
DATABASE_URL=postgres://backup-user:secret@postgres:5432/gildra
CATALOG_BACKUP_RESTORE_DATABASE_URL=postgres://backup-user:secret@isolated-postgres:5432/gildra_restore

CATALOG_BACKUP_S3_ENDPOINT=https://s3.example-region.example
CATALOG_BACKUP_S3_REGION=example-region
CATALOG_BACKUP_S3_BUCKET=gildra-backups
CATALOG_BACKUP_S3_ACCESS_KEY_ID=replace-in-secret-store
CATALOG_BACKUP_S3_SECRET_ACCESS_KEY=replace-in-secret-store
CATALOG_BACKUP_S3_PATH_STYLE=true
CATALOG_BACKUP_URI_SCHEME=s3

CATALOG_BACKUP_AGE_RECIPIENT=age1replace-with-public-recipient
CATALOG_BACKUP_AGE_IDENTITY=AGE-SECRET-KEY-1REPLACE-IN-SECRET-STORE
CATALOG_BACKUP_SIGNING_KEY=base64-encoded-32-byte-ed25519-seed
```

Use `CATALOG_BACKUP_URI_SCHEME=r2` for Cloudflare R2. The access policy should
be limited to read/write access on the dedicated bucket and prefix. Enable
bucket versioning or object retention independently so compromised application
credentials cannot silently replace the only recovery point.

Generate the age identity on a trusted workstation and store a separate
offline copy:

```bash
age-keygen -o catalog-backup.agekey
age-keygen -y catalog-backup.agekey
```

Generate the Ed25519 seed separately:

```bash
openssl rand -base64 32
```

The age identity and signing seed are secrets. The age recipient and the
Ed25519 public-key fingerprint are safe to record in the recovery runbook. The
signed sidecar contains its public key, but disaster recovery must compare it
against the separately trusted fingerprint.

## Running the job

The restore database must be disposable, reachable by the backup container,
and empty. The command refuses to use the source database as the restore target
and refuses a target containing user tables. Database creation and deletion are
left to the deployment job so the application cannot accidentally destroy an
existing database.

```bash
catalog-backup \
  -product wow \
  -object-prefix catalog-backups \
  -timeout 2h
```

Successful output contains only non-secret evidence: manifest ID, off-host
URIs, SHA-256, byte size, schema version, restore duration, and signer
fingerprint. `pg_dump` and `pg_restore` receive connection strings via their
process environment instead of command-line arguments.

For the OVH Docker deployment, use the bounded wrapper instead of maintaining
a permanent restore database:

```bash
sudo /opt/gildra/infra/backup/run-catalog-backup.sh
```

The wrapper creates a uniquely named PostgreSQL container on the private Compose
network, stores its data only in a size-bounded `tmpfs`, waits for readiness,
runs `catalog-backup`, and removes the restore container on success or failure.
The source PostgreSQL container is never stopped and the restore target is never
reachable through a published host port. Do not point the restore URL at the
source database or reuse a restored database between drills.

Install `infra/systemd/gildra-catalog-backup.service` and its timer only after
all backup secrets have been placed in `/opt/gildra/.env` and one manual run has
produced a `verified` manifest. The timer runs before the daily catalog refresh,
so a fresh recovery proof is available to the production publication gate.

## Scheduling and retention

Before the first unbounded production import, run this command and confirm a
fresh `verified` manifest. Then schedule it at least daily and before every
schema migration or full catalog import. Keep multiple generations according
to a documented retention policy; never expire the latest verified backup until
a newer generation has passed the restore drill.

Alert when:

- no verified PostgreSQL manifest exists in the last 24 hours;
- a job remains in `creating` or `verifying` beyond its timeout;
- remote hash, restore, signature, schema version, or row counts differ;
- the disposable restore database is not empty;
- the object store rejects uploads or downloads.

The next resilience stages are an independent ClickHouse backup/restore drill,
media-object inventory verification, retention automation, and an end-to-end
scheduled job in staging before production activation.
