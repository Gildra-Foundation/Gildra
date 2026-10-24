#!/usr/bin/env python3
"""Shared fetcher for mythicstats.com pages.

mythicstats.com serves plain server-rendered HTML and answers a direct HTTPS
request, so the free direct route goes first. The paid provider chain
(Scrape.do first, see ``wowhead_tier_lists.fetch_with_fallback``) is used only
when the direct response is blocked or fails validation, which keeps a refresh
at zero credits in the normal case.
"""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from typing import Any

from web_scraper import ResponseContract, validate_response
from web_scraper.fetchers.base import RawResponse

from .wowhead_tier_lists import fetch_with_fallback

BASE_URL = "https://mythicstats.com"
USER_AGENT = "GildraDatasetBot/1.0 (+https://gildra.net)"
MAX_BODY_BYTES = 3_000_000
# One request per second at most: the site is a small fan project.
_MIN_INTERVAL_SECONDS = 1.0
_last_request_at = 0.0


def contract(*canaries: str, min_body_bytes: int = 20_000) -> ResponseContract:
    return ResponseContract.html(
        canaries=canaries,
        min_body_bytes=min_body_bytes,
        stop_signatures=("Just a moment...", "cf-chl-", "Access denied", "Attention Required"),
    )


def _polite_wait() -> None:
    global _last_request_at
    delay = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
    if delay > 0:
        time.sleep(delay)
    _last_request_at = time.monotonic()


def _direct_fetch(source_url: str, response_contract: ResponseContract) -> tuple[bytes, dict[str, Any]]:
    _polite_wait()
    request = urllib.request.Request(source_url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read(MAX_BODY_BYTES + 1)
        raw = RawResponse(
            requested_url=source_url, final_url=response.geturl(), status=response.status,
            headers=dict(response.headers), body=body, elapsed_ms=0,
            truncated=len(body) > MAX_BODY_BYTES,
        )
    validated = validate_response(raw, response_contract)
    if not validated.transport_validated:
        raise RuntimeError(f"mythicstats direct response failed validation: {validated.telemetry()['reason']}")
    return body, {"provider": "direct", "strategy": "https", "target_status": raw.status,
                  "body_bytes": len(body), "credits_spent": "0"}


def fetch_mythicstats(path: str, response_contract: ResponseContract) -> tuple[bytes, dict[str, Any]]:
    """GET ``https://mythicstats.com<path>``: direct first, paid providers only as a fallback."""
    if not path.startswith("/") or "//" in path:
        raise ValueError(f"invalid mythicstats path: {path!r}")
    source_url = f"{BASE_URL}{path}"
    try:
        return _direct_fetch(source_url, response_contract)
    except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as direct_error:
        try:
            return fetch_with_fallback(source_url, response_contract)
        except RuntimeError as provider_error:
            raise RuntimeError(
                f"mythicstats fetch failed for {path}: direct={direct_error}; providers={provider_error}"
            ) from provider_error
