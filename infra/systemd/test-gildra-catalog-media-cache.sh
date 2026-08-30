#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
service_file=$script_directory/gildra-catalog-media-cache.service
timer_file=$script_directory/gildra-catalog-media-cache.timer

[ -f "$service_file" ]
[ -f "$timer_file" ]

exec_line=$(grep '^ExecStart=' "$service_file")
[ "$(printf '%s\n' "$exec_line" | wc -l)" -eq 1 ]
printf '%s\n' "$exec_line" | grep -Fq 'catalog-media-cache'
printf '%s\n' "$exec_line" | grep -Fq -- '-limit 10000'
printf '%s\n' "$exec_line" | grep -Fq -- '-seed-icon-limit 10000'
printf '%s\n' "$exec_line" | grep -Fq -- '-confirm'

grep -Fxq 'OnCalendar=hourly' "$timer_file"
grep -Fxq 'Unit=gildra-catalog-media-cache.service' "$timer_file"

printf '%s\n' 'test: hourly media cache explicitly seeds up to 10000 icons'
