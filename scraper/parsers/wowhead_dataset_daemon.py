#!/usr/bin/env python3
"""Private HTTP entrypoint used by the River daily dataset worker."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, date, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .archon_dataset_service import refresh_tierlist_archon
from .icyveins_dataset_service import refresh_tierlist_icyveins
from .wowgg_dataset_service import refresh_tierlist_wowgg
from .wowhead_dataset_service import RefreshBusy, refresh_tierlist

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


class Handler(BaseHTTPRequestHandler):
    server_version = "gildra-dataset-worker/1"

    def _json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._json(HTTPStatus.OK, {"status": "ok"})
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:
        refreshers = {
            "/internal/v1/datasets/tierlist-wowhead/refresh": refresh_tierlist,
            "/internal/v1/datasets/tierlist-archon/refresh": refresh_tierlist_archon,
            "/internal/v1/datasets/tierlist-wowgg/refresh": refresh_tierlist_wowgg,
            "/internal/v1/datasets/tierlist-icyveins/refresh": refresh_tierlist_icyveins,
        }
        refresher = refreshers.get(self.path)
        if refresher is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
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
            result = refresher(scheduled, trigger=trigger)
            self._json(HTTPStatus.OK, result.as_dict())
        except RefreshBusy as exc:
            self._json(HTTPStatus.CONFLICT, {"error": "refresh_busy", "detail": str(exc)})
        except (ValueError, json.JSONDecodeError) as exc:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "invalid_request", "detail": str(exc)})
        except Exception:
            logger.exception("dataset refresh failed path=%s", self.path)
            self._json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "refresh_failed", "detail": "candidate was not published"},
            )

    def log_message(self, message: str, *args: object) -> None:
        logger.info("request client=%s message=%s", self.client_address[0], message % args)


def main() -> int:
    address = os.getenv("DATASET_WORKER_ADDR", "0.0.0.0")
    port = int(os.getenv("DATASET_WORKER_PORT", "8081"))
    server = ThreadingHTTPServer((address, port), Handler)
    logger.info("dataset worker listening address=%s port=%d", address, port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
