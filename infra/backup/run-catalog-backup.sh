#!/bin/sh
set -eu

deployment_directory="${GILDRA_DEPLOYMENT_DIRECTORY:-/opt/gildra}"
environment_file="${GILDRA_ENV_FILE:-$deployment_directory/.env}"
release_environment_file="${GILDRA_RELEASE_ENV_FILE:-$deployment_directory/current-release.env}"
state_directory="${GILDRA_BACKUP_STATE_DIRECTORY:-$deployment_directory/var/catalog-backup}"
lock_file="${GILDRA_BACKUP_LOCK_FILE:-$state_directory/run.lock}"
restore_image="${CATALOG_BACKUP_RESTORE_IMAGE:-postgres@sha256:8189a1f6e40904781fc9e2612687877791d21679866db58b1de996b31fc312e4}"
restore_network="${CATALOG_BACKUP_DOCKER_NETWORK:-gildra_default}"
restore_user="gildra_restore"
restore_database="gildra_restore"
run_token="$(date -u +%Y%m%dT%H%M%SZ)-$$"
restore_container="gildra-catalog-restore-$run_token"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
runtime_environment=""
result_output=""
job_status="failed"

if [ ! -r "$environment_file" ]; then
  echo "catalog backup environment file is not readable" >&2
  exit 1
fi
if [ ! -r "$release_environment_file" ]; then
  echo "catalog backup release manifest is not readable" >&2
  exit 1
fi
for compose_file in compose.yml compose.prod.yml compose.runtime.yml compose.backup.yml; do
  if [ ! -r "$deployment_directory/$compose_file" ]; then
    echo "catalog backup Compose file is not readable: $compose_file" >&2
    exit 1
  fi
done

for command in date docker flock grep install mktemp openssl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "required command is unavailable: $command" >&2
    exit 1
  fi
done

printf '%s\n' "$restore_image" | grep -Eq '^postgres@sha256:[0-9a-f]{64}$' || {
  echo "catalog backup restore image must be pinned by sha256 digest" >&2
  exit 1
}
printf '%s\n' "$restore_network" | grep -Eq '^[0-9A-Za-z][0-9A-Za-z_.-]*$' || {
  echo "catalog backup Docker network name is invalid" >&2
  exit 1
}

umask 077
install -d -m 700 "$state_directory"
exec 8>"$lock_file"
if ! flock -n 8; then
  echo "another catalog backup or restore drill is already running" >&2
  exit 1
fi

runtime_environment="$(mktemp "$state_directory/runtime.XXXXXX")"
result_output="$(mktemp "$state_directory/result.XXXXXX")"
chmod 600 "$runtime_environment" "$result_output"
restore_password="$(openssl rand -hex 24)"

compose() {
  docker compose \
    --env-file "$environment_file" \
    --env-file "$release_environment_file" \
    --env-file "$runtime_environment" \
    -f "$deployment_directory/compose.yml" \
    -f "$deployment_directory/compose.prod.yml" \
    -f "$deployment_directory/compose.runtime.yml" \
    -f "$deployment_directory/compose.backup.yml" \
    "$@"
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  docker rm -f "$restore_container" >/dev/null 2>&1 || true
  [ -z "$runtime_environment" ] || rm -f "$runtime_environment"
  [ -z "$result_output" ] || rm -f "$result_output"

  finished_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  status_output="$state_directory/last-run.env.tmp.$$"
  {
    printf 'STATUS=%s\n' "$job_status"
    printf 'STARTED_AT=%s\n' "$started_at"
    printf 'FINISHED_AT=%s\n' "$finished_at"
    printf 'EXIT_CODE=%s\n' "$status"
  } > "$status_output"
  chmod 600 "$status_output"
  mv -f "$status_output" "$state_directory/last-run.env"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

cat >"$runtime_environment" <<EOF
POSTGRES_DB=$restore_database
POSTGRES_USER=$restore_user
POSTGRES_PASSWORD=$restore_password
CATALOG_BACKUP_RESTORE_DATABASE_URL=postgres://$restore_user:$restore_password@$restore_container:5432/$restore_database?sslmode=disable
EOF

cd "$deployment_directory"

compose run --rm --no-deps -e CATALOG_BACKUP_PREFLIGHT=true catalog-backup >/dev/null
docker network inspect "$restore_network" >/dev/null
docker run --detach --rm \
  --name "$restore_container" \
  --network "$restore_network" \
  --env-file "$runtime_environment" \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=8g \
  --security-opt no-new-privileges:true \
  "$restore_image" >/dev/null

attempt=0
until docker exec "$restore_container" pg_isready -U "$restore_user" -d "$restore_database" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "isolated restore PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

compose run --rm --no-deps catalog-backup > "$result_output"
[ -s "$result_output" ] || {
  echo "catalog backup returned empty recovery evidence" >&2
  exit 1
}
grep -Eq '"restoreVerified"[[:space:]]*:[[:space:]]*true' "$result_output" || {
  echo "catalog backup did not report a verified restore" >&2
  exit 1
}
grep -Eq '"sourceRestoreMatch"[[:space:]]*:[[:space:]]*true' "$result_output" || {
  echo "catalog backup did not report matching source and restore state" >&2
  exit 1
}
chmod 600 "$result_output"
mv -f "$result_output" "$state_directory/last-success.json"
result_output=""
job_status="verified"
