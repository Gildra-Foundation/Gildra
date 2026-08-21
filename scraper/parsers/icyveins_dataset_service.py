#!/usr/bin/env python3
"""Validate and atomically publish the daily Tierlist — Icy Veins snapshot."""

from __future__ import annotations

import json
import os
import re
import urllib.error
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from .icyveins_tierlist import SOURCES, collect_icyveins_dataset
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

DATASET_SLUG = "tierlist-icyveins"
DATASET_NAME = "Tierlist — Icy Veins"
ADVISORY_LOCK_ID = 0x47696C6472614956
EXPECTED_CONTEXTS = {(source["activity"], source["role"]) for source in SOURCES}
TIER_RE = re.compile(r"^[SABCD][+-]?$")


class DatasetValidationError(ValueError):
    """A suspicious candidate must never replace the last good snapshot."""


def validate_candidate(payload: dict[str, Any], *, previous_record_count: int | None = None) -> list[dict[str, Any]]:
    pages = payload.get("pages")
    if not isinstance(pages, list) or len(pages) != 8:
        raise DatasetValidationError("candidate must contain exactly eight Icy Veins pages")
    if {(page.get("activity"), page.get("role")) for page in pages} != EXPECTED_CONTEXTS:
        raise DatasetValidationError("candidate is missing an Icy Veins activity slice")
    records = [record for page in pages for record in page.get("records", [])]
    if not 70 <= len(records) <= 180:
        raise DatasetValidationError(f"candidate record count is outside safety bounds: {len(records)}")
    unique_specs = {(row.get("class_slug"), row.get("spec_slug")) for row in records}
    if not 35 <= len(unique_specs) <= 60:
        raise DatasetValidationError(f"candidate specialization count is outside safety bounds: {len(unique_specs)}")
    if payload.get("record_count") != len(records) or payload.get("unique_spec_count") != len(unique_specs):
        raise DatasetValidationError("candidate counts do not match its contents")
    if previous_record_count and len(records) < previous_record_count * 0.75:
        raise DatasetValidationError("candidate lost more than 25 percent of the previous snapshot")
    seen: set[tuple[str, str, str, str]] = set()
    for page in pages:
        minimum = 10 if page["role"] == "dps" else 5
        if page.get("record_count") != len(page.get("records", [])) or len(page["records"]) < minimum:
            raise DatasetValidationError(f"too few rows for {page['context_key']}")
        source = urlsplit(str(page.get("source_url") or ""))
        if source.hostname != "www.icy-veins.com" or not source.path.startswith("/wow/"):
            raise DatasetValidationError("invalid Icy Veins page URL")
        try:
            datetime.fromisoformat(str(page["source_updated_at"]).replace("Z", "+00:00"))
        except (KeyError, ValueError) as exc:
            raise DatasetValidationError("invalid Icy Veins source timestamp") from exc
        for row in page["records"]:
            identity = (row.get("activity"), row.get("role"), row.get("class_slug"), row.get("spec_slug"))
            if identity in seen:
                raise DatasetValidationError(f"duplicate Icy Veins specialization context: {identity}")
            seen.add(identity)
            if TIER_RE.fullmatch(str(row.get("tier") or "")) is None:
                raise DatasetValidationError("invalid Icy Veins tier")
            if not isinstance(row.get("rank_in_tier"), int) or row["rank_in_tier"] < 1:
                raise DatasetValidationError("invalid Icy Veins rank")
            for field in ("source_url", "guide_url"):
                parsed = urlsplit(str(row.get(field) or ""))
                if parsed.hostname != "www.icy-veins.com" or not parsed.path.startswith("/wow/"):
                    raise DatasetValidationError(f"invalid Icy Veins {field}")
            if row["guide_url"] == row["source_url"]:
                raise DatasetValidationError("Icy Veins guide URL points to the tier-list page")
    return records


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
    return {"schema_version": payload["schema_version"], "pages": [
        {key: value for key, value in page.items() if key != "fetch"} for page in payload["pages"]
    ]}


def refresh_tierlist_icyveins(scheduled_for: date, *, trigger: str = "scheduled") -> RefreshResult:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    started_at = datetime.now(UTC)
    run_key = f"daily:{scheduled_for.isoformat()}"
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK_ID,))
            if not cursor.fetchone()[0]:
                raise RefreshBusy("Tierlist — Icy Veins refresh is already running")
        connection.commit()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("SELECT id, current_snapshot_id FROM datasets WHERE slug = %s FOR UPDATE", (DATASET_SLUG,))
                    dataset = cursor.fetchone()
                    if dataset is None:
                        raise RuntimeError(f"dataset {DATASET_NAME} is not seeded")
                    dataset_id, current_snapshot_id = dataset
                    cursor.execute("SELECT id, status, snapshot_id FROM dataset_runs WHERE dataset_id = %s AND run_key = %s", (dataset_id, run_key))
                    existing = cursor.fetchone()
                    if existing and existing[1] == "succeeded":
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
                    previous_count = None
                    if current_snapshot_id:
                        cursor.execute("SELECT record_count FROM dataset_snapshots WHERE id = %s", (current_snapshot_id,))
                        previous = cursor.fetchone()
                        previous_count = previous[0] if previous else None

            payload = collect_icyveins_dataset()
            records = validate_candidate(payload, previous_record_count=previous_count)
            snapshot_hash = _sha256(_semantic_payload(payload))
            snapshot_id: UUID | None = None
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO dataset_snapshots (dataset_id, run_id, source_fetched_at, content_hash, page_count, record_count, unique_spec_count, payload)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                    """, (dataset_id, run_id, datetime.fromisoformat(payload["fetched_at"]), snapshot_hash,
                          payload["page_count"], len(records), payload["unique_spec_count"], Jsonb(payload)))
                    snapshot_id = cursor.fetchone()[0]
                    page_rows = []
                    entry_rows = []
                    for page in payload["pages"]:
                        page_content = {key: value for key, value in page.items() if key not in {"fetch", "records"}}
                        updated_at = datetime.fromisoformat(page["source_updated_at"].replace("Z", "+00:00"))
                        page_rows.append((snapshot_id, page["context_key"], page["activity"], page["role"], page["title"],
                                          page["author_name"], page["source_url"], updated_at, page["record_count"], _sha256(page_content)))
                        for row in page["records"]:
                            entry_rows.append((snapshot_id, page["context_key"], row["activity"], row["role"], row["tier"],
                                               row["rank_in_tier"], row["class_name"], row["class_slug"], row["spec_name"],
                                               row["spec_slug"], row["icon_url"], row["guide_url"], row["source_url"],
                                               row["change_direction"], row["description"], row["description_paragraphs"],
                                               updated_at, _sha256(row)))
                    cursor.executemany("""
                        INSERT INTO icyveins_tierlist_pages (snapshot_id, context_key, activity, role, title, author_name,
                            source_url, source_updated_at, record_count, content_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, page_rows)
                    cursor.executemany("""
                        INSERT INTO icyveins_tierlist_entries (snapshot_id, context_key, activity, role, tier, rank_in_tier,
                            class_name, class_slug, spec_name, spec_slug, icon_url, guide_url, source_url, change_direction,
                            description, description_paragraphs, source_updated_at, content_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, entry_rows)
                    cursor.execute("""
                        UPDATE dataset_runs SET status = 'succeeded', finished_at = now(), page_count = %s,
                            record_count = %s, unique_spec_count = %s, credits_spent = %s, snapshot_id = %s WHERE id = %s
                    """, (payload["page_count"], len(records), payload["unique_spec_count"], Decimal(payload["credits_spent"] or 0), snapshot_id, run_id))
                    cursor.execute("""
                        UPDATE datasets SET current_snapshot_id = %s, last_success_at = now(), last_error_code = '',
                            last_error_summary = '', updated_at = now() WHERE id = %s
                    """, (snapshot_id, dataset_id))
            result = RefreshResult("succeeded", str(run_id), str(snapshot_id), scheduled_for.isoformat(), len(records), payload["unique_spec_count"], False)
            _clickhouse_event({"run_id": str(run_id), "snapshot_id": str(snapshot_id), "occurred_at": datetime.now(UTC).isoformat(),
                               "dataset": DATASET_SLUG, "status": "succeeded", "duration_ms": int((datetime.now(UTC)-started_at).total_seconds()*1000),
                               "page_count": payload["page_count"], "record_count": len(records), "unique_spec_count": payload["unique_spec_count"],
                               "credits": str(payload["credits_spent"] or 0), "lkg_preserved": False, "error_code": "", "metadata": "{}"})
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
