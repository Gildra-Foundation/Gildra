#!/bin/sh
# Daily backup of the CMS database (gildra_cms) and media volume (cms_media).
# Dump and archive are written as *.partial, verified (pg_restore --list,
# tar -t), checksummed, and only then published under a timestamped directory.
# A failed run never replaces or removes a previous verified backup.
set -eu

deployment_directory="${GILDRA_DEPLOYMENT_DIRECTORY:-/opt/gildra}"
environment_file="${GILDRA_ENV_FILE:-$deployment_directory/.env}"
backup_directory="${CMS_BACKUP_DIRECTORY:-$deployment_directory/backups/cms}"
state_directory="${CMS_BACKUP_STATE_DIRECTORY:-$deployment_directory/var/cms-backup}"
lock_file="${CMS_BACKUP_LOCK_FILE:-$state_directory/run.lock}"
tool_image="${CMS_BACKUP_TOOL_IMAGE:-postgres@sha256:8189a1f6e40904781fc9e2612687877791d21679866db58b1de996b31fc312e4}"
database="${CMS_BACKUP_DATABASE:-gildra_cms}"
media_volume="${CMS_BACKUP_MEDIA_VOLUME:-gildra_cms_media}"
keep_daily="${CMS_BACKUP_KEEP_DAILY:-7}"
keep_weekly="${CMS_BACKUP_KEEP_WEEKLY:-4}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
work_directory=""
job_status="failed"

for command in date docker flock find install sed sha256sum tar; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "required command is unavailable: $command" >&2
    exit 1
  }
done
printf '%s\n' "$tool_image" | grep -Eq '^postgres@sha256:[0-9a-f]{64}$' || {
  echo "cms backup tool image must be pinned by sha256 digest" >&2
  exit 1
}
printf '%s\n' "$database" | grep -Eq '^[0-9A-Za-z_]+$' || {
  echo "cms backup database name is invalid" >&2
  exit 1
}
for count in "$keep_daily" "$keep_weekly"; do
  printf '%s\n' "$count" | grep -Eq '^[1-9][0-9]*$' || {
    echo "cms backup retention counts must be positive integers" >&2
    exit 1
  }
done
[ -r "$environment_file" ] || {
  echo "cms backup environment file is not readable" >&2
  exit 1
}
for compose_file in compose.yml compose.prod.yml; do
  [ -r "$deployment_directory/$compose_file" ] || {
    echo "cms backup Compose file is not readable: $compose_file" >&2
    exit 1
  }
done

umask 077
install -d -m 700 "$state_directory" "$backup_directory"
exec 8>"$lock_file"
flock -n 8 || {
  echo "another cms backup or restore rehearsal is already running" >&2
  exit 1
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  [ -z "$work_directory" ] || rm -rf "$work_directory"
  status_output="$state_directory/last-run.env.tmp.$$"
  {
    printf 'STATUS=%s\n' "$job_status"
    printf 'STARTED_AT=%s\n' "$started_at"
    printf 'FINISHED_AT=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'EXIT_CODE=%s\n' "$status"
  } > "$status_output"
  mv -f "$status_output" "$state_directory/last-run.env"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

work_directory="$(mktemp -d "$backup_directory/.partial.XXXXXX")"

# Custom-format dump streamed out of the running postgres service.
(cd "$deployment_directory" && docker compose \
  --env-file "$environment_file" \
  -f compose.yml -f compose.prod.yml \
  exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc --no-owner "$1"' sh "$database") \
  > "$work_directory/$database.dump"

# Media volume streamed as a gzip tar through a throw-away container.
docker run --rm --network none --security-opt no-new-privileges:true \
  --mount "type=volume,src=$media_volume,dst=/media,readonly" \
  "$tool_image" tar -C /media -czf - . > "$work_directory/cms_media.tar.gz"

[ -s "$work_directory/$database.dump" ] || {
  echo "cms database dump is empty" >&2
  exit 1
}
docker run -i --rm --network none "$tool_image" pg_restore --list \
  < "$work_directory/$database.dump" >/dev/null || {
  echo "cms database dump is not a readable archive" >&2
  exit 1
}
tar -tzf "$work_directory/cms_media.tar.gz" >/dev/null || {
  echo "cms media archive is not readable" >&2
  exit 1
}

(cd "$work_directory" && sha256sum "$database.dump" cms_media.tar.gz > SHA256SUMS)
printf 'CREATED_AT=%s\nDATABASE=%s\nMEDIA_VOLUME=%s\n' \
  "$started_at" "$database" "$media_volume" > "$work_directory/manifest.env"

[ ! -e "$backup_directory/$stamp" ] || {
  echo "cms backup $stamp already exists" >&2
  exit 1
}
mv "$work_directory" "$backup_directory/$stamp"
work_directory=""
job_status="verified"

# Rotation runs only after a verified publish: keep the newest backup of each of
# the last KEEP_DAILY days plus the newest backup of each of the last KEEP_WEEKLY
# ISO weeks (the current week counts as one); everything else is deleted.
keep_list="$(mktemp "$state_directory/keep.XXXXXX")"
days=0
weeks=0
last_day=""
last_week=""
for directory in $(find "$backup_directory" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' | sort -r); do
  name="$(basename "$directory")"
  day="${name%%T*}"
  week="$(date -u -d "$(printf '%s' "$day" | sed 's/^\(....\)\(..\)\(..\)$/\1-\2-\3/')" +%G-%V)"
  if [ "$day" != "$last_day" ]; then
    last_day="$day"
    if [ "$days" -lt "$keep_daily" ]; then
      days=$((days + 1))
      printf '%s\n' "$name" >> "$keep_list"
    fi
  fi
  if [ "$week" != "$last_week" ]; then
    last_week="$week"
    if [ "$weeks" -lt "$keep_weekly" ]; then
      weeks=$((weeks + 1))
      printf '%s\n' "$name" >> "$keep_list"
    fi
  fi
done
for directory in $(find "$backup_directory" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z'); do
  grep -qx "$(basename "$directory")" "$keep_list" || rm -rf "$directory"
done
rm -f "$keep_list"
