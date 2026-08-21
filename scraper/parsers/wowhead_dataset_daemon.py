#!/usr/bin/env python3
"""Private HTTP entrypoint used by the River daily dataset worker."""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.parse
import urllib.request
from datetime import UTC, date, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from uuid import uuid4

import psycopg

from .archon_dataset_service import refresh_tierlist_archon
from .icyveins_dataset_service import refresh_tierlist_icyveins
from .mythicstats_dataset_service import refresh_tierlist_mythicstats
from .wowgg_dataset_service import refresh_tierlist_wowgg
from .wowhead_dataset_service import RefreshBusy, refresh_tierlist
from .observability import configure_logging, event, log_context, safe_error

configure_logging()
logger = logging.getLogger(__name__)


class Handler(BaseHTTPRequestHandler):
    server_version = "gildra-dataset-worker/1"
    request_id = ""

    def _json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if self.request_id:
            self.send_header("X-Request-ID", self.request_id)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._json(HTTPStatus.OK, {"status": "ok"})
            return
        if self.path == "/readyz":
            try:
                _check_readiness()
            except Exception:
                self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"status": "unavailable"})
                return
            self._json(HTTPStatus.OK, {"status": "ready"})
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:
        refreshers = {
            "/internal/v1/datasets/tierlist-wowhead/refresh": refresh_tierlist,
            "/internal/v1/datasets/tierlist-archon/refresh": refresh_tierlist_archon,
            "/internal/v1/datasets/tierlist-wowgg/refresh": refresh_tierlist_wowgg,
            "/internal/v1/datasets/tierlist-icyveins/refresh": refresh_tierlist_icyveins,
            "/internal/v1/datasets/tierlist-mythicstats/refresh": refresh_tierlist_mythicstats,
        }
        refresher = refreshers.get(self.path)
        if refresher is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        self.request_id = str(uuid4())
        dataset = self.path.split("/")[-2]
        started = time.monotonic()
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > 4096:
                raise ValueError("request body is too large")
            raw = self.rfile.read(length)
            request = json.loads(raw or b"{}")
            scheduled = date.fromisoformat(
                request.get("scheduled_for", datetime.now(UTC).date().isoformat())
            )
            trigger = request.get("trigger", "scheduled")
            if trigger not in {"scheduled", "manual", "retry"}:
                raise ValueError("invalid trigger")
            with log_context(
                request_id=self.request_id,
                dataset=dataset,
                scheduled_for=scheduled.isoformat(),
                trigger=trigger,
            ):
                event(logger, "dataset_refresh_started")
                result = refresher(scheduled, trigger=trigger)
                event(
                    logger,
                    "dataset_refresh_completed",
                    status=result.status,
                    run_id=result.run_id,
                    snapshot_id=result.snapshot_id,
                    record_count=result.record_count,
                    unique_spec_count=result.unique_spec_count,
                    lkg_preserved=result.lkg_preserved,
                    duration_ms=int((time.monotonic() - started) * 1_000),
                )
                self._json(HTTPStatus.OK, result.as_dict())
        except RefreshBusy as exc:
            event(
                logger,
                "dataset_refresh_busy",
                level=logging.WARNING,
                request_id=self.request_id,
                dataset=dataset,
                duration_ms=int((time.monotonic() - started) * 1_000),
            )
            self._json(HTTPStatus.CONFLICT, {"error": "refresh_busy", "detail": str(exc)})
        except (ValueError, json.JSONDecodeError) as exc:
            event(
                logger,
                "dataset_refresh_request_rejected",
                level=logging.WARNING,
                request_id=self.request_id,
                dataset=dataset,
                error_type=type(exc).__name__,
                duration_ms=int((time.monotonic() - started) * 1_000),
            )
            self._json(HTTPStatus.BAD_REQUEST, {"error": "invalid_request", "detail": safe_error(exc)})
        except Exception as exc:
            event(
                logger,
                "dataset_refresh_failed",
                level=logging.ERROR,
                exc=exc,
                request_id=self.request_id,
                dataset=dataset,
                duration_ms=int((time.monotonic() - started) * 1_000),
            )
            self._json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "refresh_failed", "detail": "candidate was not published"},
            )

    def log_message(self, message: str, *args: object) -> None:
        # Request lifecycle events above are structured; health checks stay silent.
        return


def _check_readiness() -> None:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    with psycopg.connect(database_url, connect_timeout=2) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

    base_url = os.getenv("CLICKHOUSE_HTTP_URL", "http://clickhouse:8123")
    params = urllib.parse.urlencode({"query": "SELECT 1"})
    request = urllib.request.Request(f"{base_url.rstrip('/')}?{params}")
    user = os.getenv("CLICKHOUSE_USER", "gildra")
    password = os.getenv("CLICKHOUSE_PASSWORD", "")
    if user:
        import base64

        token = base64.b64encode(f"{user}:{password}".encode()).decode()
        request.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(request, timeout=2) as response:
        if response.status != HTTPStatus.OK:
            raise RuntimeError("ClickHouse readiness check failed")


def main() -> int:
    address = os.getenv("DATASET_WORKER_ADDR", "0.0.0.0")
    port = int(os.getenv("DATASET_WORKER_PORT", "8081"))
    server = ThreadingHTTPServer((address, port), Handler)
    event(logger, "dataset_worker_started", address=address, port=port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
