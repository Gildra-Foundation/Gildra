#!/bin/sh

set -eu

environment_file=${1:-/opt/gildra/.env}

fail() {
  printf 'deploy: %s\n' "$*" >&2
  exit 1
}

[ -r "$environment_file" ] || fail "runtime environment file is not readable: $environment_file"

temporary=$(mktemp "${environment_file}.tmp.XXXXXX") ||
  fail "could not create a temporary runtime environment file beside $environment_file"
cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT HUP INT TERM

cp "$environment_file" "$temporary"
changed=false

ensure_entry() {
  key=$1
  value=$2
  count=$(grep -c "^${key}=" "$environment_file" || true)
  [ "$count" -le 1 ] || fail "$environment_file must contain exactly one $key entry"
  if [ "$count" -eq 0 ]; then
    printf '%s=%s\n' "$key" "$value" >> "$temporary"
    printf 'deploy: added missing %s runtime policy entry\n' "$key" >&2
    changed=true
  fi
}

# These defaults are fail-safe for the existing single-host production
# deployment: the catalog stays private and recovery remains server-local.
# Secrets are never generated or written here.
ensure_entry CATALOG_ACCESS_MODE private
ensure_entry CATALOG_RECOVERY_POLICY verified_same_host
ensure_entry CATALOG_BACKUP_LOCAL_DIRECTORY /var/lib/gildra/catalog-backups

if [ "$changed" = true ]; then
  chmod 600 "$temporary"
  mv -f "$temporary" "$environment_file"
fi

trap - EXIT HUP INT TERM
rm -f "$temporary"
