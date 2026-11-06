#!/usr/bin/env python3
"""Shared shape, validation and publishing of the JSON-payload tier lists.

Newer tier-list sources (wowmeta.com, wythic.com, method.gg, murlok.io and the
Gildra PvP ladder computed from the Blizzard API) publish one compact document
per snapshot in ``dataset_snapshots.payload`` instead of tables of their own,
so they need no migration. The API reads the payload as is
(backend/internal/gamemeta/payloadtier.go).

Payload, schema_version 1::

    {"schema_version": 1, "source": "wowmeta", "source_name": "wowmeta.com",
     "source_url": "https://wowmeta.com", "fetched_at": "...",
     "lists": [{"activity": "mythic_plus" | "raid" | "pvp", "role": "dps" | "healer" | "tank",
                "bracket": "" | "shuffle" | "2v2" | "3v3" | "blitz" | "rbg",
                "region": "" | "all" | "eu" | "us", "source_url": "...",
                "tiers_derived": false, "sample": 123,
                "entries": [{"rank": 1, "tier": "S", "class_slug": "warrior", "spec_slug": "arms",
                             "class_name": "Warrior", "spec_name": "Arms",
                             "metrics": {"score": 1.0, "rating": 2400.0, "popularity": 0.12,
                                         "players": 120, "max_key": 21, "win_rate": 0.55},
                             "change": "up" | "down" | ""}]}],
     "page_count": 3, "record_count": 80, "unique_spec_count": 40, "credits_spent": "0"}

Only facts are stored: spec identity, position, tier and the source's numbers.
A candidate that fails validation never replaces the last good snapshot; an
unchanged one is recorded as a skipped run.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Callable
from urllib.parse import urlsplit
from uuid import UUID

from web_scraper import ResponseContract, validate_response
from web_scraper.fetchers.base import RawResponse

from .wow_specs import BY_SLUGS, ROLES, Spec

SCHEMA_VERSION = 1
ACTIVITIES = ("mythic_plus", "raid", "pvp")
BRACKETS = ("shuffle", "2v2", "3v3", "blitz", "rbg")
REGIONS = ("all", "eu", "us")
TIERS = ("S", "A", "B", "C", "D", "F")
TIER_RE = re.compile(r"^[SABCDF][+-]?$")
METRIC_KEYS = {"score", "rating", "popularity", "players", "max_key", "win_rate", "mean"}
USER_AGENT = "GildraDatasetBot/1.0 (+https://gildra.net)"
MAX_BODY_BYTES = 4_000_000
STOP_SIGNATURES = ("Just a moment...", "cf-chl-", "Access denied", "Attention Required")


class DatasetValidationError(ValueError):
    """A suspicious candidate must never replace the last good snapshot."""


class TierParseError(ValueError):
    """The page layout changed: never publish a partial parse."""


def html_contract(*canaries: str, min_body_bytes: int = 20_000) -> ResponseContract:
    return ResponseContract.html(canaries=canaries, min_body_bytes=min_body_bytes, stop_signatures=STOP_SIGNATURES)


class PoliteFetcher:
    """Direct HTTPS with at most one request per ``interval`` seconds per source.

    These sources answer plain requests; when a response is blocked or fails
    its contract the run fails and the last good snapshot stays (no paid
    providers for optional tabs).
    """

    def __init__(self, host: str, *, interval: float = 1.5) -> None:
        self.host = host
        self.interval = interval
        self._last = 0.0
        self.requests = 0

    def get(self, url: str, contract: ResponseContract) -> tuple[bytes, dict[str, Any]]:
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.hostname != self.host:
            raise ValueError(f"unexpected URL for {self.host}: {url}")
        delay = self.interval - (time.monotonic() - self._last)
        if delay > 0:
            time.sleep(delay)
        self._last = time.monotonic()
        self.requests += 1
        request = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml", "Accept-Encoding": "identity",
        })
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read(MAX_BODY_BYTES + 1)
            final = urlsplit(response.geturl())
            raw = RawResponse(requested_url=url, final_url=response.geturl(), status=response.status,
                              headers=dict(response.headers), body=body, elapsed_ms=0,
                              truncated=len(body) > MAX_BODY_BYTES)
        if final.hostname != self.host:
            raise RuntimeError(f"{self.host} redirected to {final.hostname}")
        validated = validate_response(raw, contract)
        if not validated.transport_validated:
            raise RuntimeError(f"{self.host} response failed validation: {validated.telemetry()['reason']}")
        return body, {"path": parts.path, "provider": "direct", "target_status": raw.status,
                      "body_bytes": len(body), "credits_spent": "0"}


def entry(spec: Spec, rank: int, tier: str, metrics: dict[str, Any] | None = None, change: str = "") -> dict[str, Any]:
    return {
        "rank": rank, "tier": tier, "class_slug": spec.class_slug, "spec_slug": spec.spec_slug,
        "class_name": spec.class_name, "spec_name": spec.spec_name,
        "metrics": {key: value for key, value in (metrics or {}).items() if value is not None},
        "change": change,
    }


def split_by_role(entries: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """One all-roles ranking → per-role lists, keeping the source's order and tiers; ranks restart at 1."""
    roles: dict[str, list[dict[str, Any]]] = {role: [] for role in ROLES}
    for item in sorted(entries, key=lambda value: value["rank"]):
        spec = BY_SLUGS[(item["class_slug"], item["spec_slug"])]
        roles[spec.role].append({**item, "rank": len(roles[spec.role]) + 1})
    return roles


def build_payload(source: str, source_name: str, source_url: str, lists: list[dict[str, Any]],
                  fetches: list[dict[str, Any]], fetched_at: datetime, **extra: Any) -> dict[str, Any]:
    rows = [item for table in lists for item in table["entries"]]
    return {
        "schema_version": SCHEMA_VERSION, "source": source, "source_name": source_name, "source_url": source_url,
        "fetched_at": fetched_at.isoformat(), **extra, "lists": lists,
        "page_count": len(fetches), "record_count": len(rows),
        "unique_spec_count": len({(item["class_slug"], item["spec_slug"]) for item in rows}),
        "credits_spent": "0", "fetch": fetches,
    }


@dataclass(frozen=True)
class Expectation:
    """What a source's candidate must contain to be published."""

    source: str
    host: str
    # (activity, role, bracket, region) keys that must all be present.
    required: tuple[tuple[str, str, str, str], ...]
    # Minimum share of the role's specs a list must rank (dps 0.6 → 16 of 27).
    min_coverage: float = 0.6


def _list_key(table: dict[str, Any]) -> tuple[str, str, str, str]:
    return (table.get("activity"), table.get("role"), table.get("bracket", ""), table.get("region", ""))  # type: ignore[return-value]


def validate_payload(payload: dict[str, Any], expect: Expectation, *, previous_record_count: int | None = None) -> int:
    """Raise on anything structurally unsafe; return the number of spec rows."""
    from .wow_specs import ROLE_SIZES

    if payload.get("schema_version") != SCHEMA_VERSION or payload.get("source") != expect.source:
        raise DatasetValidationError("unexpected schema version or source")
    if urlsplit(str(payload.get("source_url"))).hostname != expect.host:
        raise DatasetValidationError("unexpected source URL")
    lists = payload.get("lists")
    if not isinstance(lists, list) or not lists:
        raise DatasetValidationError("candidate has no lists")
    keys = [_list_key(table) for table in lists]
    if len(set(keys)) != len(keys):
        raise DatasetValidationError("duplicate lists")
    missing = [key for key in expect.required if key not in keys]
    if missing:
        raise DatasetValidationError(f"candidate lost lists: {missing}")
    rows = 0
    for table in lists:
        activity, role, bracket, region = _list_key(table)
        label = f"{activity}/{role}/{bracket or '-'}/{region or '-'}"
        if activity not in ACTIVITIES or role not in ROLES:
            raise DatasetValidationError(f"{label}: unknown activity or role")
        if (activity == "pvp") != bool(bracket) or (bracket and bracket not in BRACKETS):
            raise DatasetValidationError(f"{label}: bracket does not match the activity")
        if region and region not in REGIONS:
            raise DatasetValidationError(f"{label}: unknown region")
        list_url = urlsplit(str(table.get("source_url", "")))
        if list_url.scheme != "https" or (list_url.hostname or "").removeprefix("www.") != expect.host.removeprefix("www."):
            raise DatasetValidationError(f"{label}: invalid source URL")
        entries = table.get("entries") or []
        if len(entries) < max(1, int(ROLE_SIZES[role] * expect.min_coverage)) or len(entries) > ROLE_SIZES[role]:
            raise DatasetValidationError(f"{label}: {len(entries)} specs")
        if [item.get("rank") for item in entries] != list(range(1, len(entries) + 1)):
            raise DatasetValidationError(f"{label}: ranks are not 1..n")
        seen: set[tuple[str, str]] = set()
        for item in entries:
            identity = (str(item.get("class_slug")), str(item.get("spec_slug")))
            spec = BY_SLUGS.get(identity)
            if spec is None or identity in seen:
                raise DatasetValidationError(f"{label}: unknown or duplicate spec {identity}")
            seen.add(identity)
            if spec.role != role:
                raise DatasetValidationError(f"{label}: {identity} is not a {role} spec")
            if not TIER_RE.fullmatch(str(item.get("tier"))):
                raise DatasetValidationError(f"{label}: {identity} has tier {item.get('tier')!r}")
            metrics = item.get("metrics") or {}
            if not set(metrics) <= METRIC_KEYS:
                raise DatasetValidationError(f"{label}: unknown metrics {sorted(set(metrics) - METRIC_KEYS)}")
            for key, value in metrics.items():
                if not isinstance(value, (int, float)) or isinstance(value, bool) or value != value:
                    raise DatasetValidationError(f"{label}: {identity} {key} is not a number")
                if key in {"popularity", "win_rate"} and not 0 <= value <= 1:
                    raise DatasetValidationError(f"{label}: {identity} {key} out of range")
                if key in {"players", "max_key", "rating"} and value < 0:
                    raise DatasetValidationError(f"{label}: {identity} {key} is negative")
            if item.get("change", "") not in {"", "up", "down"}:
                raise DatasetValidationError(f"{label}: {identity} has an unknown change marker")
        # A source orders its rows best first: tiers may never get better further down.
        weights = [TIERS.index(str(item["tier"])[0]) for item in entries]
        if weights != sorted(weights):
            raise DatasetValidationError(f"{label}: tiers are not ordered")
        rows += len(entries)
    if payload.get("record_count") != rows:
        raise DatasetValidationError("candidate counts do not match its contents")
    if previous_record_count and rows < previous_record_count * 0.75:
        raise DatasetValidationError("candidate lost more than a quarter of the previous rows")
    return rows


# ---------------------------------------------------------------------------
# Publishing (same contract as mythistone_simtier_dataset_service).


def _safe_error(exc: BaseException) -> tuple[str, str]:
    import psycopg

    if isinstance(exc, DatasetValidationError):
        code = "validation_failed"
    elif isinstance(exc, psycopg.Error):
        code = "database_failed"
    elif isinstance(exc, (urllib.error.URLError, TimeoutError)):
        code = "network_failed"
    else:
        code = "collection_failed"
    return code, (" ".join(str(exc).split())[:500] or exc.__class__.__name__)


def _semantic(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key not in {"fetched_at", "fetch", "credits_spent"}}


def _public(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key != "fetch"}


@dataclass(frozen=True)
class PayloadDataset:
    slug: str
    name: str
    source_name: str
    refresh_hours: int
    lock_id: int
    expect: Expectation
    collect: Callable[[], dict[str, Any]]


def publish(dataset: PayloadDataset, scheduled_for: date, *, trigger: str = "scheduled"):
    """Collect, validate and atomically publish one payload dataset (self-seeding)."""
    import psycopg
    from psycopg.types.json import Jsonb

    from .wowhead_dataset_service import RefreshBusy, RefreshResult, _clickhouse_event, _sha256

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    started_at = datetime.now(UTC)
    slot_hour = started_at.hour // dataset.refresh_hours * dataset.refresh_hours if dataset.refresh_hours < 24 else 0
    run_key = f"{dataset.refresh_hours}h:{scheduled_for.isoformat()}T{slot_hour:02d}"
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", (dataset.lock_id,))
            if not cursor.fetchone()[0]:
                raise RefreshBusy(f"{dataset.name} refresh is already running")
        connection.commit()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO datasets (slug, name, source_name, refresh_interval)
                        VALUES (%s, %s, %s, make_interval(hours => %s))
                        ON CONFLICT (slug) DO NOTHING
                    """, (dataset.slug, dataset.name, dataset.source_name, dataset.refresh_hours))
                    cursor.execute("SELECT id, current_snapshot_id FROM datasets WHERE slug = %s FOR UPDATE", (dataset.slug,))
                    row = cursor.fetchone()
                    if row is None:
                        raise RuntimeError(f"dataset {dataset.name} could not be seeded")
                    dataset_id, current_snapshot_id = row
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

            payload = dataset.collect()
            rows = validate_payload(payload, dataset.expect, previous_record_count=previous_rows)
            snapshot_hash = _sha256(_semantic(payload))
            credits = Decimal(payload.get("credits_spent") or 0)
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
                              Jsonb(_public(payload), dumps=lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":")))))
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
            _clickhouse_event({"run_id": str(run_id), "snapshot_id": str(snapshot_id), "occurred_at": datetime.now(UTC).isoformat(),
                               "dataset": dataset.slug, "status": status, "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                               "page_count": payload["page_count"], "record_count": rows, "unique_spec_count": payload["unique_spec_count"],
                               "credits": str(credits), "lkg_preserved": unchanged, "error_code": "", "metadata": "{}"})
            return RefreshResult(status, str(run_id), str(snapshot_id), scheduled_for.isoformat(), rows, payload["unique_spec_count"], unchanged)
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
                _clickhouse_event({"run_id": str(run_id), "occurred_at": datetime.now(UTC).isoformat(), "dataset": dataset.slug,
                                   "status": "failed", "duration_ms": int((datetime.now(UTC) - started_at).total_seconds() * 1000),
                                   "lkg_preserved": lkg_preserved, "error_code": code,
                                   "metadata": json.dumps({"summary": summary}, ensure_ascii=False)})
            raise
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (dataset.lock_id,))
            connection.commit()
