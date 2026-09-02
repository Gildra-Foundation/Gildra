#!/bin/sh

# Refresh each World of Warcraft product independently. A failed edition is
# reported to systemd but never prevents the other editions from attempting a
# refresh, and every pipeline keeps its last verified release intact.
set -eu

deployment_directory=${GILDRA_DEPLOY_DIR:-/opt/gildra}
environment_file=${GILDRA_ENV_FILE:-$deployment_directory/.env}

compose() {
  /usr/bin/docker compose \
    --env-file "$environment_file" \
    --env-file "$deployment_directory/current-release.env" \
    -f "$deployment_directory/compose.yml" \
    -f "$deployment_directory/compose.prod.yml" \
    -f "$deployment_directory/compose.runtime.yml" \
    "$@"
}

run_edition() {
  product=$1
  profile=$2

  printf 'catalog-refresh: checking %s\n' "$product"
  if compose run --rm --no-deps --entrypoint catalog-build-check api \
      -product "$product" -require-update; then
    :
  else
    check_status=$?
    if [ "$check_status" -eq 1 ]; then
      printf 'catalog-refresh: %s is already current\n' "$product"
      return 0
    fi
    printf 'catalog-refresh: build check failed for %s (status %s)\n' "$product" "$check_status" >&2
    return "$check_status"
  fi

  printf 'catalog-refresh: importing %s with profile %s\n' "$product" "$profile"
  compose run --rm --no-deps --entrypoint catalog-pipeline api \
    -mode apply -trigger schedule -product "$product" -profile "$profile" \
    -sources wago,db2,battlenet,listfile -use-checked-build \
    -max-records 0 -confirm-full-import -publication-environment production \
    -access-mode private -recovery-policy verified_same_host -timeout 8h
}

failures=0
for edition in \
  'wow retail-foundation' \
  'wow_classic classic-foundation-v1' \
  'wow_classic_era classic-era-foundation-v1' \
  'wow_classic_hardcore classic-hardcore-foundation-v1'; do
  # The values are controlled by this file and contain no shell syntax.
  set -- $edition
  if ! run_edition "$1" "$2"; then
    failures=$((failures + 1))
    printf 'catalog-refresh: %s failed; continuing with remaining editions\n' "$1" >&2
  fi
done

if [ "$failures" -ne 0 ]; then
  printf 'catalog-refresh: %s edition(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'catalog-refresh: all editions are current or refreshed\n'
