#!/bin/sh
# Put a web image on the staging copy (infra/staging/compose.yml) and check it.
#   sudo sh infra/deploy/deploy-web-staging.sh <image>
# Then run the release gate against it, e.g.
#   SMOKE_URL=http://127.0.0.1:3200 npm run smoke:routes
# and promote the same image to production with the usual web deploy.
set -eu

image=${1:?usage: deploy-web-staging.sh <image>}
root=${GILDRA_STAGING_ROOT:-/opt/gildra-staging}
state=$root/current.env
lock=/run/lock/gildra-staging.lock

exec 9>"$lock"
flock -n 9 || { echo "staging: another staging deploy is running" >&2; exit 1; }
docker image inspect "$image" >/dev/null
dsn=$(sed -n 's/^SENTRY_WEB_DSN=//p' /opt/gildra/.env)

umask 077
[ -f "$state" ] && cp -f "$state" "$state.previous"
printf 'WEB_STAGING_IMAGE=%s\nSENTRY_WEB_DSN=%s\nSTAGING_DEPLOYED_AT=%s\n' "$image" "$dsn" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$state"
docker compose --project-directory "$root" --env-file "$state" -f "$root/compose.yml" \
  up -d --no-build --pull never --wait --wait-timeout 180 web-staging

for path in / /ru /wow /tier-lists /wow/raids /database /search /privacy; do
  code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 "http://127.0.0.1:3200$path")
  [ "$code" = 200 ] || { echo "staging: $path answered $code" >&2; exit 1; }
done
echo "staging: $image is up at http://127.0.0.1:3200"
