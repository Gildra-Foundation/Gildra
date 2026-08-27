#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
deployment_script=$script_directory/deploy-immutable-release.sh
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

printf 'test: failed release restored and verified the previous immutable images\n'
