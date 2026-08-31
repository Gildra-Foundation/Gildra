#!/bin/sh

set -eu

deployment_directory=${GILDRA_DEPLOY_DIR:-/opt/gildra}
environment_file=${GILDRA_ENV_FILE:-$deployment_directory/.env}
release_environment_file=${GILDRA_RELEASE_ENV_FILE:-$deployment_directory/current-release.env}
build_version=${CATALOG_REPAIR_BUILD_VERSION:-}

fail() {
  printf 'catalog-repair: %s\n' "$*" >&2
  exit 1
}

manifest_value() {
  key=$1
  file=$2
  count=$(grep -c "^${key}=" "$file" || true)
  [ "$count" -eq 1 ] || fail "$file must contain exactly one $key entry"
  sed -n "s/^${key}=//p" "$file"
}

[ -r "$environment_file" ] || fail "runtime environment file is not readable: $environment_file"
[ -r "$release_environment_file" ] || fail "release manifest is not readable: $release_environment_file"
for compose_file in compose.yml compose.prod.yml compose.runtime.yml; do
  [ -r "$deployment_directory/$compose_file" ] || fail "deployment file is not readable: $compose_file"
done

printf '%s\n' "$build_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' ||
  fail 'CATALOG_REPAIR_BUILD_VERSION must be a four-component numeric WoW build version'

catalog_access_mode=$(manifest_value CATALOG_ACCESS_MODE "$environment_file")
case "$catalog_access_mode" in
  public|private) ;;
  *) fail 'CATALOG_ACCESS_MODE must be public or private' ;;
esac
catalog_recovery_policy=$(manifest_value CATALOG_RECOVERY_POLICY "$environment_file")
[ "$catalog_recovery_policy" = verified_same_host ] ||
  fail 'CATALOG_RECOVERY_POLICY must be verified_same_host for a same-host repair'

for command_name in docker grep sed; do
  command -v "$command_name" >/dev/null 2>&1 || fail "required command is missing: $command_name"
done

compose() {
  docker compose \
    --env-file "$environment_file" \
    --env-file "$release_environment_file" \
    -f "$deployment_directory/compose.yml" \
    -f "$deployment_directory/compose.prod.yml" \
    -f "$deployment_directory/compose.runtime.yml" \
    "$@"
}

cd "$deployment_directory"
printf 'catalog-repair: starting explicit same-build repair for WoW build %s\n' "$build_version" >&2
compose run --rm --no-deps --entrypoint catalog-pipeline api \
  -mode apply \
  -trigger manual \
  -profile retail-foundation \
  -product wow \
  -sources wago,db2,battlenet,listfile \
  -version "$build_version" \
  -force-rebuild \
  -max-records 0 \
  -confirm-full-import \
  -publication-environment production \
  -access-mode "$catalog_access_mode" \
  -recovery-policy "$catalog_recovery_policy" \
  -timeout 8h
printf 'catalog-repair: repair pipeline completed for WoW build %s\n' "$build_version" >&2
