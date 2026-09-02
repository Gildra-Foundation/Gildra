#!/bin/sh

# Refresh each World of Warcraft product independently. A failed edition is
# reported to systemd but never prevents the other editions from attempting a
# refresh, and every pipeline keeps its last verified release intact.
set -eu

deployment_directory=${GILDRA_DEPLOY_DIR:-/opt/gildra}
environment_file=${GILDRA_ENV_FILE:-$deployment_directory/.env}
# The catalog access mode follows the runtime environment file (public since
# 2026-09-02); fall back to public when the entry is missing.
catalog_access_mode=$(sed -n 's/^CATALOG_ACCESS_MODE=//p' "$environment_file" | head -n 1)
case "$catalog_access_mode" in
  public|private) ;;
  *) catalog_access_mode=public ;;
esac

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
  if compose run --rm --no-deps --entrypoint catalog-build-check catalog-pipeline \
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

  # Each production import must pass its profile's complete source set
  # (backend/internal/catalogpipeline/pipeline.go): Raidbots supplies the
  # retail talent trees, the classic editions have no Wago or Raidbots data.
  case "$profile" in
    retail-foundation) sources=wago,raidbots,db2,battlenet,listfile ;;
    *) sources=db2,battlenet,listfile ;;
  esac
  printf 'catalog-refresh: importing %s with profile %s (sources %s, access %s)\n' \
    "$product" "$profile" "$sources" "$catalog_access_mode"
  compose run --rm --no-deps catalog-pipeline \
    -mode apply -trigger schedule -product "$product" -profile "$profile" \
    -sources "$sources" -use-checked-build \
    -max-records 0 -confirm-full-import -publication-environment production \
    -access-mode "$catalog_access_mode" -recovery-policy verified_same_host -timeout 8h
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
