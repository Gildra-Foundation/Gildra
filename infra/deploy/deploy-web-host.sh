#!/bin/bash
# One-command web release built on this host (docs/releases.md):
#   build → (optional staging) → roll out → smoke → automatic rollback,
# with the time of every step printed at the end.
#
#   sudo infra/deploy/deploy-web-host.sh <label> [--ref <git-ref>] [--staging]
#        [--image <local-image>] [--expect <path>:<text>] [--current <image>]
#        [--prune | --prune-dry-run]
#
# The image is built from the committed tree of <git-ref> (default HEAD), so
# uncommitted or ignored files never reach production: a private build copy
# ($GILDRA_BUILD_DIR) is reset to that tree with its own index, rewriting only
# the files that changed, so BuildKit sends a small incremental context. The
# image is tagged gildra-web:<label>-<sha12> and labelled with label and revision.
# The release itself keeps the safety of the earlier hand-made host scripts:
#  * the shared deployment lock (/run/lock/gildra-deploy.lock), taken after the
#    build so a slow build never blocks another deployment;
#  * the running release must be healthy and pass smoke before it is replaced
#    (and, with --current, still be the image the release was prepared over:
#    a hotfix deployed meanwhile stops it instead of being overwritten);
#  * the previous manifest stays as /opt/gildra/<label>-previous.env and the
#    previous image is tagged gildra-web:rollback-before-<label>;
#  * any failure after the switch restores the previous image and manifest.
# Only WEB_* keys of current-release.env change. --prune (or GILDRA_PRUNE=1)
# then applies the image retention of prune-web-images.sh (shared with the disk
# guard); --prune-dry-run only lists what it would remove.
#
# The build waits for a slot of the host's heavy-command queue (gildra-heavy)
# and runs in gildra-build.slice with a low CPU/IO weight and a memory ceiling,
# so the production containers in system.slice keep the machine; the switch
# itself is not throttled.
set -euo pipefail

usage() {
  sed -n '6,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 64
}

root=${GILDRA_DEPLOY_DIR:-/opt/gildra}
env_file=${GILDRA_ENV_FILE:-$root/.env}
manifest=$root/current-release.env
lock=${GILDRA_DEPLOY_LOCK_FILE:-/run/lock/gildra-deploy.lock}
lock_wait=${GILDRA_LOCK_WAIT:-600}
source_dir=${GILDRA_SOURCE_DIR:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}
build_dir=${GILDRA_BUILD_DIR:-/var/cache/gildra/web-build}
smoke_host=${GILDRA_SMOKE_HOST:-127.0.0.1}
smoke_port=${GILDRA_SMOKE_PORT:-443}
smoke_paths=${GILDRA_WEB_SMOKE_PATHS:-"/ /ru /wow /ru/wow /login /ru/login /tier-lists /ru/tier-lists /database /ru/database /sitemap.xml /wow/raids /ru/wow/raids /wow/mythic-plus /ru/wow/mythic-plus /ru/wow/characters /ru/talents/fury-warrior /ru/search /library /ru/library /ru/privacy /wow/lairs /ru/wow/dungeons /ru/wow/gear /ru/wow/rotation/fury-warrior"}
min_free_gb=${GILDRA_MIN_FREE_GB:-20}
prune=${GILDRA_PRUNE:-0}
heavy=${GILDRA_HEAVY-/home/zulut/bin/gildra-heavy}
build_slice=${GILDRA_BUILD_SLICE-gildra-build.slice}
build_limits=${GILDRA_BUILD_LIMITS-CPUWeight=50 IOWeight=50 MemoryHigh=8G}

label=${1:-}
[[ $label =~ ^[0-9A-Za-z][0-9A-Za-z._-]{0,79}$ ]] || usage
shift
ref=HEAD image= staging=false expect= current=
while [ "$#" -gt 0 ]; do
  case $1 in
    --ref) ref=${2:?--ref needs a value}; shift 2 ;;
    --image) image=${2:?--image needs a value}; shift 2 ;;
    --staging) staging=true; shift ;;
    --expect) expect=${2:?--expect needs <path>:<text>}; shift 2 ;;
    --current) current=${2:?--current needs an image}; shift 2 ;;
    --prune) prune=1; shift ;;
    --prune-dry-run) prune=dry-run; shift ;;
    *) usage ;;
  esac
done

say() { printf 'deploy-web-host[%s]: %s\n' "$label" "$*" >&2; }
fail() { say "$*"; exit 1; }

# Step timings, printed at the end whether the release succeeds or not.
steps=() step_name= step_started=0 release_started=$SECONDS epoch=$(($(date +%s) - SECONDS))
step() {
  step_end
  step_name=$1 step_started=$SECONDS
  say "→ $1"
}
step_end() {
  if [ -n "$step_name" ]; then
    steps+=("$(printf '%-28s %4ss' "$step_name" $((SECONDS - step_started)))")
  fi
  step_name=
}
report() {
  step_end
  say "timings:"
  local line
  for line in "${steps[@]}"; do printf '  %s\n' "$line" >&2; done
  printf '  %-28s %4ss\n' total $((SECONDS - release_started)) >&2
}

compose() {
  docker compose --project-directory "$root" --env-file "$env_file" --env-file "$manifest" \
    -f "$root/compose.yml" -f "$root/compose.prod.yml" -f "$root/compose.runtime.yml" "$@"
}

healthy() {
  local container
  container=$(compose ps -q web)
  [ -n "$container" ] || return 1
  [ "$(docker inspect --format '{{.Config.Image}}' "$container")" = "$1" ] || return 1
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy ]
}

reload_nginx() {
  local nginx
  nginx=$(compose ps -q nginx)
  [ -n "$nginx" ] || return 1
  docker exec "$nginx" nginx -t >/dev/null 2>&1
  docker exec "$nginx" nginx -s reload >/dev/null 2>&1
}

# Every path through nginx, eight at a time; any failure fails the check.
smoke() {
  local failed=0
  printf '%s\n' $smoke_paths | xargs -P 8 -I{} sh -c '
    curl --fail --silent --show-error --insecure --retry 5 --retry-delay 2 --max-time 20 \
      --resolve "gildra.net:$2:$1" "https://gildra.net:$2$3" -o /dev/null || { echo "smoke failed: $3" >&2; exit 1; }' \
    _ "$smoke_host" "$smoke_port" {} || failed=1
  curl --fail --silent --show-error --insecure --retry 5 --retry-delay 2 --max-time 15 \
    --resolve "api.gildra.net:$smoke_port:$smoke_host" "https://api.gildra.net:$smoke_port/readyz" -o /dev/null ||
    { echo "smoke failed: api readyz" >&2; failed=1; }
  if [ -n "$expect" ]; then
    curl --fail --silent --show-error --insecure --max-time 20 --resolve "gildra.net:$smoke_port:$smoke_host" \
      "https://gildra.net:$smoke_port${expect%%:*}" | grep -Fq -- "${expect#*:}" ||
      { echo "smoke failed: ${expect%%:*} does not contain ${expect#*:}" >&2; failed=1; }
  fi
  return "$failed"
}

up_web() {
  WEB_IMAGE=$1 compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 web
}

rollback() {
  say "restoring $previous"
  up_web "$previous" && reload_nginx && healthy "$previous" || return 1
  cp -f "$backup" "$manifest" && chmod 600 "$manifest" || return 1
  smoke && say "rollback verified"
}

armed=false
on_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$armed" = true ]; then
    step rollback
    rollback || { say "ROLLBACK FAILED — the site needs attention"; status=2; }
  fi
  report
  exit "$status"
}
trap on_exit EXIT
trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM

free_gb() { df -Pk "$1" | awk 'NR==2 { print int($4 / 1048576) }'; }


step preflight
for command_name in docker git curl flock xargs df; do
  command -v "$command_name" >/dev/null || fail "required command is missing: $command_name"
done
[ -f "$env_file" ] && [ -f "$manifest" ] || fail "deployment files are missing in $root"
docker_root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /)
[ "$(free_gb "$docker_root")" -ge "$min_free_gb" ] ||
  fail "less than ${min_free_gb} GB free under $docker_root; free space before building"

if [ -z "$image" ]; then
  revision=$(git -C "$source_dir" rev-parse --verify "$ref^{commit}")
  image=gildra-web:$label-${revision:0:12}

  step "source $(printf '%.12s' "$revision")"
  # Like `git reset --hard <revision> && git clean -fdx` on a private worktree,
  # without touching HEAD or the index of the source checkout.
  git_dir=$(git -C "$source_dir" rev-parse --path-format=absolute --git-common-dir)
  umask 022
  mkdir -p "$build_dir/src"
  GIT_INDEX_FILE=$build_dir/index git --git-dir="$git_dir" --work-tree="$build_dir/src" read-tree --reset -u "$revision"
  GIT_INDEX_FILE=$build_dir/index git --git-dir="$git_dir" --work-tree="$build_dir/src" clean -fdxq

  step build
  # BuildKit keeps the npm and Next.js caches in cache mounts (Dockerfile), so a
  # rebuild only redoes what the commit changed. BuildKit runs the steps, not
  # the docker client, so only --cgroup-parent (not nice) lowers their priority.
  build_cmd=(env DOCKER_BUILDKIT=1 docker build)
  if [ -n "$build_slice" ]; then
    if command -v systemctl >/dev/null && [ -n "$build_limits" ]; then
      # shellcheck disable=SC2086 # one property per word
      systemctl set-property --runtime "$build_slice" $build_limits || say "could not limit $build_slice"
    fi
    build_cmd+=(--cgroup-parent "$build_slice")
  fi
  slot=$build_dir/slot-acquired
  rm -f "$slot"
  if [ -n "$heavy" ] && [ -x "$heavy" ]; then
    say "waiting for a heavy-command slot ($heavy)"
    # The marker splits the queue wait from the build in the timings.
    # shellcheck disable=SC2016 # expanded by the inner shell
    build_cmd=("$heavy" sh -c 'date +%s > "$0"; exec "$@"' "$slot" "${build_cmd[@]}")
  fi
  "${build_cmd[@]}" --progress="${GILDRA_BUILD_PROGRESS:-auto}" \
    --label "net.gildra.patch=$label" \
    --label "org.opencontainers.image.revision=$revision" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -t "$image" "$build_dir/src"
  if [ -s "$slot" ]; then
    acquired=$(($(cat "$slot") - epoch))
    steps+=("$(printf '%-28s %4ss' "queue wait" $((acquired - step_started)))")
    step_started=$acquired
  fi
else
  revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
fi
[ "$(docker image inspect --format '{{index .Config.Labels "net.gildra.patch"}}' "$image")" = "$label" ] ||
  fail "$image is not labelled net.gildra.patch=$label"

if [ "$staging" = true ]; then
  step staging
  sh "$(dirname "$0")/deploy-web-staging.sh" "$image"
fi

step lock
exec 9>"$lock"
flock -w "$lock_wait" 9 || fail "another deployment held the lock for ${lock_wait}s"

step "check current release"
previous=$(sed -n 's/^WEB_IMAGE=//p' "$manifest")
[ -n "$previous" ] || fail "$manifest has no WEB_IMAGE"
[ -z "$current" ] || [ "$previous" = "$current" ] ||
  fail "the current release is $previous, not $current; carry its source over first"
[ "$previous" != "$image" ] || fail "$image is already the current release"
docker image inspect "$previous" >/dev/null || fail "the current image $previous is missing on this host"
healthy "$previous" || fail "the running web container is not the healthy $previous"
smoke || fail "the current release fails its smoke checks; not deploying over it"

backup=$root/$label-previous.env
umask 077
cp -f "$manifest" "$backup"
docker tag "$previous" "gildra-web:rollback-before-$label"
armed=true

step "switch web container"
up_web "$image"
reload_nginx
healthy "$image" || fail "web is not running a healthy $image"

step smoke
smoke || fail "smoke checks failed on $image"

tmp=$manifest.tmp.$$
grep -vE '^(WEB_IMAGE|WEB_SOURCE_REVISION|WEB_HOTFIX_SOURCE_REVISION|WEB_DEPLOYED_AT)=' "$manifest" > "$tmp" || true
printf 'WEB_IMAGE=%s\nWEB_SOURCE_REVISION=%s\nWEB_HOTFIX_SOURCE_REVISION=%s\nWEB_DEPLOYED_AT=%s\n' \
  "$image" "$revision" "$label" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$manifest"
armed=false
say "$image is live; rollback: gildra-web:rollback-before-$label, manifest $backup"

if [ "$prune" != 0 ]; then
  step prune
  prune_args=()
  [ "$prune" = 1 ] && prune_args=(--apply)
  GILDRA_DEPLOY_DIR=$root "$(dirname "$0")/prune-web-images.sh" "${prune_args[@]}" >&2 ||
    say "pruning failed; the release itself is fine"
fi
