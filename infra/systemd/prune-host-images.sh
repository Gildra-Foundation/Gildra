#!/bin/sh
# Keep the production host's disk from filling with superseded release images
# and build cache (every web wave adds a 1-2 GB host-built image).
#   prune-host-images.sh            # list what would be removed
#   prune-host-images.sh --apply    # remove it
# Kept: images of running or stopped containers, every image named in
# current-release.env, in the three newest *-previous.env manifests (the
# rollback targets) or as a default in compose*.yml, and anything newer than
# GILDRA_PRUNE_MIN_AGE_HOURS (48). Build cache older than 72 h is pruned too.

set -eu

apply=false
[ "${1:-}" = "--apply" ] && apply=true
root=${GILDRA_OPT_ROOT:-/opt/gildra}
min_age_hours=${GILDRA_PRUNE_MIN_AGE_HOURS:-48}
now=$(date +%s)

keep=$(
  {
    cat "$root/current-release.env"
    ls -t "$root"/*-previous.env 2>/dev/null | head -n 3 | xargs -r cat
    cat "$root"/compose*.yml
    docker ps -a --format '{{.Image}}'
  } | grep -oE 'gildra-[a-z-]+:[A-Za-z0-9._-]+' | sort -u
)

removed=0
docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' | grep -E '^gildra-(web|api|cms|cms-jobs|scraper):' |
while read -r image created_date created_time _; do
  printf '%s\n' "$keep" | grep -qx "$image" && continue
  age_hours=$(( (now - $(date -d "$created_date $created_time" +%s)) / 3600 ))
  [ "$age_hours" -ge "$min_age_hours" ] || continue
  echo "remove $image (${age_hours} h old)"
  if $apply; then docker image rm "$image" >/dev/null && removed=$((removed + 1)); fi
done

if $apply; then
  docker builder prune --force --filter until=72h | tail -n 1
  docker image prune --force | tail -n 1
fi
df -h / | tail -n 1
