# Daily build check and staged import — schedule proposal

Nothing here is installed. No unit, timer, drop-in or credential is changed by
this file; it says how a new game build should reach the site without manual
steps and without meeting the nightly server backup, and what is still missing.

## Why the import is a multi-day job

Measured on production run 207 (27–28 Oct 2026, build 12.1.5.70575):

| Stage | Duration |
|---|---:|
| import-wago | 2 h 16 min |
| import-raidbots | 39 min |
| import-db2 | 4 h 06 min |
| import-battlenet-quests, import-battlenet, media, listfile | 49 min |
| enrich-battlenet-quests | 2 h 00 min |
| enrich-battlenet-missing | 20 h 10 min, killed unfinished |

Battle.net enrichment asks one request per record. Its throughput was flat at
35,800–36,600 preserved responses an hour for 20 hours, for 200 and 404 answers
alike: that is the published API quota of 36,000 requests an hour, shared with
the live site. One fresh client build had about 1.6 million such requests
ahead of it (item, spell and creature in two locales), about 44 hours. With a
30 hour budget (`-timeout 30h` in the saved command, the same value hard-coded
in `infra/systemd/run-gildra-catalog-refresh-all.sh`) the run could not finish,
and a retry started from zero.

What changed in the pipeline:

- every finished enrichment record has a checkpoint; a stopped stage continues;
- responses preserved for the same build-pinned Battle.net namespace are reused
  by the next client build (the API build lags the client: today the API serves
  12.1.5.70077 while the client is 12.1.5.70783), so only a new API build costs
  a full pass;
- a second-locale pass does not ask for records the first locale showed absent
  or without a description;
- a stopped DB2 stage keeps the tables it proved;
- the pipeline stops its stage with SIGTERM at its own deadline and records why.

So the schedule must be a chain of bounded daily windows, each resuming the
same release, never one long run.

## Proposed daily flow

One chain, no second timer:

1. `gildra-server-backup.timer` (existing, 02:30 UTC plus its randomized delay)
   runs the nightly backup.
2. On success the backup unit starts `gildra-catalog-midnight.service`
   (`OnSuccess=` drop-in `20-midnight-consumer.conf`, this directory). The
   consumer takes the backup's own `job.lock`, so backup and import cannot
   overlap by construction, not by clock arithmetic.
3. The consumer proves recovery (`catalog-backup -restore-proof full`), then
   asks `catalog-build-check -product wow` for the live build.
4. Live build already published and no unfinished release: exit 0. Nothing is
   written.
5. Otherwise it looks up the newest unfinished release of that build and runs

   ```
   catalog-pipeline -mode apply -trigger schedule -product wow \
     -profile retail-foundation -version <live build> \
     -sources wago,raidbots,db2,battlenet,listfile -max-records 0 \
     -confirm-full-import -publication-environment production \
     -recovery-policy verified_same_host \
     -enrichment-requests-per-hour <MIDNIGHT_ENRICHMENT_REQUESTS_PER_HOUR> \
     -timeout <seconds until the window closes> \
     [-resume-release <id> -resume-from <first stage without a success>]
   ```

   The window closes ten minutes before the next backup can start. At the
   deadline the pipeline stops its stage (SIGTERM, 30 s), marks the stage and
   the release failed with the deadline as the cause, and keeps checkpoints.
6. The next night step 5 resumes the same release from the stopped stage.
   When every stage has succeeded the pipeline validates, passes the
   publication gate and publishes atomically; the consumer then verifies the
   published pointer and records `last-good.json`.

`MIDNIGHT_ENRICHMENT_REQUESTS_PER_HOUR` is read by `consumer.py` (optional).
Leaving it unset uses the whole quota; 18000 leaves half to the live site and
doubles the enrichment days.

Expected length of a first import of a client build (stand rehearsal of
12.1.5.70783 on 12 Nov 2026: import-wago 2 h 05 min, import-raidbots 33 min,
resuming a release 3 min; the rest is in
`/home/debian/gildra-db-fill-20261112/FRESHNESS.md`): stages before
enrichment fit in one window; enrichment takes one more window when the API
build is unchanged and the previous evidence is still in the database, and
two to three windows after Blizzard moves the API to a new build.

## What the consumer still needs before it can be installed

1. **Window length.** `deadline()` caps a run at 12 hours and the unit has
   `TimeoutStartSec=12h`. The backup finishes around 03:30–04:30 UTC, so about
   21 hours are free. Either raise both to "next backup minus ten minutes" or
   accept twice as many days per import. Owner decision.
2. **A stopped-at-deadline run is not a failure.** Today the consumer raises,
   the unit fails and `OnFailure=gildra-notify@` fires every night of a
   multi-day import. It needs a third outcome, "pending": the pipeline run
   ended with a deadline cause and its stage counters advanced. Alert on a
   pending release that made no progress in a window, and on any other error.
3. **Interrupted run reconciliation.** `resume_args()` refuses a release whose
   run is still `running` and asks for an operator. After the consumer has
   proved its own writer sessions are gone it can call
   `catalog-pipeline -mode apply -product wow -reconcile-failed-run <id>
   -confirm-worker-stopped` itself. The command takes the pipeline lock (a
   connected pipeline always holds it), fails the dead run and its staging
   release the way the pipeline would have, and closes the imports left behind.
4. **Time to stop.** The pipeline's `-timeout` is set to the window end minus
   60 seconds, and the consumer kills the process group at the window end.
   Failing a release restores the pointers of every entity it staged: 597,623
   rows and about two and a half minutes on the rehearsal stand, five minutes
   in production run 207. A pipeline killed inside that step leaves its run
   marked running (the rehearsal reproduced this with a 150 second stop). The
   pipeline timeout must end at least 15 minutes before the consumer's own
   kill, and any manual stop must wait as long (`docker stop -t 900`).
5. **Stage list.** `STAGES` in `consumer.py` duplicates the pipeline plan.
   It matches today; a plan change must update both, or the consumer should
   read the plan from `catalog-pipeline -mode dry_run`.
6. **Evidence retention.** Reuse reads enrichment artifacts of earlier builds,
   including releases that failed. Nothing may purge
   `catalog_source_records` of `battlenet-missing/*` artifacts younger than
   45 days (`-evidence-reuse-max-age`).
7. **Pinned native binaries.** `verify_native_binaries()` checks a manifest of
   SHA-256 values; it must be regenerated from the commit that is released.
8. **Environment.** `/etc/gildra-catalog-midnight/environment` needs the
   production database URL, the isolated restore database, Battle.net
   credentials and the incident route. Production currently runs the pipeline
   through Docker Compose; the consumer runs native binaries on the host.
9. **Still open from the consumer's own README:** restore-proof capacity
   (three source sizes plus reserve on the restore filesystem), the life cycle
   of the single proof directory, a named operator and a real alert route.
10. **Other editions.** The consumer imports Retail only. Classic editions keep
   using `run-gildra-catalog-refresh-all.sh`, which starts a new release on
   every run with a fixed `-timeout 30h` and has no timer. If it is ever
   scheduled it needs the same resume lookup, or it repeats run 207.

## Until the consumer is installed

The coordinator runs the same command by hand after the nightly backup
(04:30 UTC or later), with `-timeout` ending before 02:20 UTC, and repeats it
with `-resume-release`/`-resume-from` until the release publishes. The exact
sequence with expected durations and rollback is in the FRESHNESS report.

## Rehearsal stand

The stand network has no route out. `source_proxy.py` is a CONNECT-only relay
bound to the stand bridge address and limited to the stand subnet: port 443
only, the listed source hosts only, no private targets, no TLS termination, no
URL or credential logging. The runner sets `HTTPS_PROXY`/`HTTP_PROXY` to it and
`NO_PROXY` for the stand database, mounts the static binaries read-only, uses
the stand's own `DATABASE_URL`, the `staging` publication environment and
`-expected-database-system-id` so a wrong connection string cannot write to
production. The relay is a transient unit and is stopped when the stand parks.
The stand must be parked by 01:45 UTC and started again after 04:30 UTC: its
volume would otherwise enter the nightly backup.
