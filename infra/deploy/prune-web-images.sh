#!/bin/bash
# Retention of gildra-web:* image tags on the host — the one set of rules for
# deploy-web-host.sh --prune and the disk guard. Dry run by default:
#   sudo infra/deploy/prune-web-images.sh            # lists KEEP(...) / WOULD DELETE
#   sudo infra/deploy/prune-web-images.sh --apply    # removes the WOULD DELETE tags
# Kept:
#  * every image a container uses, running or stopped;
#  * the current release (WEB_IMAGE in current-release.env) and the
#    $GILDRA_KEEP_PREVIOUS (2) releases that ran before it — the WEB_IMAGE of
#    the newest /opt/gildra/*previous*.env backups, so candidate and test
#    images never count as releases;
#  * the newest rollback* tag and the newest backup* tag (the last deploy's);
#  * anything younger than $GILDRA_KEEP_YOUNG_HOURS (6) hours.
# Everything else, test images included, is untagged; docker deletes an image
# with its last tag. Build cache is the disk guard's: this never prunes it.
set -euo pipefail

root=${GILDRA_DEPLOY_DIR:-/opt/gildra}
keep_previous=${GILDRA_KEEP_PREVIOUS:-2}
young_hours=${GILDRA_KEEP_YOUNG_HOURS:-6}
apply=false
case ${1:-} in
  --apply) apply=true ;;
  "") ;;
  *) echo "usage: $0 [--apply]" >&2; exit 64 ;;
esac
[[ $keep_previous =~ ^[0-9]+$ && $young_hours =~ ^[0-9]+$ ]] || { echo "prune-web-images: bad retention numbers" >&2; exit 64; }

current=$(sed -n 's/^WEB_IMAGE=//p' "$root/current-release.env" 2>/dev/null || true)
[ -n "$current" ] || { echo "prune-web-images: no WEB_IMAGE in $root/current-release.env; nothing removed" >&2; exit 1; }
current_id=$(docker image inspect --format '{{.Id}}' "$current")
declare -A in_use=()
while read -r id; do [ -n "$id" ] && in_use[$id]=1; done < <(docker ps -aq | xargs -r docker inspect --format '{{.Image}}')

# "<created epoch> <tag> <image id>", newest first.
listing=$(docker image ls gildra-web --no-trunc --format '{{.Repository}}:{{.Tag}}' | grep -v ':<none>$' |
  while read -r tag; do
    printf '%s %s %s\n' "$(date -d "$(docker image inspect --format '{{.Created}}' "$tag")" +%s)" "$tag" \
      "$(docker image inspect --format '{{.Id}}' "$tag")"
  done | sort -rn)

now=$(date +%s)
declare -A previous=()
while read -r backup; do
  [ "${#previous[@]}" -lt "$keep_previous" ] || break
  ran=$(sed -n 's/^WEB_IMAGE=//p' "$backup" | tail -n 1)
  [ -n "$ran" ] || continue
  id=$(docker image inspect --format '{{.Id}}' "$ran" 2>/dev/null) || continue
  [ "$id" != "$current_id" ] && previous[$id]=1
done < <(ls -1t "$root"/*previous*.env 2>/dev/null || true)

newest_rollback= newest_backup=
while read -r created tag id; do
  case ${tag#gildra-web:} in
    rollback*) newest_rollback=${newest_rollback:-$tag} ;;
    backup*) newest_backup=${newest_backup:-$tag} ;;
  esac
done <<< "$listing"

while read -r created tag id; do
  [ -n "$tag" ] || continue
  reason=
  if [ -n "${in_use[$id]:-}" ]; then reason="in use"
  elif [ "$id" = "$current_id" ]; then reason=current
  elif [ -n "${previous[$id]:-}" ]; then reason=previous
  elif [ "$tag" = "$newest_rollback" ] || [ "$tag" = "$newest_backup" ]; then reason="last rollback/backup"
  elif [ $(((now - created) / 3600)) -lt "$young_hours" ]; then reason="younger than ${young_hours}h"
  fi
  if [ -n "$reason" ]; then
    printf 'KEEP(%s) %s\n' "$reason" "$tag"
  elif [ "$apply" = true ]; then
    printf 'DELETE %s\n' "$tag"
    docker image rm "$tag" >/dev/null || printf 'KEPT %s (docker refused)\n' "$tag"
  else
    printf 'WOULD DELETE %s\n' "$tag"
  fi
done <<< "$listing"
