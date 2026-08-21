#!/usr/bin/env python3
"""Validate and atomically publish the daily Tierlist — MythicStats snapshot."""

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

from .mythicstats_tierlist import collect_mythicstats_dataset
from .observability import event, safe_error, stage, update_context
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

DATASET_SLUG = "tierlist-mythicstats"
DATASET_NAME = "Tierlist — MythicStats"
ADVISORY_LOCK_ID = 0x47696C6472614D53
EXPECTED_CONTEXTS = {"performance", "spec_tiers"}
EXPECTED_ROLES = {"dps", "tank", "healer"}
EXPECTED_CATEGORIES = {"melee", "ranged", "tank", "healer"}
TIER_RE = re.compile(r"^[SABCDF]$")
KEY_RANGE_RE = re.compile(r"^[0-9]+\s*-\s*[0-9]+$")
logger = logging.getLogger(__name__)


class DatasetValidationError(ValueError):
    """A suspicious candidate must never replace the last good snapshot."""


def _valid_mythicstats_url(value: Any, prefix: str) -> bool:
    parsed = urlsplit(str(value or ""))
    return parsed.scheme == "https" and parsed.hostname == "mythicstats.com" and parsed.path.startswith(prefix)


def validate_candidate(
    payload: dict[str, Any], *, previous_record_count: int | None = None
) -> list[dict[str, Any]]:
    pages = payload.get("pages")
    if not isinstance(pages, list) or len(pages) != 2:
        raise DatasetValidationError("candidate must contain exactly two MythicStats pages")
    if {page.get("context_key") for page in pages} != EXPECTED_CONTEXTS:
        raise DatasetValidationError("candidate is missing a MythicStats page")
    if payload.get("page_count") != 2:
        raise DatasetValidationError("candidate page count does not match its contents")

    page_by_context = {str(page["context_key"]): page for page in pages}
    performance = page_by_context["performance"].get("records")
    spec_tiers = page_by_context["spec_tiers"].get("records")
    if not isinstance(performance, list) or not 35 <= len(performance) <= 60:
        raise DatasetValidationError("performance table count is outside safety bounds")
    if not isinstance(spec_tiers, list) or not 35 <= len(spec_tiers) <= 60:
        raise DatasetValidationError("specialization tier count is outside safety bounds")

    records = [*performance, *spec_tiers]
    unique_specs = {(row.get("class_slug"), row.get("spec_slug")) for row in records}
    if not 35 <= len(unique_specs) <= 60:
        raise DatasetValidationError("candidate specialization count is outside safety bounds")
    if payload.get("record_count") != len(records) or payload.get("unique_spec_count") != len(unique_specs):
        raise DatasetValidationError("candidate counts do not match its contents")
    if previous_record_count and len(records) < previous_record_count * 0.75:
        raise DatasetValidationError("candidate lost more than 25 percent of the previous snapshot")

    for page in pages:
        if page.get("record_count") != len(page.get("records", [])):
            raise DatasetValidationError(f"record count mismatch for {page.get('context_key')}")
        expected_path = "/dps" if page["context_key"] == "performance" else "/spec"
        if not _valid_mythicstats_url(page.get("source_url"), expected_path):
            raise DatasetValidationError("invalid MythicStats page URL")
        if not str(page.get("title") or "").strip():
            raise DatasetValidationError("missing MythicStats page title")

    performance_page = page_by_context["performance"]
    if not str(performance_page.get("source_period_id") or "").isdigit():
        raise DatasetValidationError("invalid MythicStats period")
    if not str(performance_page.get("source_period_name") or "").strip():
        raise DatasetValidationError("missing MythicStats period name")

    seen_performance: set[tuple[str, str, str]] = set()
    ranks_by_role: dict[str, set[int]] = {role: set() for role in EXPECTED_ROLES}
    for row in performance:
        role = str(row.get("role") or "")
        identity = (role, str(row.get("class_slug") or ""), str(row.get("spec_slug") or ""))
        if role not in EXPECTED_ROLES or identity in seen_performance:
            raise DatasetValidationError("invalid or duplicate MythicStats performance specialization")
        seen_performance.add(identity)
        rank = row.get("rank")
        if not isinstance(rank, int) or rank < 1 or rank in ranks_by_role[role]:
            raise DatasetValidationError("invalid MythicStats performance rank")
        ranks_by_role[role].add(rank)
        if TIER_RE.fullmatch(str(row.get("tier") or "")) is None:
            raise DatasetValidationError("invalid MythicStats performance tier")
        average = row.get("average_value")
        top = row.get("top_value")
        runs = row.get("runs_estimate")
        if not isinstance(average, int) or not isinstance(top, int) or average <= 0 or top < average:
            raise DatasetValidationError("invalid MythicStats performance values")
        if not isinstance(runs, int) or runs <= 0 or not str(row.get("runs_label") or ""):
            raise DatasetValidationError("invalid MythicStats run count")
        if KEY_RANGE_RE.fullmatch(str(row.get("key_range") or "")) is None:
            raise DatasetValidationError("invalid MythicStats key range")
        if not _valid_mythicstats_url(row.get("spec_url"), "/spec/"):
            raise DatasetValidationError("invalid MythicStats specialization URL")
        if row.get("source_url") != "https://mythicstats.com/dps":
            raise DatasetValidationError("invalid MythicStats performance source URL")
    for role, ranks in ranks_by_role.items():
        minimum = 20 if role == "dps" else 5
        if len(ranks) < minimum or ranks != set(range(1, len(ranks) + 1)):
            raise DatasetValidationError(f"incomplete MythicStats {role} ranking")

    seen_tiers: set[tuple[str, str, str]] = set()
    categories: dict[str, int] = {category: 0 for category in EXPECTED_CATEGORIES}
    ranks_by_tier: dict[tuple[str, str], set[int]] = {}
    for row in spec_tiers:
        category = str(row.get("category") or "")
        identity = (category, str(row.get("class_slug") or ""), str(row.get("spec_slug") or ""))
        if category not in EXPECTED_CATEGORIES or identity in seen_tiers:
            raise DatasetValidationError("invalid or duplicate MythicStats tier specialization")
        seen_tiers.add(identity)
        categories[category] += 1
        tier = str(row.get("tier") or "")
        rank = row.get("rank_in_tier")
        if TIER_RE.fullmatch(tier) is None or not isinstance(rank, int) or rank < 1:
            raise DatasetValidationError("invalid MythicStats specialization tier rank")
        tier_ranks = ranks_by_tier.setdefault((category, tier), set())
        if rank in tier_ranks:
            raise DatasetValidationError("duplicate MythicStats rank within a tier")
        tier_ranks.add(rank)
        if not _valid_mythicstats_url(row.get("spec_url"), "/spec/"):
            raise DatasetValidationError("invalid MythicStats tier specialization URL")
        if row.get("source_url") != "https://mythicstats.com/spec":
            raise DatasetValidationError("invalid MythicStats tier source URL")
    for category, count in categories.items():
        minimum = 10 if category in {"melee", "ranged"} else 5
        if count < minimum:
            raise DatasetValidationError(f"too few MythicStats {category} specializations")
    for ranks in ranks_by_tier.values():
        if ranks != set(range(1, len(ranks) + 1)):
            raise DatasetValidationError("non-contiguous MythicStats tier ranks")

    performance_specs = {(row["class_slug"], row["spec_slug"]) for row in performance}
    tier_specs = {(row["class_slug"], row["spec_slug"]) for row in spec_tiers}
    if performance_specs != tier_specs:
        raise DatasetValidationError("MythicStats tables disagree on specialization coverage")
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
    return code, safe_error(exc)


def _semantic_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": payload["schema_version"],
        "pages": [
            {key: value for key, value in page.items() if key != "fetch"}
            for page in payload["pages"]
        ],
    }


def refresh_tierlist_mythicstats(
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
                raise RefreshBusy("Tierlist — MythicStats refresh is already running")
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
                            "skipped",
                            str(existing[0]),
                            str(existing[2]),
                            scheduled_for.isoformat(),
                            0,
                            0,
                            True,
                        )
                    cursor.execute(
                        """
                        INSERT INTO dataset_runs (dataset_id, run_key, trigger, scheduled_for, status, started_at, lkg_snapshot_id)
                        VALUES (%s, %s, %s, %s, 'running', now(), %s)
                        ON CONFLICT (dataset_id, run_key) DO UPDATE SET
                            trigger = EXCLUDED.trigger, status = 'running', attempt_count = dataset_runs.attempt_count + 1,
                            started_at = now(), finished_at = NULL, snapshot_id = NULL,
                            lkg_snapshot_id = EXCLUDED.lkg_snapshot_id, error_code = '', error_summary = ''
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
                payload = collect_mythicstats_dataset()
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
                        INSERT INTO dataset_snapshots (dataset_id, run_id, source_fetched_at, content_hash,
                            page_count, record_count, unique_spec_count, payload)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                        """,
                        (
                            dataset_id,
                            run_id,
                            datetime.fromisoformat(payload["fetched_at"]),
                            snapshot_hash,
                            payload["page_count"],
                            len(records),
                            payload["unique_spec_count"],
                            Jsonb(payload),
                        ),
                    )
                    snapshot_id = cursor.fetchone()[0]
                    page_rows = []
                    performance_rows = []
                    tier_rows = []
                    for page in payload["pages"]:
                        page_content = {
                            key: value
                            for key, value in page.items()
                            if key not in {"fetch", "records"}
                        }
                        page_rows.append(
                            (
                                snapshot_id,
                                page["context_key"],
                                page["page_type"],
                                page["title"],
                                page["subtitle"],
                                page["source_url"],
                                page["source_period_id"],
                                page["source_period_name"],
                                page["key_range"],
                                page["record_count"],
                                _sha256(page_content),
                            )
                        )
                        for row in page["records"]:
                            if page["page_type"] == "performance":
                                performance_rows.append(
                                    (
                                        snapshot_id,
                                        page["context_key"],
                                        row["role"],
                                        row["rank"],
                                        row["rank_change"],
                                        row["tier"],
                                        row["average_value"],
                                        row["top_value"],
                                        row["runs_label"],
                                        row["runs_estimate"],
                                        row["key_range"],
                                        row["class_name"],
                                        row["class_slug"],
                                        row["spec_name"],
                                        row["spec_slug"],
                                        row["icon_url"],
                                        row["spec_url"],
                                        row["source_url"],
                                        _sha256(row),
                                    )
                                )
                            else:
                                tier_rows.append(
                                    (
                                        snapshot_id,
                                        page["context_key"],
                                        row["category"],
                                        row["tier"],
                                        row["rank_in_tier"],
                                        row["class_name"],
                                        row["class_slug"],
                                        row["spec_name"],
                                        row["spec_slug"],
                                        row["icon_url"],
                                        row["spec_url"],
                                        row["source_url"],
                                        _sha256(row),
                                    )
                                )
                    cursor.executemany(
                        """
                        INSERT INTO mythicstats_pages (snapshot_id, context_key, page_type, title, subtitle,
                            source_url, source_period_id, source_period_name, key_range, record_count, content_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        page_rows,
                    )
                    cursor.executemany(
                        """
                        INSERT INTO mythicstats_performance_entries (snapshot_id, context_key, role, rank,
                            rank_change, tier, average_value, top_value, runs_label, runs_estimate, key_range,
                            class_name, class_slug, spec_name, spec_slug, icon_url, spec_url, source_url, content_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        performance_rows,
                    )
                    cursor.executemany(
                        """
                        INSERT INTO mythicstats_spec_tier_entries (snapshot_id, context_key, category, tier,
                            rank_in_tier, class_name, class_slug, spec_name, spec_slug, icon_url, spec_url,
                            source_url, content_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        tier_rows,
                    )
                    cursor.execute(
                        """
                        UPDATE dataset_runs SET status = 'succeeded', finished_at = now(), page_count = %s,
                            record_count = %s, unique_spec_count = %s, credits_spent = %s,
                            snapshot_id = %s WHERE id = %s
                        """,
                        (
                            payload["page_count"],
                            len(records),
                            payload["unique_spec_count"],
                            Decimal(payload["credits_spent"] or 0),
                            snapshot_id,
                            run_id,
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
                "succeeded",
                str(run_id),
                str(snapshot_id),
                scheduled_for.isoformat(),
                len(records),
                payload["unique_spec_count"],
                False,
            )
            _clickhouse_event(
                {
                    "run_id": str(run_id),
                    "snapshot_id": str(snapshot_id),
                    "occurred_at": datetime.now(UTC).isoformat(),
                    "dataset": DATASET_SLUG,
                    "status": "succeeded",
                    "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                    "page_count": payload["page_count"],
                    "record_count": len(records),
                    "unique_spec_count": payload["unique_spec_count"],
                    "credits": str(payload["credits_spent"] or 0),
                    "lkg_preserved": False,
                    "error_code": "",
                    "metadata": "{}",
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
                        "run_id": str(run_id),
                        "occurred_at": datetime.now(UTC).isoformat(),
                        "dataset": DATASET_SLUG,
                        "status": "failed",
                        "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                        "lkg_preserved": lkg_preserved,
                        "error_code": code,
                        "metadata": json.dumps({"summary": summary}, ensure_ascii=False),
                    }
                )
            raise
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_ID,))
            connection.commit()
