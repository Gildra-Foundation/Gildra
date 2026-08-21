#!/usr/bin/env python3
"""Extract the six class tier-list links from Wowhead's guide index."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import tempfile
import time
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit, urlunsplit

from web_scraper import ResponseContract, validate_response
from web_scraper.fetchers.base import RawResponse
from web_scraper.providers import (
    BrightDataProvider,
    ProviderError,
    ProviderRequest,
    ScrapeDoProvider,
    ZenRowsProvider,
    ZyteProvider,
)

from .observability import event, safe_error, safe_url

DEFAULT_SOURCE_URL = "https://www.wowhead.com/guides/classes/tier-lists"
DEFAULT_OUTPUT = "/app/reports/wowhead-tier-lists.json"

_PATH_RE = re.compile(
    r"^/guide/classes/tier-lists/"
    r"(?P<role>dps|healer|tank)-rankings-(?P<activity>raids|mythic-plus)/?$"
)
_ROLE_ORDER = {"dps": 0, "healer": 1, "tank": 2}
_ACTIVITY_ORDER = {"raid": 0, "mythic_plus": 1}
logger = logging.getLogger(__name__)


def _provider_attempts() -> int:
    try:
        configured = int(os.getenv("SCRAPER_PROVIDER_ATTEMPTS", "2"))
    except ValueError:
        configured = 2
    return max(1, min(3, configured))


class _AnchorCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a" or self._href is not None:
            return
        href = dict(attrs).get("href")
        if href:
            self._href = href
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self._href is None:
            return
        title = " ".join("".join(self._text).split())
        self.links.append((self._href, title))
        self._href = None
        self._text = []


def extract_tier_list_links(html: bytes | str, source_url: str) -> list[dict[str, str]]:
    text = html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html
    parser = _AnchorCollector()
    parser.feed(text)

    found: dict[str, dict[str, str]] = {}
    for href, title in parser.links:
        absolute = urljoin(source_url, href)
        parts = urlsplit(absolute)
        if parts.scheme != "https" or parts.hostname not in {"wowhead.com", "www.wowhead.com"}:
            continue
        match = _PATH_RE.fullmatch(parts.path)
        if match is None:
            continue

        canonical_url = urlunsplit(("https", "www.wowhead.com", parts.path.rstrip("/"), "", ""))
        activity = "raid" if match.group("activity") == "raids" else "mythic_plus"
        role = match.group("role")
        found[canonical_url] = {
            "activity": activity,
            "role": role,
            "title": title or f"{role.upper()} Tier List",
            "url": canonical_url,
        }

    return sorted(
        found.values(),
        key=lambda item: (_ACTIVITY_ORDER[item["activity"]], _ROLE_ORDER[item["role"]]),
    )


def fetch_with_scrape_do(
    source_url: str, contract: ResponseContract
) -> tuple[bytes, dict[str, Any]]:
    provider = ScrapeDoProvider()
    if not provider.configured:
        raise RuntimeError("Scrape.do is not configured in the process environment")

    started = time.monotonic()
    event(
        logger,
        "scrape_fetch_attempt_started",
        provider=provider.name,
        strategy="normal",
        target_url=safe_url(source_url),
        attempt=1,
    )
    try:
        response = provider.fetch(
            ProviderRequest(url=source_url, strategy_id="normal", timeout_seconds=60.0)
        )
    except (ProviderError, OSError, TimeoutError) as exc:
        event(
            logger,
            "scrape_fetch_attempt_failed",
            level=logging.WARNING,
            provider=provider.name,
            strategy="normal",
            target_url=safe_url(source_url),
            attempt=1,
            duration_ms=int((time.monotonic() - started) * 1_000),
            error_type=type(exc).__name__,
            error_summary=safe_error(exc),
        )
        raise
    raw = RawResponse(
        requested_url=source_url,
        final_url=response.final_url or source_url,
        status=response.target_status,
        headers=response.headers,
        body=response.body,
        elapsed_ms=response.latency_ms,
        truncated=response.truncated,
    )
    validated = validate_response(raw, contract)
    if not validated.transport_validated:
        telemetry = validated.telemetry()
        event(
            logger,
            "scrape_fetch_attempt_rejected",
            level=logging.WARNING,
            provider=provider.name,
            strategy="normal",
            target_url=safe_url(source_url),
            attempt=1,
            duration_ms=int((time.monotonic() - started) * 1_000),
            target_status=telemetry["status"],
            verdict=telemetry["verdict"],
            reason=telemetry["reason"],
        )
        raise RuntimeError(
            "Wowhead response failed validation: "
            f"verdict={telemetry['verdict']} status={telemetry['status']} "
            f"reason={telemetry['reason']}"
        )

    event(
        logger,
        "scrape_fetch_attempt_completed",
        provider=response.provider,
        strategy=response.strategy_id,
        target_url=safe_url(source_url),
        attempt=1,
        duration_ms=int((time.monotonic() - started) * 1_000),
        target_status=response.target_status,
        body_bytes=len(response.body),
    )
    return response.body, {
        "provider": response.provider,
        "strategy": response.strategy_id,
        "target_status": response.target_status,
        "body_bytes": len(response.body),
        "credits_spent": str(response.cost.credits) if response.cost.attributed else None,
    }


def fetch_with_fallback(
    source_url: str,
    contract: ResponseContract,
    *,
    providers: list[tuple[Any, str]] | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """Keep Scrape.do primary and fail over only when its result is unusable."""
    candidates = providers or [
        (ScrapeDoProvider(), "normal"),
        (ZenRowsProvider(), "basic"),
        (ZyteProvider(), "http"),
        (BrightDataProvider(), "unlocker"),
    ]
    failed: list[str] = []
    attempts_per_provider = _provider_attempts()
    for provider, strategy in candidates:
        if not provider.configured:
            continue
        for attempt in range(1, attempts_per_provider + 1):
            started = time.monotonic()
            event(
                logger,
                "scrape_fetch_attempt_started",
                provider=provider.name,
                strategy=strategy,
                target_url=safe_url(source_url),
                attempt=attempt,
            )
            try:
                response = provider.fetch(
                    ProviderRequest(
                        url=source_url,
                        strategy_id=strategy,
                        timeout_seconds=60.0,
                    )
                )
                raw = RawResponse(
                    requested_url=source_url,
                    final_url=response.final_url or source_url,
                    status=response.target_status,
                    headers=response.headers,
                    body=response.body,
                    elapsed_ms=response.latency_ms,
                    truncated=response.truncated,
                )
                validated = validate_response(raw, contract)
                if not validated.transport_validated:
                    telemetry = validated.telemetry()
                    event(
                        logger,
                        "scrape_fetch_attempt_rejected",
                        level=logging.WARNING,
                        provider=provider.name,
                        strategy=strategy,
                        target_url=safe_url(source_url),
                        attempt=attempt,
                        duration_ms=int((time.monotonic() - started) * 1_000),
                        target_status=telemetry["status"],
                        verdict=telemetry["verdict"],
                        reason=telemetry["reason"],
                    )
                    failed.append(provider.name)
                    break
                event(
                    logger,
                    "scrape_fetch_attempt_completed",
                    provider=response.provider,
                    strategy=response.strategy_id,
                    target_url=safe_url(source_url),
                    attempt=attempt,
                    duration_ms=int((time.monotonic() - started) * 1_000),
                    target_status=response.target_status,
                    body_bytes=len(response.body),
                )
                return response.body, {
                    "provider": response.provider,
                    "strategy": response.strategy_id,
                    "target_status": response.target_status,
                    "body_bytes": len(response.body),
                    "credits_spent": (
                        str(response.cost.credits) if response.cost.attributed else None
                    ),
                }
            except (ProviderError, OSError, TimeoutError) as exc:
                event(
                    logger,
                    "scrape_fetch_attempt_failed",
                    level=logging.WARNING,
                    provider=provider.name,
                    strategy=strategy,
                    target_url=safe_url(source_url),
                    attempt=attempt,
                    duration_ms=int((time.monotonic() - started) * 1_000),
                    error_type=type(exc).__name__,
                    error_summary=safe_error(exc),
                )
                if attempt < attempts_per_provider:
                    time.sleep(0.5 * attempt)
                    continue
                failed.append(provider.name)
    if not failed:
        raise RuntimeError("no configured scraping provider is available")
    raise RuntimeError(f"all configured scraping providers failed: {', '.join(failed)}")


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    contract = ResponseContract.html(
        canaries=("Tier List Guides", "/guide/classes/tier-lists/"),
        min_body_bytes=1_000,
        stop_signatures=("Just a moment...", "cf-chl-"),
    )
    body, fetch = fetch_with_fallback(args.source_url, contract)
    links = extract_tier_list_links(body, args.source_url)
    if len(links) != 6:
        raise RuntimeError(f"expected 6 tier-list links, extracted {len(links)}")

    payload = {
        "schema_version": 1,
        "source_url": args.source_url,
        "fetched_at": datetime.now(UTC).isoformat(),
        "fetch": fetch,
        "count": len(links),
        "links": links,
    }
    output = Path(args.output)
    _write_json_atomic(output, payload)
    print(json.dumps({"status": "ok", "count": len(links), "output": str(output)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
