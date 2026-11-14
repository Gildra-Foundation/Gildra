# Offline operations contract — no installation or deletion authorization

Backup-owner design/staging agreement: `/home/debian/server-backup-20261111/D2-V2-AGREEMENT.md`.
Metadata, admission and exceptional EX retention are accepted. Activation conditions
below remain mandatory. The new backup timer is owned/enabled independently; D2
is NOT installed, and the service OnSuccess is empty. Bootstrap6 is not a normal
daily-service invocation and must never be manually admitted as one.

## Incident delivery and operator

Before any writing command, provision a **named human/on-call owner** in
MIDNIGHT_INCIDENT_OPERATOR, an absolute executable MIDNIGHT_INCIDENT_EXECUTABLE,
and its reviewed MIDNIGHT_INCIDENT_SHA256. No name or destination is invented here.
The checked executable receives one JSON document on stdin with contract_version1,
incident_id, event (started/ongoing/resolved), writer application_name, operator,
blocker_age_seconds, backup_generation_age_seconds, severity and this runbook path.
It receives a minimal environment, never database URLs or backup credentials.
Within5 seconds it must return JSON `{"accepted":true,"incident_id":"<same id>"}`
only after the configured incident destination durably accepts delivery/queueing.
The executable is the delivery adapter, not a file-writer pretending to be a pager.
Its configured route, named duty operator and actual receipt must be exercised in
an explicitly authorized staging alert before activation. None has been supplied
or contacted here. Tests use a temporary local executable and local receipt only.

When the first DB-terminal check is false/unknown, the supervisor invokes the hook
immediately BEFORE sleeping. It repeats every60 seconds while blocked and marks
critical after5 minutes or if the latest backup completion is older than26h/unknown.
Each event carries both ages; failed acknowledgements are explicitly unconfirmed,
recorded locally and retried. Resolution is sent after BOTH DB observers report no
matching session. Journal/incident.json are additional evidence, not delivery.
An independent existing monitoring route must alert on missing hook receipts and
stale heartbeat while the service is active/stopping; OnFailure alone is inadequate.
No new timer or external alert was created/sent. Host death prevents this process
from alerting, so external heartbeat supervision is an activation prerequisite.

Operator procedure on first alert:
1. Acknowledge the incident through the configured destination. Read attempt.json,
   incident.json and reconciliation-required.json; compare writer identity, blocker
   age and latest backup generation age. Notify the backup duty owner that the next
   nonblocking backup can fail busy. Escalate unacknowledged/ongoing critical events.
2. Do NOT kill/restart the supervisor, remove job.lock or force-start a backup.
   Observe the exact tagged sessions on BOTH source and restore with read-only SQL
   and a short timeout. Restore observer connectivity/permissions before concluding
   that a writer is absent. A dead client is not terminal evidence.
3. If an actual writer is stuck, the designated DB operator must obtain approval for
   cancelling its exact backend/transaction, confirm identity, and observe rollback
   completion. This runbook grants no production cancellation permission.
4. Leave EX held while any observation is false/unknown. Once both report terminal,
   supervisor records terminal and releases naturally. Then reconcile the pipeline's
   still-running stage through supported maintenance; never blindly UPDATE status.
5. Verify incident resolution delivery and the next normal scheduled backup's own
   invocation-bound generation. Do not call a failed/busy backup successful. Recheck
   fresh proof/source/build admission before any new ingestion attempt.

## Pinned native chain

MIDNIGHT_NATIVE_MANIFEST points to JSON contract_version1, source_base (40hex),
source_patch_sha256 (64hex), go_version, binaries mapping names to SHA256 and
pg_tools mapping psql/pg_dump/pg_restore to absolute path+sha256.
MIDNIGHT_NATIVE_MANIFEST_SHA256 pins that entire JSON. Required executables are
catalog-backup, catalog-pipeline, catalog-build-check, db2-import, catalog-import,
raidbots-import, listfile-import and catalog-index. All are verified before writing.
The runtime psql path is /usr/bin/psql; pg_dump/pg_restore must resolve from PATH to
exact pinned files. Installation must use a root-controlled immutable binary set
and minimal PATH; concurrent binary replacement is prohibited for the whole run.
The manifest must represent the reviewed source patch, not an arbitrary self-hash.

The backup binary must preserve explicit URL application_name AND support
`-skip-local-retention`. D2 passes that flag: the existing default local retention
would otherwise expire old manifest records across products' proof directories.
Default legacy CLI behavior is unchanged; no installed producer/retention changed.
The candidate local native-build-manifest.json describes test-container pgtools;
it is NOT a host installation manifest (host tools still absent/unprovisioned).

## Proof replacement proposal — separately reviewed, never automatic purge

Current cap admits only one owned midnight-proof-<generation> directory. This safely
blocks subsequent daily ingestion; unattended daily rotation is NOT implemented.
Neither glob deletion nor the legacy global retention call is permitted by D2.
Failure/unknown writer state, incomplete publication, an unresolved incident, or an
unverified replacement always preserves all existing proof/manifests.

Before owner approval of an owned-only maintenance tool/procedure:
1. Inventory exact canonical paths, inode/device, owner generation, signed sidecar,
   SHA256/bytes, manifest UUID/status/storage URI, and every pipeline stage counter
   referencing backup_manifest_id. Preserve the most recent required verified proof
   and all proofs referenced by current/recoverable releases. Reject symlinks, paths
   outside the explicit owned root and ambiguous ownership.
2. Provision space for a replacement plus restore/index headroom and20GiB reserve;
   the current104GiB source/~62.97GiB free cannot pass (~332GiB same-FS proposal).
   Prove restore data-directory and all tablespace mappings. Never attempt on root
   just because small disposable tests succeeded.
3. In a separately approved maintenance window under the SAME EX lock, create a
   replacement in a separately provisioned explicitly owned staging location with
   the supported native full proof, pinned binary and -skip-local-retention. This
   is a proposed manual maintenance flow, not bypassing the consumer's one-dir cap.
4. Verify replacement signature/hash/full restore/source match/schema and recovery
   gate, completed publication/read-model state, terminal writers and all remaining
   DB references. Existing proof stays until replacement and rollback requirements
   are accepted by both catalog and backup owners.
5. Produce an immutable exact-path reclamation proposal with references/protected
   set, revalidate under lock, obtain specific deletion/expiration approval, and use
   an owner-reviewed scoped tool that preserves DB audit records and handles crash
   rollback. No such approved scoped expirer is supplied here; therefore DO NOT
   manually UPDATE manifests, invoke global retention or delete/move proof folders.
6. Verify the protected replacement still opens/verifies through the recovery gate,
   then separately permit next admission. Any mismatch stops without reclamation.

No production capacity provision, proof deletion, monitoring destination, daemon
reload, OnSuccess edit or scheduler activation is performed by this package.
