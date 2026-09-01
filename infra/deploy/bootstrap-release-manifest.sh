#!/bin/sh

set -eu

manifest=${1:-/opt/gildra/current-release.env}

fail() {
  printf 'deploy: %s\n' "$*" >&2
  exit 1
}

[ -r "$manifest" ] || fail "release manifest is not readable: $manifest"
command -v docker >/dev/null 2>&1 || fail 'docker is required to normalize the release manifest'
command -v grep >/dev/null 2>&1 || fail 'grep is required to normalize the release manifest'
command -v sed >/dev/null 2>&1 || fail 'sed is required to normalize the release manifest'
command -v awk >/dev/null 2>&1 || fail 'awk is required to normalize the release manifest'

web_image=$(sed -n 's/^WEB_IMAGE=//p' "$manifest")
api_image=$(sed -n 's/^API_IMAGE=//p' "$manifest")
cms_image=$(sed -n 's/^CMS_IMAGE=//p' "$manifest")
scraper_image=$(sed -n 's/^SCRAPER_IMAGE=//p' "$manifest")

for key in WEB_IMAGE API_IMAGE CMS_IMAGE SCRAPER_IMAGE; do
  count=$(grep -c "^${key}=" "$manifest" || true)
  [ "$count" -eq 1 ] || fail "$manifest must contain exactly one $key entry"
done

normalize_image_id() {
  image=$1
  prefix=$2
  case "$image" in
    sha256:*)
      printf '%s\n' "$image" | grep -Eq '^sha256:[0-9a-f]{64}$' ||
        fail "legacy image id is invalid for $prefix: $image"
      tag=$(docker image inspect --format '{{range .RepoTags}}{{println .}}{{end}}' "$image" 2>/dev/null |
        awk -v prefix="$prefix:" 'index($0, prefix) == 1 { print; exit }')
      [ -n "$tag" ] || fail "could not map legacy image id to a local $prefix tag: $image"
      printf '%s\n' "$tag"
      ;;
    *) printf '%s\n' "$image" ;;
  esac
}

normalized_web=$(normalize_image_id "$web_image" gildra-web)
normalized_api=$(normalize_image_id "$api_image" gildra-api)
normalized_cms=$(normalize_image_id "$cms_image" gildra-cms)
normalized_scraper=$(normalize_image_id "$scraper_image" gildra-scraper)

if [ "$normalized_web" = "$web_image" ] &&
  [ "$normalized_api" = "$api_image" ] &&
  [ "$normalized_cms" = "$cms_image" ] &&
  [ "$normalized_scraper" = "$scraper_image" ]; then
  printf 'deploy: release manifest already uses usable image references\n'
  exit 0
fi

temporary=$(mktemp "${manifest}.tmp.XXXXXX") || fail "could not create a temporary release manifest beside $manifest"
cleanup() { rm -f "$temporary"; }
trap cleanup EXIT HUP INT TERM

awk \
  -v web="$normalized_web" \
  -v api="$normalized_api" \
  -v cms="$normalized_cms" \
  -v scraper="$normalized_scraper" '
  /^WEB_IMAGE=/ { print "WEB_IMAGE=" web; next }
  /^API_IMAGE=/ { print "API_IMAGE=" api; next }
  /^CMS_IMAGE=/ { print "CMS_IMAGE=" cms; next }
  /^SCRAPER_IMAGE=/ { print "SCRAPER_IMAGE=" scraper; next }
  { print }
' "$manifest" > "$temporary"
chmod 600 "$temporary"
mv -f "$temporary" "$manifest"
trap - EXIT HUP INT TERM
rm -f "$temporary"
printf 'deploy: normalized legacy image ids in %s\n' "$manifest"
