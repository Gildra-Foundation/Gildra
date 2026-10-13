#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
template_file=$script_directory/gildra-notify@.service
recovery_template=$script_directory/gildra-notify-ok@.service
notify_script=$script_directory/notify-unit-failure.py

[ -f "$template_file" ]
[ -f "$recovery_template" ]
[ -f "$notify_script" ]
grep -Fxq 'ExecStart=/usr/bin/python3 /opt/gildra/infra/systemd/notify-unit-failure.py %i' "$template_file"
grep -Fxq 'ExecStart=/usr/bin/python3 /opt/gildra/infra/systemd/notify-unit-failure.py --recovered %i' "$recovery_template"
grep -Fq 'GILDRA_ALERT_LOG=' "$template_file"

for unit in gildra-catalog-refresh gildra-catalog-backup gildra-catalog-media-cache gildra-catalog-backup-prune gildra-image-prune; do
  grep -Fxq 'OnFailure=gildra-notify@%p.service' "$script_directory/$unit.service"
  grep -Eq '^OnSuccess=gildra-notify-ok@%p\.service( |$)' "$script_directory/$unit.service"
done
# The import follows a verified backup instead of racing it on a timer.
grep -Fxq 'OnSuccess=gildra-notify-ok@%p.service gildra-catalog-refresh.service' "$script_directory/gildra-catalog-backup.service"
[ ! -e "$script_directory/gildra-catalog-refresh.timer" ]
sh -n "$script_directory/install-host-units.sh"

python3 -m py_compile "$notify_script"

work_directory=$(mktemp -d)
trap 'rm -rf "$work_directory"' EXIT
notify() {
  GILDRA_NOTIFY_OFFLINE=1 \
  GILDRA_ALERT_LOG="$work_directory/alerts.jsonl" \
  GILDRA_NOTIFY_ENV_FILE="$work_directory/missing.env" \
  GILDRA_NOTIFY_NOW="$1" \
    python3 "$notify_script" $2 >"$work_directory/stdout"
}

notify 2026-10-12T04:00:00+00:00 gildra-catalog-refresh
grep -Fq '"unit": "gildra-catalog-refresh"' "$work_directory/alerts.jsonl"
grep -Fq 'сбой gildra-catalog-refresh' "$work_directory/stdout"
! grep -Fq 'Telegram skipped' "$work_directory/stdout"

# A repeat within six hours is logged but not messaged again.
notify 2026-10-12T05:00:00+00:00 gildra-catalog-refresh
grep -Fq 'Telegram skipped' "$work_directory/stdout"
[ "$(grep -c '"unit": "gildra-catalog-refresh"' "$work_directory/alerts.jsonl")" -eq 2 ]

# After six hours it is messaged again with the failures in between.
notify 2026-10-12T10:30:00+00:00 gildra-catalog-refresh
! grep -Fq 'Telegram skipped' "$work_directory/stdout"
grep -Fq 'ещё 1 сбоев' "$work_directory/stdout"

# The next success reports the recovery once and clears the streak.
notify 2026-10-12T11:00:00+00:00 "--recovered gildra-catalog-refresh"
grep -Fq 'снова работает (сбоев подряд: 3' "$work_directory/stdout"
notify 2026-10-12T11:05:00+00:00 "--recovered gildra-catalog-refresh"
[ ! -s "$work_directory/stdout" ]

# A unit muted in notify.env is logged but never messaged.
printf 'NOTIFY_QUIET_UNITS=gildra-graph-refresh, other\n' > "$work_directory/quiet.env"
GILDRA_NOTIFY_OFFLINE=1 GILDRA_ALERT_LOG="$work_directory/alerts.jsonl" GILDRA_NOTIFY_ENV_FILE="$work_directory/quiet.env" \
  GILDRA_NOTIFY_NOW=2026-10-13T00:00:00+00:00 python3 "$notify_script" gildra-graph-refresh >"$work_directory/stdout"
grep -Fq 'NOTIFY_QUIET_UNITS, Telegram skipped' "$work_directory/stdout"
grep -Fq '"unit": "gildra-graph-refresh"' "$work_directory/alerts.jsonl"

printf '%s\n' 'test: unit failures are recorded, rate-limited, reported on recovery and wired to gildra-notify@'
