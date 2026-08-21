#!/usr/bin/env python3
"""Validate and atomically publish the eight-hour Tierlist — wow.gg snapshot."""

from __future__ import annotations

import json
import os
import urllib.error
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from .wowgg_tierlist import collect_wowgg_dataset
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

DATASET_SLUG = "tierlist-wowgg"
DATASET_NAME = "Tierlist — wow.gg"
ADVISORY_LOCK_ID = 0x47696C6472615747
TIERS = {"S", "A", "B", "C", "D"}


class DatasetValidationError(ValueError):
    """A candidate is incomplete or suspicious and must not replace the LKG."""


def _flatten(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [record for page in payload.get("pages", []) for record in page.get("records", [])]


def validate_candidate(
    payload: dict[str, Any], *, previous_record_count: int | None = None
) -> list[dict[str, Any]]:
    pages = payload.get("pages")
    if not isinstance(pages, list) or not 180 <= len(pages) <= 1_500:
        raise DatasetValidationError("candidate context count is outside safety bounds")
    if payload.get("page_count") != len(pages):
        raise DatasetValidationError("candidate context count does not match its contents")
    contexts = [str(page.get("context_key") or "") for page in pages]
    if "" in contexts or len(contexts) != len(set(contexts)):
        raise DatasetValidationError("candidate contains a missing or duplicate context")

    families = {(page.get("mode"), page.get("role")) for page in pages}
    required_families = {
        (mode, role)
        for mode in ("mythic_plus", "raid", "pvp")
        for role in ("dps", "healer", "tank")
    } | {("mythic_plus", "dungeon_ease")}
    if not required_families.issubset(families):
        raise DatasetValidationError("candidate is missing a mode or role family")
    if not {"all", "high", "middle", "low"}.issubset(
        {page.get("key_type") for page in pages if page.get("mode") == "mythic_plus"}
    ):
        raise DatasetValidationError("candidate is missing a Mythic+ key range")
    if not {"raid_myth", "raid_hero", "raid_normal", "raid_n10", "raid_n25", "raid_h10", "raid_h25"}.issubset(
        {page.get("raid_difficulty") for page in pages if page.get("mode") == "raid"}
    ):
        raise DatasetValidationError("candidate is missing a raid difficulty")
    if not {"2v2", "3v3", "5v5", "rbg", "shuffle", "blitz"}.issubset(
        {page.get("pvp_bracket") for page in pages if page.get("mode") == "pvp"}
    ):
        raise DatasetValidationError("candidate is missing a PvP bracket")
    if not {"all", "eu", "us", "kr", "tw"}.issubset(
        {page.get("pvp_region") for page in pages if page.get("mode") == "pvp"}
    ):
        raise DatasetValidationError("candidate is missing a PvP region")

    records = _flatten(payload)
    if not 500 <= len(records) <= 20_000:
        raise DatasetValidationError(
            f"candidate record count is outside safety bounds: {len(records)}"
        )
    if payload.get("record_count") != len(records):
        raise DatasetValidationError("candidate record count does not match its contents")
    unique_specs = {
        (row.get("class_slug"), row.get("spec_slug"))
        for row in records if row.get("entity_type") == "specialization"
    }
    if not 35 <= len(unique_specs) <= 80:
        raise DatasetValidationError(
            f"candidate unique specialization count is outside safety bounds: {len(unique_specs)}"
        )
    if payload.get("unique_spec_count") != len(unique_specs):
        raise DatasetValidationError("candidate specialization count does not match its contents")
    if previous_record_count and len(records) < previous_record_count * 0.75:
        raise DatasetValidationError("candidate lost more than 25 percent of the previous snapshot")

    nonempty_baselines = {
        (page.get("mode"), page.get("role"))
        for page in pages
        if page.get("record_count", 0) > 0
        and page.get("selection_id") in {"all", "53", "2v2"}
    }
    if not {("mythic_plus", "dps"), ("raid", "dps"), ("pvp", "dps")}.issubset(nonempty_baselines):
        raise DatasetValidationError("candidate is missing a populated baseline tier list")

    seen: set[tuple[str, str, str]] = set()
    for page in pages:
        rows = page.get("records")
        if not isinstance(rows, list) or page.get("record_count") != len(rows):
            raise DatasetValidationError("context record count does not match its contents")
        source = urlsplit(str(page.get("source_url") or ""))
        if source.hostname != "wow.gg" or not source.path.startswith("/ru/meta/"):
            raise DatasetValidationError("invalid wow.gg context URL")
        try:
            datetime.fromisoformat(str(page["source_updated_at"]).replace("Z", "+00:00"))
        except (KeyError, ValueError) as exc:
            raise DatasetValidationError("invalid wow.gg source timestamp") from exc
        for row in rows:
            identity = (page["context_key"], str(row.get("entity_type")), str(row.get("entity_slug")))
            if identity in seen:
                raise DatasetValidationError(f"duplicate wow.gg entity context: {identity}")
            seen.add(identity)
            if row.get("tier") not in TIERS or not isinstance(row.get("rank"), int) or row["rank"] < 1:
                raise DatasetValidationError("invalid wow.gg tier or rank")
            assignments = row.get("tier_assignments")
            if not isinstance(assignments, dict) or not assignments:
                raise DatasetValidationError("wow.gg tier assignments are missing")
            for assignment in assignments.values():
                if (
                    not isinstance(assignment, dict)
                    or assignment.get("tier") not in TIERS
                    or not isinstance(assignment.get("rank"), int)
                    or assignment["rank"] < 1
                ):
                    raise DatasetValidationError("invalid wow.gg metric tier assignment")
            row_source = urlsplit(str(row.get("source_url") or ""))
            if row_source.hostname != "wow.gg" or not row_source.path.startswith("/ru/meta/"):
                raise DatasetValidationError("invalid wow.gg entry URL")
            if row.get("entity_type") == "specialization":
                guide = urlsplit(str(row.get("guide_url") or ""))
                if guide.hostname != "wow.gg" or not guide.path.startswith("/ru/guides/"):
                    raise DatasetValidationError("invalid wow.gg guide URL")
            elif row.get("entity_type") != "dungeon":
                raise DatasetValidationError("invalid wow.gg entity type")
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


def _numeric(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def refresh_tierlist_wowgg(
    scheduled_for: date, *, trigger: str = "scheduled"
) -> RefreshResult:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    started_at = datetime.now(UTC)
    slot_hour = started_at.hour // 8 * 8
    run_key = f"8h:{scheduled_for.isoformat()}T{slot_hour:02d}"

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK_ID,))
            if not cursor.fetchone()[0]:
                raise RefreshBusy("Tierlist — wow.gg refresh is already running")
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

            payload = collect_wowgg_dataset()
            records = validate_candidate(payload, previous_record_count=previous_count)
            semantic_payload = {key: value for key, value in payload.items() if key != "fetch"}
            snapshot_hash = _sha256(semantic_payload)
            snapshot_id: UUID | None = None
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
                    context_rows = []
                    entry_rows = []
                    for page in payload["pages"]:
                        page_content = {key: value for key, value in page.items() if key != "records"}
                        context_rows.append((
                            snapshot_id, page["context_key"], page["mode"], page["role"],
                            page["addon_id"], page["addon_key"], page["addon_name"],
                            page["selection_type"], page["selection_id"], page["selection_name"],
                            page["key_type"], page["raid_difficulty"], page["pvp_bracket"],
                            page["pvp_region"], page["source_week"], page["source_url"],
                            datetime.fromisoformat(page["source_updated_at"].replace("Z", "+00:00")),
                            page["record_count"], _sha256(page_content),
                        ))
                        for row in page["records"]:
                            entry_rows.append((
                                snapshot_id, page["context_key"], row["entity_type"], row["entity_id"],
                                row["entity_name"], row["entity_slug"], row["rank"], row["tier"],
                                Jsonb(row["tier_assignments"]), row["class_name"], row["class_slug"],
                                row["spec_name"], row["spec_slug"], row["role"], row["guide_url"],
                                row["source_url"], _numeric(row["meta_score"]), _numeric(row["average_dps"]),
                                _numeric(row["average_hps"]), _numeric(row["top_value"]),
                                _numeric(row["popularity"]), row["pvp_players"],
                                _numeric(row["pvp_average_rating"]), _numeric(row["pvp_max_rating"]),
                                _numeric(row["pvp_min_rating"]), row["max_key"], row["diff_rank"],
                                Jsonb(row["metric_values"]), _sha256(row),
                            ))
                    cursor.executemany(
                        """
                        INSERT INTO wowgg_tierlist_contexts (
                            snapshot_id, context_key, mode, role, addon_id, addon_key, addon_name,
                            selection_type, selection_id, selection_name, key_type, raid_difficulty,
                            pvp_bracket, pvp_region, source_week, source_url, source_updated_at,
                            record_count, content_hash
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        context_rows,
                    )
                    cursor.executemany(
                        """
                        INSERT INTO wowgg_tierlist_entries (
                            snapshot_id, context_key, entity_type, entity_id, entity_name, entity_slug,
                            rank, tier, tier_assignments, class_name, class_slug, spec_name, spec_slug,
                            role, guide_url, source_url, meta_score, average_dps, average_hps, top_value,
                            popularity, pvp_players, pvp_average_rating, pvp_max_rating, pvp_min_rating,
                            max_key, diff_rank, metric_values, content_hash
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        """,
                        entry_rows,
                    )
                    cursor.execute(
                        """
                        UPDATE dataset_runs SET status = 'succeeded', finished_at = now(),
                            page_count = %s, record_count = %s, unique_spec_count = %s,
                            credits_spent = %s, snapshot_id = %s
                        WHERE id = %s
                        """,
                        (payload["page_count"], len(records), payload["unique_spec_count"],
                         Decimal(payload.get("credits_spent") or 0), snapshot_id, run_id),
                    )
                    cursor.execute(
                        """
                        UPDATE datasets SET current_snapshot_id = %s, last_success_at = now(),
                            last_error_code = '', last_error_summary = '', updated_at = now()
                        WHERE id = %s
                        """,
                        (snapshot_id, dataset_id),
                    )
            result = RefreshResult(
                "succeeded", str(run_id), str(snapshot_id), scheduled_for.isoformat(),
                len(records), payload["unique_spec_count"], False,
            )
            _clickhouse_event({
                "run_id": str(run_id), "snapshot_id": str(snapshot_id),
                "occurred_at": datetime.now(UTC).isoformat(), "dataset": DATASET_SLUG,
                "status": "succeeded",
                "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                "page_count": payload["page_count"], "record_count": len(records),
                "unique_spec_count": payload["unique_spec_count"],
                "credits": str(payload.get("credits_spent") or 0), "lkg_preserved": False,
                "error_code": "", "metadata": "{}",
            })
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
                _clickhouse_event({
                    "run_id": str(run_id), "occurred_at": datetime.now(UTC).isoformat(),
                    "dataset": DATASET_SLUG, "status": "failed",
                    "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                    "lkg_preserved": lkg_preserved, "error_code": code,
                    "metadata": json.dumps({"summary": summary}, ensure_ascii=False),
                })
            raise
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_ID,))
            connection.commit()
