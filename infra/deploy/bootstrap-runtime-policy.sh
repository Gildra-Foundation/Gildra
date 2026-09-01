#!/bin/sh

set -eu

environment_file=${1:-/opt/gildra/.env}

fail() {
  printf 'deploy: %s\n' "$*" >&2
  exit 1
}

[ -r "$environment_file" ] || fail "runtime environment file is not readable: $environment_file"

deployment_directory=$(CDPATH= cd -- "$(dirname -- "$environment_file")" && pwd)

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

# Docker Compose mounts file-backed secrets as bind mounts on a regular host;
# unlike Swarm secrets, uid/gid/mode metadata in compose.backup.yml is not
# applied to those files.  Keep the files owned by root while granting the
# least-privilege backup runtime group read access.  This is required for the
# backup container (UID/GID 65532) to read the age identity and signing key.
read_env_path() {
  key=$1
  sed -n "s/^${key}=//p" "$environment_file" | head -n 1
}

grant_backup_secret_read() {
  key=$1
  default_path=$2
  secret_path=$(read_env_path "$key")
  [ -n "$secret_path" ] || secret_path=$default_path

  case "$secret_path" in
    /*) ;;
    *) fail "$key must use an absolute path" ;;
  esac
  [ -e "$secret_path" ] || return 0
  [ -f "$secret_path" ] || fail "$key does not point to a regular file: $secret_path"
  chown root:65532 "$secret_path"
  chmod 0640 "$secret_path"
  printf 'deploy: granted backup runtime read access to %s\n' "$key" >&2
}

grant_backup_secret_read CATALOG_BACKUP_AGE_IDENTITY_FILE \
  "$deployment_directory/backups/catalog_backup_age_identity"
grant_backup_secret_read CATALOG_BACKUP_SIGNING_KEY_FILE \
  "$deployment_directory/backups/catalog_backup_signing_key"

if [ "$changed" = true ]; then
  chmod 600 "$temporary"
  mv -f "$temporary" "$environment_file"
fi

trap - EXIT HUP INT TERM
rm -f "$temporary"
