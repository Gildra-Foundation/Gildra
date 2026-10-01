#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
deployment_script=$script_directory/deploy-web-release.sh
test_directory=$(mktemp -d)
trap 'rm -rf "$test_directory"' EXIT HUP INT TERM

fake_bin=$test_directory/bin
deployment_directory=$test_directory/deployment
state_directory=$test_directory/state
mkdir -p "$fake_bin" "$deployment_directory" "$state_directory"

local_web=gildra-web:hotfix-9b45b71
new_web=ghcr.io/gildra-foundation/gildra-web@sha256:1111111111111111111111111111111111111111111111111111111111111111
bad_web=ghcr.io/gildra-foundation/gildra-web@sha256:2222222222222222222222222222222222222222222222222222222222222222
api_image=ghcr.io/gildra-foundation/gildra-api@sha256:3333333333333333333333333333333333333333333333333333333333333333
revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
revision_two=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

for file in .env compose.yml compose.prod.yml compose.runtime.yml; do
  : > "$deployment_directory/$file"
done

write_manifest() {
  {
    printf 'SOURCE_REVISION=%s\n' "$revision"
    printf 'RELEASE_ID=test-release\n'
    printf 'WEB_IMAGE=%s\n' "$1"
    printf 'API_IMAGE=%s\n' "$api_image"
    printf 'ROTATION_WORKER_IMAGE=ghcr.io/gildra-foundation/gildra-rotation-sim-worker@sha256:4444444444444444444444444444444444444444444444444444444444444444\n'
    printf 'WEB_HOTFIX_SOURCE_REVISION=%s\n' "$revision"
    printf 'DEPLOYED_AT=2026-09-30T23:59:58Z\n'
  } > "$deployment_directory/current-release.env"
}
write_manifest "$local_web"

printf '%s\n' "$local_web" > "$state_directory/web.image"
printf '%s\n' ghcr.io/gildra-foundation/gildra-nginx-fake > "$state_directory/nginx.image"
: > "$state_directory/up.log"
: > "$state_directory/reload.log"
: > "$state_directory/pull.log"

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

if [ "$1" = image ] && [ "$2" = inspect ]; then
  # Only the locally built hotfix image exists on this fake host.
  case "${3:-}" in gildra-web:hotfix-9b45b71) exit 0 ;; esac
  exit 1
fi

if [ "$1" = exec ]; then
  case "$*" in
    *"nginx -s reload"*) printf 'reload\n' >> "$TEST_STATE_DIR/reload.log"; exit 0 ;;
  esac
  exit 64
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
    pull)
      printf 'pull %s\n' "${WEB_IMAGE:-unset}" >> "$TEST_STATE_DIR/pull.log"
      exit 0
      ;;
    up)
      printf 'up %s\n' "${WEB_IMAGE:-unset}" >> "$TEST_STATE_DIR/up.log"
      printf '%s\n' "$WEB_IMAGE" > "$TEST_STATE_DIR/web.image"
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
if [ "$current" = "${TEST_BAD_WEB:-never}" ]; then
  exit 22
fi
exit 0
FAKE_CURL

cat > "$fake_bin/flock" <<'FAKE_FLOCK'
#!/bin/sh
exit 0
FAKE_FLOCK
chmod +x "$fake_bin/docker" "$fake_bin/curl" "$fake_bin/flock"

run_deploy() {
  image=$1
  rev=$2
  shift 2
  PATH="$fake_bin:$PATH" \
    TEST_STATE_DIR=$state_directory \
    GILDRA_DEPLOY_DIR=$deployment_directory \
    GILDRA_DEPLOY_LOCK_FILE=$test_directory/deploy.lock \
    WEB_IMAGE=$image \
    GILDRA_WEB_SOURCE_REVISION=$rev \
    "$@" \
    "$deployment_script" ${DEPLOY_ARGS:-} > "$test_directory/run.log" 2>&1
}

# --- input validation -------------------------------------------------------
for bad in "ghcr.io/gildra-foundation/gildra-web:latest" \
           "gildra-web:hotfix-9b45b71" \
           "ghcr.io/someone-else/gildra-web@sha256:1111111111111111111111111111111111111111111111111111111111111111" \
           "ghcr.io/gildra-foundation/gildra-api@sha256:1111111111111111111111111111111111111111111111111111111111111111"; do
  if DEPLOY_ARGS=--validate-only run_deploy "$bad" "$revision" env; then
    printf 'test: image should be refused: %s\n' "$bad" >&2
    exit 1
  fi
done
if DEPLOY_ARGS=--validate-only run_deploy "$new_web" "not-a-sha" env; then
  printf 'test: a malformed revision should be refused\n' >&2
  exit 1
fi
DEPLOY_ARGS=--validate-only run_deploy "$new_web" "$revision" env || {
  cat "$test_directory/run.log" >&2
  printf 'test: a valid web release should pass validation\n' >&2
  exit 1
}
printf 'test: web release inputs are validated\n'

# --- healthy rollout over the locally built hotfix image ---------------------
cp "$deployment_directory/current-release.env" "$test_directory/manifest.before"
run_deploy "$new_web" "$revision_two" env || {
  cat "$test_directory/run.log" >&2
  printf 'test: a healthy web release should succeed\n' >&2
  exit 1
}
[ "$(cat "$state_directory/web.image")" = "$new_web" ]
# The pull must target the NEW image, not the one still named in the manifest.
[ "$(cat "$state_directory/pull.log")" = "pull $new_web" ]
[ "$(wc -l < "$state_directory/up.log")" -eq 1 ]
[ "$(wc -l < "$state_directory/reload.log")" -eq 1 ]
grep -q "^WEB_IMAGE=$new_web$" "$deployment_directory/current-release.env"
grep -q "^WEB_SOURCE_REVISION=$revision_two$" "$deployment_directory/current-release.env"
# Everything that is not the web image or its revision stays as it was.
grep -q "^API_IMAGE=$api_image$" "$deployment_directory/current-release.env"
grep -q '^SOURCE_REVISION=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$' "$deployment_directory/current-release.env"
grep -q '^ROTATION_WORKER_IMAGE=' "$deployment_directory/current-release.env"
grep -q '^DEPLOYED_AT=2026-09-30T23:59:58Z$' "$deployment_directory/current-release.env"
# The out-of-band key of the manual hotfix is replaced by the standard one.
if grep -q '^WEB_HOTFIX_SOURCE_REVISION=' "$deployment_directory/current-release.env"; then
  printf 'test: the old hotfix revision key should have been replaced\n' >&2
  exit 1
fi
[ "$(grep -c '^WEB_IMAGE=' "$deployment_directory/current-release.env")" -eq 1 ]
printf 'test: a healthy web release updates only the web image and its revision\n'

# --- repeating the identical release is a healthy no-op ----------------------
run_deploy "$new_web" "$revision_two" env || {
  cat "$test_directory/run.log" >&2
  printf 'test: repeating the identical web release should succeed\n' >&2
  exit 1
}
[ "$(wc -l < "$state_directory/up.log")" -eq 1 ]
grep -q 'already running and healthy' "$test_directory/run.log"
printf 'test: an identical web release is a no-op\n'

# --- failing smoke checks restore the previous image and manifest ------------
cp "$deployment_directory/current-release.env" "$test_directory/manifest.good"
if run_deploy "$bad_web" "$revision" env TEST_BAD_WEB="$bad_web"; then
  printf 'test: a web release that fails its smoke checks must fail\n' >&2
  exit 1
fi
[ "$(cat "$state_directory/web.image")" = "$new_web" ]
cmp -s "$deployment_directory/current-release.env" "$test_directory/manifest.good" || {
  diff "$test_directory/manifest.good" "$deployment_directory/current-release.env" >&2 || true
  printf 'test: the manifest must be exactly as before a failed release\n' >&2
  exit 1
}
grep -q 'rollback completed and verified' "$test_directory/run.log"
# up for the bad image, then up again for the rollback; nginx reloaded for each.
[ "$(wc -l < "$state_directory/up.log")" -eq 3 ]
[ "$(sed -n 3p "$state_directory/up.log")" = "up $new_web" ]
[ "$(wc -l < "$state_directory/reload.log")" -eq 3 ]
printf 'test: a failed web release is rolled back and the manifest is untouched\n'

# --- a manifest without a web image is refused --------------------------------
grep -v '^WEB_IMAGE=' "$deployment_directory/current-release.env" > "$test_directory/manifest.noweb"
cp "$test_directory/manifest.noweb" "$deployment_directory/current-release.env"
if run_deploy "$new_web" "$revision" env; then
  printf 'test: a manifest without WEB_IMAGE must be refused\n' >&2
  exit 1
fi
printf 'test: web release contract verified\n'
