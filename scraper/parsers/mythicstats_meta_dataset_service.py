#!/usr/bin/env python3
"""Validate and atomically publish the Mythic+ meta snapshot from mythicstats.com.

The whole snapshot lives in ``dataset_snapshots.payload`` (one compact JSON
document, read by the API as is), so this dataset needs no tables of its own.
A candidate that fails validation never replaces the last good snapshot, and an
unchanged candidate is recorded as a skipped run instead of a duplicate row.
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

from .mythicstats_meta import ROLES, collect_mythicstats_meta
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

DATASET_SLUG = "mplus-meta-mythicstats"
DATASET_NAME = "Mythic+ meta — MythicStats"
ADVISORY_LOCK_ID = 0x47696C64724D534D
SLOT_HOURS = 6
ROLE_SIZE_BOUNDS = {"dps": (20, 40), "tank": (5, 8), "healer": (6, 9)}
SLUG_RE = re.compile(r"^[a-z][a-z-]+$")
SEASON_RE = re.compile(r"^[a-z]+[0-9]+$")
URL_RE = re.compile(r"^https://mythicstats[.]com/(meta|period/[0-9]+|season/[a-z]+[0-9]+)$")


class DatasetValidationError(ValueError):
    """A suspicious candidate must never replace the last good snapshot."""


def validate_candidate(payload: dict[str, Any], *, previous_week_count: int | None = None) -> int:
    """Raise on anything structurally unsafe; return the number of spec rows."""
    seasons = payload.get("seasons")
    if not isinstance(seasons, list) or not 1 <= len(seasons) <= 8:
        raise DatasetValidationError("candidate must contain one to eight seasons")
    weeks = [week for season in seasons for week in season.get("weeks", [])]
    if not 1 <= len(weeks) <= 200:
        raise DatasetValidationError(f"candidate week count is outside safety bounds: {len(weeks)}")
    if previous_week_count and len(weeks) < previous_week_count * 0.5 and len(seasons) > 1:
        raise DatasetValidationError("candidate lost more than half of the previous weeks")
    periods: set[int] = set()
    rows = 0
    for season in seasons:
        if not SEASON_RE.fullmatch(str(season.get("slug") or "")):
            raise DatasetValidationError("invalid season slug")
        if not URL_RE.fullmatch(str(season.get("source_url") or "")):
            raise DatasetValidationError("invalid season URL")
        numbers = [week.get("week") for week in season["weeks"]]
        if len(set(numbers)) != len(numbers):
            raise DatasetValidationError(f"duplicate week in season {season['slug']}")
        for week in season["weeks"]:
            period = week.get("period_id")
            if not isinstance(period, int) or period <= 0 or period in periods:
                raise DatasetValidationError(f"invalid or duplicate period {period}")
            periods.add(period)
            if not isinstance(week.get("week"), int) or not 1 <= week["week"] <= 60:
                raise DatasetValidationError(f"period {period}: invalid week number")
            if not 2 <= float(week.get("average_key") or 0) <= 40:
                raise DatasetValidationError(f"period {period}: average key out of range")
            gini = week.get("gini") or {}
            if set(gini) != {"all", "dps", "tank", "healer"} or not all(0 <= float(v) <= 1 for v in gini.values()):
                raise DatasetValidationError(f"period {period}: invalid Gini coefficients")
            if not URL_RE.fullmatch(str(week.get("source_url") or "")):
                raise DatasetValidationError(f"period {period}: invalid source URL")
            seen: set[tuple[str, str, str]] = set()
            for role in ROLES:
                specs = [spec for spec in week["specs"] if spec.get("role") == role]
                low, high = ROLE_SIZE_BOUNDS[role]
                if not low <= len(specs) <= high:
                    raise DatasetValidationError(f"period {period}: {len(specs)} {role} specs")
                for spec in specs:
                    identity = (role, str(spec.get("class_slug")), str(spec.get("spec_slug")))
                    if identity in seen or not all(SLUG_RE.fullmatch(part) for part in identity[1:]):
                        raise DatasetValidationError(f"period {period}: invalid spec {identity}")
                    seen.add(identity)
                    if not 0 <= float(spec.get("presence", -1)) <= 100:
                        raise DatasetValidationError(f"period {period}: presence out of range")
            if len(seen) != len(week["specs"]):
                raise DatasetValidationError(f"period {period}: spec with an unknown role")
            rows += len(week["specs"])
    if payload.get("record_count") != rows or payload.get("week_count") != len(weeks):
        raise DatasetValidationError("candidate counts do not match its contents")
    current = payload.get("current_period")
    if current is not None:
        if current.get("period_id") not in periods or not isinstance(current.get("affixes"), list):
            raise DatasetValidationError("current period does not belong to the candidate")
        if not URL_RE.fullmatch(str(current.get("source_url") or "")):
            raise DatasetValidationError("invalid current period URL")
    return rows


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
    return {key: payload[key] for key in ("schema_version", "seasons", "current_period")}


def _public_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """What the API serves: everything except fetch telemetry."""
    return {key: value for key, value in payload.items() if key != "fetch"}


def refresh_mplus_meta_mythicstats(scheduled_for: date, *, trigger: str = "scheduled") -> RefreshResult:
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
                        VALUES (%s, %s, 'mythicstats.com', INTERVAL '6 hours')
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
                    previous_weeks = None
                    previous_hash = None
                    if current_snapshot_id:
                        cursor.execute("SELECT page_count, content_hash, payload->'week_count' FROM dataset_snapshots WHERE id = %s", (current_snapshot_id,))
                        previous = cursor.fetchone()
                        if previous:
                            previous_hash = bytes(previous[1])
                            previous_weeks = int(previous[2]) if previous[2] is not None else None

            payload = collect_mythicstats_meta()
            rows = validate_candidate(payload, previous_week_count=previous_weeks)
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
