#!/bin/sh
set -eu

deployment_directory="${GILDRA_DEPLOYMENT_DIRECTORY:-/opt/gildra}"
environment_file="${GILDRA_ENV_FILE:-$deployment_directory/.env}"
release_environment_file="${GILDRA_RELEASE_ENV_FILE:-$deployment_directory/current-release.env}"
compose_files="-f compose.yml -f compose.prod.yml -f compose.runtime.yml"
restore_image="${CATALOG_BACKUP_RESTORE_IMAGE:-postgres@sha256:8189a1f6e40904781fc9e2612687877791d21679866db58b1de996b31fc312e4}"
restore_network="${CATALOG_BACKUP_DOCKER_NETWORK:-gildra_default}"
restore_user="gildra_restore"
restore_database="gildra_restore"
run_token="$(date -u +%Y%m%dT%H%M%SZ)-$$"
restore_container="gildra-catalog-restore-$run_token"

if [ ! -r "$environment_file" ]; then
  echo "catalog backup environment file is not readable" >&2
  exit 1
fi
if [ ! -r "$release_environment_file" ]; then
  echo "catalog backup release manifest is not readable" >&2
  exit 1
fi

for command in docker openssl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "required command is unavailable: $command" >&2
    exit 1
  fi
done

runtime_environment="$(mktemp)"
chmod 600 "$runtime_environment"
restore_password="$(openssl rand -hex 24)"

cleanup() {
  docker rm -f "$restore_container" >/dev/null 2>&1 || true
  rm -f "$runtime_environment"
}
trap cleanup EXIT INT TERM

cat >"$runtime_environment" <<EOF
POSTGRES_DB=$restore_database
POSTGRES_USER=$restore_user
POSTGRES_PASSWORD=$restore_password
CATALOG_BACKUP_RESTORE_DATABASE_URL=postgres://$restore_user:$restore_password@$restore_container:5432/$restore_database?sslmode=disable
EOF

cd "$deployment_directory"

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

# shellcheck disable=SC2086
docker compose --env-file "$environment_file" --env-file "$release_environment_file" --env-file "$runtime_environment" $compose_files \
  run --rm --no-deps catalog-backup
