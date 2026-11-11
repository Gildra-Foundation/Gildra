# Slim unused catalog indexes (00178)

Production was applied by hand on 2026-11-11 under the `db:gildra-maintenance`
lease; the migration is idempotent, so Goose records it as a no-op there.

- `catalog_entity_{localization,version}_artifacts_source_idx` (5.8 GB, 3.4 GB)
  are replaced by single-column `source_artifact_id` indexes. They only serve
  the `ON DELETE RESTRICT` foreign key and artifact lookups.
- `game_entity_localizations_locale_slug_idx` and `game_entity_versions_source_idx`
  had zero scans between 2026-10-27 and 2026-11-11.
- `catalog_db2_rows_snapshot_idx` becomes `catalog_db2_rows_snapshot_id_idx`
  on `snapshot_id` alone (11 distinct values; serves `ON DELETE SET NULL`).
- Large catalog tables vacuum and analyze at 2 % / 1 % change instead of the
  20 % default, which never triggered on tables of 50–70 million rows.

Production also dropped the DB2 rows of superseded retail builds 135 and 162
from `catalog_db2_rows` (data, not schema; no published or latest entity
version points at them). The rows are kept as a compressed COPY in
`/var/lib/gildra/db-optimize-20261111/` on the server.
