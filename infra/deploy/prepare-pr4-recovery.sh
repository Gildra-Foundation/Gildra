#!/usr/bin/env bash
# Inspect existing PR4 evidence only; never repeat preservation or restore.
set -euo pipefail
exec 9>/run/lock/gildra-deploy.lock
flock -n 9
cd /opt/gildra
for out in /opt/gildra/backups/pr4-recovery-*; do
  test -f "$out/recovery-release.env" || continue
  cmp "$out/recovery-release.env" current-release.env
  cat "$out/recovery-release.env" "$out/SHA256SUMS"
  stat -c '%n %s bytes' "$out"/*.tar
 done
cat var/catalog-backup/last-run.env
if test -f var/catalog-backup/last-success.json; then cat var/catalog-backup/last-success.json; fi
api=$(docker ps -q --filter label=com.docker.compose.project=gildra --filter label=com.docker.compose.service=api)
docker exec "$api" sh -c 'psql "$DATABASE_URL" -Atqc "SELECT max(version_id) FROM goose_db_version WHERE is_applied; SELECT row_to_json(t) FROM (SELECT component,status,database_version,byte_size,content_hash,verification,restore_completed_at FROM catalog_backup_manifests ORDER BY id DESC LIMIT 6) t;"'
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
printf 'fullRestoreCompleted=false (intentionally interrupted)\n'
