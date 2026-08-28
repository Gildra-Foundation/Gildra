#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
backup_script=$script_directory/run-catalog-backup.sh
test_directory=$(mktemp -d)
trap 'rm -rf "$test_directory"' EXIT HUP INT TERM

fake_bin=$test_directory/bin
deployment_directory=$test_directory/deployment
state_directory=$test_directory/state
fake_state=$test_directory/fake-state
mkdir -p "$fake_bin" "$deployment_directory" "$fake_state"

for file in .env current-release.env compose.yml compose.prod.yml compose.runtime.yml compose.backup.yml; do
  : > "$deployment_directory/$file"
done

grep -q 'catalog_backups:/var/lib/gildra/catalog-backups' "$script_directory/../../compose.yml"

cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/bin/sh
set -eu

case $1 in
  compose)
    case " $* " in
      *" CATALOG_BACKUP_PREFLIGHT=true "*)
        printf '1\n' > "$TEST_FAKE_STATE/preflight"
        if [ "${TEST_FAIL_PREFLIGHT:-false}" = true ]; then
          exit 70
        fi
        printf '{"mode":"configuration","product":"wow","status":"ok"}\n'
        ;;
      *)
        printf '1\n' > "$TEST_FAKE_STATE/backup"
        printf '{"manifestId":"00000000-0000-0000-0000-000000000001","restoreVerified":true,"sourceRestoreMatch":true}\n'
        ;;
    esac
    ;;
  volume)
    printf '%s\n' "$*" >> "$TEST_FAKE_STATE/volume-calls"
    exit 0
    ;;
  run)
    printf '%s\n' "$*" >> "$TEST_FAKE_STATE/run-calls"
    exit 0
    ;;
  network|exec|rm) exit 0 ;;
  *) exit 64 ;;
esac
FAKE_DOCKER

cat > "$fake_bin/openssl" <<'FAKE_OPENSSL'
#!/bin/sh
printf '0123456789abcdef0123456789abcdef0123456789abcdef\n'
FAKE_OPENSSL

cat > "$fake_bin/flock" <<'FAKE_FLOCK'
#!/bin/sh
exit 0
FAKE_FLOCK

chmod +x "$fake_bin/docker" "$fake_bin/openssl" "$fake_bin/flock"

PATH="$fake_bin:$PATH" \
TEST_FAKE_STATE=$fake_state \
GILDRA_DEPLOYMENT_DIRECTORY=$deployment_directory \
GILDRA_BACKUP_STATE_DIRECTORY=$state_directory \
CATALOG_BACKUP_RESTORE_IMAGE=postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
CATALOG_BACKUP_DOCKER_NETWORK=gildra_default \
"$backup_script"

[ -f "$fake_state/preflight" ]
[ -f "$fake_state/backup" ]
grep -q '^STATUS=verified$' "$state_directory/last-run.env"
grep -q '^EXIT_CODE=0$' "$state_directory/last-run.env"
grep -q '"restoreVerified":true' "$state_directory/last-success.json"
grep -q '^volume create .*gildra-catalog-restore-.*-data$' "$fake_state/volume-calls"
grep -q '^volume rm -f gildra-catalog-restore-.*-data$' "$fake_state/volume-calls"
grep -q -- '--mount type=volume,src=gildra-catalog-restore-.*-data,dst=/var/lib/postgresql/data' "$fake_state/run-calls"
if grep -q -- '--tmpfs' "$fake_state/run-calls"; then
  printf 'test: backup restore still uses a bounded tmpfs\n' >&2
  exit 1
fi
successful_result=$(cat "$state_directory/last-success.json")
if find "$state_directory" -maxdepth 1 -type f \( -name 'runtime.*' -o -name 'result.*' \) | grep -q .; then
  printf 'test: temporary backup state was not removed\n' >&2
  exit 1
fi

if PATH="$fake_bin:$PATH" \
  TEST_FAKE_STATE=$fake_state \
  TEST_FAIL_PREFLIGHT=true \
  GILDRA_DEPLOYMENT_DIRECTORY=$deployment_directory \
  GILDRA_BACKUP_STATE_DIRECTORY=$state_directory \
  CATALOG_BACKUP_RESTORE_IMAGE=postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  CATALOG_BACKUP_DOCKER_NETWORK=gildra_default \
  "$backup_script" >/dev/null 2>&1; then
  printf 'test: invalid backup preflight unexpectedly succeeded\n' >&2
  exit 1
fi

grep -q '^STATUS=failed$' "$state_directory/last-run.env"
grep -q '^EXIT_CODE=70$' "$state_directory/last-run.env"
[ "$(cat "$state_directory/last-success.json")" = "$successful_result" ] || {
  printf 'test: failed backup replaced the last successful recovery evidence\n' >&2
  exit 1
}

printf 'test: backup wrapper preserved verified evidence after a failed retry\n'
