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
5. the encrypted file is atomically stored either in a protected server-local
   directory or at an HTTPS S3-compatible endpoint;
6. the command reads that stored object again, checks its byte size and
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
workflow. When selected, the custom S3 endpoint is configured through the AWS SDK's
[`BaseEndpoint`](https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-endpoints.html),
not a legacy endpoint resolver.

## Required secrets and configuration

Keep these values in the deployment secret store, not in Git:

```dotenv
DATABASE_URL=postgres://backup-user:secret@postgres:5432/gildra
CATALOG_BACKUP_RESTORE_DATABASE_URL=postgres://backup-user:secret@isolated-postgres:5432/gildra_restore

# Current single-server production mode. Use an absolute protected directory
# outside the application release tree.
CATALOG_BACKUP_LOCAL_DIRECTORY=/var/lib/gildra/catalog-backups

CATALOG_BACKUP_AGE_RECIPIENT=age1replace-with-public-recipient
CATALOG_BACKUP_AGE_IDENTITY_FILE=/etc/gildra/catalog-backup/age-identity
CATALOG_BACKUP_SIGNING_KEY_FILE=/etc/gildra/catalog-backup/signing-key
```

The local backend writes immutable `0600` encrypted objects, publishes them
atomically, returns `file://` manifest URIs and rejects relative paths, path
traversal and overwrites. This production deployment intentionally uses the
local store only; it does not require or mount S3/R2 credentials.

In the single-server Compose deployment this directory is backed by the
persistent `catalog_backups` Docker volume. The operation container is removed
after each run, but the encrypted archive and signed manifest remain on the
server. Do not remove or recreate that volume during an application deploy.

The backend still supports an S3-compatible store for a future separately
reviewed off-host profile:

```dotenv
CATALOG_BACKUP_LOCAL_DIRECTORY=

CATALOG_BACKUP_S3_ENDPOINT=https://s3.example-region.example
CATALOG_BACKUP_S3_REGION=example-region
CATALOG_BACKUP_S3_BUCKET=gildra-backups
CATALOG_BACKUP_S3_ACCESS_KEY_ID_FILE=/etc/gildra/catalog-backup/r2-access-key-id
CATALOG_BACKUP_S3_SECRET_ACCESS_KEY_FILE=/etc/gildra/catalog-backup/r2-secret-access-key
CATALOG_BACKUP_S3_PATH_STYLE=true
CATALOG_BACKUP_URI_SCHEME=s3
```

Use `CATALOG_BACKUP_URI_SCHEME=r2` for Cloudflare R2. Create a private dedicated
bucket and an [Object Read & Write R2 token](https://developers.cloudflare.com/r2/api/tokens/)
scoped only to that bucket. Do not use a Global API key or an account-wide R2
administration token in the application.
R2 credentials are shown only once; place each value directly into its
root-owned referenced file without copying it into `.env`, shell history, logs,
or Terraform state. Configure object retention independently so compromised
application credentials cannot silently remove the only recovery point.

The backup-only Compose overlay mounts the four referenced files as runtime
secrets. The application accepts either a direct value or a `_FILE` reference
for compatibility, refuses ambiguous dual configuration, and production uses
only the file-reference path.

Generate the age identity on a trusted workstation and store a separate
offline copy:

```bash
age-keygen -o catalog-backup.agekey
age-keygen -y catalog-backup.agekey
```

The identity file may be the standard output produced by `age-keygen`.
Comments and blank lines are parsed according to the age identity-file format,
and the runner requires exactly one identity.

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

Successful output contains only non-secret evidence: manifest ID, storage
URIs, SHA-256, byte size, schema version, restore duration, and signer
fingerprint. `pg_dump` and `pg_restore` receive parsed libpq fields via their
process environment. Only the non-secret restore database name is present in
`pg_restore` arguments; the credential-bearing URL and password are never
placed in process arguments.

For the OVH Docker deployment, use the bounded wrapper instead of maintaining
a permanent restore database:

```bash
sudo /opt/gildra/infra/backup/run-catalog-backup.sh
```

The Compose wrapper defaults to the Retail product (`wow`). To produce a
separate verified recovery proof for another product, set
`CATALOG_BACKUP_PRODUCT` in the deployment environment before invoking the
wrapper (for example `wow_classic`, `wow_classic_era`, or
`wow_classic_hardcore`). Keep one verified manifest per product; the
publication gate is intentionally product-scoped and will not treat a Retail
backup as proof for a Classic release.

The wrapper creates a uniquely named PostgreSQL container and a dedicated local
Docker volume on the private Compose network, waits for readiness, runs
`catalog-backup`, and removes both the restore container and its volume on
success or failure. A bounded `tmpfs` is deliberately not used: the complete
catalog is larger than available safe RAM and must be restored to disk without
an artificial size ceiling.
The source PostgreSQL container is never stopped and the restore target is never
reachable through a published host port. Do not point the restore URL at the
source database or reuse a restored database between drills.

Before allocating the restore container, the wrapper runs a configuration-only
preflight. It validates the pinned restore image, selected storage settings, database URLs,
age recipient/identity pair, Ed25519 signing key, and object prefix without
accessing either database or object storage. This preflight is an early error
check, not proof that remote credentials can read and write the bucket.

Only one manual or scheduled drill can run at a time. The lock and non-secret
state are stored under `/opt/gildra/var/catalog-backup` by default. Every attempt
atomically updates `last-run.env`; a successful remote download and isolated
restore additionally updates `last-success.json` with the command's recovery
evidence. These local files aid monitoring, but the signed stored sidecar and
the verified PostgreSQL manifest remain the authoritative recovery proof.

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
- stored-object hash, restore, signature, schema version, or row counts differ;
- the disposable restore database is not empty;
- the selected storage backend rejects writes or reads.

The next resilience stages are an independent ClickHouse backup/restore drill,
media-object inventory verification, retention automation, and an end-to-end
scheduled job in staging before production activation.
