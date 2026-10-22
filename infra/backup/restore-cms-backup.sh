#!/bin/sh
# Restore rehearsal for a CMS backup produced by run-cms-backup.sh.
# Restores the dump into an isolated, throw-away PostgreSQL container and
# unpacks the media archive into a temp directory; production is never touched.
#
#   sh infra/backup/restore-cms-backup.sh [BACKUP_DIR]
#
# BACKUP_DIR defaults to the newest directory under the backup root.
set -eu

deployment_directory="${GILDRA_DEPLOYMENT_DIRECTORY:-/opt/gildra}"
backup_directory="${CMS_BACKUP_DIRECTORY:-$deployment_directory/backups/cms}"
tool_image="${CMS_BACKUP_TOOL_IMAGE:-postgres@sha256:8189a1f6e40904781fc9e2612687877791d21679866db58b1de996b31fc312e4}"
database="${CMS_BACKUP_DATABASE:-gildra_cms}"
run_token="$(date -u +%Y%m%dT%H%M%SZ)-$$"
container="gildra-cms-restore-$run_token"
scratch=""

for command in docker sha256sum tar openssl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "required command is unavailable: $command" >&2
    exit 1
  }
done

source_directory="${1:-}"
if [ -z "$source_directory" ]; then
  source_directory="$(find "$backup_directory" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' | sort | tail -n 1)"
fi
[ -n "$source_directory" ] && [ -d "$source_directory" ] || {
  echo "no cms backup found to rehearse" >&2
  exit 1
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  docker rm -f "$container" >/dev/null 2>&1 || true
  [ -z "$scratch" ] || rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

(cd "$source_directory" && sha256sum -c SHA256SUMS >/dev/null) || {
  echo "cms backup checksum mismatch" >&2
  exit 1
}

password="$(openssl rand -hex 24)"
scratch="$(mktemp -d)"
docker run --detach --rm --name "$container" --network none \
  --tmpfs /var/lib/postgresql/data:size=4g \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB="$database" \
  --security-opt no-new-privileges:true "$tool_image" >/dev/null

attempt=0
until docker exec "$container" pg_isready -U restore -d "$database" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || {
    echo "isolated restore PostgreSQL did not become ready" >&2
    exit 1
  }
  sleep 1
done

docker exec -i "$container" pg_restore -U restore -d "$database" --no-owner --exit-on-error \
  < "$source_directory/$database.dump"

tables="$(docker exec "$container" psql -U restore -d "$database" -Atc \
  "select count(*) from information_schema.tables where table_schema = 'public'")"
migrations="$(docker exec "$container" psql -U restore -d "$database" -Atc \
  "select count(*) from payload_migrations")"
[ "${tables:-0}" -gt 0 ] && [ "${migrations:-0}" -gt 0 ] || {
  echo "restored cms database is empty (tables=$tables migrations=$migrations)" >&2
  exit 1
}

tar -xzf "$source_directory/cms_media.tar.gz" -C "$scratch"
files="$(find "$scratch" -type f | wc -l | tr -d ' ')"

printf 'cms restore rehearsal ok: backup=%s tables=%s migrations=%s media_files=%s\n' \
  "$(basename "$source_directory")" "$tables" "$migrations" "$files"
