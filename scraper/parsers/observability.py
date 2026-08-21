"""Structured, redacted observability helpers for dataset refreshes."""

from __future__ import annotations

import contextvars
import hashlib
import json
import logging
import os
import re
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Iterator
from urllib.parse import urlsplit, urlunsplit


_context: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "gildra_scraper_log_context", default={}
)
_sensitive_key = re.compile(
    r"(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|session)", re.I
)
_query_secret = re.compile(
    r"(?i)([?&](?:token|api[_-]?key|key|password|secret|session)\s*=)[^&#\s]+"
)
_bearer_secret = re.compile(r"(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+")


def safe_url(value: str) -> str:
    """Return a useful URL without credentials, query parameters, or fragments."""
    try:
        parsed = urlsplit(value)
    except ValueError:
        return "[invalid-url]"
    if not parsed.scheme or not parsed.hostname:
        return "[invalid-url]"
    host = parsed.hostname
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme, host, parsed.path or "/", "", ""))


def safe_error(exc: BaseException | str, *, limit: int = 500) -> str:
    """Redact common credentials from exception text before persistence or logging."""
    value = " ".join(str(exc).split())
    value = _query_secret.sub(r"\1[REDACTED]", value)
    value = _bearer_secret.sub(r"\1 [REDACTED]", value)
    return value[:limit] or (exc.__class__.__name__ if isinstance(exc, BaseException) else "error")


def _sanitize(key: str, value: Any) -> Any:
    if _sensitive_key.search(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {str(child): _sanitize(str(child), item) for child, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize(key, item) for item in value]
    if isinstance(value, BaseException):
        return safe_error(value)
    if isinstance(value, str):
        if value == "":
            return ""
        return safe_error(value, limit=2_000)
    if isinstance(value, (bool, int, float)) or value is None:
        return value
    return safe_error(str(value), limit=2_000)


class JSONFormatter(logging.Formatter):
    """Emit one JSON object per line with a stable event schema."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname.lower(),
            "service": "gildra-scraper",
            "logger": record.name,
            "event": getattr(record, "event_name", "log"),
            "message": safe_error(record.getMessage(), limit=2_000),
        }
        payload.update(_sanitize("context", _context.get()))
        payload.update(_sanitize("fields", getattr(record, "event_fields", {})))
        if record.exc_info and record.exc_info[1] is not None:
            payload["error_type"] = record.exc_info[0].__name__
            payload["error_summary"] = safe_error(record.exc_info[1])
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def configure_logging() -> None:
    """Configure production JSON logs once at the process boundary."""
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


@contextmanager
def log_context(**fields: Any) -> Iterator[None]:
    merged = {**_context.get(), **fields}
    token = _context.set(merged)
    try:
        yield
    finally:
        _context.reset(token)


def update_context(**fields: Any) -> None:
    _context.set({**_context.get(), **fields})


def current_context() -> dict[str, Any]:
    return dict(_context.get())


def event(
    logger: logging.Logger,
    name: str,
    *,
    level: int = logging.INFO,
    exc: BaseException | None = None,
    **fields: Any,
) -> None:
    logger.log(
        level,
        name,
        extra={"event_name": name, "event_fields": fields},
        exc_info=(type(exc), exc, exc.__traceback__) if exc is not None else None,
    )


@contextmanager
def stage(logger: logging.Logger, name: str, **fields: Any) -> Iterator[None]:
    started = time.monotonic()
    event(logger, "scrape_stage_started", stage=name, **fields)
    try:
        yield
    except BaseException as exc:
        event(
            logger,
            "scrape_stage_failed",
            level=logging.WARNING,
            stage=name,
            duration_ms=int((time.monotonic() - started) * 1_000),
            error_type=type(exc).__name__,
            **fields,
        )
        raise
    else:
        event(
            logger,
            "scrape_stage_completed",
            stage=name,
            duration_ms=int((time.monotonic() - started) * 1_000),
            **fields,
        )


def url_hash(value: str) -> int:
    """Stable non-reversible URL identifier suitable for grouping logs."""
    return int.from_bytes(hashlib.sha256(safe_url(value).encode()).digest()[:8], "big")
