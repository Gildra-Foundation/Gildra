#!/bin/sh

set -eu

repository_directory=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
test_directory=$(mktemp -d)
trap 'rm -rf "$test_directory"' EXIT HUP INT TERM

for name in age-identity signing-key; do
  printf 'must-not-appear-%s\n' "$name" > "$test_directory/$name"
  chmod 600 "$test_directory/$name"
done

configuration=$test_directory/compose.yml
CATALOG_BACKUP_AGE_IDENTITY_FILE=$test_directory/age-identity \
CATALOG_BACKUP_SIGNING_KEY_FILE=$test_directory/signing-key \
docker compose \
  --env-file "$repository_directory/.env.example" \
  -f "$repository_directory/compose.yml" \
  -f "$repository_directory/compose.prod.yml" \
  -f "$repository_directory/compose.runtime.yml" \
  -f "$repository_directory/compose.backup.yml" \
  --profile operations \
  config > "$configuration"

for path in \
  /run/secrets/catalog_backup_age_identity \
  /run/secrets/catalog_backup_signing_key; do
  grep -q "$path" "$configuration"
done

for identity in catalog_backup_age_identity catalog_backup_signing_key; do
  grep -qE "uid: [\"']?65532[\"']?" "$configuration"
  grep -qE "gid: [\"']?65532[\"']?" "$configuration"
  grep -qE "mode: [\"']?0440[\"']?" "$configuration"
done

if grep -q 'must-not-appear' "$configuration"; then
  printf 'test: rendered Compose configuration exposed secret contents\n' >&2
  exit 1
fi

printf 'test: backup Compose uses file references without rendering secret contents\n'
