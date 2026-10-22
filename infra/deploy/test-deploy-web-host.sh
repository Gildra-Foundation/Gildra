#!/bin/bash
# Contract of deploy-web-host.sh against a fake docker/git/curl/df.
set -euo pipefail

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
deployment_script=$script_directory/deploy-web-host.sh
test_directory=$(mktemp -d)
trap 'rm -rf "$test_directory"' EXIT HUP INT TERM

fake_bin=$test_directory/bin
deployment_directory=$test_directory/deployment
state=$test_directory/state
mkdir -p "$fake_bin" "$deployment_directory" "$state/images"

revision=0123456789abcdef0123456789abcdef01234567
old_web=gildra-web:old-release-aaaaaaaaaaaa
api_image=ghcr.io/gildra-foundation/gildra-api@sha256:3333333333333333333333333333333333333333333333333333333333333333

reset_host() {
  rm -rf "$state" && mkdir -p "$state/images"
  for file in .env compose.yml compose.prod.yml compose.runtime.yml; do : > "$deployment_directory/$file"; done
  rm -f "$deployment_directory"/*-previous.env
  printf 'SOURCE_REVISION=%s\nWEB_IMAGE=%s\nAPI_IMAGE=%s\nWEB_HOTFIX_SOURCE_REVISION=old\n' \
    "$revision" "$old_web" "$api_image" > "$deployment_directory/current-release.env"
  # images/<tag>: "<id> <created, four words> <patch label>"
  add_image "$old_web" sha256:old "2026-10-20 10:00:00 +0000 UTC" old-release
  printf '%s\n' "$old_web" > "$state/web.image"
  : > "$state/docker.log"
  printf '100\n' > "$state/free.gb"
}
add_image() { printf '%s %s %s\n' "$2" "$3" "$4" > "$state/images/$1"; }

cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/bin/bash
set -euo pipefail
s=$TEST_STATE_DIR
printf '%s\n' "$*" >> "$s/docker.log"
field() { [ -f "$s/images/$1" ] || exit 1; cut -d' ' -f"$2" "$s/images/$1"; }
case $1 in
  info) echo /var/lib/docker ;;
  build)
    tag= label=
    while [ "$#" -gt 0 ]; do
      case $1 in
        -t) tag=$2; shift 2 ;;
        --label) case $2 in net.gildra.patch=*) label=${2#*=} ;; esac; shift 2 ;;
        *) shift ;;
      esac
    done
    cat > "$s/context.tar"
    [ -z "${TEST_BUILD_FAILS:-}" ] || exit 1
    printf 'sha256:%s %s %s\n' "${tag##*:}" "2026-10-22 22:00:00 +0000 UTC" "$label" > "$s/images/$tag"
    ;;
  tag) cp "$s/images/$2" "$s/images/$3" ;;
  image)
    case $2 in
      inspect)
        if [ "$3" = --format ]; then
          case $4 in
            *net.gildra.patch*) field "$5" 6 ;;
            *revision*) echo "${TEST_REVISION:-}" ;;
            *.Id*) field "$5" 1 ;;
          esac
        else field "$3" 1 >/dev/null; fi ;;
      ls)
        for f in "$s"/images/*; do
          read -r id d t z u label < "$f"
          printf '%s %s %s %s\t%s\t%s\n' "$d" "$t" "$z" "$u" "$(basename "$f")" "$id"
        done ;;
      rm)
        [ "$3" != "${TEST_IN_USE:-}" ] || exit 1
        rm -f "$s/images/$3"; echo "rm $3" >> "$s/removed.log" ;;
    esac ;;
  inspect)
    case $3 in
      *Config.Image*) cat "$s/web.image" ;;
      *Health*) if [ "$(cat "$s/web.image")" = "${TEST_UNHEALTHY:-never}" ]; then echo unhealthy; else echo healthy; fi ;;
      *.Image*) echo "${TEST_CONTAINER_IMAGE_ID:-sha256:none}" ;;
    esac ;;
  ps) echo container-1 ;;
  exec) case $* in *"nginx -s reload"*) echo reload >> "$s/reload.log" ;; esac ;;
  builder) ;;
  compose)
    while [ "$#" -gt 0 ]; do
      case $1 in
        ps) echo "$3-container"; exit 0 ;;
        up) printf '%s\n' "$WEB_IMAGE" > "$s/web.image"; echo "up $WEB_IMAGE" >> "$s/up.log"; exit 0 ;;
        *) shift ;;
      esac
    done ;;
  *) exit 64 ;;
esac
FAKE_DOCKER

cat > "$fake_bin/curl" <<'FAKE_CURL'
#!/bin/bash
# Fails while the bad image runs; serves a marker page otherwise.
[ "$(cat "$TEST_STATE_DIR/web.image")" != "${TEST_BAD_WEB:-never}" ] || exit 22
echo '<html data-release-marker>'
FAKE_CURL

cat > "$fake_bin/df" <<'FAKE_DF'
#!/bin/sh
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/x 1 1 %s 1%% /\n' "$(( $(cat "$TEST_STATE_DIR/free.gb") * 1048576 ))"
FAKE_DF
chmod +x "$fake_bin"/*

# A throwaway repository stands in for the source tree.
source_repo=$test_directory/source
git init -q "$source_repo"
printf 'FROM scratch\n' > "$source_repo/Dockerfile"
git -C "$source_repo" add Dockerfile
git -C "$source_repo" -c user.name=t -c user.email=t@t commit -qm init
head=$(git -C "$source_repo" rev-parse HEAD)

run() {
  PATH="$fake_bin:$PATH" TEST_STATE_DIR=$state GILDRA_DEPLOY_DIR=$deployment_directory \
    GILDRA_DEPLOY_LOCK_FILE=$test_directory/deploy.lock GILDRA_SOURCE_DIR=$source_repo \
    GILDRA_LOCK_WAIT=1 "$@" > "$test_directory/run.log" 2>&1
}
expect_ok() { run "$@" || { cat "$test_directory/run.log" >&2; echo "test: expected success: $*" >&2; exit 1; }; }
expect_fail() { if run "$@"; then cat "$test_directory/run.log" >&2; echo "test: expected failure: $*" >&2; exit 1; fi; }
manifest=$deployment_directory/current-release.env
new_web=gildra-web:rel1-${head:0:12}

# --- a healthy release builds the committed tree and switches only WEB_* -------
reset_host
cp "$manifest" "$test_directory/manifest.before"
expect_ok env "$deployment_script" rel1 --expect /ru:data-release-marker
tar -tf "$state/context.tar" | grep -qx Dockerfile
grep -q -- '--label net.gildra.patch=rel1' "$state/docker.log"
grep -q -- "--label org.opencontainers.image.revision=$head" "$state/docker.log"
[ "$(cat "$state/web.image")" = "$new_web" ]
grep -qx "WEB_IMAGE=$new_web" "$manifest"
grep -qx "WEB_SOURCE_REVISION=$head" "$manifest"
grep -qx "WEB_HOTFIX_SOURCE_REVISION=rel1" "$manifest"
grep -qx "API_IMAGE=$api_image" "$manifest"
grep -qx "SOURCE_REVISION=$revision" "$manifest"
[ "$(grep -c '^WEB_IMAGE=' "$manifest")" -eq 1 ]
cmp -s "$deployment_directory/rel1-previous.env" "$test_directory/manifest.before"
[ "$(cut -d' ' -f1 "$state/images/gildra-web:rollback-before-rel1")" = sha256:old ]
[ "$(wc -l < "$state/reload.log")" -eq 1 ]
grep -q 'timings:' "$test_directory/run.log"
grep -Eq '^  build +[0-9]+s$' "$test_directory/run.log"
grep -Eq '^  total +[0-9]+s$' "$test_directory/run.log"
if grep -q '^builder' "$state/docker.log" || [ -f "$state/removed.log" ]; then
  echo 'test: nothing may be pruned without --prune' >&2; exit 1
fi
echo 'test: a healthy release switches only the WEB_* keys and keeps a rollback'

# --- failing smoke after the switch restores the previous image and manifest --
reset_host
cp "$manifest" "$test_directory/manifest.before"
expect_fail env TEST_BAD_WEB="$new_web" "$deployment_script" rel1
[ "$(cat "$state/web.image")" = "$old_web" ]
cmp -s "$manifest" "$test_directory/manifest.before"
grep -q 'rollback verified' "$test_directory/run.log"
[ "$(sed -n 2p "$state/up.log")" = "up $old_web" ]
grep -Eq '^  rollback +[0-9]+s$' "$test_directory/run.log"
echo 'test: failed smoke rolls back the image and the manifest'

# --- an unhealthy new container is rolled back too ---------------------------
reset_host
expect_fail env TEST_UNHEALTHY="$new_web" "$deployment_script" rel1
[ "$(cat "$state/web.image")" = "$old_web" ]
grep -qx "WEB_IMAGE=$old_web" "$manifest"
echo 'test: an unhealthy new container is rolled back'

# --- nothing touches production when the build fails or the site is down -----
reset_host
expect_fail env TEST_BUILD_FAILS=1 "$deployment_script" rel1
[ ! -f "$state/up.log" ] && [ ! -f "$deployment_directory/rel1-previous.env" ]
reset_host
expect_fail env TEST_BAD_WEB="$old_web" "$deployment_script" rel1
[ ! -f "$state/up.log" ] && grep -q 'current release fails its smoke' "$test_directory/run.log"
echo 'test: a failed build or an unhealthy current release leaves production alone'

# --- low disk space stops before building -------------------------------------
reset_host
echo 5 > "$state/free.gb"
expect_fail env "$deployment_script" rel1
[ ! -f "$state/context.tar" ] && grep -q 'less than 20 GB free' "$test_directory/run.log"
echo 'test: low disk space stops the release before the build'

# --- a held deployment lock stops the release ----------------------------------
reset_host
exec 8>"$test_directory/deploy.lock"
flock -n 8
expect_fail env "$deployment_script" rel1
grep -q 'another deployment held the lock' "$test_directory/run.log"
[ ! -f "$state/up.log" ]
exec 8>&-
echo 'test: a held deployment lock stops the release'

# --- bad arguments and wrong labels are refused -------------------------------
reset_host
expect_fail env "$deployment_script" 'bad label'
expect_fail env "$deployment_script" rel1 --keep 0
add_image gildra-web:other sha256:other "2026-10-22 10:00:00 +0000 UTC" something-else
expect_fail env "$deployment_script" rel1 --image gildra-web:other
grep -q 'not labelled net.gildra.patch=rel1' "$test_directory/run.log"
echo 'test: bad arguments and mislabelled images are refused'

# --- --image rolls out an existing image without building ---------------------
reset_host
add_image gildra-web:prebuilt sha256:pre "2026-10-22 11:00:00 +0000 UTC" rel2
expect_ok env TEST_REVISION="$head" "$deployment_script" rel2 --image gildra-web:prebuilt
[ ! -f "$state/context.tar" ] && grep -qx 'WEB_IMAGE=gildra-web:prebuilt' "$manifest"
echo 'test: --image rolls out a prebuilt image'

# --- --prune-dry-run lists without removing anything ----------------------------
reset_host
add_image gildra-web:r01 sha256:r01 "2026-10-01 10:00:00 +0000 UTC" r01
for day in 02 03 04 05 06; do add_image "gildra-web:r$day" "sha256:r$day" "2026-10-$day 10:00:00 +0000 UTC" "r$day"; done
expect_ok env "$deployment_script" rel1 --prune-dry-run
grep -q 'would remove image tag gildra-web:r01' "$test_directory/run.log"
[ -f "$state/images/gildra-web:r01" ] && [ ! -f "$state/removed.log" ]
if grep -q '^builder' "$state/docker.log"; then echo 'test: a dry run must not prune build cache' >&2; exit 1; fi
echo 'test: --prune-dry-run removes nothing'

# --- --prune keeps recent, current, rollback and in-use images ----------------
reset_host
for day in 10 11 12 13 14 15 16; do
  add_image "gildra-web:r$day" "sha256:r$day" "2026-10-$day 10:00:00 +0000 UTC" "r$day"
done
for day in 11 12 13 14; do
  add_image "gildra-web:rollback-before-r$day" "sha256:x$day" "2026-10-$day 09:00:00 +0000 UTC" "x"
done
add_image gildra-web:preview sha256:preview "2026-10-01 10:00:00 +0000 UTC" preview
expect_ok env TEST_CONTAINER_IMAGE_ID=sha256:preview "$deployment_script" rel1 --prune --keep 3
kept() { [ -f "$state/images/$1" ] || { echo "test: $1 should be kept" >&2; exit 1; }; }
gone() { [ ! -f "$state/images/$1" ] || { echo "test: $1 should be removed" >&2; exit 1; }; }
kept "$new_web"; kept "$old_web"; kept gildra-web:rollback-before-rel1
kept gildra-web:r16; kept gildra-web:preview
kept gildra-web:rollback-before-r14; kept gildra-web:rollback-before-r13
gone gildra-web:r15; gone gildra-web:r14; gone gildra-web:r10; gone gildra-web:rollback-before-r12; gone gildra-web:rollback-before-r11
grep -q '^builder prune -f --filter until=168h' "$state/docker.log"
grep -q '^builder prune -f --max-used-space 30GB' "$state/docker.log"
echo 'test: --prune keeps recent, current, rollback and in-use images'

echo 'test: deploy-web-host contract verified'
