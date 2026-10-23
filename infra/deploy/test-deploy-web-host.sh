#!/bin/bash
# Contract of deploy-web-host.sh and prune-web-images.sh against a fake
# docker/curl/df/systemctl/gildra-heavy and a throwaway git repository.
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
  # images/<tag>: "<id> <created> <patch label>"
  add_image "$old_web" sha256:old 2026-10-20T10:00:00Z old-release
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
    tag= label= context=${!#}
    while [ "$#" -gt 0 ]; do
      case $1 in
        -t) tag=$2; shift 2 ;;
        --label) case $2 in net.gildra.patch=*) label=${2#*=} ;; esac; shift 2 ;;
        *) shift ;;
      esac
    done
    ls -A "$context" > "$s/context.list"
    cp "$context/Dockerfile" "$s/context.dockerfile"
    [ -z "${TEST_BUILD_FAILS:-}" ] || exit 1
    printf 'sha256:%s %s %s\n' "${tag##*:}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$label" > "$s/images/$tag"
    ;;
  tag) cp "$s/images/$2" "$s/images/$3" ;;
  image)
    case $2 in
      inspect)
        if [ "$3" = --format ]; then
          case $4 in
            *net.gildra.patch*) field "$5" 3 ;;
            *.Created*) field "$5" 2 ;;
            *revision*) echo "${TEST_REVISION:-}" ;;
            *.Id*) field "$5" 1 ;;
          esac
        else field "$3" 1 >/dev/null; fi ;;
      ls)
        for f in "$s"/images/*; do basename "$f"; done ;;
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
case " $* " in *" -o "*) ;; *) echo '<html data-release-marker>' ;; esac
FAKE_CURL

cat > "$fake_bin/df" <<'FAKE_DF'
#!/bin/sh
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/x 1 1 %s 1%% /\n' "$(( $(cat "$TEST_STATE_DIR/free.gb") * 1048576 ))"
FAKE_DF
cat > "$fake_bin/systemctl" <<'FAKE_SYSTEMCTL'
#!/bin/sh
echo "$*" >> "$TEST_STATE_DIR/systemctl.log"
FAKE_SYSTEMCTL

cat > "$fake_bin/heavy" <<'FAKE_HEAVY'
#!/bin/sh
echo "$1 $2" >> "$TEST_STATE_DIR/heavy.log"
exec "$@"
FAKE_HEAVY
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
    GILDRA_BUILD_DIR=$test_directory/build GILDRA_LOCK_WAIT=1 GILDRA_HEAVY=$fake_bin/heavy "$@" > "$test_directory/run.log" 2>&1
}
expect_ok() { run "$@" || { cat "$test_directory/run.log" >&2; echo "test: expected success: $*" >&2; exit 1; }; }
expect_fail() { if run "$@"; then cat "$test_directory/run.log" >&2; echo "test: expected failure: $*" >&2; exit 1; fi; }
manifest=$deployment_directory/current-release.env
new_web=gildra-web:rel1-${head:0:12}

# --- a healthy release builds the committed tree and switches only WEB_* -------
reset_host
cp "$manifest" "$test_directory/manifest.before"
expect_ok env "$deployment_script" rel1 --expect /ru:data-release-marker
# Only the committed tree reaches the build: no .git, no stray or edited files.
[ "$(cat "$state/context.list")" = Dockerfile ]
grep -qx 'FROM scratch' "$state/context.dockerfile"
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
[ ! -f "$state/removed.log" ] || { echo 'test: nothing may be pruned without --prune' >&2; exit 1; }
echo 'test: a healthy release switches only the WEB_* keys and keeps a rollback'

# The build waits for a heavy-command slot and runs in the low-weight build slice.
grep -qx 'env DOCKER_BUILDKIT=1' "$state/heavy.log"
grep -qx 'set-property --runtime gildra-build.slice CPUWeight=50 IOWeight=50 MemoryHigh=8G' "$state/systemctl.log"
grep -q -- '^build --cgroup-parent gildra-build.slice ' "$state/docker.log"
reset_host
expect_ok env GILDRA_HEAVY= GILDRA_BUILD_SLICE= "$deployment_script" rel1
[ ! -f "$state/heavy.log" ] && [ ! -f "$state/systemctl.log" ] && ! grep -q -- --cgroup-parent "$state/docker.log"
echo 'test: the build is queued and throttled, and both can be turned off'

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
[ ! -f "$state/context.list" ] && grep -q 'less than 20 GB free' "$test_directory/run.log"
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
expect_fail env "$deployment_script" rel1 --keep 3
add_image gildra-web:other sha256:other 2026-10-22T10:00:00Z something-else
expect_fail env "$deployment_script" rel1 --image gildra-web:other
grep -q 'not labelled net.gildra.patch=rel1' "$test_directory/run.log"
echo 'test: bad arguments and mislabelled images are refused'

# --- --image rolls out an existing image without building ---------------------
reset_host
add_image gildra-web:prebuilt sha256:pre 2026-10-22T11:00:00Z rel2
expect_ok env TEST_REVISION="$head" "$deployment_script" rel2 --image gildra-web:prebuilt
[ ! -f "$state/context.list" ] && grep -qx 'WEB_IMAGE=gildra-web:prebuilt' "$manifest"
echo 'test: --image rolls out a prebuilt image'

# --- --prune-dry-run lists without removing anything ----------------------------
reset_host
for day in 01 02 03 04 05 06; do add_image "gildra-web:r$day" "sha256:r$day" "2026-10-${day}T10:00:00Z" "r$day"; done
expect_ok env "$deployment_script" rel1 --prune-dry-run
grep -q 'WOULD DELETE gildra-web:r01' "$test_directory/run.log"
[ -f "$state/images/gildra-web:r01" ] && [ ! -f "$state/removed.log" ]
echo 'test: --prune-dry-run removes nothing'

# --- --prune: current + 2 previous, last rollback/backup, in use, young ------------
reset_host
for day in 10 11 12 13 14 15 16; do add_image "gildra-web:r$day" "sha256:r$day" "2026-10-${day}T10:00:00Z" "r$day"; done
for day in 11 12 13 14; do add_image "gildra-web:rollback-before-r$day" "sha256:x$day" "2026-10-${day}T09:00:00Z" x; done
add_image gildra-web:backup-a sha256:ba 2026-10-05T10:00:00Z x
add_image gildra-web:backup-b sha256:bb 2026-10-12T10:00:00Z x
add_image gildra-web:fastdeploy-e2e-a sha256:e2e 2026-10-21T10:00:00Z e2e
add_image gildra-web:preview sha256:preview 2026-10-01T10:00:00Z preview
add_image gildra-web:fresh sha256:fresh "$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ)" fresh
# Releases that ran: r15 before r16 before the current old-release (backups name the replaced image).
printf 'WEB_IMAGE=gildra-web:r15\n' > "$deployment_directory/r16-previous.env"
printf 'WEB_IMAGE=gildra-web:r16\n' > "$deployment_directory/old-release-previous.env"
touch -d '-2 days' "$deployment_directory/r16-previous.env"; touch -d '-1 day' "$deployment_directory/old-release-previous.env"
expect_ok env TEST_CONTAINER_IMAGE_ID=sha256:preview "$deployment_script" rel1 --prune
kept() { [ -f "$state/images/$1" ] || { cat "$test_directory/run.log" >&2; echo "test: $1 should be kept" >&2; exit 1; }; }
gone() { [ ! -f "$state/images/$1" ] || { cat "$test_directory/run.log" >&2; echo "test: $1 should be removed" >&2; exit 1; }; }
# current (new) + previous two (the replaced release and r16)
kept "$new_web"; kept "$old_web"; kept gildra-web:r16
# the last deploy's rollback tag (the one just made) and the newest backup
kept gildra-web:rollback-before-rel1; kept gildra-web:backup-b
kept gildra-web:preview; kept gildra-web:fresh
gone gildra-web:r15; gone gildra-web:r10; gone gildra-web:rollback-before-r14; gone gildra-web:rollback-before-r11
gone gildra-web:backup-a; gone gildra-web:fastdeploy-e2e-a
grep -q 'KEEP(in use) gildra-web:preview' "$test_directory/run.log"
grep -q 'KEEP(younger than 6h) gildra-web:fresh' "$test_directory/run.log"
if grep -q '^builder' "$state/docker.log"; then echo 'test: build cache belongs to the disk guard' >&2; exit 1; fi
echo 'test: --prune keeps current + 2 previous, the last rollback/backup, in-use and young images'

# --- the retention script alone: dry run by default, refuses without a manifest --
reset_host
add_image gildra-web:r01 sha256:r01 2026-10-01T10:00:00Z r01
PATH="$fake_bin:$PATH" TEST_STATE_DIR=$state GILDRA_DEPLOY_DIR=$deployment_directory \
  "$script_directory/prune-web-images.sh" > "$test_directory/run.log"
grep -qx 'KEEP(current) gildra-web:old-release-aaaaaaaaaaaa' "$test_directory/run.log"
grep -qx 'WOULD DELETE gildra-web:r01' "$test_directory/run.log"
[ -f "$state/images/gildra-web:r01" ]
sed -i '/^WEB_IMAGE=/d' "$manifest"
if PATH="$fake_bin:$PATH" TEST_STATE_DIR=$state GILDRA_DEPLOY_DIR=$deployment_directory \
  "$script_directory/prune-web-images.sh" --apply > "$test_directory/run.log" 2>&1; then
  echo 'test: pruning without a current release must fail' >&2; exit 1
fi
[ ! -f "$state/removed.log" ]
echo 'test: prune-web-images.sh is a dry run by default and needs a current release'

# --- the build copy follows the requested commit and drops stray files ----------
reset_host
printf 'FROM scratch\nLABEL v=2\n' > "$source_repo/Dockerfile"
printf 'x\n' > "$source_repo/extra.txt"
git -C "$source_repo" add Dockerfile extra.txt
git -C "$source_repo" -c user.name=t -c user.email=t@t commit -qm two
printf 'uncommitted\n' >> "$source_repo/Dockerfile"
touch "$test_directory/build/src/stray"
expect_ok env "$deployment_script" rel2
[ "$(cat "$state/context.list")" = "$(printf 'Dockerfile\nextra.txt')" ]
grep -qx 'LABEL v=2' "$state/context.dockerfile" && ! grep -q uncommitted "$state/context.dockerfile"
reset_host
expect_ok env "$deployment_script" rel3 --ref HEAD~1
[ "$(cat "$state/context.list")" = Dockerfile ]
git -C "$source_repo" checkout -q -- Dockerfile
[ "$(git -C "$source_repo" rev-parse HEAD)" != "$head" ] && git -C "$source_repo" diff --quiet
echo 'test: the build copy follows the requested commit and drops stray files'

echo 'test: deploy-web-host contract verified'
