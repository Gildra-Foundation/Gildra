#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
backup_script=$script_directory/run-cms-backup.sh
restore_script=$script_directory/restore-cms-backup.sh
test_directory=$(mktemp -d)
trap 'rm -rf "$test_directory"' EXIT HUP INT TERM

fake_bin=$test_directory/bin
deployment_directory=$test_directory/deployment
state_directory=$test_directory/state
backup_root=$test_directory/backups
fake_state=$test_directory/fake-state
media=$test_directory/media
mkdir -p "$fake_bin" "$deployment_directory" "$fake_state" "$media"
printf 'png\n' > "$media/a.png"
for file in .env compose.yml compose.prod.yml; do
  : > "$deployment_directory/$file"
done

cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/bin/sh
set -eu
case $1 in
  compose)
    printf 'PGDMP fake custom-format dump\n'
    ;;
  run)
    printf '%s\n' "$*" >> "$TEST_FAKE_STATE/run-calls"
    case " $* " in
      *" tar "*) tar -C "$TEST_MEDIA" -czf - . ;;
      *" pg_restore --list "*)
        cat >/dev/null
        [ "${TEST_FAIL_VERIFY:-false}" != true ] || exit 1
        ;;
      *) printf 'container\n' ;;
    esac
    ;;
  exec)
    case " $* " in
      *"count(*) from payload_migrations"*) printf '3\n' ;;
      *"information_schema.tables"*) printf '12\n' ;;
      *"pg_restore"*) cat >/dev/null ;;
    esac
    ;;
  rm) exit 0 ;;
  *) exit 64 ;;
esac
FAKE_DOCKER
printf '#!/bin/sh\nprintf "0123456789abcdef0123456789abcdef0123456789abcdef\\n"\n' > "$fake_bin/openssl"
printf '#!/bin/sh\nexit 0\n' > "$fake_bin/flock"
printf '#!/bin/sh\nexit 0\n' > "$fake_bin/sleep"
chmod +x "$fake_bin/docker" "$fake_bin/openssl" "$fake_bin/flock" "$fake_bin/sleep"

digest=postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
run_backup() {
  PATH="$fake_bin:$PATH" \
  TEST_FAKE_STATE=$fake_state TEST_MEDIA=$media \
  GILDRA_DEPLOYMENT_DIRECTORY=$deployment_directory \
  CMS_BACKUP_DIRECTORY=$backup_root \
  CMS_BACKUP_STATE_DIRECTORY=$state_directory \
  CMS_BACKUP_TOOL_IMAGE=$digest \
  "$@"
}

run_backup "$backup_script"
published=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20*Z')
[ -f "$published/gildra_cms.dump" ] && [ -f "$published/cms_media.tar.gz" ] && [ -f "$published/SHA256SUMS" ]
(cd "$published" && sha256sum -c SHA256SUMS >/dev/null)
tar -tzf "$published/cms_media.tar.gz" | grep -q 'a.png'
grep -q '^STATUS=verified$' "$state_directory/last-run.env"
if find "$backup_root" -name '.partial.*' | grep -q .; then
  printf 'test: partial backup directory was not removed\n' >&2
  exit 1
fi
grep -q 'readonly' "$fake_state/run-calls"

# A failed verification must not publish a new backup nor touch the old one.
sleep 1 2>/dev/null || true
if run_backup env TEST_FAIL_VERIFY=true "$backup_script" >/dev/null 2>&1; then
  printf 'test: unverifiable dump unexpectedly succeeded\n' >&2
  exit 1
fi
grep -q '^STATUS=failed$' "$state_directory/last-run.env"
[ "$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | wc -l)" -eq 1 ]
[ -f "$published/gildra_cms.dump" ]
if find "$backup_root" -name '.partial.*' | grep -q .; then
  printf 'test: failed run left partial data\n' >&2
  exit 1
fi

# Unpinned image is rejected.
if run_backup env CMS_BACKUP_TOOL_IMAGE=postgres:17 "$backup_script" >/dev/null 2>&1; then
  printf 'test: unpinned tool image accepted\n' >&2
  exit 1
fi

# Retention removes only old published backups.
old=$backup_root/20200101T000000Z
mkdir -p "$old"
touch -d '2020-01-01' "$old"
run_backup env CMS_BACKUP_RETENTION_DAYS=14 "$backup_script"
[ ! -d "$old" ]
[ -d "$published" ]

# Restore rehearsal: success, then corrupted checksum.
output=$(run_backup "$restore_script" "$published")
printf '%s\n' "$output" | grep -q 'cms restore rehearsal ok: .* tables=12 migrations=3 media_files=1'
printf 'tampered\n' >> "$published/cms_media.tar.gz"
if run_backup "$restore_script" "$published" >/dev/null 2>&1; then
  printf 'test: restore accepted a corrupted backup\n' >&2
  exit 1
fi

printf 'test: cms backup publishes verified backups, keeps old ones on failure and rehearses restore\n'
