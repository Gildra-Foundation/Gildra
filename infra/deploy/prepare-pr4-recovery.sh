#!/usr/bin/env bash
# Fixed PR4 preflight: verify the preserved baseline, then refresh light proof.
set -euo pipefail
umask 077
exec 9>/run/lock/gildra-deploy.lock
flock -n 9
cd /opt/gildra
out=/opt/gildra/backups/pr4-recovery-20261114T130841Z
cmp "$out/recovery-release.env" current-release.env
(cd "$out" && sha256sum -c SHA256SUMS)
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io --username Shpuntyara --password-stdin
services=(web api scraper-worker rotation-sim-worker)
keys=(WEB_IMAGE API_IMAGE SCRAPER_IMAGE ROTATION_WORKER_IMAGE)
for i in 0 1 2 3; do
  container=$(docker ps -q --filter label=com.docker.compose.project=gildra --filter "label=com.docker.compose.service=${services[i]}")
  test -n "$container"
  test "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = healthy
  running=$(docker inspect -f '{{.Image}}' "$container")
  saved=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0]["Id"])' "$out/${services[i]}.json")
  test "$running" = "$saved"
  ref=$(sed -n "s/^${keys[i]}=//p" current-release.env)
  [[ "$ref" =~ ^ghcr.io/gildra-foundation/gildra-[a-z-]+@sha256:[0-9a-f]{64}$ ]]
  docker pull "$ref"
  test "$(docker image inspect -f '{{.Id}}' "$ref")" = "$running"
  printf 'rollback verified: %s %s\n' "${services[i]}" "$ref"
done
api=$(docker ps -q --filter label=com.docker.compose.project=gildra --filter label=com.docker.compose.service=api)
schema=$(docker exec "$api" sh -c 'psql "$DATABASE_URL" -Atqc "SELECT max(version_id) FROM goose_db_version WHERE is_applied"')
test "$schema" = 184
curl --fail --silent --show-error --max-time 15 https://api.wowarcana.com/readyz
# Use the established default: full archive verification plus isolated schema
# and small-table restore. Never represent this as a full data restore.
GILDRA_RESTORE_PROOF=light /opt/gildra/infra/backup/run-catalog-backup.sh
python3 - "$out" <<'CHECK'
import json, pathlib, sys
state = pathlib.Path('/opt/gildra/var/catalog-backup')
v = json.loads((state / 'last-success.json').read_text())
assert v['restoreVerified'] is True and v['sourceRestoreMatch'] is True
assert v['restoreMode'] == 'light' and v['databaseVersion'] == 184
assert v['byteSize'] > 0 and len(v['sha256']) == 64
pathlib.Path(sys.argv[1], 'light-proof.json').write_text(json.dumps(v, indent=2) + '\n')
print(json.dumps({k: v[k] for k in ('manifestId','databaseVersion','byteSize','sha256','restoreMode','restoreVerified','sourceRestoreMatch')}))
CHECK
printf 'preflight complete; full data restore NOT performed\n'
