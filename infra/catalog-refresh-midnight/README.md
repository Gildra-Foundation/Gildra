# Midnight backup-success consumer (offline candidate)

This directory is an installation proposal, not an installed scheduler. It changes
no backup-owned file. Exactly one OnSuccess dependency invokes one oneshot;
there is no new timer, cron, Restart loop or refresh-all invocation.

## Contract

`consumer.py` exclusively/nonblockingly locks the SAME
`/var/lib/gildra-server-backup/job.lock` for validation, recovery, build check,
resume lookup, complete ingestion, publication verification and state commit.
Busy returns failure, never skip-success. The child inherits the lock. Commands
must be native foreground binaries, never Docker/remote launchers or daemons.
Process groups are terminated on timeout/error/signal; systemd KillMode additionally
contains descendants. Uninterruptible kernel I/O or a broken host cannot be given
a software completion guarantee: backup must fail busy rather than overlap.

Under that lock, read latest.json once with fstat from the same open inode. Match
backup Result=success, inactive, normal exit0; completed/generation/mtime must
belong to this invocation. Completion <=1h old, generation <=26h; require all
four producer snapshot prefixes (8 or 64 hex), valid probe SHA256, correct host and
retention=true. Consumer contract version2 resolves each prefix through read-only
`gildra-restic snapshots --json`: exactly one full64 ID, exact host, generation
and component tags, server-backup tag and four distinct IDs. Ambiguous prefixes,
wrong generation/component/host and missing snapshots fail. No producer change.
Malformed, partial, old, future and previous-run evidence fails closed. Atomic
producer rename is a prerequisite: schema alone cannot prove write atomicity.
The current producer was inspected and uses os.replace. Initial restore-proof
is neither consumed nor reinterpreted as a daily attestation.

Run the supported **native catalog-backup executable** with full restore proof
and explicit isolated scratch PostgreSQL configured by the owner. This retains
legacy manifest creation and validation without calling its old systemd service
or launching a second OnSuccess chain. Require local backup store configuration
for verified_same_host (or extend explicitly after owner review). The pipeline's
own 24h/schema/hash/source-restore gate remains authoritative; no restic-to-legacy
relabeling or recovery waiver. No generated mock evidence enters production.

Before native proof, query both database system identifiers/database names and source
pg_database_size. Reject a matching source/restore identity; require the restore identity
explicitly provisioned in MIDNIGHT_RESTORE_SYSTEM_ID and MIDNIGHT_RESTORE_DATABASE.
Capacity preflight budgets one uncompressed source-size dump plus two source sizes for
restore/index/work, aggregated by filesystem, plus20GiB reserve on each filesystem.
The operator must prove MIDNIGHT_RESTORE_FILESYSTEM_PATH maps to that actual restore
cluster and all its tablespaces; this cannot be established by a string setting alone.
Reserve is checked before each command and every second during execution; breach aborts
owned processes and then reconciles database sessions. For a104GiB source on one FS,
this proposal requires332GiB free, so current~62.97GiB fails before proof starts.
No full proof was attempted. No existing backup is deleted. At most ONE newly owned
midnight-proof-<generation> directory is admitted; another attempt fails until its
owner agrees explicit reclamation. This conservative lifecycle is bounded but not an
automatic daily retention solution. Reclamation/storage provisioning needs agreement.

Build discovery uses the existing live wow build checker. Reject non-12.x builds.
Only product wow/retail-foundation and all existing source gates are invoked.
Public Midnight membership is coordinator-owned: importer has no expansion-only
CLI. Its supported Retail dependency imports preserve legacy data; this is NOT
an invented item/level/name filter or a four-edition refresh. This implementation
cannot promise that every underlying write affects only Midnight rows.

A failed/staging same-build release resumes at its first unproven executable
stage. Proof is a succeeded stage linked by release-start to that exact release.
Runner revalidates the evidence and source snapshots. A still-running DB run
fails closed: after a hard kill, operator must prove the worker is gone and use
the supported reconciliation procedure before retrying. No blind DB UPDATE is
provided. Successful import followed by supervisor crash is safe to repeat via
pipeline already-published recovery. Exit0 alone is insufficient: require current
published release, refreshed read models and latest apply run publication_ready.

Completed generation goes atomically to last-good.json only after confirmation;
a repeated generation does not import again. attempt.json records running/failed/
succeeded for admitted attempts. Pre-admission and contention failures remain
visible through nonzero systemd result/journal/OnFailure; they do not overwrite an
active attempt. No retention/deletion of existing source/catalog records is added.

## Bounded window and RPO

At admission inspect the existing timer ActiveState/SubState, LastTriggerUSec and
NextElapseUSecRealtime. Require active/waiting, a past trigger within26h and a future
next firing. If today's02:30 has arrived but today's trigger has not occurred,
reject (including02:31–02:35 pending jitter). Take min(now+12h, next **earliest**
02:30 UTC minus10m, actual next firing minus10m); require >=5m remaining.
Jitter gives no extra budget. Recovery, discovery, queries and import SHARE this
budget. Pipeline context expires at least60s before it; supervisor TERM then KILL
bounds ordinary process execution, with <=30s grace. Wall/monotonic drift>2s aborts.
systemd starts stopping at12h but MUST NOT force-kill an unreconciled lock holder:
TimeoutStopSec=infinity and SendSIGKILL=no. Observer queries check both source and
restore pg_stat_activity for the unique application_name; terminal means no matching
session, even idle. Unknown/failed observations hold EX and retry. No new writing
command runs in this reconciliation phase. State I/O failure also retains exclusion.
This may cause the next nonblocking backup to FAIL busy; it is deliberately not a
backup timeout extension or a completion guarantee. **Owner design/staging agreement received in D2-V2-AGREEMENT.md; activation
requires immediate incident delivery, named operator and monitoring.** Reboot/SIGKILL remains outside
this software guarantee. A previous running attempt is reconciled before new admission
but still requires operator pipeline reconciliation; it is never silently retried.
Do not schedule another ingestion timer. Missed backup or busy job means failed
refresh; the owner's Persistent backup timer is the next automatic opportunity.
An operator retry must pass freshness again. Long stages replay from stage start,
not record-level checkpoint. A stage exceeding every daily window can starve:
there is no claim that existing30h work now completes within12h.

Operational target: daily successful backup, alert on any failed backup/consumer,
and page if latest completed generation age exceeds26h. Actual off-host data RPO
must be computed from application export time, not completed_at or the probe.
With daily cadence+jitter5m and backup duration <=20h, conservative steady-success
bound is approximately44h5m since capture (assuming capture begins at job start).
This is NOT a contractual24h RPO. Failed/missed jobs make the bound unbounded until
recovery. Snapshots of four components are not an atomic cross-service transaction.
Catalog freshness has no proven bound until full-size stage throughput is measured.
Clock changes, reboot/kill, storage failure and hung kernel tasks require monitoring;
retain exclusivity even if it means failing a backup. No last-good published
snapshot is deliberately discarded on an incomplete import.

## Exact remaining installation (owner only; not executed)

1. Review these files with server-backup owner and coordinator; integrate updated
   pipeline D changes and A/B/C plus Midnight membership. Run whole-schema staging
   import/restore with real supported sources and this wrapper before production.
2. Build/install matching native catalog-pipeline, catalog-backup (including explicit
   application_name preservation in databaseEnvironment; the old binary overwrites it),
   catalog-build-check and ALL importer/index binaries in
   `/usr/local/lib/gildra-catalog/bin`. Install matching pg_dump/pg_restore/psql
   (`/usr/bin/psql` is absent on inspected host). Do not wrap Docker CLI here.
3. Provision a separate disposable restore PostgreSQL DB with sufficient capacity,
   local encrypted backup store, explicit credentials, age/signing secrets and
   source API credentials. Configure root-only
   `/etc/gildra-catalog-midnight/environment`: DATABASE_URL,
   CATALOG_BACKUP_RESTORE_DATABASE_URL, CATALOG_BACKUP_LOCAL_DIRECTORY,
   MIDNIGHT_RESTORE_SYSTEM_ID, MIDNIGHT_RESTORE_DATABASE,
   MIDNIGHT_RESTORE_FILESYSTEM_PATH (proven local cluster/tablespace mapping),
   CATALOG_BACKUP_AGE_IDENTITY_FILE, CATALOG_BACKUP_SIGNING_KEY_FILE,
   CATALOG_BACKUP_AGE_RECIPIENT and importer settings. Never source live .env
   implicitly. Native binaries need host-reachable URLs; Docker service names are
   not assumed routable. Existing catalog-backup Validate must reject same DB.
4. Install consumer.py at `/usr/local/lib/gildra-catalog-midnight/consumer.py`,
   unit at `/etc/systemd/system/gildra-catalog-midnight.service`.
   Owner installs 20-midnight-consumer.conf as
   `/etc/systemd/system/gildra-server-backup.service.d/20-midnight-consumer.conf`.
   OnSuccess reset is intentional: verify final effective value contains only
   this consumer. Keep legacy catalog-backup.timer and refresh-all trigger inactive;
   do not start legacy backup service (it triggers refresh-all).
5. Validate units/environment/native full restore/timeout/cgroup behavior on
   isolated target; verify alert destination, daemon-reload only with authorization.
   Owner alone enables new backup timer after their recovery gate. Consumer is
   static, not enabled. No production activation is authorized by this proposal.
6. Observe first full backup -> refresh, verify actual metadata schema has not
   changed, DB publication/read-model result, and recovery proof/storage/time budget.
   Rollback integration: owner removes only this drop-in and stops consumer,
   preserving backup timer, last-good data and recovery artifacts.

Tests: `python3 -m unittest discover -s infra/catalog-refresh-midnight -v`.
Mocks cover orchestration and SQL-result decisions; actual temporary OS processes
cover flock and termination. They do not prove actual production restore,
full production restore, source availability or whole-catalog throughput. Optional
`MIDNIGHT_DISPOSABLE_PG=midnight-fill-coordinator-pg` runs a real PostgreSQL transaction/
terminal/lock check on that explicitly named disposable container only. Unit tests
also exercise actual8-character producer shape, pending jitter02:20/29/31/34,
catch-up, clock jump, reserve breach before/during a process, and observer outage.

## Accepted design and final staging additions

Read OPERATIONS.md for the accepted exceptional EX tradeoff, exact local notification
contract, named-operator escalation and the separately reviewed proof replacement
proposal. D2 verifies the notification executable digest/operator before new writes;
immediate reconciliation-start acknowledgement is distinct from JSON/journal evidence.
No destination/operator or external alert has been configured/sent here.

The consumer requires a pinned native manifest (MIDNIGHT_NATIVE_MANIFEST plus its
SHA256) for all eight binaries and matching pgtools. Real disposable full-schema
native catalog-backup -> pg_dump/pg_restore and actual db2-import termination under
EX/observer outage PASS; see native-chain-result.json in the report directory.
This is a10.35MB test archive, not a104GiB production proof or latest-source throughput.
New -skip-local-retention prevents the legacy CLI from expiring existing manifests;
the normal CLI default is unchanged. One-proof cap remains; no automatic reclamation.

Backup owner independently enabled the new server timer under its original task,
next observed2026-11-12 02:30:45UTC. Service OnSuccess remains empty; D2 is not installed.
Bootstrap6 metadata must not be consumed as a daily service invocation.
