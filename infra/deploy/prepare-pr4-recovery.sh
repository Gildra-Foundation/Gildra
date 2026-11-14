#!/usr/bin/env bash
# Fixed recovery operation: no command, path, or image inputs.
set -euo pipefail
umask 077
exec 9>/run/lock/gildra-deploy.lock
flock -n 9
cd /opt/gildra
out=/opt/gildra/backups/pr4-recovery-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$out"
cp -p current-release.env "$out/previous-release.env"
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io --username Shpuntyara --password-stdin
services=(web api scraper-worker rotation-sim-worker)
repos=(gildra-web gildra-api gildra-scraper gildra-rotation-sim-worker)
keys=(WEB_IMAGE API_IMAGE SCRAPER_IMAGE ROTATION_WORKER_IMAGE)
expected=(64eadc4e6a7277fb376a336de48b9604ecd5757d876bce8a3a3eced0242b7c5b 8f4a78868724ef898d67a730980819d05b9d18aefb110f5a43b2053246d56b40 f1c5ba751938ac1bc365788c1b74ee791ee79b0aec7d1df60913457a4fcec545 a98dc5d17aa74f0261123c110e73201f7b2cf06b5813ed7fa1674e96220a9d70)
for i in 0 1 2 3; do
  container=$(docker ps -q --filter label=com.docker.compose.project=gildra --filter "label=com.docker.compose.service=${services[i]}")
  test -n "$container"
  test "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = healthy
  id=$(docker inspect -f '{{.Image}}' "$container")
  test "$id" = "sha256:${expected[i]}"
  docker image inspect "$id" > "$out/${services[i]}.json"
  docker save "$id" > "$out/${services[i]}.tar"
  (cd "$out" && sha256sum "${services[i]}.tar" >> SHA256SUMS)
done
(cd "$out" && sha256sum -c SHA256SUMS)
for i in 0 1 2 3; do
  repo=ghcr.io/gildra-foundation/${repos[i]}
  tag=$repo:recovery-${expected[i]}
  docker tag "sha256:${expected[i]}" "$tag"
  docker push "$tag"
  digest=$(docker image inspect "$tag" --format '{{range .RepoDigests}}{{println .}}{{end}}' | grep "^$repo@sha256:" | head -1)
  [[ "$digest" =~ ^ghcr.io/gildra-foundation/[a-z-]+@sha256:[0-9a-f]{64}$ ]]
  docker pull "$digest"
  test "$(docker image inspect -f '{{.Id}}' "$digest")" = "sha256:${expected[i]}"
  printf '%s=%s\n' "${keys[i]}" "$digest" >> "$out/recovery-release.env"
done
printf 'RELEASE_ID=pr4-preserved-mixed\n' >> "$out/recovery-release.env"
# No SOURCE_REVISION: per-image inspected metadata records the real mixed state.
cp "$out/recovery-release.env" current-release.env.recovery
mv current-release.env.recovery current-release.env
GILDRA_RESTORE_PROOF=full /opt/gildra/infra/backup/run-catalog-backup.sh
cp /opt/gildra/var/catalog-backup/last-success.json "$out/last-success.json"
python3 - "$out/last-success.json" <<'CHECK'
import json,sys
v=json.load(open(sys.argv[1]))
assert v['restoreVerified'] is True and v['sourceRestoreMatch'] is True
CHECK
die() { echo "$*" >&2; exit 1; }
api_container=$(docker ps -q --filter label=com.docker.compose.project=gildra --filter label=com.docker.compose.service=api)
  schema_state=$(docker exec "$api_container" sh -c 'psql "$DATABASE_URL" -Atqc "SELECT COALESCE(max(version_id),0) FROM goose_db_version WHERE is_applied"')
  backup_state=$(docker exec "$api_container" sh -c 'psql "$DATABASE_URL" -Atqc "SELECT COALESCE((SELECT database_version::bigint || '"'"'|'"'"' || floor(extract(epoch FROM restore_completed_at))::bigint FROM catalog_backup_manifests WHERE component='"'"'postgres'"'"' AND status='"'"'verified'"'"' AND storage_uri ~ '"'"'^(file|s3|r2|swift)://'"'"' AND content_hash IS NOT NULL AND byte_size>0 AND verification @> '"'"'{\"restore_verified\":true,\"source_restore_match\":true}'"'"'::jsonb ORDER BY restore_completed_at DESC,id DESC LIMIT 1), '"'"'0|0'"'"')"')
  printf '%s\n' "$schema_state" | grep -Eq '^[0-9]+$' || die "api returned an invalid catalog schema version: $schema_state"
  printf '%s\n' "$backup_state" | grep -Eq '^[0-9]+\|[0-9]+$' || die "api returned invalid recovery evidence state: $backup_state"

test "${backup_state%%|*}" = "$schema_state"
test "${backup_state#*|}" -ge "$(($(date +%s)-86400))"
printf '%s\n' "$schema_state" "$backup_state" > "$out/database-proof.txt"
cat "$out/recovery-release.env" "$out/SHA256SUMS"
printf 'Recovery evidence directory: %s\n' "$out"
