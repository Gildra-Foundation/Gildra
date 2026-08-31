#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
deployment_script=$script_directory/deploy-immutable-release.sh
repository_directory=$(CDPATH= cd -- "$script_directory/../.." && pwd)
test_directory=$(mktemp -d)
trap 'rm -rf "$test_directory"' EXIT HUP INT TERM

fake_bin=$test_directory/bin
deployment_directory=$test_directory/deployment
state_directory=$test_directory/state
mkdir -p "$fake_bin" "$deployment_directory" "$state_directory"

old_web=ghcr.io/gildra-foundation/gildra-web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
old_api=ghcr.io/gildra-foundation/gildra-api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
old_cms=ghcr.io/gildra-foundation/gildra-cms@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
old_scraper=ghcr.io/gildra-foundation/gildra-scraper@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
new_web=ghcr.io/gildra-foundation/gildra-web@sha256:1111111111111111111111111111111111111111111111111111111111111111
new_api=ghcr.io/gildra-foundation/gildra-api@sha256:2222222222222222222222222222222222222222222222222222222222222222
new_cms=ghcr.io/gildra-foundation/gildra-cms@sha256:3333333333333333333333333333333333333333333333333333333333333333
new_scraper=ghcr.io/gildra-foundation/gildra-scraper@sha256:4444444444444444444444444444444444444444444444444444444444444444

for file in .env compose.yml compose.prod.yml compose.runtime.yml; do
  : > "$deployment_directory/$file"
done

{
  printf 'CATALOG_BACKUP_LOCAL_DIRECTORY=/var/lib/gildra/catalog-backups\n'
  printf 'CATALOG_ACCESS_MODE=private\n'
  printf 'CATALOG_RECOVERY_POLICY=verified_same_host\n'
} > "$deployment_directory/.env"

{
  printf 'WEB_IMAGE=%s\n' "$old_web"
  printf 'API_IMAGE=%s\n' "$old_api"
  printf 'CMS_IMAGE=%s\n' "$old_cms"
  printf 'SCRAPER_IMAGE=%s\n' "$old_scraper"
} > "$deployment_directory/current-release.env"

for service in web api catalog-backup cms scraper scraper-worker; do
  case $service in
    web) image=$old_web ;;
    api|catalog-backup) image=$old_api ;;
    cms) image=$old_cms ;;
    scraper|scraper-worker) image=$old_scraper ;;
  esac
  printf '%s\n' "$image" > "$state_directory/$service.image"
done
printf '0\n' > "$state_directory/up-count"

cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/bin/sh
set -eu

if [ "$1" = inspect ]; then
  shift
  [ "$1" = --format ] && shift 2
  service=${1%-container}
  cat "$TEST_STATE_DIR/$service.image"
  exit 0
fi

if [ "$1" = exec ]; then
  # The deployment recovery gate asks the running API for the current schema
  # and the latest verified backup. Keep the fake state current and fresh so
  # this test remains focused on immutable image rollback behaviour.
  case "$*" in
    *goose_db_version*) printf '116\n' ;;
    *) printf '116|9999999999\n' ;;
  esac
  exit 0
fi

[ "$1" = compose ] || exit 64
shift
while [ "$#" -gt 0 ]; do
  case $1 in
    --env-file|-f) shift 2 ;;
    ps)
      [ "$2" = -q ]
      printf '%s-container\n' "$3"
      exit 0
      ;;
    pull) exit 0 ;;
    up)
      count=$(cat "$TEST_STATE_DIR/up-count")
      count=$((count + 1))
      printf '%s\n' "$count" > "$TEST_STATE_DIR/up-count"
      for service in web api catalog-backup cms scraper scraper-worker; do
        case $service in
          web) image=$WEB_IMAGE ;;
          api|catalog-backup) image=$API_IMAGE ;;
          cms) image=$CMS_IMAGE ;;
          scraper|scraper-worker) image=$SCRAPER_IMAGE ;;
        esac
        printf '%s\n' "$image" > "$TEST_STATE_DIR/$service.image"
      done
      exit 0
      ;;
    *) shift ;;
  esac
done
exit 64
FAKE_DOCKER

cat > "$fake_bin/curl" <<'FAKE_CURL'
#!/bin/sh
set -eu
current=$(cat "$TEST_STATE_DIR/web.image")
if [ "$current" = "$TEST_NEW_WEB" ]; then
  exit 22
fi
status=200
location=''
write_status=false
dump_file=''
expect_dump_file=false
for argument in "$@"; do
  if [ "$expect_dump_file" = true ]; then
    dump_file=$argument
    expect_dump_file=false
    continue
  fi
  case "$argument" in
    --write-out) write_status=true ;;
    --dump-header) expect_dump_file=true ;;
    https://api.gildra.net/v1/library/datasets*) status=401 ;;
    https://api.gildra.net/world-of-warcraft/*/v1/library/datasets*) status=401 ;;
    https://api.gildra.net/library*|https://api.gildra.net/ru/library*) status=307; location='/api-console?next=%2Flibrary' ;;
    https://gildra.net/library/items) status=302; location='https://api.gildra.net/library/items' ;;
    https://gildra.net/ru/library/items) status=302; location='https://api.gildra.net/ru/library/items' ;;
  esac
done
[ -z "$dump_file" ] || printf 'HTTP/2 307\nLocation: %s\n\n' "$location" > "$dump_file"
[ "$write_status" = true ] && printf '%s' "$status"
exit 0
FAKE_CURL

cat > "$fake_bin/flock" <<'FAKE_FLOCK'
#!/bin/sh
exit 0
FAKE_FLOCK
chmod +x "$fake_bin/docker" "$fake_bin/curl" "$fake_bin/flock"

if PATH="$fake_bin:$PATH" \
  TEST_STATE_DIR=$state_directory \
  TEST_NEW_WEB=$new_web \
  GILDRA_DEPLOY_DIR=$deployment_directory \
  GILDRA_DEPLOY_LOCK_FILE=$test_directory/deploy.lock \
  WEB_IMAGE=$new_web \
  API_IMAGE=$new_api \
  CMS_IMAGE=$new_cms \
  SCRAPER_IMAGE=$new_scraper \
  GILDRA_SOURCE_REVISION=1111111111111111111111111111111111111111 \
  GILDRA_RELEASE_ID=test-release \
  GILDRA_ROLLBACK_COMPATIBLE=true \
  "$deployment_script" > "$test_directory/deploy.log" 2>&1; then
  printf 'test: deployment should remain failed after a successful rollback\n' >&2
  exit 1
fi

[ "$(cat "$state_directory/up-count")" -eq 2 ] || {
  printf 'test: expected one failed deployment and one rollback\n' >&2
  exit 1
}
[ "$(cat "$state_directory/web.image")" = "$old_web" ]
[ "$(cat "$state_directory/api.image")" = "$old_api" ]
[ "$(cat "$state_directory/cms.image")" = "$old_cms" ]
[ "$(cat "$state_directory/scraper.image")" = "$old_scraper" ]
grep -q "WEB_IMAGE=$old_web" "$deployment_directory/current-release.env"
grep -q '^FAILED_RELEASE_ID=test-release$' "$deployment_directory/last-rollback.env"
grep -q '^RESTORED_RELEASE_ID=legacy$' "$deployment_directory/last-rollback.env"
grep -q 'rollback completed and verified' "$test_directory/deploy.log"

# Keep the public-library journey inside the rollback-armed deployment script.
# A separate workflow smoke step is too late: by then the previous release has
# already been disarmed as an automatic rollback target.
grep -Fq "'https://api.gildra.net/v1/library/datasets?product=wow&locale=en_US'" "$deployment_script"
grep -Fq 'https://api.gildra.net/world-of-warcraft/$edition/v1/library/datasets?locale=en_US' "$deployment_script"
grep -Fq 'verify_library_route /library' "$deployment_script"
grep -Fq 'verify_library_route /ru/library' "$deployment_script"
grep -Fq 'verify_library_route /library/items' "$deployment_script"
grep -Fq 'verify_library_route /ru/library/items' "$deployment_script"
grep -Fq 'https://gildra.net/library' "$deployment_script"
grep -Fq 'https://gildra.net/ru/library' "$deployment_script"
grep -Fq 'verify_library_redirect /library/items' "$deployment_script"
grep -Fq 'verify_library_redirect /ru/library/items' "$deployment_script"
grep -Fq 'verify_catalog_load' "$deployment_script"
grep -Fq 'catalog-load-check' "$deployment_script"
grep -Fq 'verify_catalog_readiness' "$deployment_script"
grep -Fq -- '-require-production-ready' "$deployment_script"
grep -Fq 'require_environment_value CATALOG_BACKUP_LOCAL_DIRECTORY' "$deployment_script"
grep -Fq 'require_environment_value CATALOG_ACCESS_MODE' "$deployment_script"
grep -Fq 'require_environment_value CATALOG_RECOVERY_POLICY' "$deployment_script"
grep -Fq 'ensure_recovery_backup' "$deployment_script"
grep -Fq 'run-catalog-backup.sh' "$deployment_script"
grep -Fq 'run-catalog-repair.sh' "$repository_directory/.github/workflows/catalog-repair.yml"
grep -Fq 'CATALOG_ACCESS_MODE: ${CATALOG_ACCESS_MODE:-public}' "$repository_directory/compose.yml"
grep -Fq -- '-require-data-ready' "$deployment_script"
grep -Fq 'private catalog allowed an anonymous request' "$deployment_script"
grep -Fq 'https://api.gildra.net/library/items' "$repository_directory/.github/workflows/deploy.yml"
grep -Fq 'https://api.gildra.net/ru/library/items' "$repository_directory/.github/workflows/deploy.yml"
if grep -Fq 'require_environment_value SENTRY_GO_DSN' "$deployment_script" ||
  grep -Fq 'require_environment_value NEXT_PUBLIC_SENTRY_DSN' "$deployment_script"; then
  printf 'test: optional Sentry configuration still blocks a release\n' >&2
  exit 1
fi
if grep '^ExecStart=.*catalog-pipeline' "$script_directory/../systemd/gildra-catalog-refresh.service" | grep -q 'raidbots'; then
  printf 'test: canonical catalog refresh still imports Raidbots data\n' >&2
  exit 1
fi
grep -Fq -- '--entrypoint catalog-refresh-all api -mode check -require-update' "$script_directory/../systemd/gildra-catalog-refresh.service"
grep -Fq -- '--entrypoint catalog-refresh-all api -mode apply' "$script_directory/../systemd/gildra-catalog-refresh.service"
if grep '^ExecStart=.*catalog-build-check\|^ExecStart=.*catalog-pipeline' "$script_directory/../systemd/gildra-catalog-refresh.service"; then
  printf 'test: scheduled catalog refresh must use the all-edition coordinator\n' >&2
  exit 1
fi

load_gate_line=$(grep -n '^verify_catalog_load$' "$deployment_script" | tail -n 1 | cut -d: -f1)
readiness_gate_line=$(grep -n '^verify_catalog_readiness$' "$deployment_script" | tail -n 1 | cut -d: -f1)
rollback_disarm_line=$(grep -n '^rollback_armed=false$' "$deployment_script" | tail -n 1 | cut -d: -f1)
[ -n "$load_gate_line" ] && [ -n "$readiness_gate_line" ] && [ -n "$rollback_disarm_line" ] &&
  [ "$readiness_gate_line" -lt "$rollback_disarm_line" ] &&
  [ "$load_gate_line" -lt "$rollback_disarm_line" ] || {
  printf 'test: catalog readiness and load gates must execute before rollback is disarmed\n' >&2
  exit 1
}

printf 'test: failed release restored and verified the previous immutable images\n'
