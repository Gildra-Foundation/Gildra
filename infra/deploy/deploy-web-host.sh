#!/bin/bash
# One-command web release built on this host (docs/releases.md):
#   build → (optional staging) → roll out → smoke → automatic rollback,
# with the time of every step printed at the end.
#
#   sudo infra/deploy/deploy-web-host.sh <label> [--ref <git-ref>] [--staging]
#        [--image <local-image>] [--expect <path>:<text>] [--prune | --prune-dry-run] [--keep <n>]
#
# The image is built from the committed tree of <git-ref> (default HEAD) via
# `git archive`, so uncommitted or ignored files never reach production. It is
# tagged gildra-web:<label>-<sha12> and labelled with the label and revision.
# The release itself keeps the safety of the earlier hand-made host scripts:
#  * the shared deployment lock (/run/lock/gildra-deploy.lock), taken after the
#    build so a slow build never blocks another deployment;
#  * the running release must be healthy and pass smoke before it is replaced;
#  * the previous manifest stays as /opt/gildra/<label>-previous.env and the
#    previous image is tagged gildra-web:rollback-before-<label>;
#  * any failure after the switch restores the previous image and manifest.
# Only WEB_* keys of current-release.env change. --prune (or GILDRA_PRUNE=1)
# then drops old gildra-web images and aged build cache (prune_images below);
# --prune-dry-run only lists the image tags it would remove.
set -euo pipefail

usage() {
  sed -n '4,5p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 64
}

root=${GILDRA_DEPLOY_DIR:-/opt/gildra}
env_file=${GILDRA_ENV_FILE:-$root/.env}
manifest=$root/current-release.env
lock=${GILDRA_DEPLOY_LOCK_FILE:-/run/lock/gildra-deploy.lock}
lock_wait=${GILDRA_LOCK_WAIT:-600}
source_dir=${GILDRA_SOURCE_DIR:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}
smoke_host=${GILDRA_SMOKE_HOST:-127.0.0.1}
smoke_port=${GILDRA_SMOKE_PORT:-443}
smoke_paths=${GILDRA_WEB_SMOKE_PATHS:-"/ /ru /wow /ru/wow /login /ru/login /tier-lists /ru/tier-lists /database /ru/database /sitemap.xml /wow/raids /ru/wow/raids /wow/mythic-plus /ru/wow/mythic-plus /ru/wow/characters /ru/talents/fury-warrior /ru/search /library /ru/library /ru/privacy /wow/lairs /ru/wow/dungeons /ru/wow/gear /ru/wow/rotation/fury-warrior"}
min_free_gb=${GILDRA_MIN_FREE_GB:-20}
keep=${GILDRA_KEEP_IMAGES:-5}
cache_max_age=${GILDRA_BUILD_CACHE_MAX_AGE:-168h}
cache_max_size=${GILDRA_BUILD_CACHE_MAX_SIZE:-30GB}
prune=${GILDRA_PRUNE:-0}

label=${1:-}
[[ $label =~ ^[0-9A-Za-z][0-9A-Za-z._-]{0,79}$ ]] || usage
shift
ref=HEAD image= staging=false expect=
while [ "$#" -gt 0 ]; do
  case $1 in
    --ref) ref=${2:?--ref needs a value}; shift 2 ;;
    --image) image=${2:?--image needs a value}; shift 2 ;;
    --staging) staging=true; shift ;;
    --expect) expect=${2:?--expect needs <path>:<text>}; shift 2 ;;
    --prune) prune=1; shift ;;
    --prune-dry-run) prune=dry-run; shift ;;
    --keep) keep=${2:?--keep needs a number}; shift 2 ;;
    *) usage ;;
  esac
done
[[ $keep =~ ^[1-9][0-9]*$ ]] || { echo "deploy-web-host: --keep must be a positive number" >&2; exit 64; }

say() { printf 'deploy-web-host[%s]: %s\n' "$label" "$*" >&2; }
fail() { say "$*"; exit 1; }

# Step timings, printed at the end whether the release succeeds or not.
steps=() step_name= step_started=0 release_started=$SECONDS
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
  docker exec "$nginx" nginx -s reload >/dev/null
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

# Keep the newest $keep release images, the current and previous web images,
# the newest three rollback/backup tags and every image a container uses;
# untag the rest (docker removes an image with its last tag). Build cache that
# has not been used for $cache_max_age goes, and the rest is capped at
# $cache_max_size.
prune_images() {
  local -A protected=()
  local listing created ref id releases=0 marked=0
  protected[$(docker image inspect --format '{{.Id}}' "$image")]=1
  protected[$(docker image inspect --format '{{.Id}}' "$previous")]=1
  while read -r id; do protected[$id]=1; done < <(docker ps -aq | xargs -r docker inspect --format '{{.Image}}')
  listing=$(docker image ls gildra-web --no-trunc --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}\t{{.ID}}' |
    grep -v '<none>' | sort -r)
  while IFS=$'\t' read -r created ref id; do
    case ${ref#gildra-web:} in
      rollback-*|backup-*) marked=$((marked + 1)); [ "$marked" -gt 3 ] || protected[$id]=1 ;;
      *) releases=$((releases + 1)); [ "$releases" -gt "$keep" ] || protected[$id]=1 ;;
    esac
  done <<< "$listing"
  while IFS=$'\t' read -r created ref id; do
    [ -z "$ref" ] || [ -n "${protected[$id]:-}" ] && continue
    if [ "$prune" = dry-run ]; then say "would remove image tag $ref"; continue; fi
    say "removing old image tag $ref"
    docker image rm "$ref" >/dev/null || say "kept $ref (still in use)"
  done <<< "$listing"
  [ "$prune" = 1 ] || return 0
  docker builder prune -f --filter "until=$cache_max_age" >/dev/null
  docker builder prune -f --max-used-space "$cache_max_size" >/dev/null
}

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

  step build
  # BuildKit keeps the npm and Next.js caches in cache mounts (Dockerfile), so a
  # rebuild only redoes what the commit changed.
  git -C "$source_dir" archive --format=tar "$revision" |
    DOCKER_BUILDKIT=1 docker build --progress="${GILDRA_BUILD_PROGRESS:-auto}" \
      --label "net.gildra.patch=$label" \
      --label "org.opencontainers.image.revision=$revision" \
      --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      -t "$image" -
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
  prune_images || say "pruning failed; the release itself is fine"
fi
