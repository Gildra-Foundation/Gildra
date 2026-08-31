#!/bin/sh

set -eu

deployment_directory=${GILDRA_DEPLOY_DIR:-/opt/gildra}
environment_file=${GILDRA_ENV_FILE:-$deployment_directory/.env}
lock_file=${GILDRA_DEPLOY_LOCK_FILE:-/run/lock/gildra-deploy.lock}
current_manifest=$deployment_directory/current-release.env
previous_manifest=$deployment_directory/previous-release.env
rollback_manifest=$deployment_directory/last-rollback.env
validate_only=false
rollback_armed=false

if [ "${1:-}" = "--validate-only" ]; then
  validate_only=true
elif [ "$#" -ne 0 ]; then
  printf 'usage: %s [--validate-only]\n' "$0" >&2
  exit 64
fi

fail() {
  printf 'deploy: %s\n' "$*" >&2
  exit 1
}

validate_revision() {
  revision=$1
  printf '%s\n' "$revision" | grep -Eq '^[0-9a-f]{40}$' ||
    fail 'GILDRA_SOURCE_REVISION must be a lowercase 40-character Git commit SHA'
}

validate_release_id() {
  release_id=$1
  printf '%s\n' "$release_id" | grep -Eq '^[0-9A-Za-z._-]+$' ||
    fail 'GILDRA_RELEASE_ID may contain only letters, numbers, dots, underscores, and hyphens'
}

validate_image() {
  label=$1
  image=$2
  pattern=$3

  [ -n "$image" ] || fail "$label is required"
  printf '%s\n' "$image" | grep -Eq "$pattern" ||
    fail "$label must be an approved GHCR image pinned by sha256 digest"
}

validate_release_inputs() {
  : "${WEB_IMAGE:?WEB_IMAGE is required}"
  : "${API_IMAGE:?API_IMAGE is required}"
  : "${CMS_IMAGE:?CMS_IMAGE is required}"
  : "${SCRAPER_IMAGE:?SCRAPER_IMAGE is required}"
  : "${GILDRA_SOURCE_REVISION:?GILDRA_SOURCE_REVISION is required}"
  : "${GILDRA_RELEASE_ID:?GILDRA_RELEASE_ID is required}"

  validate_image WEB_IMAGE "$WEB_IMAGE" '^ghcr\.io/gildra-foundation/gildra-web@sha256:[0-9a-f]{64}$'
  validate_image API_IMAGE "$API_IMAGE" '^ghcr\.io/gildra-foundation/gildra-api@sha256:[0-9a-f]{64}$'
  validate_image CMS_IMAGE "$CMS_IMAGE" '^ghcr\.io/gildra-foundation/gildra-cms@sha256:[0-9a-f]{64}$'
  validate_image SCRAPER_IMAGE "$SCRAPER_IMAGE" '^ghcr\.io/gildra-foundation/gildra-scraper@sha256:[0-9a-f]{64}$'
  validate_revision "$GILDRA_SOURCE_REVISION"
  validate_release_id "$GILDRA_RELEASE_ID"
  [ "${GILDRA_ROLLBACK_COMPATIBLE:-}" = true ] ||
    fail 'GILDRA_ROLLBACK_COMPATIBLE=true is required; automated rollback never reverts database migrations'
}

validate_runtime_policy() {
  catalog_access_mode=$(manifest_value CATALOG_ACCESS_MODE "$environment_file")
  case $catalog_access_mode in
    public|private) ;;
    *) fail 'CATALOG_ACCESS_MODE must be public or private' ;;
  esac
  catalog_recovery_policy=$(manifest_value CATALOG_RECOVERY_POLICY "$environment_file")
  [ "$catalog_recovery_policy" = verified_same_host ] ||
    fail 'this single-server release requires CATALOG_RECOVERY_POLICY=verified_same_host'
}

manifest_value() {
  key=$1
  file=$2
  count=$(grep -c "^${key}=" "$file" || true)
  [ "$count" -eq 1 ] || fail "$file must contain exactly one $key entry"
  sed -n "s/^${key}=//p" "$file"
}

manifest_optional_value() {
  key=$1
  file=$2
  count=$(grep -c "^${key}=" "$file" || true)
  [ "$count" -le 1 ] || fail "$file contains more than one $key entry"
  if [ "$count" -eq 1 ]; then
    sed -n "s/^${key}=//p" "$file"
  fi
}

require_environment_value() {
  key=$1
  value=$(manifest_value "$key" "$environment_file")
  case $value in
    ""|'""'|"''") fail "$environment_file must contain a non-empty $key value" ;;
  esac
}

load_previous_release() {
  file=$1
  rollback_web_image=$(manifest_value WEB_IMAGE "$file")
  rollback_api_image=$(manifest_value API_IMAGE "$file")
  rollback_cms_image=$(manifest_value CMS_IMAGE "$file")
  rollback_scraper_image=$(manifest_value SCRAPER_IMAGE "$file")
  rollback_source_revision=$(manifest_optional_value SOURCE_REVISION "$file")
  rollback_release_id=$(manifest_optional_value RELEASE_ID "$file")

  validate_image WEB_IMAGE "$rollback_web_image" '^ghcr\.io/gildra-foundation/gildra-web@sha256:[0-9a-f]{64}$'
  validate_image API_IMAGE "$rollback_api_image" '^ghcr\.io/gildra-foundation/gildra-api@sha256:[0-9a-f]{64}$'
  validate_image CMS_IMAGE "$rollback_cms_image" '^ghcr\.io/gildra-foundation/gildra-cms@sha256:[0-9a-f]{64}$'
  validate_image SCRAPER_IMAGE "$rollback_scraper_image" '^ghcr\.io/gildra-foundation/gildra-scraper@sha256:[0-9a-f]{64}$'

  if [ -n "$rollback_source_revision" ]; then
    validate_revision "$rollback_source_revision"
  else
    rollback_source_revision=legacy
  fi
  if [ -n "$rollback_release_id" ]; then
    validate_release_id "$rollback_release_id"
  else
    rollback_release_id=legacy
  fi
}

compose() {
  docker compose \
    --env-file "$environment_file" \
    -f "$deployment_directory/compose.yml" \
    -f "$deployment_directory/compose.prod.yml" \
    -f "$deployment_directory/compose.runtime.yml" \
    "$@"
}

verify_service_image() {
  service=$1
  expected=$2
  container_id=$(compose ps -q "$service")
  [ -n "$container_id" ] || fail "service $service has no running container"
  actual=$(docker inspect --format '{{.Config.Image}}' "$container_id")
  [ "$actual" = "$expected" ] ||
    fail "service $service is running an unexpected image: $actual"
}

verify_running_images() {
  verify_service_image web "$WEB_IMAGE"
  verify_service_image api "$API_IMAGE"
  verify_service_image cms "$CMS_IMAGE"
  verify_service_image scraper-worker "$SCRAPER_IMAGE"
}

ensure_recovery_backup() {
  api_container=$(compose ps -q api)
  [ -n "$api_container" ] || fail 'api service has no running container for the recovery backup gate'

  schema_state=$(docker exec "$api_container" sh -c 'psql "$DATABASE_URL" -Atqc "SELECT COALESCE(max(version_id),0) FROM goose_db_version WHERE is_applied"')
  backup_state=$(docker exec "$api_container" sh -c 'psql "$DATABASE_URL" -Atqc "SELECT COALESCE((SELECT database_version::bigint || '"'"'|'"'"' || floor(extract(epoch FROM restore_completed_at))::bigint FROM catalog_backup_manifests WHERE component='"'"'postgres'"'"' AND status='"'"'verified'"'"' AND storage_uri ~ '"'"'^(file|s3|r2|swift)://'"'"' AND content_hash IS NOT NULL AND byte_size>0 AND verification @> '"'"'{\"restore_verified\":true,\"source_restore_match\":true}'"'"'::jsonb ORDER BY restore_completed_at DESC,id DESC LIMIT 1), '"'"'0|0'"'"')"')
  printf '%s\n' "$schema_state" | grep -Eq '^[0-9]+$' || fail "api returned an invalid catalog schema version: $schema_state"
  printf '%s\n' "$backup_state" | grep -Eq '^[0-9]+\|[0-9]+$' || fail "api returned invalid recovery evidence state: $backup_state"

  current_schema=$schema_state
  backup_version=${backup_state%%|*}
  backup_epoch=${backup_state#*|}
  now_epoch=$(date +%s)
  backup_deadline=$((now_epoch - 86400))
  if [ "$backup_version" -ge "$current_schema" ] && [ "$backup_epoch" -ge "$backup_deadline" ]; then
    return
  fi

  backup_script="$deployment_directory/infra/backup/run-catalog-backup.sh"
  [ -x "$backup_script" ] || fail 'catalog schema changed or recovery evidence is stale, but the local backup runner is missing'
  printf 'deploy: refreshing verified local recovery evidence (schema=%s, previous_backup=%s|%s)\n' \
    "$current_schema" "$backup_version" "$backup_epoch" >&2
  GILDRA_DEPLOYMENT_DIRECTORY="$deployment_directory" \
    GILDRA_ENV_FILE="$environment_file" \
    GILDRA_RELEASE_ENV_FILE="$current_manifest" \
    "$backup_script"
}

verify_library_route() {
  route_path=$1
  if [ "$catalog_access_mode" = private ]; then
    response_headers=$(mktemp)
    route_status=$(curl --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
      --dump-header "$response_headers" --output /dev/null --write-out '%{http_code}' \
      --resolve api.gildra.net:443:127.0.0.1 "https://api.gildra.net$route_path") || {
      rm -f "$response_headers"
      fail "private library route failed: $route_path"
    }
    route_location=$(sed -n 's/^[Ll][Oo][Cc][Aa][Tt][Ii][Oo][Nn]:[[:space:]]*//p' "$response_headers" | head -n 1 | tr -d '\r')
    rm -f "$response_headers"
    case "$route_status" in
      3??) case "$route_location" in
        /api-console\?next=*) ;;
        *) fail "private library route does not redirect to login: $route_path (HTTP $route_status)" ;;
      esac ;;
      *) fail "private library route returned HTTP $route_status: $route_path" ;;
    esac
    return
  fi
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve api.gildra.net:443:127.0.0.1 "https://api.gildra.net$route_path" >/dev/null
}

verify_local_health() {
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve api.gildra.net:443:127.0.0.1 https://api.gildra.net/livez >/dev/null
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve api.gildra.net:443:127.0.0.1 https://api.gildra.net/readyz >/dev/null
  if [ "$catalog_access_mode" = private ]; then
    catalog_status=$(curl --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
      --output /dev/null --write-out '%{http_code}' \
      --resolve api.gildra.net:443:127.0.0.1 \
      'https://api.gildra.net/v1/library/datasets?product=wow&locale=en_US')
    [ "$catalog_status" = 401 ] || fail "private catalog allowed an anonymous request: HTTP $catalog_status"
    prefixed_catalog_status=$(curl --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
      --output /dev/null --write-out '%{http_code}' \
      --resolve api.gildra.net:443:127.0.0.1 \
      'https://api.gildra.net/world-of-warcraft/retail/v1/library/datasets?product=wow&locale=en_US')
    [ "$prefixed_catalog_status" = 401 ] || fail "prefixed private catalog allowed an anonymous request: HTTP $prefixed_catalog_status"
  else
    curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
      --resolve api.gildra.net:443:127.0.0.1 \
      'https://api.gildra.net/v1/library/datasets?product=wow&locale=en_US' >/dev/null
    curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
      --resolve api.gildra.net:443:127.0.0.1 \
      'https://api.gildra.net/world-of-warcraft/retail/v1/library/datasets?product=wow&locale=en_US' >/dev/null
  fi
  verify_library_route /library
  verify_library_route /ru/library
  verify_library_route /library/items
  verify_library_route /ru/library/items
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve gildra.net:443:127.0.0.1 https://gildra.net/database >/dev/null
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve gildra.net:443:127.0.0.1 https://gildra.net/ru/database >/dev/null
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve gildra.net:443:127.0.0.1 https://gildra.net/library >/dev/null
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve gildra.net:443:127.0.0.1 https://gildra.net/ru/library >/dev/null
  verify_library_redirect /library/items
  verify_library_redirect /ru/library/items
}

verify_library_redirect() {
  route_path=$1
  response_headers=$(mktemp)
  route_status=$(curl --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --dump-header "$response_headers" --output /dev/null --write-out '%{http_code}' \
    --resolve gildra.net:443:127.0.0.1 "https://gildra.net$route_path") || {
    rm -f "$response_headers"
    fail "library redirect failed: $route_path"
  }
  route_location=$(sed -n 's/^[Ll][Oo][Cc][Aa][Tt][Ii][Oo][Nn]:[[:space:]]*//p' "$response_headers" | head -n 1 | tr -d '\r')
  rm -f "$response_headers"
  case "$route_status:$route_location" in
    3??:https://api.gildra.net$route_path) ;;
    *) fail "library redirect does not preserve path: $route_path (HTTP $route_status, Location $route_location)" ;;
  esac
}

verify_catalog_load() {
  api_container=$(compose ps -q api)
  [ -n "$api_container" ] || fail 'api service has no running container for the load gate'
  for locale in en_US ru_RU; do
    load_target='-base-url=http://127.0.0.1:8080'
    if [ "$catalog_access_mode" = private ]; then
      load_target='-in-process'
    fi
    docker exec "$api_container" catalog-load-check \
      "$load_target" \
      -product wow \
      -locale "$locale" \
      -dataset items \
      -requests 60 \
      -concurrency 4 \
      -datasets-p95 1s \
      -summaries-p95 500ms \
      -detail-p95 1s
  done
}

verify_catalog_readiness() {
  api_container=$(compose ps -q api)
  [ -n "$api_container" ] || fail 'api service has no running container for the readiness gate'
  if [ "$catalog_access_mode" = private ]; then
    docker exec "$api_container" catalog-audit \
      -product wow \
      -recovery-policy verified_same_host \
      -require-data-ready
  else
    docker exec "$api_container" catalog-audit \
      -product wow \
      -recovery-policy verified_same_host \
      -require-production-ready
  fi
}

write_release_manifest() {
  destination=$1
  source_revision=$2
  release_id=$3
  deployed_at=$4
  temporary=$destination.tmp.$$

  umask 077
  {
    printf 'SOURCE_REVISION=%s\n' "$source_revision"
    printf 'RELEASE_ID=%s\n' "$release_id"
    printf 'WEB_IMAGE=%s\n' "$WEB_IMAGE"
    printf 'API_IMAGE=%s\n' "$API_IMAGE"
    printf 'CMS_IMAGE=%s\n' "$CMS_IMAGE"
    printf 'SCRAPER_IMAGE=%s\n' "$SCRAPER_IMAGE"
    printf 'DEPLOYED_AT=%s\n' "$deployed_at"
  } > "$temporary"
  chmod 600 "$temporary"
  mv -f "$temporary" "$destination"
}

rollback_release() {
  printf 'deploy: release failed; restoring the previous immutable images\n' >&2
  load_previous_release "$previous_manifest"

  failed_source_revision=$GILDRA_SOURCE_REVISION
  failed_release_id=$GILDRA_RELEASE_ID
  WEB_IMAGE=$rollback_web_image
  API_IMAGE=$rollback_api_image
  CMS_IMAGE=$rollback_cms_image
  SCRAPER_IMAGE=$rollback_scraper_image
  export WEB_IMAGE API_IMAGE CMS_IMAGE SCRAPER_IMAGE

  compose pull web api catalog-backup cms scraper scraper-worker || return 1
  compose up -d --no-build --remove-orphans --wait --wait-timeout 240 || return 1
  verify_running_images || return 1
  verify_local_health || return 1
  cp -f "$previous_manifest" "$current_manifest" || return 1
  chmod 600 "$current_manifest" || return 1

  temporary=$rollback_manifest.tmp.$$
  rolled_back_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  umask 077
  {
    printf 'FAILED_SOURCE_REVISION=%s\n' "$failed_source_revision"
    printf 'FAILED_RELEASE_ID=%s\n' "$failed_release_id"
    printf 'RESTORED_SOURCE_REVISION=%s\n' "$rollback_source_revision"
    printf 'RESTORED_RELEASE_ID=%s\n' "$rollback_release_id"
    printf 'ROLLED_BACK_AT=%s\n' "$rolled_back_at"
  } > "$temporary" || return 1
  chmod 600 "$temporary" || return 1
  mv -f "$temporary" "$rollback_manifest" || return 1
  printf 'deploy: rollback completed and verified\n' >&2
}

on_exit() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$rollback_armed" = true ]; then
    if ! rollback_release; then
      printf 'deploy: CRITICAL: automatic rollback failed\n' >&2
      status=2
    fi
  fi
  exit "$status"
}

validate_release_inputs

if [ "$validate_only" = true ]; then
  printf 'deploy: immutable release inputs are valid\n'
  exit 0
fi

for command_name in docker curl flock grep sed date; do
  command -v "$command_name" >/dev/null 2>&1 || fail "required command is missing: $command_name"
done

[ -f "$environment_file" ] || fail "runtime environment file does not exist: $environment_file"
require_environment_value CATALOG_ACCESS_MODE
require_environment_value CATALOG_RECOVERY_POLICY
require_environment_value CATALOG_BACKUP_LOCAL_DIRECTORY
validate_runtime_policy
for compose_file in compose.yml compose.prod.yml compose.runtime.yml; do
  [ -f "$deployment_directory/$compose_file" ] ||
    fail "deployment file does not exist: $deployment_directory/$compose_file"
done
[ -f "$current_manifest" ] ||
  fail "current release manifest is missing; create a reviewed baseline before enabling automated deployment"

umask 077
lock_directory=$(dirname "$lock_file")
[ -d "$lock_directory" ] || fail "deployment lock directory does not exist: $lock_directory"
exec 9>"$lock_file"
flock -n 9 || fail 'another deployment is already running on this host'

load_previous_release "$current_manifest"
if [ "$rollback_web_image" = "$WEB_IMAGE" ] &&
   [ "$rollback_api_image" = "$API_IMAGE" ] &&
   [ "$rollback_cms_image" = "$CMS_IMAGE" ] &&
   [ "$rollback_scraper_image" = "$SCRAPER_IMAGE" ]; then
  verify_running_images
  ensure_recovery_backup
  verify_local_health
  verify_catalog_readiness
  verify_catalog_load
  write_release_manifest "$current_manifest" "$GILDRA_SOURCE_REVISION" "$GILDRA_RELEASE_ID" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'deploy: requested immutable images are already running and healthy\n'
  exit 0
fi

cp -f "$current_manifest" "$previous_manifest"
chmod 600 "$previous_manifest"
load_previous_release "$previous_manifest"
rollback_armed=true
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

compose pull web api catalog-backup cms scraper scraper-worker
compose up -d --no-build --remove-orphans --wait --wait-timeout 240
verify_running_images
write_release_manifest "$current_manifest" "$GILDRA_SOURCE_REVISION" "$GILDRA_RELEASE_ID" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
ensure_recovery_backup
verify_local_health
verify_catalog_readiness
verify_catalog_load
write_release_manifest "$current_manifest" "$GILDRA_SOURCE_REVISION" "$GILDRA_RELEASE_ID" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

rollback_armed=false
trap - EXIT HUP INT TERM
printf 'deploy: immutable release is running and verified\n'
