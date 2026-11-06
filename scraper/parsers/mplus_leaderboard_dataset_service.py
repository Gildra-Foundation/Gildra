#!/usr/bin/env python3
"""Validate and atomically publish the Mythic+ character leaderboards.

One dataset per region (``mplus-leaderboard-eu``, ``-us``, ``-kr``, ``-tw``);
each snapshot is one JSON document in ``dataset_snapshots.payload`` read by the
API as is, so no tables of their own are needed. A candidate that fails
validation never replaces the last good snapshot, and an unchanged candidate is
recorded as a skipped run.

A full crawl of four regions takes one to two hours at the polite request
rate, longer than the River worker's HTTP timeout, so the daemon starts it in
a background thread and answers at once (``start_mplus_leaderboard_refresh``).
Runs are keyed by twelve-hour slot: a retry inside the same slot is a no-op.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import urllib.error
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from .blizzard_api import REGIONS, BlizzardApiError, BlizzardClient
from .mplus_leaderboard import LOADOUT_RE, OVERALL_SIZE, SPEC_SIZE, SPECS, collect_region
from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

logger = logging.getLogger(__name__)

DATASET_PREFIX = "mplus-leaderboard-"
DATASET_NAME = "Mythic+ leaderboard — {region}"
ADVISORY_LOCK_BASE = 0x47696C644D504C42  # "GildMPLB"
SLOT_HOURS = 12
MIN_CHARACTERS = {"eu": 500, "us": 500, "kr": 60, "tw": 60}
MAX_CHARACTERS = OVERALL_SIZE + SPEC_SIZE * len(SPECS)
# Realm slugs are lower-case and may carry letters beyond ASCII ("aggra-português").
REALM_RE = re.compile(r"^[^\sA-Z/?#%&]{2,64}$")
ICON_RE = re.compile(r"^[a-z0-9_-]{1,120}$")


class DatasetValidationError(ValueError):
    """A suspicious candidate must never replace the last good snapshot."""


def dataset_slug(region: str) -> str:
    return f"{DATASET_PREFIX}{region}"


def validate_candidate(payload: dict[str, Any], *, previous_count: int | None = None) -> int:
    """Raise on anything structurally unsafe; return the number of characters."""
    region = payload.get("region")
    if region not in REGIONS or payload.get("schema_version") != 1:
        raise DatasetValidationError("unknown region or schema")
    season = payload.get("season") or {}
    if not isinstance(season.get("id"), int) or season["id"] <= 0 or not str(season.get("name") or "").strip():
        raise DatasetValidationError("invalid season")
    if not isinstance(payload.get("period"), int) or payload["period"] <= 0:
        raise DatasetValidationError("invalid period")
    characters = payload.get("characters")
    if not isinstance(characters, list) or not MIN_CHARACTERS[region] <= len(characters) <= MAX_CHARACTERS:
        raise DatasetValidationError(f"{region}: character count outside safety bounds: {len(characters or [])}")
    if previous_count and len(characters) < previous_count * 0.5:
        raise DatasetValidationError(f"{region}: candidate lost more than half of the previous characters")
    realms = payload.get("realms") or {}
    seen: set[tuple[str, str]] = set()
    last = float("inf")
    for character in characters:
        name, realm = str(character.get("name") or ""), str(character.get("realm") or "")
        if not 2 <= len(name) <= 24 or not REALM_RE.fullmatch(realm) or realm not in realms:
            raise DatasetValidationError(f"invalid character identity {name!r}@{realm!r}")
        identity = (realm, name.casefold())
        if identity in seen:
            raise DatasetValidationError(f"duplicate character {name}@{realm}")
        seen.add(identity)
        if character.get("spec") not in SPECS:
            raise DatasetValidationError(f"{name}: unknown specialization")
        score = character.get("score")
        if not isinstance(score, (int, float)) or not 0 < score < 6000 or score > last:
            raise DatasetValidationError(f"{name}: rating out of range or out of order")
        last = score
        key, ilvl = character.get("key"), character.get("ilvl")
        if key is not None and (not isinstance(key, int) or not 2 <= key <= 40):
            raise DatasetValidationError(f"{name}: keystone level out of range")
        if ilvl is not None and (not isinstance(ilvl, int) or not 1 <= ilvl <= 1500):
            raise DatasetValidationError(f"{name}: item level out of range")
        loadout = character.get("loadout")
        if loadout is not None and not LOADOUT_RE.fullmatch(str(loadout)):
            raise DatasetValidationError(f"{name}: invalid talent loadout")
    with_ilvl = sum(1 for character in characters if character.get("ilvl"))
    if with_ilvl < len(characters) * 0.8:
        raise DatasetValidationError("too many characters without profile details")
    specs = payload.get("specs")
    if not isinstance(specs, list) or {spec.get("id") for spec in specs} != set(SPECS):
        raise DatasetValidationError("spec summaries do not cover every specialization")
    items = payload.get("items") or {}
    for spec in specs:
        if spec.get("role") != SPECS[spec["id"]][1] or spec.get("class_id") != SPECS[spec["id"]][0]:
            raise DatasetValidationError(f"spec {spec['id']}: wrong class or role")
        for entry in spec.get("hero") or []:
            if not isinstance(entry.get("id"), int) or not 0 <= float(entry.get("share", -1)) <= 1:
                raise DatasetValidationError(f"spec {spec['id']}: invalid hero talent share")
        for entry in (spec.get("trinkets") or []) + (spec.get("weapons") or []):
            if not 0 <= float(entry.get("share", -1)) <= 1:
                raise DatasetValidationError(f"spec {spec['id']}: invalid item share")
    for item_id, item in items.items():
        if not item_id.isdigit() or not str((item.get("name") or {}).get("en") or ""):
            raise DatasetValidationError(f"item {item_id}: invalid")
        if item.get("icon") is not None and not ICON_RE.fullmatch(str(item["icon"])):
            raise DatasetValidationError(f"item {item_id}: invalid icon")
    if payload.get("record_count") != len(characters):
        raise DatasetValidationError("candidate counts do not match its contents")
    return len(characters)


def _safe_error(exc: BaseException) -> tuple[str, str]:
    if isinstance(exc, DatasetValidationError):
        code = "validation_failed"
    elif isinstance(exc, psycopg.Error):
        code = "database_failed"
    elif isinstance(exc, (urllib.error.URLError, TimeoutError, BlizzardApiError)):
        code = "network_failed"
    else:
        code = "collection_failed"
    return code, (" ".join(str(exc).split())[:500] or exc.__class__.__name__)


def _semantic_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: payload[key] for key in ("schema_version", "region", "season", "specs", "items", "realms", "characters")}


def _public_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """What the API serves: everything except fetch telemetry."""
    return {key: value for key, value in payload.items() if key != "fetch"}


def refresh_region(region: str, client: BlizzardClient, scheduled_for: date, *, trigger: str = "scheduled",
                   item_cache: dict[int, dict[str, Any]] | None = None) -> RefreshResult:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    slug, name = dataset_slug(region), DATASET_NAME.format(region=region.upper())
    started_at = datetime.now(UTC)
    slot_hour = started_at.hour // SLOT_HOURS * SLOT_HOURS
    run_key = f"{SLOT_HOURS}h:{scheduled_for.isoformat()}T{slot_hour:02d}"
    lock_id = ADVISORY_LOCK_BASE + REGIONS.index(region)
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (lock_id,))
            if not cursor.fetchone()[0]:
                raise RefreshBusy(f"{name} refresh is already running")
        connection.commit()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    # Self-seeding: the dataset row is data, not schema, so no migration is needed.
                    cursor.execute("""
                        INSERT INTO datasets (slug, name, source_name, refresh_interval)
                        VALUES (%s, %s, 'Blizzard API', INTERVAL '12 hours')
                        ON CONFLICT (slug) DO NOTHING
                    """, (slug, name))
                    cursor.execute("SELECT id, current_snapshot_id FROM datasets WHERE slug = %s FOR UPDATE", (slug,))
                    dataset = cursor.fetchone()
                    if dataset is None:
                        raise RuntimeError(f"dataset {name} could not be seeded")
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
                    previous: dict[str, Any] | None = None
                    previous_hash = None
                    if current_snapshot_id:
                        cursor.execute("""
                            SELECT content_hash, (
                              SELECT jsonb_agg(jsonb_build_object('name', c->'name', 'realm', c->'realm', 'spec', c->'spec'))
                              FROM jsonb_array_elements(payload->'characters') c
                            ) FROM dataset_snapshots WHERE id = %s
                        """, (current_snapshot_id,))
                        row = cursor.fetchone()
                        if row:
                            previous_hash = bytes(row[0])
                            previous = {"characters": row[1] or []}

            payload = collect_region(region, client, previous=previous, item_cache=item_cache,
                                     log=lambda message: logger.info("%s", message))
            count = validate_candidate(payload, previous_count=len((previous or {}).get("characters") or []) or None)
            snapshot_hash = _sha256(_semantic_payload(payload))
            unchanged = previous_hash is not None and previous_hash == snapshot_hash
            snapshot_id: UUID | None = current_snapshot_id if unchanged else None
            with connection.transaction():
                with connection.cursor() as cursor:
                    if not unchanged:
                        cursor.execute("""
                            INSERT INTO dataset_snapshots (dataset_id, run_id, source_fetched_at, content_hash, page_count, record_count, unique_spec_count, payload)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                        """, (dataset_id, run_id, datetime.fromisoformat(payload["fetched_at"]), snapshot_hash,
                              payload["page_count"], count, payload["unique_spec_count"],
                              Jsonb(_public_payload(payload), dumps=lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":")))))
                        snapshot_id = cursor.fetchone()[0]
                    cursor.execute("""
                        UPDATE dataset_runs SET status = %s, finished_at = now(), page_count = %s,
                            record_count = %s, unique_spec_count = %s, credits_spent = %s, snapshot_id = %s WHERE id = %s
                    """, ("skipped" if unchanged else "succeeded", payload["page_count"], count,
                          payload["unique_spec_count"], Decimal(0), snapshot_id, run_id))
                    cursor.execute("""
                        UPDATE datasets SET current_snapshot_id = %s, last_success_at = now(), last_error_code = '',
                            last_error_summary = '', updated_at = now() WHERE id = %s
                    """, (snapshot_id, dataset_id))
            status = "skipped" if unchanged else "succeeded"
            _clickhouse_event({"run_id": str(run_id), "snapshot_id": str(snapshot_id), "occurred_at": datetime.now(UTC).isoformat(),
                               "dataset": slug, "status": status, "duration_ms": int((datetime.now(UTC)-started_at).total_seconds()*1000),
                               "page_count": payload["page_count"], "record_count": count, "unique_spec_count": payload["unique_spec_count"],
                               "credits": "0", "lkg_preserved": unchanged, "error_code": "",
                               "metadata": json.dumps(payload.get("fetch") or {})})
            return RefreshResult(status, str(run_id), str(snapshot_id), scheduled_for.isoformat(), count, payload["unique_spec_count"], unchanged)
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
                _clickhouse_event({"run_id": str(run_id), "occurred_at": datetime.now(UTC).isoformat(), "dataset": slug,
                                   "status": "failed", "duration_ms": int((datetime.now(UTC)-started_at).total_seconds()*1000),
                                   "lkg_preserved": lkg_preserved, "error_code": code,
                                   "metadata": json.dumps({"summary": summary}, ensure_ascii=False)})
            raise
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (lock_id,))
            connection.commit()


def refresh_mplus_leaderboards(scheduled_for: date, *, trigger: str = "scheduled") -> list[RefreshResult]:
    """Every region in turn; one region failing keeps the others (and its own last good snapshot)."""
    client = BlizzardClient()
    item_cache: dict[int, dict[str, Any]] = {}
    results = []
    for region in REGIONS:
        try:
            results.append(refresh_region(region, client, scheduled_for, trigger=trigger, item_cache=item_cache))
        except Exception:
            logger.exception("Mythic+ leaderboard refresh failed region=%s", region)
    logger.info("Mythic+ leaderboard refresh finished requests=%d", client.request_count)
    return results


_background_lock = threading.Lock()
_background: threading.Thread | None = None


def start_mplus_leaderboard_refresh(scheduled_for: date, *, trigger: str = "scheduled") -> RefreshResult:
    """Start the crawl in the background; a second call while it runs is a no-op."""
    global _background
    if not os.environ.get("BATTLENET_CLIENT_ID") or not os.environ.get("BATTLENET_CLIENT_SECRET"):
        raise RuntimeError("BATTLENET_CLIENT_ID and BATTLENET_CLIENT_SECRET are required")
    with _background_lock:
        if _background is not None and _background.is_alive():
            return RefreshResult("running", "", None, scheduled_for.isoformat(), 0, 0, True)
        _background = threading.Thread(
            target=refresh_mplus_leaderboards, args=(scheduled_for,), kwargs={"trigger": trigger},
            name="mplus-leaderboard-refresh", daemon=True,
        )
        _background.start()
    return RefreshResult("started", "", None, scheduled_for.isoformat(), 0, 0, True)
