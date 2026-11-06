#!/usr/bin/env python3
"""Rate-limited client for the official Blizzard Game Data and Profile APIs.

Credentials (``BATTLENET_CLIENT_ID`` / ``BATTLENET_CLIENT_SECRET``) are read
from the process environment only and never logged or stored. Blizzard allows
36,000 requests per hour and 100 per second per client; the collector shares
the client with the website, so it keeps itself far below both with a token
bucket (``BLIZZARD_API_RATE``, default 6 requests per second) and honours
``Retry-After`` on 429.
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

REGIONS = ("eu", "us", "kr", "tw")
TOKEN_URL = "https://oauth.battle.net/token"
USER_AGENT = "GildraDatasetBot/1.0 (+https://gildra.net)"
MAX_BODY_BYTES = 8_000_000


class BlizzardApiError(RuntimeError):
    """A request kept failing after its retries."""


class RateLimiter:
    """A token bucket shared by every worker thread."""

    def __init__(self, rate: float, burst: int = 4) -> None:
        self.rate = max(0.1, rate)
        self.capacity = max(1, burst)
        self.tokens = float(self.capacity)
        self.updated = time.monotonic()
        self.lock = threading.Lock()
        self.paused_until = 0.0

    def pause(self, seconds: float) -> None:
        with self.lock:
            self.paused_until = max(self.paused_until, time.monotonic() + seconds)
            self.tokens = 0.0

    def acquire(self) -> None:
        while True:
            with self.lock:
                now = time.monotonic()
                if now < self.paused_until:
                    wait = self.paused_until - now
                else:
                    self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
                    self.updated = now
                    if self.tokens >= 1:
                        self.tokens -= 1
                        return
                    wait = (1 - self.tokens) / self.rate
            time.sleep(min(wait, 5.0))


class BlizzardClient:
    def __init__(self, *, rate: float | None = None, client_id: str | None = None, client_secret: str | None = None) -> None:
        self.client_id = client_id or os.environ.get("BATTLENET_CLIENT_ID", "")
        self.client_secret = client_secret or os.environ.get("BATTLENET_CLIENT_SECRET", "")
        if not self.client_id or not self.client_secret:
            raise RuntimeError("BATTLENET_CLIENT_ID and BATTLENET_CLIENT_SECRET are required")
        self.limiter = RateLimiter(rate if rate is not None else float(os.environ.get("BLIZZARD_API_RATE", "6")))
        self._token = ""
        self._token_expires = 0.0
        self._token_lock = threading.Lock()
        self._count_lock = threading.Lock()
        self.request_count = 0
        self.not_found_count = 0

    def _access_token(self, *, force: bool = False) -> str:
        with self._token_lock:
            if not force and self._token and time.monotonic() < self._token_expires - 300:
                return self._token
            basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
            request = urllib.request.Request(TOKEN_URL, data=b"grant_type=client_credentials", headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": USER_AGENT,
            })
            with urllib.request.urlopen(request, timeout=30) as response:
                body = json.load(response)
            self._token = str(body["access_token"])
            self._token_expires = time.monotonic() + float(body.get("expires_in", 3600))
            return self._token

    def get(self, region: str, path: str, namespace: str, *, locale: str | None = "en_US",
            allow_missing: bool = True, attempts: int = 4) -> dict[str, Any] | None:
        """GET one document; ``None`` for a 404 (renamed, moved or hidden profile)."""
        if region not in REGIONS:
            raise ValueError(f"unknown region {region}")
        params = {"namespace": f"{namespace}-{region}"}
        if locale:
            params["locale"] = locale
        url = f"https://{region}.api.blizzard.com{path}?{urllib.parse.urlencode(params)}"
        delay = 2.0
        for attempt in range(attempts):
            self.limiter.acquire()
            with self._count_lock:
                self.request_count += 1
            request = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {self._access_token()}",
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
            })
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    body = response.read(MAX_BODY_BYTES + 1)
                if len(body) > MAX_BODY_BYTES:
                    raise BlizzardApiError(f"{path}: response is too large")
                return json.loads(body)
            except urllib.error.HTTPError as exc:
                if exc.code == 404 and allow_missing:
                    with self._count_lock:
                        self.not_found_count += 1
                    return None
                if exc.code == 401:
                    self._access_token(force=True)
                elif exc.code == 429:
                    retry_after = exc.headers.get("Retry-After") if exc.headers else None
                    self.limiter.pause(float(retry_after) if retry_after and retry_after.isdigit() else delay)
                elif exc.code < 500:
                    raise BlizzardApiError(f"{path}: HTTP {exc.code}") from exc
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ConnectionError):
                pass
            if attempt + 1 < attempts:
                time.sleep(delay)
                delay *= 2
        raise BlizzardApiError(f"{path}: failed after {attempts} attempts")
