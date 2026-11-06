#!/usr/bin/env python3
"""Validate and atomically publish the Raider.IO Mythic+ run sample.

One snapshot (``dataset_snapshots.payload``) holds the season, its dungeons,
the specializations seen, the compact top runs of every dungeon and region and
the season's rating cutoffs. The Go API aggregates compositions, spec presence,
dungeon summaries and the route finder from it on request, so every block of
the three Mythic+ community pages is computed from the same runs. A candidate
that fails validation never replaces the last good snapshot; an unchanged one
is recorded as a skipped run.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from .raiderio_mplus import REGIONS, collect_raiderio_mplus
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

DATASET_SLUG = "mplus-runs-raiderio"
DATASET_NAME = "Mythic+ runs — Raider.IO"
ADVISORY_LOCK_ID = 0x47696C64724D5252
SLOT_HOURS = 12
MIN_RUNS = 500
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SEASON_RE = re.compile(r"^season-[a-z0-9-]+$")
ISO_RE = re.compile(r"^20[0-9]{2}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z$")
DAY_RE = re.compile(r"^20[0-9]{2}-[01][0-9]-[0-3][0-9]$")
ROLES = ("tank", "healer", "dps")


class DatasetValidationError(ValueError):
    """A suspicious candidate must never replace the last good snapshot."""


def _check(condition: bool, message: str) -> None:
    if not condition:
        raise DatasetValidationError(message)


def validate_candidate(payload: dict[str, Any], *, previous_run_count: int | None = None) -> int:
    """Raise on anything structurally unsafe; return the number of runs."""
    _check(payload.get("schema_version") == 1, "unknown schema version")
    season = payload.get("season") or {}
    _check(bool(SEASON_RE.fullmatch(str(season.get("slug") or ""))), "invalid season slug")
    dungeons = payload.get("dungeons")
    _check(isinstance(dungeons, list) and 4 <= len(dungeons) <= 12, "dungeon count outside 4..12")
    dungeon_ids: set[int] = set()
    for dungeon in dungeons:
        _check(isinstance(dungeon.get("id"), int) and dungeon["id"] > 0 and dungeon["id"] not in dungeon_ids, "invalid dungeon id")
        _check(bool(SLUG_RE.fullmatch(str(dungeon.get("slug") or ""))) and bool(dungeon.get("name")), "invalid dungeon slug or name")
        _check(isinstance(dungeon.get("timer_ms"), int) and 600_000 <= dungeon["timer_ms"] <= 3_600_000, "dungeon timer out of range")
        dungeon_ids.add(dungeon["id"])
    specs = payload.get("specs")
    _check(isinstance(specs, list) and 10 <= len(specs) <= 60, "spec count outside 10..60")
    spec_roles: dict[int, str] = {}
    for spec in specs:
        _check(isinstance(spec.get("id"), int) and spec["id"] not in spec_roles, "invalid or duplicate spec id")
        _check(spec.get("role") in ROLES, f"spec {spec.get('id')}: invalid role")
        _check(bool(SLUG_RE.fullmatch(str(spec.get("class_slug") or ""))) and bool(SLUG_RE.fullmatch(str(spec.get("spec_slug") or ""))), "invalid spec slugs")
        spec_roles[spec["id"]] = spec["role"]
    runs = payload.get("runs")
    _check(isinstance(runs, list) and MIN_RUNS <= len(runs) <= 60_000, f"run count outside {MIN_RUNS}..60000")
    if previous_run_count:
        _check(len(runs) >= previous_run_count * 0.5, "candidate lost more than half of the previous runs")
    seen: set[int] = set()
    per_dungeon: dict[int, int] = {}
    for run in runs:
        run_id = run.get("id")
        _check(isinstance(run_id, int) and run_id > 0 and run_id not in seen, f"invalid or duplicate run {run_id}")
        seen.add(run_id)
        _check(run.get("dg") in dungeon_ids, f"run {run_id}: unknown dungeon")
        _check(isinstance(run.get("lv"), int) and 2 <= run["lv"] <= 40, f"run {run_id}: key level out of range")
        _check(isinstance(run.get("ch"), int) and 1 <= run["ch"] <= 3, f"run {run_id}: leaderboard runs are timed (1..3 upgrades)")
        _check(isinstance(run.get("tm"), int) and isinstance(run.get("ms"), int) and 0 < run["ms"] <= run["tm"] <= 3_600_000, f"run {run_id}: clear time out of range")
        _check(bool(ISO_RE.fullmatch(str(run.get("at") or ""))), f"run {run_id}: invalid completion time")
        _check(run.get("rg") in REGIONS, f"run {run_id}: invalid region")
        _check(isinstance(run.get("v"), bool), f"run {run_id}: invalid video flag")
        dps = run.get("d")
        _check(isinstance(dps, list) and len(dps) == 3 and dps == sorted(dps), f"run {run_id}: DPS must be three sorted spec ids")
        _check(spec_roles.get(run.get("t")) == "tank" and spec_roles.get(run.get("h")) == "healer", f"run {run_id}: tank/healer spec has the wrong role")
        _check(all(spec_roles.get(spec) == "dps" for spec in dps), f"run {run_id}: DPS spec has the wrong role")
        per_dungeon[run["dg"]] = per_dungeon.get(run["dg"], 0) + 1
    _check(len(per_dungeon) >= max(4, len(dungeon_ids) - 1), "too many dungeons without runs")
    cutoffs = payload.get("cutoffs")
    _check(isinstance(cutoffs, dict), "cutoffs must be an object")
    for region, block in cutoffs.items():
        _check(region in REGIONS, f"cutoffs: unknown region {region}")
        scores = [tier.get("score") for tier in block.get("tiers") or []]
        _check(bool(scores) and all(isinstance(score, (int, float)) and 0 < score < 6000 for score in scores), f"cutoffs {region}: invalid scores")
        _check(scores == sorted(scores, reverse=True), f"cutoffs {region}: percentiles out of order")
        for series in block.get("history") or []:
            _check(all(DAY_RE.fullmatch(str(point[0])) and 0 <= float(point[1]) < 6000 for point in series.get("points") or []), f"cutoffs {region}: invalid history")
    _check(payload.get("record_count") == len(runs) and payload.get("unique_spec_count") == len(specs), "candidate counts do not match its contents")
    return len(runs)


def _safe_error(exc: BaseException) -> tuple[str, str]:
    if isinstance(exc, DatasetValidationError):
        code = "validation_failed"
    elif isinstance(exc, psycopg.Error):
        code = "database_failed"
    elif isinstance(exc, (urllib.error.URLError, TimeoutError)):
        code = "network_failed"
    else:
        code = "collection_failed"
    return code, (" ".join(str(exc).split())[:500] or exc.__class__.__name__)


def _semantic_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: payload[key] for key in ("schema_version", "season", "dungeons", "specs", "runs", "cutoffs")}


def _public_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """What the API serves: everything except fetch telemetry."""
    return {key: value for key, value in payload.items() if key != "fetch"}


def refresh_mplus_runs_raiderio(scheduled_for: date, *, trigger: str = "scheduled") -> RefreshResult:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    started_at = datetime.now(UTC)
    slot_hour = started_at.hour // SLOT_HOURS * SLOT_HOURS
    run_key = f"{SLOT_HOURS}h:{scheduled_for.isoformat()}T{slot_hour:02d}"
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK_ID,))
            if not cursor.fetchone()[0]:
                raise RefreshBusy(f"{DATASET_NAME} refresh is already running")
        connection.commit()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    # Self-seeding: the dataset row is data, not schema, so no migration is needed.
                    cursor.execute("""
                        INSERT INTO datasets (slug, name, source_name, refresh_interval)
                        VALUES (%s, %s, 'raider.io', INTERVAL '12 hours')
                        ON CONFLICT (slug) DO NOTHING
                    """, (DATASET_SLUG, DATASET_NAME))
                    cursor.execute("SELECT id, current_snapshot_id FROM datasets WHERE slug = %s FOR UPDATE", (DATASET_SLUG,))
                    dataset = cursor.fetchone()
                    if dataset is None:
                        raise RuntimeError(f"dataset {DATASET_NAME} could not be seeded")
                    dataset_id, current_snapshot_id = dataset
                    cursor.execute("SELECT id, status, snapshot_id FROM dataset_runs WHERE dataset_id = %s AND run_key = %s", (dataset_id, run_key))
                    existing = cursor.fetchone()
                    if existing and existing[1] in {"succeeded", "skipped"}:
                        return RefreshResult("skipped", str(existing[0]), str(existing[2]), scheduled_for.isoformat(), 0, 0, True)
                    cursor.execute("""
                        INSERT INTO dataset_runs (dataset_id, run_key, trigger, scheduled_for, status, started_at, lkg_snapshot_id)
                        VALUES (%s, %s, %s, %s, 'running', now(), %s)
                        ON CONFLICT (dataset_id, run_key) DO UPDATE SET
                            trigger = EXCLUDED.trigger, status = 'running', attempt_count = dataset_runs.attempt_count + 1,
                            started_at = now(), finished_at = NULL, snapshot_id = NULL,
                            lkg_snapshot_id = EXCLUDED.lkg_snapshot_id, error_code = '', error_summary = ''
                        RETURNING id
                    """, (dataset_id, run_key, trigger, scheduled_for, current_snapshot_id))
                    run_id = cursor.fetchone()[0]
                    cursor.execute("UPDATE datasets SET last_attempt_at = now(), updated_at = now() WHERE id = %s", (dataset_id,))
                    previous_runs = None
                    previous_hash = None
                    if current_snapshot_id:
                        cursor.execute("SELECT page_count, content_hash, payload->'record_count' FROM dataset_snapshots WHERE id = %s", (current_snapshot_id,))
                        previous = cursor.fetchone()
                        if previous:
                            previous_hash = bytes(previous[1])
                            previous_runs = int(previous[2]) if previous[2] is not None else None

            payload = collect_raiderio_mplus()
            rows = validate_candidate(payload, previous_run_count=previous_runs)
            snapshot_hash = _sha256(_semantic_payload(payload))
            credits = Decimal(payload["credits_spent"] or 0)
            unchanged = previous_hash is not None and previous_hash == snapshot_hash
            snapshot_id: UUID | None = current_snapshot_id if unchanged else None
            with connection.transaction():
                with connection.cursor() as cursor:
                    if not unchanged:
                        cursor.execute("""
                            INSERT INTO dataset_snapshots (dataset_id, run_id, source_fetched_at, content_hash, page_count, record_count, unique_spec_count, payload)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                        """, (dataset_id, run_id, datetime.fromisoformat(payload["fetched_at"]), snapshot_hash,
                              payload["page_count"], rows, payload["unique_spec_count"],
                              Jsonb(_public_payload(payload), dumps=lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":")))))
                        snapshot_id = cursor.fetchone()[0]
                    cursor.execute("""
                        UPDATE dataset_runs SET status = %s, finished_at = now(), page_count = %s,
                            record_count = %s, unique_spec_count = %s, credits_spent = %s, snapshot_id = %s WHERE id = %s
                    """, ("skipped" if unchanged else "succeeded", payload["page_count"], rows,
                          payload["unique_spec_count"], credits, snapshot_id, run_id))
                    cursor.execute("""
                        UPDATE datasets SET current_snapshot_id = %s, last_success_at = now(), last_error_code = '',
                            last_error_summary = '', updated_at = now() WHERE id = %s
                    """, (snapshot_id, dataset_id))
            status = "skipped" if unchanged else "succeeded"
            result = RefreshResult(status, str(run_id), str(snapshot_id), scheduled_for.isoformat(), rows, payload["unique_spec_count"], unchanged)
            _clickhouse_event({"run_id": str(run_id), "snapshot_id": str(snapshot_id), "occurred_at": datetime.now(UTC).isoformat(),
                               "dataset": DATASET_SLUG, "status": status, "duration_ms": int((datetime.now(UTC)-started_at).total_seconds()*1000),
                               "page_count": payload["page_count"], "record_count": rows, "unique_spec_count": payload["unique_spec_count"],
                               "credits": str(credits), "lkg_preserved": unchanged, "error_code": "", "metadata": "{}"})
            return result
        except RefreshBusy:
            raise
        except BaseException as exc:
            code, summary = _safe_error(exc)
            lkg_preserved = bool(locals().get("current_snapshot_id"))
            if "run_id" in locals() and "dataset_id" in locals():
                with connection.transaction():
                    with connection.cursor() as cursor:
                        cursor.execute("UPDATE dataset_runs SET status = 'failed', finished_at = now(), error_code = %s, error_summary = %s WHERE id = %s", (code, summary, run_id))
                        cursor.execute("UPDATE datasets SET last_error_code = %s, last_error_summary = %s, updated_at = now() WHERE id = %s", (code, summary, dataset_id))
                _clickhouse_event({"run_id": str(run_id), "occurred_at": datetime.now(UTC).isoformat(), "dataset": DATASET_SLUG,
                                   "status": "failed", "duration_ms": int((datetime.now(UTC)-started_at).total_seconds()*1000),
                                   "lkg_preserved": lkg_preserved, "error_code": code,
                                   "metadata": json.dumps({"summary": summary}, ensure_ascii=False)})
            raise
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_ID,))
            connection.commit()
