#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
service_file=$script_directory/gildra-catalog-media-cache.service
timer_file=$script_directory/gildra-catalog-media-cache.timer

[ -f "$service_file" ]
[ -f "$timer_file" ]

exec_line=$(grep '^ExecStart=' "$service_file")
[ "$(printf '%s\n' "$exec_line" | wc -l)" -eq 1 ]
# Assert the complete renewal command: scoped seeding flags must not leak back
# into the whole-catalog refresh mode, and pacing/checkpoint limits must remain.
grep -Fxq 'ExecStart=/usr/bin/docker compose --env-file .env --env-file current-release.env -f compose.yml -f compose.prod.yml -f compose.runtime.yml -f compose.wowarcana.yml run --rm --no-deps catalog-media-cache -environment production -expansion= -refresh-icons -refresh-limit 3000 -refresh-batch 100 -refresh-headroom-days 10 -refresh-interval 500ms -refresh-retry-failed-after 72h -refresh-checkpoint /var/lib/gildra/catalog-media/refresh-wow.json -confirm' "$service_file"

grep -Fxq 'OnCalendar=*-*-* 00,06,12,18:15:00 UTC' "$timer_file"
grep -Fxq 'RandomizedDelaySec=5m' "$timer_file"
grep -Fxq 'Persistent=true' "$timer_file"
grep -Fxq 'Unit=gildra-catalog-media-cache.service' "$timer_file"

printf '%s\n' 'test: scheduled catalog icon renewal retains bounded pacing and checkpoint recovery'
