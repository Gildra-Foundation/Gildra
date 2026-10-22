# CMS backup and restore rehearsal

`run-cms-backup.sh` backs up the Payload CMS database (`gildra_cms`) and the
`cms_media` volume. `restore-cms-backup.sh` proves a backup restores.

## What a run does

1. `pg_dump -Fc` of `gildra_cms` through the running `postgres` Compose service,
   and a gzip tar of the `cms_media` volume (read-only mount) via the
   digest-pinned postgres image.
2. Verifies both (`pg_restore --list`, `tar -t`), writes `SHA256SUMS` and
   `manifest.env`, then publishes `$CMS_BACKUP_DIRECTORY/<UTC stamp>/`.
   Partial output is deleted on any failure; earlier backups are never touched.
3. Prunes backups older than `CMS_BACKUP_RETENTION_DAYS` (default 14) only after
   a verified publish. Status goes to `$CMS_BACKUP_STATE_DIRECTORY/last-run.env`.

Defaults (override with env): backup root `/opt/gildra/backups/cms`, state
`/opt/gildra/var/cms-backup`, volume `gildra_cms_media`.

## Restore rehearsal (safe: isolated container, no network, tmpfs)

```sh
sh infra/backup/restore-cms-backup.sh            # newest backup
sh infra/backup/restore-cms-backup.sh /opt/gildra/backups/cms/<stamp>
```

Checks the checksums, restores into a throw-away PostgreSQL, requires public
tables and `payload_migrations` rows, unpacks the media and prints
`cms restore rehearsal ok: ... tables=N migrations=N media_files=N`.

## Tests

`sh infra/backup/test-cms-backup.sh` (fake `docker`; no Docker needed).

## Not installed yet

No systemd timer is installed; scheduling (a `gildra-cms-backup.timer` next to
the catalog one) is a production step that needs the owner's OK. Backups stay
on the same host: copy them off-host before relying on them for disaster
recovery.
