#!/usr/bin/env python3
"""Apply the retention policy to same-host catalog backups.

Backups are 5 GB a day and the restore drill needs another 45 GB of scratch
space, so an unbounded backup directory fills the disk and the drill itself
starts failing. The policy, using ``catalog_backup_manifests`` as the source
of truth:

* every verified backup from the last ``--keep-daily-days`` days stays;
* older verified backups keep the newest one per ISO week for
  ``--keep-weekly-weeks`` weeks and expire the rest;
* anything older expires;
* files of failed runs and files no manifest references (older than
  ``--orphan-age-hours``) are deleted.

Expired manifests are marked ``expired`` in the database so the console and
the recovery gate never point at a file that is gone. Runs dry by default;
pass ``--apply`` to delete.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MANIFEST_SUFFIX = ".manifest.json"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="delete files and update manifests (default: report only)")
    parser.add_argument("--volume-dir", default="/var/lib/docker/volumes/gildra_catalog_backups/_data/catalog-backups",
                        help="host directory that holds the backup objects")
    parser.add_argument("--uri-prefix", default="file:///var/lib/gildra/catalog-backups/catalog-backups/",
                        help="storage_uri prefix that maps onto --volume-dir")
    parser.add_argument("--postgres-container", default="gildra-postgres-1")
    parser.add_argument("--postgres-user", default="gildra")
    parser.add_argument("--postgres-db", default="gildra")
    parser.add_argument("--keep-daily-days", type=int, default=7)
    parser.add_argument("--keep-weekly-weeks", type=int, default=4)
    parser.add_argument("--orphan-age-hours", type=int, default=24)
    parser.add_argument("--manifests-json", help="read manifests from this JSON file instead of PostgreSQL (tests)")
    parser.add_argument("--now", help="override the current time, ISO 8601 (tests)")
    return parser.parse_args(argv)


def psql(args: argparse.Namespace, sql: str) -> str:
    command = ["docker", "exec", "-i", args.postgres_container, "psql", "-U", args.postgres_user, "-d", args.postgres_db,
               "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"psql failed: {completed.stderr.strip()}")
    return completed.stdout


def load_manifests(args: argparse.Namespace) -> list[dict[str, str]]:
    if args.manifests_json:
        with open(args.manifests_json, encoding="utf-8") as handle:
            return json.load(handle)
    output = psql(args, """
        SELECT id::text, status,
               coalesce(restore_completed_at, completed_at, created_at)::text,
               storage_uri
        FROM catalog_backup_manifests
        WHERE component='postgres' AND storage_uri LIKE 'file://%'
        ORDER BY created_at""")
    manifests = []
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) != 4:
            continue
        manifests.append({"id": parts[0], "status": parts[1], "timestamp": parts[2], "storage_uri": parts[3]})
    return manifests


def parse_timestamp(value: str) -> datetime:
    text = value.strip().replace(" ", "T", 1)
    if text.endswith("+00"):
        text += ":00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def host_path(args: argparse.Namespace, volume: Path, storage_uri: str) -> Path | None:
    if not storage_uri.startswith(args.uri_prefix):
        return None
    relative = storage_uri[len(args.uri_prefix):]
    candidate = (volume / relative).resolve()
    try:
        candidate.relative_to(volume)
    except ValueError:
        return None
    return candidate


def decide(manifests: list[dict[str, str]], now: datetime, keep_daily_days: int, keep_weekly_weeks: int) -> dict[str, list[dict[str, str]]]:
    daily_cutoff = now - timedelta(days=keep_daily_days)
    weekly_cutoff = now - timedelta(days=7 * keep_weekly_weeks)
    keep: list[dict[str, str]] = []
    expire: list[dict[str, str]] = []
    delete_only: list[dict[str, str]] = []
    weekly: dict[tuple[int, int], list[tuple[datetime, dict[str, str]]]] = defaultdict(list)

    for manifest in manifests:
        status = manifest["status"]
        if status in ("failed", "expired"):
            delete_only.append(manifest)
            continue
        if status in ("creating", "verifying", "created"):
            keep.append(manifest)
            continue
        stamp = parse_timestamp(manifest["timestamp"])
        if stamp >= daily_cutoff:
            keep.append(manifest)
        elif stamp >= weekly_cutoff:
            year, week, _ = stamp.isocalendar()
            weekly[(year, week)].append((stamp, manifest))
        else:
            expire.append(manifest)

    for _, entries in sorted(weekly.items()):
        entries.sort(key=lambda item: item[0], reverse=True)
        keep.append(entries[0][1])
        expire.extend(manifest for _, manifest in entries[1:])

    return {"keep": keep, "expire": expire, "delete_only": delete_only}


def remove_files(path: Path, apply: bool) -> int:
    freed = 0
    for candidate in (path, Path(str(path) + MANIFEST_SUFFIX)):
        if not candidate.is_file():
            continue
        freed += candidate.stat().st_size
        if apply:
            candidate.unlink()
    return freed


def prune_empty_dirs(volume: Path, apply: bool) -> None:
    if not apply:
        return
    for directory in sorted((p for p in volume.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        try:
            directory.rmdir()
        except OSError:
            pass


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    now = parse_timestamp(args.now) if args.now else datetime.now(UTC)
    volume = Path(args.volume_dir).resolve()
    if not volume.is_dir():
        print(f"prune: backup directory does not exist: {volume}", file=sys.stderr)
        return 1

    manifests = load_manifests(args)
    plan = decide(manifests, now, args.keep_daily_days, args.keep_weekly_weeks)
    referenced: set[Path] = set()
    freed = 0
    expired_ids: list[str] = []
    removed: list[str] = []

    for manifest in plan["keep"]:
        path = host_path(args, volume, manifest["storage_uri"])
        if path is not None:
            referenced.add(path)
            referenced.add(Path(str(path) + MANIFEST_SUFFIX))

    for manifest in plan["expire"] + plan["delete_only"]:
        path = host_path(args, volume, manifest["storage_uri"])
        if path is None:
            print(f"prune: skipping manifest {manifest['id']} with foreign storage uri {manifest['storage_uri']}", file=sys.stderr)
            continue
        released = remove_files(path, args.apply)
        if released:
            freed += released
            removed.append(str(path.relative_to(volume)))
        if manifest in plan["expire"] and UUID_RE.match(manifest["id"]):
            expired_ids.append(manifest["id"])

    orphan_cutoff = now - timedelta(hours=args.orphan_age_hours)
    orphans: list[str] = []
    for candidate in volume.rglob("*"):
        if not candidate.is_file() or candidate in referenced:
            continue
        base = Path(str(candidate)[: -len(MANIFEST_SUFFIX)]) if candidate.name.endswith(MANIFEST_SUFFIX) else candidate
        if base in referenced:
            continue
        modified = datetime.fromtimestamp(candidate.stat().st_mtime, UTC)
        if modified > orphan_cutoff:
            continue
        freed += candidate.stat().st_size
        orphans.append(str(candidate.relative_to(volume)))
        if args.apply:
            candidate.unlink()

    if expired_ids and args.apply and not args.manifests_json:
        ids = ", ".join(f"'{value}'" for value in expired_ids)
        psql(args, f"UPDATE catalog_backup_manifests SET status='expired', updated_at=now() WHERE id IN ({ids})")

    prune_empty_dirs(volume, args.apply)

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "now": now.isoformat(timespec="seconds"),
        "kept": len(plan["keep"]),
        "expired": expired_ids,
        "removed": sorted(set(removed)),
        "orphans": sorted(orphans),
        "freed_bytes": freed,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
