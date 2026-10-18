# SpellMisc text lookup index (00172)

`enrichMentions` compares `raw.payload->>'SpellID'=target.external_id::text`
within one build, `SpellMisc`, and `en_US`. Migration 00172 adds a partial
expression index for that exact lookup. It leaves the numeric SpellID index,
query text, data, API executable, and imports unchanged. In particular, text
values with leading zeroes keep their existing meaning. The partial predicate
does not require `payload ? 'SpellID'`, which is absent from this reader.

The supported runner is Goose v3, as used by `backend/entrypoint.sh`. Its
`NO TRANSACTION` directive is required: concurrent index creation and removal
must execute outside a transaction. Apply the committed migration through that
runner, with the database/migration lease and the normal backup, disk-space,
active-transaction, and service-health checks. Do not start the API entrypoint
merely to run this index migration; use the reviewed migration-only operation.
The index build scans the existing table and uses disk and I/O despite allowing
ordinary writes. Set bounded session lock/statement timeouts in the reviewed
operation, rather than changing global database settings.

Before applying, verify schema version 171, the new index name is absent, and
no other concurrent build is running on this table. If an interrupted attempt
left this index invalid, stop. A reviewed cleanup must verify its exact
definition and ownership, then remove that invalid index concurrently before
retrying the unapplied migration. `CREATE INDEX` deliberately has no
`IF NOT EXISTS`: an invalid or incompatible index must not be silently accepted.
Afterwards verify Goose version 172 and that the new index is ready and valid,
then compare the unchanged reader's plan and service health. Keep all six
pre-existing indexes.

For production rollback, add a new, numbered, forward migration after the
latest committed schema version. Its Up should contain the following, with
`-- +goose NO TRANSACTION`; its Down should recreate the exact index from
00172 concurrently. Do not edit 00172 or run Goose `down` on production:

```sql
DROP INDEX CONCURRENTLY IF EXISTS catalog_db2_rows_spell_misc_text_lookup_idx;
```

The Down in 00172 is for isolated upgrade/rollback regression. Removing this
additive index restores the previous plan and does not change query results.

Run the isolated regression after building or obtaining the repository's
static Goose v3.27.1 executable. Supply a locally available, immutable
Postgres image matching the deployed version; the harness never pulls images,
opens production connections, or starts application services:

```sh
python3 scripts/test-catalog-spell-misc-text-index.py \
  --postgres-image sha256:LOCAL_IMAGE_ID \
  --expected-pg-version 17.10 \
  --goose /absolute/path/to/goose \
  --output-dir /absolute/path/to/new-proof-directory
```

The harness caps its own container at one CPU and 768 MiB, with no network,
published ports, or persistent volumes. It applies the real numeric and text
migrations with Goose, executes the complete reader SQL extracted from
`mentions.go`, and compares its ordered results and normal EXPLAIN plans on
200,000 synthetic rows. It covers build, locale, table, missing/null/empty and
leading-zero SpellIDs, difficulty/row ordering, and a missing file asset. It
also checks concurrent creation inside a transaction is rejected, local Down
preserves results, and reapplying Up restores the indexed plan. The synthetic
cost comparison is a planner regression, not a production latency forecast.
