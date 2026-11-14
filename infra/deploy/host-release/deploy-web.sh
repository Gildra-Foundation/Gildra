#!/bin/bash
# Web-only release of a host-built image to wowarcana.com (web container + nginx reload).
# Same mechanism as the earlier host releases (.artifacts/atlas/deploy-web-host.sh,
# docs/releases.md): deployment lock, previous manifest kept as
# /opt/gildra/<patch>-previous.env, smoke checks through nginx, automatic rollback.
#   sudo bash deploy-web.sh <image> <patch> <expected-previous-image> <checks.tsv|/dev/null>
# Called by release.py (gildra-ship skill). checks.tsv: "path<TAB>substring" markers of the release.
set -euo pipefail
ca=$(dirname "$(readlink -f "$0")")/origin-ca.pem
checks=${4:-/dev/null}

root=/opt/gildra
image=${1:?usage: deploy-web.sh <image> <patch> <expected-previous>}
patch=${2:?usage: deploy-web.sh <image> <patch> <expected-previous>}
expected_previous=${3:?usage: deploy-web.sh <image> <patch> <expected-previous>}
manifest=$root/current-release.env
backup=$root/$patch-previous.env
lock=/run/lock/gildra-deploy.lock
bridge=gildra-web-bridge
armed=false
smoke_pids=()

compose() {
  docker compose --project-directory "$root" --env-file "$root/.env" --env-file "$manifest" \
    -f "$root/compose.yml" -f "$root/compose.prod.yml" -f "$root/compose.runtime.yml" "$@"
}

healthy() {
  local container observed health
  container=$(compose ps -q web) || return 1
  [ -n "$container" ] || return 1
  observed=$(docker inspect --format '{{.Config.Image}}' "$container") || return 1
  [ "$observed" = "$1" ] || return 1
  health=$(docker inspect --format '{{.State.Health.Status}}' "$container") || return 1
  [ "$health" = healthy ] || return 1
}

reload_nginx() {
  local nginx
  nginx=$(compose ps -q nginx) || return 1
  [ -n "$nginx" ] || return 1
  docker exec "$nginx" nginx -t >/dev/null 2>&1 || return 1
  docker exec "$nginx" nginx -s reload >/dev/null || return 1
}

# The new image next to the old one under the service's own name. nginx learns both addresses on
# reload and passes a request to the other one when the first refuses it, so no request meets a
# closed port while the service container is replaced (19 of 22 deploys answered 502 before).
# A new image that does not start is found here, before production is touched.
bridge_up() {
  local address deadline
  docker rm -f "$bridge" >/dev/null 2>&1 || true
  WEB_IMAGE=$1 compose run -d --no-deps --pull never --use-aliases --name "$bridge" web >/dev/null || return 1
  address=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$bridge") || return 1
  deadline=$((SECONDS + ${GILDRA_BRIDGE_WAIT:-90}))
  while [ "$SECONDS" -lt "$deadline" ]; do
    curl --silent --fail --max-time 5 --output /dev/null "http://$address:3000/" && return 0
    [ "$(docker inspect --format '{{.State.Running}}' "$bridge" 2>/dev/null)" = true ] || return 1
    sleep 0.2
  done
  return 1
}

# SIGTERM first: the server finishes the requests it has and closes its port, so nginx sees a
# refusal and passes on. A killed container vanishes with its requests (502 or a hung request).
bridge_down() {
  local address pid
  address=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$bridge" 2>/dev/null) || return 0
  # Refuse new connections for a moment while the container still answers: every nginx worker
  # that tries it is refused at once, goes to the other address and stops trying this one.
  pid=$(docker inspect --format '{{.State.Pid}}' "$bridge" 2>/dev/null) || pid=0
  if [ "$pid" -gt 0 ] && nsenter --target "$pid" --net iptables -I INPUT -p tcp --dport 3000 --syn -j REJECT --reject-with tcp-reset 2>/dev/null; then sleep 1.5; fi
  docker stop --time 20 "$bridge" >/dev/null || true
  docker rm -f "$bridge" >/dev/null || return 1
  forget_address "$address"
  reload_nginx
}

# nginx keeps the hardware address of a container that is gone and would wait a minute for it to
# answer. Without the entry the connection fails within three seconds and goes to the other address.
forget_address() {
  local pid
  [ -n "$1" ] || return 0
  pid=$(docker inspect --format '{{.State.Pid}}' "$(compose ps -q nginx)" 2>/dev/null) || return 0
  nsenter --target "$pid" --net ip neigh flush to "$1" 2>/dev/null || true
}

# Replace the service container with <image> without a gap.
switch_web() {
  bridge_up "$1" || { echo "$patch: the new image did not start next to production" >&2; return 1; }
  reload_nginx || return 1
  WEB_IMAGE=$1 compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 web || return 1
  reload_nginx || return 1
  bridge_down
}

drain_smoke() {
  local pid status=0
  for pid in "${smoke_pids[@]}"; do wait "$pid" || status=1; done
  smoke_pids=()
  return "$status"
}

smoke() {
  local path
  for path in / /ru /wow /ru/wow /login /ru/login /tier-lists /ru/tier-lists /database /ru/database /sitemap.xml \
      /wow/raids /ru/wow/raids /wow/raids/venomous-abyss /ru/wow/raids/venomous-abyss /wow/mythic-plus /ru/wow/mythic-plus /wow/mythic-plus/meta /ru/wow/mythic-plus/meta /ru/wow/characters /ru/talents/fury-warrior \
      /ru/search /library /ru/library /ru/privacy /wow/auction /ru/wow/auction /wow/lairs /ru/wow/dungeons /ru/wow/gear /ru/wow/rotation/fury-warrior; do
    curl --fail --silent --show-error --cacert "$ca" --retry 5 --retry-delay 2 --max-time 20 \
      --resolve wowarcana.com:443:127.0.0.1 "https://wowarcana.com$path" >/dev/null &
    smoke_pids+=("$!")
    if [ "${#smoke_pids[@]}" -ge 4 ]; then
      drain_smoke || { echo "smoke batch failed near: $path" >&2; return 1; }
    fi
  done
  drain_smoke || { echo "smoke batch failed" >&2; return 1; }
  curl --fail --silent --show-error --cacert "$ca" --max-time 15 \
    --resolve api.wowarcana.com:443:127.0.0.1 https://api.wowarcana.com/readyz >/dev/null || { echo "smoke failed: api readyz" >&2; return 1; }
}

rollback() {
  echo "$patch: restoring $previous" >&2
  WEB_IMAGE=$previous compose up -d --no-deps --no-build --pull never --wait --wait-timeout 180 web || return 1
  reload_nginx || return 1
  bridge_down || return 1
  healthy "$previous" || return 1
  python3 - "$backup" "$manifest" <<'PYROLLBACK' || return 1
from pathlib import Path
import os,sys
backup,manifest=map(Path,sys.argv[1:]);new=manifest.with_name(manifest.name+'.web-only-rollback')
web=[x for x in backup.read_text().splitlines() if x.startswith('WEB_')]
other=[x for x in manifest.read_text().splitlines() if not x.startswith('WEB_')]
fd=os.open(new,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as stream:stream.write('\n'.join(other+web)+'\n');stream.flush();os.fsync(stream.fileno())
os.replace(new,manifest)
PYROLLBACK
  smoke || return 1
  echo "$patch: rollback verified" >&2
}

on_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  drain_smoke || true
  if [ "$status" -ne 0 ] && [ "$armed" = true ]; then rollback || { echo "$patch: ROLLBACK FAILED" >&2; status=2; }; fi
  bridge_down || true
  exit "$status"
}

exec 9>"$lock"
flock -n 9 || { echo "$patch: another deployment is running" >&2; exit 1; }
[ "$(docker image inspect --format '{{index .Config.Labels "net.gildra.patch"}}' "$image")" = "$patch" ]
previous=$(sed -n 's/^WEB_IMAGE=//p' "$manifest")
[ "$previous" = "$expected_previous" ] || { echo "production changed: manifest WEB_IMAGE=$previous" >&2; exit 1; }
docker image inspect "$previous" >/dev/null
healthy "$previous"
smoke

umask 077
[ ! -e "$backup" ]
cp -n "$manifest" "$backup"
armed=true
trap on_exit EXIT
trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM

switch_web "$image"
healthy "$image"
smoke
# Markers of this release (checks.tsv); the catalog API may be briefly busy, so retry.
body=$(mktemp)
markers_ok() {
  local path needle
  while IFS=$'\t' read -r path needle; do
    [ -n "$path" ] && [ -n "$needle" ] && [ "${path#\#}" = "$path" ] || continue
    curl --fail --silent --show-error --cacert "$ca" --max-time 30 --resolve wowarcana.com:443:127.0.0.1 "https://wowarcana.com$path" > "$body" || return 1
    grep -Fq -- "$needle" "$body" || { echo "marker missing: $path $needle" >&2; return 1; }
  done < "$checks"
}
for attempt in 1 2 3 4 5 6; do markers_ok && break; [ "$attempt" = 6 ] && { echo "release markers failed" >&2; exit 1; }; sleep 10; done
rm -f "$body"
# Routes removed on purpose stay 404.
for path in /blueprints /analytics /ru/analytics /games/world-of-warcraft /wow/articles /reader /cms-preview; do
  code=$(curl --silent --output /dev/null --write-out '%{http_code}' --cacert "$ca" --max-time 20 --resolve wowarcana.com:443:127.0.0.1 "https://wowarcana.com$path")
  [ "$code" = 404 ] || { echo "expected 404 for $path, got $code" >&2; exit 1; }
done

tmp=$manifest.tmp.$$
grep -vE '^(WEB_IMAGE|WEB_SOURCE_REVISION|WEB_HOTFIX_SOURCE_REVISION|WEB_DEPLOYED_AT)=' "$manifest" > "$tmp"
{
  printf 'WEB_IMAGE=%s\n' "$image"
  printf 'WEB_SOURCE_REVISION=%s\n' "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
  printf 'WEB_HOTFIX_SOURCE_REVISION=%s\n' "$patch"
  printf 'WEB_DEPLOYED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$tmp"
chmod 600 "$tmp"; mv -f "$tmp" "$manifest"
armed=false
trap - EXIT HUP INT TERM
echo "$patch: $image is live, smoke checks passed; previous image $previous kept for rollback ($backup)"
