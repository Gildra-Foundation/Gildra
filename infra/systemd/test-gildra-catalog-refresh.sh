#!/bin/sh

set -eu

script_directory=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
service_file=$script_directory/gildra-catalog-refresh.service
runner_file=$script_directory/run-gildra-catalog-refresh-all.sh

[ -f "$service_file" ]
[ -f "$runner_file" ]
grep -Fxq 'ExecStart=/opt/gildra/infra/systemd/run-gildra-catalog-refresh-all.sh' "$service_file"
grep -Fq 'catalog-build-check' "$runner_file"
grep -Fq 'catalog-pipeline' "$runner_file"
for product in wow wow_classic wow_classic_era wow_classic_hardcore; do
  grep -Fq "'$product" "$runner_file"
done
for profile in retail-foundation classic-foundation-v1 classic-era-foundation-v1 classic-hardcore-foundation-v1; do
  grep -Fq "$profile" "$runner_file"
done

sh -n "$runner_file"
printf '%s\n' 'test: scheduled refresh covers Retail, Classic, Classic Era and Hardcore'
