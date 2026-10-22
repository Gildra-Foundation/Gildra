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
retention_days="${CMS_BACKUP_RETENTION_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
work_directory=""
job_status="failed"

for command in date docker flock find install sha256sum tar; do
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
printf '%s\n' "$retention_days" | grep -Eq '^[1-9][0-9]*$' || {
  echo "cms backup retention must be a positive number of days" >&2
  exit 1
}
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

# Retention only runs after a verified backup was published.
find "$backup_directory" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' \
  -mtime "+$retention_days" -exec rm -rf {} +
