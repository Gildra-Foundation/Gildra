#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
template_file=$script_directory/gildra-notify@.service
notify_script=$script_directory/notify-unit-failure.py

[ -f "$template_file" ]
[ -f "$notify_script" ]
grep -Fxq 'ExecStart=/usr/bin/python3 /opt/gildra/infra/systemd/notify-unit-failure.py %i' "$template_file"
grep -Fq 'GILDRA_ALERT_LOG=' "$template_file"

for unit in gildra-catalog-refresh gildra-catalog-backup gildra-catalog-media-cache gildra-catalog-backup-prune; do
  grep -Fxq 'OnFailure=gildra-notify@%p.service' "$script_directory/$unit.service"
done

python3 -m py_compile "$notify_script"

work_directory=$(mktemp -d)
trap 'rm -rf "$work_directory"' EXIT
GILDRA_NOTIFY_OFFLINE=1 \
GILDRA_ALERT_LOG="$work_directory/alerts.jsonl" \
GILDRA_NOTIFY_ENV_FILE="$work_directory/missing.env" \
  python3 "$notify_script" gildra-catalog-refresh >"$work_directory/stdout"
grep -Fq '"unit": "gildra-catalog-refresh"' "$work_directory/alerts.jsonl"
grep -Fq 'gildra-catalog-refresh failed' "$work_directory/stdout"

printf '%s\n' 'test: unit failures are recorded locally and wired to gildra-notify@'
