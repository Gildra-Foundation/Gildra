# Catalog PostgreSQL backup: restore proof modes

`run-catalog-backup.sh` (timer `gildra-catalog-backup.timer`) dumps the main
database, encrypts it with age, stores it in the `gildra_catalog_backups`
volume and then proves the archive can be restored.

| `GILDRA_RESTORE_PROOF` | What is proven | Extra disk needed |
| --- | --- | --- |
| `light` (default) | The stored object matches its SHA-256; the whole archive decrypts and parses (`pg_restore --file=/dev/null`); the schema and the data of tables up to 20 000 rows are restored into the isolated restore database and their counts match the source; larger tables are restored empty. Foreign keys are skipped because partial data cannot satisfy them. | about 6% of the database |
| `full` | The whole archive is restored into the isolated restore database and every table count matches the source. | one more database |

The signed evidence (`*.manifest.json`) and the manifest's `verification` JSON
record `restore_mode` and `skipped_data_tables`, so a light proof is never
mistaken for a full one.

Before starting, the wrapper compares the database size with the free space of
`/var/lib/docker` and refuses to run a backup the disk cannot hold. It also
refuses `light` when the image's `catalog-backup` does not report
`restoreProof: light` in its preflight, because an older build would silently
run a full restore.

Settings (systemd drop-in or environment):

- `GILDRA_RESTORE_PROOF=light|full`
- `GILDRA_CATALOG_BACKUP_IMAGE` runs only the backup with another image (a
  build that contains the proof modes) without touching `API_IMAGE` of the release.
  On the production host it is `gildra-catalog-backup:light-<commit>`, built as
  `FROM <API_IMAGE>` with the new `catalog-backup` binary copied over; the name is
  deliberately outside `gildra-(web|api|cms|...)` so `prune-host-images.sh` keeps
  it. Once a regular API release contains this build, remove the drop-in
  `/etc/systemd/system/gildra-catalog-backup.service.d/light-proof.conf`.
- `CATALOG_BACKUP_LIGHT_MAX_TABLE_ROWS` (default 20000)

To go back to the full proof: set `GILDRA_RESTORE_PROOF=full` (and make sure
there is about a database of free disk), or remove the drop-in.
