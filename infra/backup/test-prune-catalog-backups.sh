#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
prune_script=$script_directory/prune-catalog-backups.py
service_file=$script_directory/../systemd/gildra-catalog-backup-prune.service
timer_file=$script_directory/../systemd/gildra-catalog-backup-prune.timer

[ -f "$prune_script" ]
[ -f "$service_file" ]
[ -f "$timer_file" ]
grep -Fxq 'ExecStart=/usr/bin/python3 /opt/gildra/infra/backup/prune-catalog-backups.py --apply' "$service_file"
grep -Fq 'Unit=gildra-catalog-backup-prune.service' "$timer_file"
python3 -m py_compile "$prune_script"

work_directory=$(mktemp -d)
trap 'rm -rf "$work_directory"' EXIT
volume=$work_directory/catalog-backups
prefix=file:///backups/catalog-backups/

make_backup() {
  mkdir -p "$volume/wow/$1"
  printf 'dump' >"$volume/wow/$1/$2.dump.age"
  printf '{}' >"$volume/wow/$1/$2.dump.age.manifest.json"
}
# Recent daily backups, two in the same older week, one ancient, one failed run.
make_backup 2026/09/03 postgres-recent-a
make_backup 2026/09/02 postgres-recent-b
make_backup 2026/08/20 postgres-week34-newer
make_backup 2026/08/18 postgres-week34-older
make_backup 2026/07/01 postgres-ancient
make_backup 2026/09/03 postgres-failed
# An orphan nobody references, old enough to be removed.
mkdir -p "$volume/wow/2026/09/01"
printf 'stale' >"$volume/wow/2026/09/01/postgres-orphan.dump.age"
touch -d '2026-09-01 00:00:00' "$volume/wow/2026/09/01/postgres-orphan.dump.age"

cat >"$work_directory/manifests.json" <<EOF
[
  {"id": "11111111-1111-4111-8111-111111111111", "status": "verified", "timestamp": "2026-09-03T03:00:00+00:00", "storage_uri": "${prefix}wow/2026/09/03/postgres-recent-a.dump.age"},
  {"id": "22222222-2222-4222-8222-222222222222", "status": "verified", "timestamp": "2026-09-02T03:00:00+00:00", "storage_uri": "${prefix}wow/2026/09/02/postgres-recent-b.dump.age"},
  {"id": "33333333-3333-4333-8333-333333333333", "status": "verified", "timestamp": "2026-08-20T03:00:00+00:00", "storage_uri": "${prefix}wow/2026/08/20/postgres-week34-newer.dump.age"},
  {"id": "44444444-4444-4444-8444-444444444444", "status": "verified", "timestamp": "2026-08-18T03:00:00+00:00", "storage_uri": "${prefix}wow/2026/08/18/postgres-week34-older.dump.age"},
  {"id": "55555555-5555-4555-8555-555555555555", "status": "verified", "timestamp": "2026-07-01T03:00:00+00:00", "storage_uri": "${prefix}wow/2026/07/01/postgres-ancient.dump.age"},
  {"id": "66666666-6666-4666-8666-666666666666", "status": "failed", "timestamp": "2026-09-03T22:00:00+00:00", "storage_uri": "${prefix}wow/2026/09/03/postgres-failed.dump.age"}
]
EOF

run_prune() {
  python3 "$prune_script" "$@" --volume-dir "$volume" --uri-prefix "$prefix" \
    --manifests-json "$work_directory/manifests.json" --now 2026-09-04T09:00:00+00:00
}

run_prune >"$work_directory/dry.json"
grep -Fq '"mode": "dry-run"' "$work_directory/dry.json"
[ -f "$volume/wow/2026/07/01/postgres-ancient.dump.age" ]

run_prune --apply >"$work_directory/apply.json"
grep -Fq '"kept": 3' "$work_directory/apply.json"
grep -Fq '44444444-4444-4444-8444-444444444444' "$work_directory/apply.json"
grep -Fq '55555555-5555-4555-8555-555555555555' "$work_directory/apply.json"
[ -f "$volume/wow/2026/09/03/postgres-recent-a.dump.age" ]
[ -f "$volume/wow/2026/09/02/postgres-recent-b.dump.age" ]
[ -f "$volume/wow/2026/08/20/postgres-week34-newer.dump.age" ]
[ ! -e "$volume/wow/2026/08/18/postgres-week34-older.dump.age" ]
[ ! -e "$volume/wow/2026/08/18/postgres-week34-older.dump.age.manifest.json" ]
[ ! -e "$volume/wow/2026/07/01/postgres-ancient.dump.age" ]
[ ! -e "$volume/wow/2026/09/03/postgres-failed.dump.age" ]
[ ! -e "$volume/wow/2026/09/01/postgres-orphan.dump.age" ]
[ ! -d "$volume/wow/2026/07" ]

printf '%s\n' 'test: backup retention keeps 7 daily and 4 weekly verified backups and removes the rest'
