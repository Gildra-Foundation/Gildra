#!/usr/bin/env python3
"""Validate and atomically publish the simulated DPS tier list from mythistone.com.

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

from .mythistone_simtier import GEAR_SETS, SOURCE_URL, TARGETS, TIERS, collect_mythistone_simtier
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

DATASET_SLUG = "tierlist-mythistone-sim"
DATASET_NAME = "Sim tier list — MythiStone"
ADVISORY_LOCK_ID = 0x47696C64724D5353
SLOT_HOURS = 24
ROLE_SIZE_BOUNDS = {"dps": (20, 40), "tank": (4, 8)}
SLUG_RE = re.compile(r"^[a-z][a-z-]*$")
DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
DPS_BOUNDS = (1_000, 100_000_000)


class DatasetValidationError(ValueError):
    """A suspicious candidate must never replace the last good snapshot."""


def validate_candidate(payload: dict[str, Any], *, previous_record_count: int | None = None) -> int:
    """Raise on anything structurally unsafe; return the number of spec rows."""
    if payload.get("schema_version") != 1 or payload.get("source_url") != SOURCE_URL:
        raise DatasetValidationError("unexpected schema version or source URL")
    if payload.get("simmed_on") is not None and not DATE_RE.fullmatch(str(payload["simmed_on"])):
        raise DatasetValidationError("invalid simulation date")
    if payload.get("gear_sets") != list(GEAR_SETS):
        raise DatasetValidationError("unexpected gear sets")
    tables = payload.get("tables")
    if not isinstance(tables, list):
        raise DatasetValidationError("candidate has no tables")
    keys = [(table.get("role"), table.get("targets")) for table in tables]
    expected = [(role, targets) for role in ROLE_SIZE_BOUNDS for targets in TARGETS]
    if sorted(keys, key=str) != sorted(expected, key=str):
        raise DatasetValidationError(f"candidate tables do not cover every role and target count: {keys}")
    rows = 0
    for table in tables:
        role, targets, entries = table["role"], table["targets"], table.get("entries") or []
        low, high = ROLE_SIZE_BOUNDS[role]
        if not low <= len(entries) <= high:
            raise DatasetValidationError(f"{role} {targets}t: {len(entries)} specs")
        if not isinstance(table.get("specs_total"), int) or table["specs_total"] < len(entries):
            raise DatasetValidationError(f"{role} {targets}t: invalid spec total")
        if [entry.get("rank") for entry in entries] != list(range(1, len(entries) + 1)):
            raise DatasetValidationError(f"{role} {targets}t: ranks are not 1..n")
        seen: set[tuple[str, str]] = set()
        top = None
        for entry in entries:
            identity = (str(entry.get("class_slug")), str(entry.get("spec_slug")))
            if identity in seen or not all(SLUG_RE.fullmatch(part) for part in identity):
                raise DatasetValidationError(f"{role} {targets}t: invalid or duplicate spec {identity}")
            seen.add(identity)
            if entry.get("role") != role or entry.get("tier") not in TIERS or not isinstance(entry.get("spec_id"), int):
                raise DatasetValidationError(f"{role} {targets}t: invalid row {identity}")
            values = entry.get("dps") or {}
            if not values or not set(values) <= set(GEAR_SETS):
                raise DatasetValidationError(f"{role} {targets}t: {identity} has no gear set values")
            if not all(isinstance(value, int) and DPS_BOUNDS[0] <= value <= DPS_BOUNDS[1] for value in values.values()):
                raise DatasetValidationError(f"{role} {targets}t: {identity} damage out of range")
            if entry.get("best") != max(values.values()):
                raise DatasetValidationError(f"{role} {targets}t: {identity} best is not its highest set")
            if top is None:
                top = entry["best"]
            elif entry["best"] > top:
                raise DatasetValidationError(f"{role} {targets}t: rows are not ordered by best damage")
            behind = entry.get("behind_pct")
            if not isinstance(behind, (int, float)) or not -100 <= behind <= 0:
                raise DatasetValidationError(f"{role} {targets}t: {identity} gap out of range")
            # The page rounds the gap to 0.1 %: it must agree with the numbers it sits next to.
            if abs(behind - (entry["best"] / top - 1) * 100) > 0.2:
                raise DatasetValidationError(f"{role} {targets}t: {identity} gap disagrees with its numbers")
        rows += len(entries)
    if payload.get("record_count") != rows:
        raise DatasetValidationError("candidate counts do not match its contents")
    if previous_record_count and rows < previous_record_count * 0.75:
        raise DatasetValidationError("candidate lost more than a quarter of the previous rows")
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
    return {key: payload[key] for key in ("schema_version", "simmed_on", "sim_version", "gear_sets", "tables")}


def _public_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """What the API serves: everything except fetch telemetry."""
    return {key: value for key, value in payload.items() if key != "fetch"}


def refresh_tierlist_mythistone_sim(scheduled_for: date, *, trigger: str = "scheduled") -> RefreshResult:
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
                        VALUES (%s, %s, 'mythistone.com', INTERVAL '24 hours')
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
                    previous_rows = None
                    previous_hash = None
                    if current_snapshot_id:
                        cursor.execute("SELECT record_count, content_hash FROM dataset_snapshots WHERE id = %s", (current_snapshot_id,))
                        previous = cursor.fetchone()
                        if previous:
                            previous_rows = int(previous[0]) if previous[0] is not None else None
                            previous_hash = bytes(previous[1])

            payload = collect_mythistone_simtier()
            rows = validate_candidate(payload, previous_record_count=previous_rows)
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
