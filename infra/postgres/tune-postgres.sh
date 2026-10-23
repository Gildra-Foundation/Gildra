#!/bin/bash
# Applies the production Postgres memory and planner settings with one restart,
# meant to run unattended at a quiet hour (a systemd-run timer, docs/releases.md):
#
#   sudo infra/postgres/tune-postgres.sh <label>          # apply
#   sudo infra/postgres/tune-postgres.sh <label> --revert # back to the defaults
#
# Under the shared deployment lock it backs up postgresql.conf / .auto.conf,
# times a few database searches through the API, sets the values with ALTER
# SYSTEM (postgresql.auto.conf), checkpoints and restarts the container, then
# checks every service that talks to the database (api, cms, cms-jobs,
# scraper-worker, web) and times the same searches again. If Postgres does not
# come back with the new values or the API cannot read the catalog, the
# settings are reset and Postgres restarted once more. Everything is logged to
# /opt/gildra/backups/postgres-tune-<label>/run.log.
set -euo pipefail

label=${1:-}
[[ $label =~ ^[0-9A-Za-z][0-9A-Za-z._-]{0,79}$ ]] || { echo "usage: $0 <label> [--revert]" >&2; exit 64; }
mode=${2:-apply}

pg=${GILDRA_POSTGRES_CONTAINER:-gildra-postgres-1}
lock=${GILDRA_DEPLOY_LOCK_FILE:-/run/lock/gildra-deploy.lock}
lock_wait=${GILDRA_LOCK_WAIT:-1800}
min_available_gb=${GILDRA_MIN_AVAILABLE_GB:-8}
backup=${GILDRA_BACKUP_DIR:-/opt/gildra/backups}/postgres-tune-$label
# name=value pairs; restart-only ones (shared_buffers) are checked after the restart.
settings=${GILDRA_POSTGRES_SETTINGS:-"shared_buffers=4GB effective_cache_size=16GB random_page_cost=1.1 effective_io_concurrency=200"}
searches=${GILDRA_SEARCH_PROBES:-"en_US:helm en_US:girdle ru_RU:frost en_US:sabatons"}

mkdir -p "$backup"
exec > >(tee -a "$backup/run.log") 2>&1
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
psql_c() { docker exec "$pg" psql -U gildra -d gildra -Atv ON_ERROR_STOP=1 -c "$1"; }
ip_of() { docker inspect "$1" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' | awk '{print $1}'; }

# wait_for <seconds> <command...>: retry every 3 s.
wait_for() {
  local deadline=$((SECONDS + $1)); shift
  until "$@"; do
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 3
  done
}

postgres_ready() {
  [ "$(docker inspect "$pg" --format '{{.State.Health.Status}}')" = healthy ] && psql_c 'select 1' >/dev/null 2>&1
}
api_reads_catalog() {
  curl -fsS -o /dev/null --max-time 30 "http://$(ip_of gildra-api-1):8080/v1/game/entity-summaries?product=wow&locale=en_US&limit=3&q=helm"
}
cms_reads_pages() {
  curl -fsS -o /dev/null --max-time 15 "http://$(ip_of gildra-cms-1):3001/api/pages?limit=1&depth=0"
}
scraper_healthy() {
  curl -fsS -o /dev/null --max-time 5 "http://$(ip_of gildra-scraper-worker-1):8081/healthz"
}
web_serves_database() {
  # The origin certificate is Cloudflare's, not publicly trusted: -k.
  curl -kfsS -o /dev/null --max-time 30 --resolve gildra.net:443:127.0.0.1 "https://gildra.net/database?type=item&q=helm"
}

time_searches() {
  local api probe locale term
  api=$(ip_of gildra-api-1)
  for probe in $searches; do
    locale=${probe%%:*} term=${probe#*:}
    printf '  %s %-10s %s\n' "$locale" "$term" "$(curl -s -o /dev/null --max-time 60 -w '%{http_code} %{time_total}s' \
      "http://$api:8080/v1/game/entity-summaries?product=wow&type=item&locale=$locale&limit=24&q=$term")"
  done
}

restart_postgres() {
  log "checkpoint and restart $pg"
  psql_c 'CHECKPOINT' >/dev/null
  docker restart -t 120 "$pg" >/dev/null
  wait_for 180 postgres_ready || return 1
  log "postgres is healthy"
}

show_settings() {
  local pair names=""
  for pair in $settings; do names="$names'${pair%%=*}',"; done
  psql_c "select name || '=' || current_setting(name) from pg_settings where name in (${names%,}) order by name" | tr '\n' ' '
  echo
}

# A dependant that did not reconnect on its own is restarted once.
check_dependant() {
  local name=$1 container=$2 check=$3
  if wait_for 90 "$check"; then log "$name ok"; return 0; fi
  log "$name did not recover; restarting $container"
  docker restart -t 30 "$container" >/dev/null
  if wait_for 120 "$check"; then log "$name ok after restart"; return 0; fi
  log "$name still failing"
  return 1
}

cms_jobs_running() {
  [ "$(docker inspect gildra-cms-jobs-1 --format '{{.State.Running}}')" = true ] &&
    ! docker logs --since 60s gildra-cms-jobs-1 2>&1 | grep -qiE 'ECONNREFUSED|Connection terminated|terminating connection|57P01'
}

revert() {
  local pair
  log "reverting: ALTER SYSTEM RESET"
  for pair in $settings; do psql_c "ALTER SYSTEM RESET ${pair%%=*}" >/dev/null; done
  restart_postgres || { log "FATAL: postgres not healthy after revert; restore $backup/postgresql.auto.conf by hand"; exit 2; }
  show_settings
}

exec 9>"$lock"
log "waiting for the deployment lock"
flock -w "$lock_wait" 9 || { log "another deployment held the lock for ${lock_wait}s; nothing changed"; exit 75; }

log "label=$label mode=$mode settings: $settings"
docker exec "$pg" cat /var/lib/postgresql/data/postgresql.conf > "$backup/postgresql.conf"
docker exec "$pg" cat /var/lib/postgresql/data/postgresql.auto.conf > "$backup/postgresql.auto.conf"
log "before: $(show_settings)"

if [ "$mode" = --revert ]; then
  revert
  exit 0
fi
[ "$mode" = apply ] || { echo "unknown mode $mode" >&2; exit 64; }

available_gb=$(awk '/^MemAvailable:/ {print int($2 / 1048576)}' /proc/meminfo)
if [ "$available_gb" -lt "$min_available_gb" ]; then
  log "only ${available_gb} GB available (need $min_available_gb); nothing changed"
  exit 75
fi
log "memory available: ${available_gb} GB"

log "searches before:"
time_searches

for pair in $settings; do psql_c "ALTER SYSTEM SET ${pair%%=*} = '${pair#*=}'" >/dev/null; done
if ! restart_postgres; then
  log "postgres did not come back with the new settings"
  docker logs --tail 30 "$pg" 2>&1 | sed 's/^/  pg: /'
  revert
  exit 1
fi
log "after: $(show_settings)"
for pair in $settings; do
  # pg reports 4GB as 4GB and 1.1 as 1.1, so the text compares as set.
  [ "$(psql_c "show ${pair%%=*}")" = "${pair#*=}" ] || { log "${pair%%=*} did not take effect"; revert; exit 1; }
done

if ! wait_for 120 api_reads_catalog; then
  log "the API cannot read the catalog after the restart"
  revert
  exit 1
fi
log "api ok"
failed=0
check_dependant cms gildra-cms-1 cms_reads_pages || failed=1
check_dependant cms-jobs gildra-cms-jobs-1 cms_jobs_running || failed=1
check_dependant scraper gildra-scraper-worker-1 scraper_healthy || failed=1
check_dependant web gildra-web-1 web_serves_database || failed=1

log "searches after (cold buffers):"
time_searches
log "searches after (second pass):"
time_searches
docker ps --format '{{.Names}} {{.Status}}' | grep -E '^gildra-(postgres|api|cms|cms-jobs|scraper-worker|web)-1 ' | sed 's/^/  /'
[ "$failed" = 0 ] && log "done" || log "done, but a dependant needs attention (see above)"
exit "$failed"
