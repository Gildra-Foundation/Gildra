#!/usr/bin/env python3
"""Validate and atomically publish the daily Tierlist Archon snapshot."""

from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.error
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from .archon_tierlist import SOURCES, collect_archon_dataset
from .observability import event, safe_error, stage, update_context
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

DATASET_SLUG = "tierlist-archon"
DATASET_NAME = "Tierlist Archon"
ADVISORY_LOCK_ID = 0x47696C6472614152
EXPECTED_CONTEXTS = {
    (source["activity"], source["difficulty"], source["role"]) for source in SOURCES
}
TIER_RE = re.compile(r"^[A-FS][+]?$")
logger = logging.getLogger(__name__)


class DatasetValidationError(ValueError):
    """A candidate is incomplete or suspicious and must not replace the LKG."""


def _flatten(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [record for page in payload.get("pages", []) for record in page.get("records", [])]


def validate_candidate(
    payload: dict[str, Any], *, previous_record_count: int | None = None
) -> list[dict[str, Any]]:
    pages = payload.get("pages")
    if not isinstance(pages, list) or len(pages) != 12:
        raise DatasetValidationError("candidate must contain exactly twelve pages")
    contexts = {
        (page.get("activity"), page.get("difficulty"), page.get("role")) for page in pages
    }
    if contexts != EXPECTED_CONTEXTS:
        raise DatasetValidationError("candidate is missing an Archon activity slice")

    records = _flatten(payload)
    if not 90 <= len(records) <= 220:
        raise DatasetValidationError(
            f"candidate record count is outside safety bounds: {len(records)}"
        )
    unique_specs = {(row.get("class_slug"), row.get("spec_slug")) for row in records}
    if not 35 <= len(unique_specs) <= 50:
        raise DatasetValidationError(
            f"candidate unique specialization count is outside safety bounds: {len(unique_specs)}"
        )
    if payload.get("record_count") != len(records):
        raise DatasetValidationError("candidate record count does not match its contents")
    if payload.get("unique_spec_count") != len(unique_specs):
        raise DatasetValidationError("candidate specialization count does not match its contents")
    if previous_record_count and len(records) < previous_record_count * 0.75:
        raise DatasetValidationError("candidate lost more than 25 percent of the previous snapshot")

    seen: set[tuple[str, str, str, str, str]] = set()
    for page in pages:
        minimum = 10 if page["role"] == "dps" else 2
        if len(page.get("records", [])) < minimum:
            raise DatasetValidationError(
                f"too few {page['role']} rows for {page['activity']}/{page['difficulty']}"
            )
        try:
            datetime.fromisoformat(str(page["source_updated_at"]).replace("Z", "+00:00"))
        except (KeyError, ValueError) as exc:
            raise DatasetValidationError("invalid Archon source timestamp") from exc

    for row in records:
        identity = (
            str(row.get("activity")), str(row.get("difficulty")), str(row.get("role")),
            str(row.get("class_slug")), str(row.get("spec_slug")),
        )
        if identity in seen:
            raise DatasetValidationError(f"duplicate specialization context: {identity}")
        seen.add(identity)
        if not isinstance(row.get("rank"), int) or row["rank"] < 1:
            raise DatasetValidationError("ranking position must be a positive integer")
        tier = str(row.get("tier") or "")
        if tier and TIER_RE.fullmatch(tier) is None:
            raise DatasetValidationError(f"invalid tier label: {tier!r}")
        assignments = row.get("tier_assignments")
        if not isinstance(assignments, dict):
            raise DatasetValidationError("tier assignments must be an object")
        for assignment in assignments.values():
            if (
                not isinstance(assignment, dict)
                or TIER_RE.fullmatch(str(assignment.get("tier") or "")) is None
                or not isinstance(assignment.get("rank"), int)
                or assignment["rank"] < 1
            ):
                raise DatasetValidationError("invalid metric tier assignment")
        build = urlsplit(str(row.get("build_url") or ""))
        source = urlsplit(str(row.get("source_url") or ""))
        if build.hostname != "www.archon.gg" or not build.path.startswith("/wow/builds/"):
            raise DatasetValidationError(f"invalid build URL for {identity}")
        if source.hostname != "www.archon.gg" or not source.path.startswith("/wow/tier-list/"):
            raise DatasetValidationError(f"invalid source URL for {identity}")
        parses = row.get("parses")
        popularity = row.get("popularity")
        if not isinstance(parses, int) or parses < 0:
            raise DatasetValidationError(f"invalid parse count for {identity}")
        if popularity is not None and not 0 <= float(popularity) <= 1:
            raise DatasetValidationError(f"invalid popularity for {identity}")
    return records


def _semantic_payload(payload: dict[str, Any]) -> dict[str, Any]:
    pages = []
    for page in payload["pages"]:
        pages.append({key: value for key, value in page.items() if key != "fetch"})
    return {"schema_version": payload["schema_version"], "pages": pages}


def _safe_error(exc: BaseException) -> tuple[str, str]:
    if isinstance(exc, DatasetValidationError):
        code = "validation_failed"
    elif isinstance(exc, psycopg.Error):
        code = "database_failed"
    elif isinstance(exc, (urllib.error.URLError, TimeoutError)):
        code = "network_failed"
    else:
        code = "collection_failed"
    return code, safe_error(exc)


def _numeric(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def refresh_tierlist_archon(
    scheduled_for: date, *, trigger: str = "scheduled"
) -> RefreshResult:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    started_at = datetime.now(UTC)
    run_key = f"daily:{scheduled_for.isoformat()}"

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK_ID,))
            if not cursor.fetchone()[0]:
                raise RefreshBusy("Tierlist Archon refresh is already running")
        connection.commit()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT id, current_snapshot_id FROM datasets WHERE slug = %s FOR UPDATE",
                        (DATASET_SLUG,),
                    )
                    dataset = cursor.fetchone()
                    if dataset is None:
                        raise RuntimeError(f"dataset {DATASET_NAME} is not seeded")
                    dataset_id, current_snapshot_id = dataset
                    cursor.execute(
                        "SELECT id, status, snapshot_id FROM dataset_runs WHERE dataset_id = %s AND run_key = %s",
                        (dataset_id, run_key),
                    )
                    existing = cursor.fetchone()
                    if existing and existing[1] == "succeeded":
                        return RefreshResult(
                            "skipped", str(existing[0]), str(existing[2]),
                            scheduled_for.isoformat(), 0, 0, True,
                        )
                    cursor.execute(
                        """
                        INSERT INTO dataset_runs (
                            dataset_id, run_key, trigger, scheduled_for, status,
                            started_at, lkg_snapshot_id
                        ) VALUES (%s, %s, %s, %s, 'running', now(), %s)
                        ON CONFLICT (dataset_id, run_key) DO UPDATE SET
                            trigger = EXCLUDED.trigger, status = 'running',
                            attempt_count = dataset_runs.attempt_count + 1,
                            started_at = now(), finished_at = NULL, snapshot_id = NULL,
                            lkg_snapshot_id = EXCLUDED.lkg_snapshot_id,
                            error_code = '', error_summary = ''
                        RETURNING id
                        """,
                        (dataset_id, run_key, trigger, scheduled_for, current_snapshot_id),
                    )
                    run_id = cursor.fetchone()[0]
                    update_context(run_id=str(run_id))
                    cursor.execute(
                        "UPDATE datasets SET last_attempt_at = now(), updated_at = now() WHERE id = %s",
                        (dataset_id,),
                    )
                    previous_count = None
                    if current_snapshot_id:
                        cursor.execute(
                            "SELECT record_count FROM dataset_snapshots WHERE id = %s",
                            (current_snapshot_id,),
                        )
                        previous = cursor.fetchone()
                        previous_count = previous[0] if previous else None

            with stage(logger, "collect"):
                payload = collect_archon_dataset()
            with stage(
                logger,
                "validate",
                page_count=payload.get("page_count"),
                candidate_record_count=payload.get("record_count"),
            ):
                records = validate_candidate(payload, previous_record_count=previous_count)
            snapshot_hash = _sha256(_semantic_payload(payload))
            snapshot_id: UUID | None = None
            page_by_context = {
                (page["activity"], page["difficulty"], page["role"]): page
                for page in payload["pages"]
            }
            publish_started = time.monotonic()
            event(logger, "scrape_stage_started", stage="publish")
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO dataset_snapshots (
                            dataset_id, run_id, source_fetched_at, content_hash,
                            page_count, record_count, unique_spec_count, payload
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            dataset_id, run_id, datetime.fromisoformat(payload["fetched_at"]),
                            snapshot_hash, payload["page_count"], len(records),
                            payload["unique_spec_count"], Jsonb(payload),
                        ),
                    )
                    snapshot_id = cursor.fetchone()[0]
                    rows = []
                    for row in records:
                        page = page_by_context[(row["activity"], row["difficulty"], row["role"])]
                        content = {**row, "source_updated_at": page["source_updated_at"]}
                        rows.append(
                            (
                                snapshot_id, row["activity"], row["difficulty"], row["role"],
                                row["rank"], row["tier"], Jsonb(row["tier_assignments"]),
                                row["spec_id"], row["class_name"], row["class_slug"],
                                row["spec_name"], row["spec_slug"], row["icon_slug"],
                                row["build_url"], row["source_url"], _numeric(row["score"]),
                                _numeric(row["dps"]), _numeric(row["hps"]),
                                _numeric(row["survivability"]), _numeric(row["popularity"]),
                                row["parses"], row["max_key"],
                                datetime.fromisoformat(page["source_updated_at"].replace("Z", "+00:00")),
                                _sha256(content),
                            )
                        )
                    cursor.executemany(
                        """
                        INSERT INTO archon_tierlist_entries (
                            snapshot_id, activity, difficulty, role, rank, tier,
                            tier_assignments, spec_id, class_name, class_slug,
                            spec_name, spec_slug, icon_slug, build_url, source_url,
                            score, dps, hps, survivability, popularity, parses,
                            max_key, source_updated_at, content_hash
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        """,
                        rows,
                    )
                    cursor.execute(
                        """
                        UPDATE dataset_runs SET status = 'succeeded', finished_at = now(),
                            page_count = %s, record_count = %s, unique_spec_count = %s,
                            credits_spent = %s, snapshot_id = %s
                        WHERE id = %s
                        """,
                        (
                            payload["page_count"], len(records), payload["unique_spec_count"],
                            Decimal(payload["credits_spent"] or 0), snapshot_id, run_id,
                        ),
                    )
                    cursor.execute(
                        """
                        UPDATE datasets SET current_snapshot_id = %s, last_success_at = now(),
                            last_error_code = '', last_error_summary = '', updated_at = now()
                        WHERE id = %s
                        """,
                        (snapshot_id, dataset_id),
                    )
            event(
                logger,
                "scrape_stage_completed",
                stage="publish",
                duration_ms=int((time.monotonic() - publish_started) * 1_000),
                snapshot_id=str(snapshot_id),
                record_count=len(records),
            )

            result = RefreshResult(
                "succeeded", str(run_id), str(snapshot_id), scheduled_for.isoformat(),
                len(records), payload["unique_spec_count"], False,
            )
            _clickhouse_event(
                {
                    "run_id": str(run_id), "snapshot_id": str(snapshot_id),
                    "occurred_at": datetime.now(UTC).isoformat(), "dataset": DATASET_SLUG,
                    "status": "succeeded",
                    "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                    "page_count": payload["page_count"], "record_count": len(records),
                    "unique_spec_count": payload["unique_spec_count"],
                    "credits": str(payload["credits_spent"] or 0), "lkg_preserved": False,
                    "error_code": "", "metadata": "{}",
                }
            )
            return result
        except RefreshBusy:
            raise
        except BaseException as exc:
            code, summary = _safe_error(exc)
            lkg_preserved = bool(locals().get("current_snapshot_id"))
            if "run_id" in locals() and "dataset_id" in locals():
                with connection.transaction():
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "UPDATE dataset_runs SET status = 'failed', finished_at = now(), error_code = %s, error_summary = %s WHERE id = %s",
                            (code, summary, run_id),
                        )
                        cursor.execute(
                            "UPDATE datasets SET last_error_code = %s, last_error_summary = %s, updated_at = now() WHERE id = %s",
                            (code, summary, dataset_id),
                        )
                _clickhouse_event(
                    {
                        "run_id": str(run_id), "occurred_at": datetime.now(UTC).isoformat(),
                        "dataset": DATASET_SLUG, "status": "failed",
                        "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                        "lkg_preserved": lkg_preserved, "error_code": code,
                        "metadata": json.dumps({"summary": summary}, ensure_ascii=False),
                    }
                )
            raise
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_ID,))
            connection.commit()
