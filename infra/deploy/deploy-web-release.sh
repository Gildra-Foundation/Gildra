#!/bin/sh
# Roll out a new `web` image on top of the release that is already running.
#
# This is the fast path for front-end only changes. It touches nothing but the
# web container (and reloads nginx so it resolves the new container address):
# no migrations, no recovery backup, no catalog gates. Anything that changes the
# API, database schema, CMS, scraper, worker, compose files or infrastructure
# must go through deploy-immutable-release.sh instead; the workflow decides.
#
# Safety properties:
#  * shares the deployment lock with deploy-immutable-release.sh;
#  * the new image must be a GHCR digest from this organisation;
#  * smoke checks run against the live routes through nginx before the release
#    manifest is touched;
#  * any failure restores the previous web image and leaves the manifest as it
#    was.

set -eu

deployment_directory=${GILDRA_DEPLOY_DIR:-/opt/gildra}
environment_file=${GILDRA_ENV_FILE:-$deployment_directory/.env}
lock_file=${GILDRA_DEPLOY_LOCK_FILE:-/run/lock/gildra-deploy.lock}
current_manifest=$deployment_directory/current-release.env
manifest_backup=$deployment_directory/previous-web-release.env
smoke_paths=${GILDRA_WEB_SMOKE_PATHS:-"/ /ru /wow /login /tier-lists /database /sitemap.xml"}
validate_only=false
rollback_armed=false

if [ "${1:-}" = "--validate-only" ]; then
  validate_only=true
elif [ "$#" -ne 0 ]; then
  printf 'usage: %s [--validate-only]\n' "$0" >&2
  exit 64
fi

fail() {
  printf 'deploy-web: %s\n' "$*" >&2
  exit 1
}

validate_web_inputs() {
  : "${WEB_IMAGE:?WEB_IMAGE is required}"
  : "${GILDRA_WEB_SOURCE_REVISION:?GILDRA_WEB_SOURCE_REVISION is required}"
  printf '%s\n' "$WEB_IMAGE" | grep -Eq '^ghcr\.io/gildra-foundation/gildra-web@sha256:[0-9a-f]{64}$' ||
    fail 'WEB_IMAGE must be a ghcr.io/gildra-foundation/gildra-web image pinned by sha256 digest'
  printf '%s\n' "$GILDRA_WEB_SOURCE_REVISION" | grep -Eq '^[0-9a-f]{40}$' ||
    fail 'GILDRA_WEB_SOURCE_REVISION must be a lowercase 40-character Git commit SHA'
}

manifest_value() {
  key=$1
  file=$2
  count=$(grep -c "^${key}=" "$file" || true)
  [ "$count" -eq 1 ] || fail "$file must contain exactly one $key entry"
  sed -n "s/^${key}=//p" "$file"
}

validate_current_web_image() {
  image=$1
  case "$image" in
    ghcr.io/gildra-foundation/gildra-web@sha256:*)
      printf '%s\n' "$image" | grep -Eq '^ghcr\.io/gildra-foundation/gildra-web@sha256:[0-9a-f]{64}$' ||
        fail "current WEB_IMAGE is malformed: $image"
      ;;
    gildra-web:*)
      # A web image built on the host while the registry was unreachable.
      printf '%s\n' "$image" | grep -Eq '^gildra-web:[0-9A-Za-z._-]+$' ||
        fail "current WEB_IMAGE local reference is invalid: $image"
      docker image inspect "$image" >/dev/null 2>&1 ||
        fail "current WEB_IMAGE local image is not available on the host: $image"
      ;;
    *) fail "current WEB_IMAGE is neither a GHCR digest nor a local gildra-web image: $image" ;;
  esac
}

# Every compose file interpolates all release images, so the manifest supplies
# them and only WEB_IMAGE is overridden by an exported variable for the call.
compose() {
  docker compose \
    --env-file "$environment_file" \
    --env-file "$current_manifest" \
    -f "$deployment_directory/compose.yml" \
    -f "$deployment_directory/compose.prod.yml" \
    -f "$deployment_directory/compose.runtime.yml" \
    "$@"
}

web_container() {
  compose ps -q web
}

verify_web_image() {
  expected=$1
  container_id=$(web_container)
  [ -n "$container_id" ] || return 1
  actual=$(docker inspect --format '{{.Config.Image}}' "$container_id") || return 1
  [ "$actual" = "$expected" ]
}

reload_nginx() {
  nginx_container=$(compose ps -q nginx)
  [ -n "$nginx_container" ] || return 1
  docker exec "$nginx_container" nginx -s reload >/dev/null 2>&1
}

smoke_checks() {
  for path in $smoke_paths; do
    curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 20 \
      --resolve gildra.net:443:127.0.0.1 "https://gildra.net$path" >/dev/null ||
      { printf 'deploy-web: smoke check failed: %s\n' "$path" >&2; return 1; }
  done
  curl --fail --silent --show-error --insecure --retry 6 --retry-delay 5 --max-time 15 \
    --resolve api.gildra.net:443:127.0.0.1 https://api.gildra.net/readyz >/dev/null ||
    { printf 'deploy-web: smoke check failed: api readyz\n' >&2; return 1; }
}

# Write the manifest with the new web image and revision, keeping every other
# line. A previous out-of-band key for the web revision is replaced.
write_manifest() {
  new_image=$1
  new_revision=$2
  temporary=$current_manifest.tmp.$$
  umask 077
  grep -vE '^(WEB_IMAGE|WEB_SOURCE_REVISION|WEB_HOTFIX_SOURCE_REVISION)=' "$current_manifest" > "$temporary" || true
  {
    printf 'WEB_IMAGE=%s\n' "$new_image"
    printf 'WEB_SOURCE_REVISION=%s\n' "$new_revision"
  } >> "$temporary"
  chmod 600 "$temporary"
  mv -f "$temporary" "$current_manifest"
}

restore_previous_web() {
  printf 'deploy-web: smoke checks failed; restoring the previous web image\n' >&2
  WEB_IMAGE=$previous_web_image
  export WEB_IMAGE
  compose up -d --no-deps --no-build --pull missing --wait --wait-timeout 180 web || return 1
  reload_nginx || return 1
  verify_web_image "$previous_web_image" || return 1
  cp -f "$manifest_backup" "$current_manifest" || return 1
  chmod 600 "$current_manifest" || return 1
  printf 'deploy-web: rollback completed and verified\n' >&2
}

on_exit() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$rollback_armed" = true ]; then
    if ! restore_previous_web; then
      printf 'deploy-web: CRITICAL: automatic rollback failed\n' >&2
      status=2
    fi
  fi
  exit "$status"
}

validate_web_inputs

if [ "$validate_only" = true ]; then
  printf 'deploy-web: web release inputs are valid\n'
  exit 0
fi

for command_name in docker curl flock grep sed; do
  command -v "$command_name" >/dev/null 2>&1 || fail "required command is missing: $command_name"
done
[ -f "$environment_file" ] || fail "runtime environment file does not exist: $environment_file"
[ -f "$current_manifest" ] || fail "current release manifest is missing: $current_manifest"
for compose_file in compose.yml compose.prod.yml compose.runtime.yml; do
  [ -f "$deployment_directory/$compose_file" ] || fail "deployment file does not exist: $deployment_directory/$compose_file"
done

umask 077
lock_directory=$(dirname "$lock_file")
[ -d "$lock_directory" ] || fail "deployment lock directory does not exist: $lock_directory"
exec 9>"$lock_file"
flock -n 9 || fail 'another deployment is already running on this host'

previous_web_image=$(manifest_value WEB_IMAGE "$current_manifest")
validate_current_web_image "$previous_web_image"

if [ "$previous_web_image" = "$WEB_IMAGE" ]; then
  verify_web_image "$WEB_IMAGE" || fail 'the requested web image is recorded as current but is not the running one'
  smoke_checks || fail 'the requested web image is running but its smoke checks fail'
  write_manifest "$WEB_IMAGE" "$GILDRA_WEB_SOURCE_REVISION"
  printf 'deploy-web: the requested web image is already running and healthy\n'
  exit 0
fi

cp -f "$current_manifest" "$manifest_backup"
chmod 600 "$manifest_backup"
rollback_armed=true
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# ghcr.io intermittently drops TCP connects from this host; layers fetched in an
# earlier attempt stay cached, so retrying the pull is cheap.
export WEB_IMAGE
pull_attempt=1
until compose pull web; do
  [ "$pull_attempt" -lt 8 ] || fail 'compose pull failed after 8 attempts'
  printf 'deploy-web: compose pull attempt %s failed; retrying in 10s\n' "$pull_attempt" >&2
  pull_attempt=$((pull_attempt + 1))
  sleep 10
done
compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 web
# nginx resolves the `web` upstream when it loads its configuration; the new
# container has a new address, so make it look again.
reload_nginx || fail 'nginx could not be reloaded'
verify_web_image "$WEB_IMAGE" || fail 'the web service is not running the requested image'
smoke_checks
write_manifest "$WEB_IMAGE" "$GILDRA_WEB_SOURCE_REVISION"

rollback_armed=false
trap - EXIT HUP INT TERM
printf 'deploy-web: web release is running and verified\n'
