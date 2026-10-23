#!/bin/sh
# Install the scheduled Gildra units and their scripts from this checkout onto the
# production host, so the host matches the repository.
#   sudo sh infra/systemd/install-host-units.sh           # show what would change
#   sudo sh infra/systemd/install-host-units.sh --apply   # install, keep a backup, reload systemd
# Replaced files are copied to /opt/gildra/var/unit-backups/<UTC timestamp>/ first.
# Units that are not part of this repository (mail backup, code graph) are left alone.

set -eu

apply=false
[ "${1:-}" = "--apply" ] && apply=true

repo=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
units_dir=${GILDRA_UNITS_DIR:-/etc/systemd/system}
opt_root=${GILDRA_OPT_ROOT:-/opt/gildra}
backup_dir=$opt_root/var/unit-backups/$(date -u +%Y%m%dT%H%M%SZ)
changed=0

units="gildra-catalog-backup.service gildra-catalog-backup.timer
gildra-catalog-backup-prune.service gildra-catalog-backup-prune.timer
gildra-catalog-refresh.service
gildra-catalog-media-cache.service gildra-catalog-media-cache.timer
gildra-notify@.service gildra-notify-ok@.service
gildra-image-prune.service gildra-image-prune.timer
gildra-cms-backup.service gildra-cms-backup.timer"
# source (relative to the repo) -> target (relative to /opt/gildra)
scripts="infra/systemd/notify-unit-failure.py
infra/systemd/run-gildra-catalog-refresh-all.sh
infra/backup/run-catalog-backup.sh
infra/backup/run-cms-backup.sh
infra/backup/prune-catalog-backups.py
infra/systemd/prune-host-images.sh"
# The import now starts from the backup's OnSuccess=, not on its own timer.
obsolete_timers="gildra-catalog-refresh.timer"

sync_file() {
  source=$1 target=$2 mode=$3
  if [ -f "$target" ] && cmp -s "$source" "$target"; then
    return 0
  fi
  changed=$((changed + 1))
  echo "--- $target"
  if [ -f "$target" ]; then diff -u "$target" "$source" || true; else echo "(new file)"; fi
  if $apply; then
    if [ -f "$target" ]; then
      mkdir -p "$backup_dir$(dirname "$target")"
      cp -p "$target" "$backup_dir$target"
    fi
    mkdir -p "$(dirname "$target")"
    install -m "$mode" "$source" "$target"
  fi
}

for unit in $units; do
  sync_file "$repo/infra/systemd/$unit" "$units_dir/$unit" 0644
done
for script in $scripts; do
  case $script in *.py|*.sh) mode=0755 ;; *) mode=0644 ;; esac
  sync_file "$repo/$script" "$opt_root/$script" "$mode"
done

for timer in $obsolete_timers; do
  if [ -f "$units_dir/$timer" ]; then
    changed=$((changed + 1))
    echo "--- $units_dir/$timer (obsolete: disable and remove)"
    if $apply; then
      systemctl disable --now "$timer" 2>/dev/null || true
      mkdir -p "$backup_dir$units_dir"
      mv "$units_dir/$timer" "$backup_dir$units_dir/$timer"
    fi
  fi
done

if ! $apply; then
  echo "$changed file(s) differ; run with --apply to install"
  exit 0
fi
if [ "$changed" -gt 0 ]; then
  systemctl daemon-reload
  systemctl enable --now gildra-catalog-backup.timer gildra-catalog-backup-prune.timer gildra-catalog-media-cache.timer \
    gildra-image-prune.timer gildra-cms-backup.timer >/dev/null
  systemd-analyze verify $(for unit in $units; do case $unit in *@.service) ;; *) echo "$units_dir/$unit" ;; esac; done) 2>&1 \
    | grep -v -e 'Unknown key name' -e 'is not executable' || true
  echo "installed $changed change(s); previous files in $backup_dir"
else
  echo "host already matches the repository"
fi
