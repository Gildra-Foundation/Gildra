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
temporary_directory="${CATALOG_BACKUP_TEMP_DIRECTORY:-/var/lib/gildra/catalog-backups}"
run_token="$(date -u +%Y%m%dT%H%M%SZ)-$$"
restore_container="gildra-catalog-restore-$run_token"
restore_volume="gildra-catalog-restore-$run_token-data"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
runtime_environment=""
result_output=""
job_status="failed"

# The production host keeps the age identity and signing key in the local
# deployment backup directory.  Older releases required operators to export
# these paths manually; infer the standard locations when they are present so
# the systemd timer and an interactive run use the same verified configuration.
if [ -z "${CATALOG_BACKUP_AGE_IDENTITY_FILE:-}" ] && [ -r "$deployment_directory/backups/catalog_backup_age_identity" ]; then
  CATALOG_BACKUP_AGE_IDENTITY_FILE="$deployment_directory/backups/catalog_backup_age_identity"
  export CATALOG_BACKUP_AGE_IDENTITY_FILE
fi
if [ -z "${CATALOG_BACKUP_SIGNING_KEY_FILE:-}" ] && [ -r "$deployment_directory/backups/catalog_backup_signing_key" ]; then
  CATALOG_BACKUP_SIGNING_KEY_FILE="$deployment_directory/backups/catalog_backup_signing_key"
  export CATALOG_BACKUP_SIGNING_KEY_FILE
fi
if [ -z "${CATALOG_BACKUP_AGE_RECIPIENT:-}" ] && [ -n "${CATALOG_BACKUP_AGE_IDENTITY_FILE:-}" ] && [ -r "$CATALOG_BACKUP_AGE_IDENTITY_FILE" ]; then
  CATALOG_BACKUP_AGE_RECIPIENT="$(awk '/^# public key:/{print $4; exit}' "$CATALOG_BACKUP_AGE_IDENTITY_FILE")"
  export CATALOG_BACKUP_AGE_RECIPIENT
fi

# docker compose interpolates service commands before starting the container.
# Export the resolved path and let compose.yml supply the CLI flag; passing a
# dash-prefixed flag after `compose run SERVICE` is parsed as a compose option
# and silently drops the service command override, sending large dumps to the
# container's small /tmp tmpfs.
export CATALOG_BACKUP_TEMP_DIRECTORY="$temporary_directory"

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
  docker volume rm -f "$restore_volume" >/dev/null 2>&1 || true
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

compose run --rm --no-deps \
  -e CATALOG_BACKUP_PREFLIGHT=true \
  -e "CATALOG_BACKUP_RESTORE_DATABASE_URL=postgres://$restore_user:$restore_password@$restore_container:5432/$restore_database?sslmode=disable" \
  catalog-backup >/dev/null
docker network inspect "$restore_network" >/dev/null
docker volume create \
  --label gildra.component=catalog-backup-restore \
  --label "gildra.run-token=$run_token" \
  "$restore_volume" >/dev/null
docker run --detach --rm \
  --name "$restore_container" \
  --network "$restore_network" \
  --env-file "$runtime_environment" \
  --mount "type=volume,src=$restore_volume,dst=/var/lib/postgresql/data" \
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

compose run --rm --no-deps \
  -e "CATALOG_BACKUP_RESTORE_DATABASE_URL=postgres://$restore_user:$restore_password@$restore_container:5432/$restore_database?sslmode=disable" \
  catalog-backup > "$result_output"
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
