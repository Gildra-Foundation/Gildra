#!/usr/bin/env python3
"""Validate and atomically publish the daily Tierlist WoWHead snapshot."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from .wowhead_tier_details import collect_tierlist_dataset
from .observability import event, safe_error, stage, update_context

DATASET_SLUG = "tierlist-wowhead"
DATASET_NAME = "Tierlist WoWHead"
ADVISORY_LOCK_ID = 0x47696C647261544C
EXPECTED_CONTEXTS = {
    ("raid", "dps"),
    ("raid", "healer"),
    ("raid", "tank"),
    ("mythic_plus", "dps"),
    ("mythic_plus", "healer"),
    ("mythic_plus", "tank"),
}
TIER_PATTERN = re.compile(r"^[A-FS][+]?$")

logger = logging.getLogger(__name__)


class RefreshBusy(RuntimeError):
    """Another refresh owns the dataset lock."""


class DatasetValidationError(ValueError):
    """A candidate snapshot is incomplete or structurally unsafe to publish."""


@dataclass(frozen=True)
class RefreshResult:
    status: str
    run_id: str
    snapshot_id: str | None
    scheduled_for: str
    record_count: int
    unique_spec_count: int
    lkg_preserved: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "run_id": self.run_id,
            "snapshot_id": self.snapshot_id,
            "scheduled_for": self.scheduled_for,
            "record_count": self.record_count,
            "unique_spec_count": self.unique_spec_count,
            "lkg_preserved": self.lkg_preserved,
        }


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _sha256(value: Any) -> bytes:
    return hashlib.sha256(_canonical_json(value)).digest()


def _flatten(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        spec
        for page in payload.get("pages", [])
        for tier in page.get("tiers", [])
        for spec in tier.get("specs", [])
    ]


def validate_candidate(
    payload: dict[str, Any], *, previous_record_count: int | None = None
) -> list[dict[str, Any]]:
    """Return normalized records or reject a suspicious partial scrape."""
    pages = payload.get("pages")
    if not isinstance(pages, list) or len(pages) != 6:
        raise DatasetValidationError("candidate must contain exactly six pages")
    contexts = {(page.get("activity"), page.get("role")) for page in pages}
    if contexts != EXPECTED_CONTEXTS:
        raise DatasetValidationError("candidate is missing an activity/role tier list")

    records = _flatten(payload)
    if not 60 <= len(records) <= 120:
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
    if previous_record_count and len(records) < previous_record_count * 0.8:
        raise DatasetValidationError(
            "candidate lost more than 20 percent of the previous snapshot"
        )

    seen: set[tuple[str, str, str, str]] = set()
    ranks: dict[tuple[str, str, str], list[int]] = {}
    for row in records:
        identity = (
            str(row.get("activity")),
            str(row.get("role")),
            str(row.get("class_slug")),
            str(row.get("spec_slug")),
        )
        if identity in seen:
            raise DatasetValidationError(f"duplicate specialization context: {identity}")
        seen.add(identity)
        tier = str(row.get("tier", ""))
        if TIER_PATTERN.fullmatch(tier) is None:
            raise DatasetValidationError(f"invalid tier label: {tier!r}")
        rank = row.get("rank_in_tier")
        if not isinstance(rank, int) or rank < 1:
            raise DatasetValidationError("tier rank must be a positive integer")
        ranks.setdefault((identity[0], identity[1], tier), []).append(rank)
        guide = urlsplit(str(row.get("guide_url", "")))
        source = urlsplit(str(row.get("source_url", "")))
        if guide.hostname != "www.wowhead.com" or not guide.path.startswith(
            "/guide/classes/"
        ):
            raise DatasetValidationError(f"invalid guide URL for {identity}")
        if source.hostname != "www.wowhead.com" or not source.path.startswith(
            "/guide/classes/tier-lists/"
        ):
            raise DatasetValidationError(f"invalid source URL for {identity}")
    if any(sorted(values) != list(range(1, len(values) + 1)) for values in ranks.values()):
        raise DatasetValidationError("one or more tiers contain non-contiguous ranks")
    return records


def _semantic_payload(payload: dict[str, Any]) -> dict[str, Any]:
    clean_pages: list[dict[str, Any]] = []
    for page in payload["pages"]:
        clean_pages.append({key: value for key, value in page.items() if key != "fetch"})
    return {"schema_version": payload["schema_version"], "pages": clean_pages}


def _safe_error(exc: BaseException) -> tuple[str, str]:
    if isinstance(exc, DatasetValidationError):
        code = "validation_failed"
    elif isinstance(exc, psycopg.Error):
        code = "database_failed"
    elif isinstance(exc, (urllib.error.URLError, TimeoutError)):
        code = "network_failed"
    else:
        code = "collection_failed"
    summary = safe_error(exc)
    return code, summary


def _clickhouse_event(payload: dict[str, Any]) -> None:
    log_fields = {
        key: payload.get(key)
        for key in (
            "run_id", "snapshot_id", "dataset", "status", "duration_ms",
            "page_count", "record_count", "unique_spec_count", "lkg_preserved",
            "error_code",
        )
        if key in payload
    }
    event(
        logger,
        "dataset_refresh_result_persisted",
        level=logging.ERROR if payload.get("status") == "failed" else logging.INFO,
        **log_fields,
    )
    base_url = os.getenv("CLICKHOUSE_HTTP_URL", "http://clickhouse:8123")
    database = os.getenv("CLICKHOUSE_DATABASE", "gildra")
    query = f"INSERT INTO {database}.dataset_refresh_events FORMAT JSONEachRow"
    params = urllib.parse.urlencode(
        {"query": query, "async_insert": "1", "wait_for_async_insert": "1"}
    )
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}?{params}",
        data=_canonical_json(payload) + b"\n",
        method="POST",
        headers={"Content-Type": "application/x-ndjson"},
    )
    user = os.getenv("CLICKHOUSE_USER", "gildra")
    password = os.getenv("CLICKHOUSE_PASSWORD", "")
    if user:
        import base64

        token = base64.b64encode(f"{user}:{password}".encode()).decode()
        request.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if not 200 <= response.status < 300:
                raise RuntimeError(f"ClickHouse returned HTTP {response.status}")
    except Exception:
        logger.exception("dataset refresh telemetry insert failed")


def refresh_tierlist(
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
                raise RefreshBusy("Tierlist WoWHead refresh is already running")
        connection.commit()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT id, current_snapshot_id
                        FROM datasets WHERE slug = %s FOR UPDATE
                        """,
                        (DATASET_SLUG,),
                    )
                    dataset = cursor.fetchone()
                    if dataset is None:
                        raise RuntimeError(f"dataset {DATASET_NAME} is not seeded")
                    dataset_id, current_snapshot_id = dataset
                    cursor.execute(
                        """
                        SELECT id, status, snapshot_id FROM dataset_runs
                        WHERE dataset_id = %s AND run_key = %s
                        """,
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
                            trigger = EXCLUDED.trigger,
                            status = 'running',
                            attempt_count = dataset_runs.attempt_count + 1,
                            started_at = now(), finished_at = NULL,
                            snapshot_id = NULL,
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
                    previous_count: int | None = None
                    if current_snapshot_id:
                        cursor.execute(
                            "SELECT record_count FROM dataset_snapshots WHERE id = %s",
                            (current_snapshot_id,),
                        )
                        previous = cursor.fetchone()
                        previous_count = previous[0] if previous else None

            with stage(logger, "collect"):
                payload = collect_tierlist_dataset()
            with stage(
                logger,
                "validate",
                page_count=payload.get("page_count"),
                candidate_record_count=payload.get("record_count"),
            ):
                records = validate_candidate(payload, previous_record_count=previous_count)
            snapshot_hash = _sha256(_semantic_payload(payload))
            snapshot_id: UUID | None = None
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
                        content = {
                            key: row[key]
                            for key in (
                                "tier", "rank_in_tier", "activity", "role", "class",
                                "class_slug", "spec", "spec_slug", "badge_slug", "guide_id",
                                "guide_title", "guide_url", "source_url", "description",
                                "description_paragraphs", "description_markup",
                            )
                        }
                        rows.append(
                            (
                                snapshot_id, row["activity"], row["role"], row["tier"],
                                row["rank_in_tier"], row["class"], row["class_slug"],
                                row["spec"], row["spec_slug"], row["badge_slug"],
                                row["guide_id"], row.get("guide_title") or "", row["guide_url"],
                                row["source_url"], row["description"],
                                row["description_paragraphs"], row["description_markup"],
                                _sha256(content),
                            )
                        )
                    cursor.executemany(
                        """
                        INSERT INTO tierlist_entries (
                            snapshot_id, activity, role, tier, rank_in_tier,
                            class_name, class_slug, spec_name, spec_slug, badge_slug,
                            guide_id, guide_title, guide_url, source_url, description,
                            description_paragraphs, description_markup, content_hash
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        """,
                        rows,
                    )
                    cursor.execute(
                        """
                        UPDATE dataset_runs SET
                            status = 'succeeded', finished_at = now(), page_count = %s,
                            record_count = %s, unique_spec_count = %s, credits_spent = %s,
                            snapshot_id = %s
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
                            """
                            UPDATE dataset_runs SET status = 'failed', finished_at = now(),
                                error_code = %s, error_summary = %s
                            WHERE id = %s
                            """,
                            (code, summary, run_id),
                        )
                        cursor.execute(
                            """
                            UPDATE datasets SET last_error_code = %s, last_error_summary = %s,
                                updated_at = now() WHERE id = %s
                            """,
                            (code, summary, dataset_id),
                        )
                _clickhouse_event(
                    {
                        "run_id": str(run_id),
                        "occurred_at": datetime.now(UTC).isoformat(),
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
