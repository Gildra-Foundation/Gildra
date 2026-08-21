#!/usr/bin/env python3
"""Collect MythicStats performance rankings and specialization tier lists."""

from __future__ import annotations

import logging
import re
import time
import urllib.request
from datetime import UTC, datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit, urlunsplit

from web_scraper import ResponseContract, validate_response
from web_scraper.fetchers.base import RawResponse

from .observability import event, safe_url
from .wowhead_tier_lists import fetch_with_fallback

BASE_URL = "https://mythicstats.com"
SOURCES = (
    {"context_key": "performance", "path": "/dps", "page_type": "performance"},
    {"context_key": "spec_tiers", "path": "/spec", "page_type": "spec_tiers"},
)
CLASS_SLUGS = (
    "death-knight",
    "demon-hunter",
    "paladin",
    "warlock",
    "warrior",
    "evoker",
    "hunter",
    "priest",
    "shaman",
    "druid",
    "rogue",
    "mage",
    "monk",
)
ROLE_LABELS = {"Damage specs": "dps", "Tank specs": "tank", "Healer specs": "healer"}
CATEGORY_LABELS = {
    "Melee tier list": "melee",
    "Ranged tier list": "ranged",
    "Tank tier list": "tank",
    "Healer tier list": "healer",
}
TIER_RE = re.compile(r"^[SABCDF]$")
VALUE_RE = re.compile(r"(?P<value>[0-9]+)\s+(?:average|top)\s+dps", re.I)
PERIOD_RE = re.compile(r"\bPeriod\s+(?P<period>[0-9]+)", re.I)
KEY_RANGE_RE = re.compile(r"Mythic\+\s+(?P<range>[0-9]+\s*-\s*[0-9]+)\s+keys", re.I)
TIER_TITLE_RE = re.compile(r"^(?P<name>.+?)\s+(?P<tier>[SABCDF])-tier$", re.I)
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
logger = logging.getLogger(__name__)


def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
    return set((dict(attrs).get("class") or "").split())


def _clean(value: str) -> str:
    return " ".join(value.split())


def _canonical(value: str, source_url: str, *, image: bool = False) -> str:
    parsed = urlsplit(urljoin(source_url, value))
    hostname = parsed.hostname or ""
    if parsed.scheme != "https":
        raise ValueError("MythicStats URL must use HTTPS")
    if image:
        if hostname != "mythicstats.com" and not hostname.endswith(".laravel.cloud"):
            raise ValueError(f"unexpected MythicStats image host: {hostname}")
    elif hostname != "mythicstats.com":
        raise ValueError(f"unexpected MythicStats URL host: {hostname}")
    return urlunsplit(("https", hostname, parsed.path, parsed.query, parsed.fragment))


def _identity(spec_slug: str) -> tuple[str, str, str, str]:
    for class_slug in CLASS_SLUGS:
        suffix = f"-{class_slug}"
        if spec_slug.endswith(suffix) and len(spec_slug) > len(suffix):
            specialization_slug = spec_slug[: -len(suffix)]
            return (
                class_slug.replace("-", " ").title(),
                class_slug,
                specialization_slug.replace("-", " ").title(),
                specialization_slug,
            )
    raise ValueError(f"unknown class suffix in MythicStats specialization: {spec_slug}")


def _parse_rank_change(value: str) -> int:
    cleaned = _clean(value)
    match = re.search(r"([0-9]+)", cleaned)
    if match is None:
        return 0
    amount = int(match.group(1))
    if "↓" in cleaned or cleaned.startswith("-"):
        return -amount
    if "↑" in cleaned or cleaned.startswith("+"):
        return amount
    return 0


def _parse_metric(title: str) -> int:
    match = VALUE_RE.search(title)
    if match is None:
        raise ValueError(f"missing exact MythicStats metric: {title!r}")
    return int(match.group("value"))


def _parse_compact_count(value: str) -> int:
    match = re.fullmatch(r"([0-9]+(?:[.][0-9]+)?)([KMB]?)", _clean(value), re.I)
    if match is None:
        raise ValueError(f"unsupported MythicStats run count: {value!r}")
    multiplier = {"": 1, "K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[match.group(2).upper()]
    return int(round(float(match.group(1)) * multiplier))


class _DepthParser(HTMLParser):
    """HTMLParser with stable element depth even for non-closed void tags."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def _entered(self, tag: str) -> bool:
        return tag not in VOID_TAGS


class PerformanceParser(_DepthParser):
    def __init__(self, source_url: str) -> None:
        super().__init__()
        self.source_url = source_url
        self.title = ""
        self.subtitle = ""
        self.period_id = ""
        self.period_name = ""
        self.key_range = ""
        self.records: list[dict[str, Any]] = []
        self.role = ""
        self._capture: dict[str, tuple[int, list[str]]] = {}
        self._period_select_depth: int | None = None
        self._option_depth: int | None = None
        self._option_value = ""
        self._option_selected = False
        self._option_text: list[str] = []
        self._metrics_depth: int | None = None
        self._cell_depth: int | None = None
        self._cell_title = ""
        self._cell_text: list[str] = []
        self._cells: list[tuple[str, str]] = []
        self._pending_metrics: list[tuple[str, str]] | None = None
        self._anchor_depth: int | None = None
        self._anchor_href = ""
        self._anchor_icon = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.depth += 1
        attributes = dict(attrs)
        classes = _classes(attrs)
        if tag == "h1" and not self.title:
            self._capture["title"] = (self.depth, [])
        elif tag == "p" and "mt-4" in classes and not self.subtitle:
            self._capture["subtitle"] = (self.depth, [])
        elif tag == "div" and {"text-left", "text-sm", "text-gray-500"}.issubset(classes):
            self._capture["role"] = (self.depth, [])

        if tag == "select" and attributes.get("name") == "period":
            self._period_select_depth = self.depth
        elif tag == "option" and self._period_select_depth is not None:
            self._option_depth = self.depth
            self._option_value = attributes.get("value") or ""
            self._option_selected = "selected" in attributes
            self._option_text = []

        if tag == "div" and {"grid", "grid-cols-6", "gap-px", "w-56"}.issubset(classes):
            self._metrics_depth = self.depth
            self._cells = []
        elif tag == "div" and self._metrics_depth is not None and self.depth == self._metrics_depth + 1:
            self._cell_depth = self.depth
            self._cell_title = attributes.get("title") or ""
            self._cell_text = []

        href = attributes.get("href") or ""
        if tag == "a" and self._pending_metrics is not None and urlsplit(urljoin(self.source_url, href)).path.startswith("/spec/"):
            self._anchor_depth = self.depth
            self._anchor_href = href
            self._anchor_icon = ""
        elif tag == "img" and self._anchor_depth is not None:
            self._anchor_icon = attributes.get("src") or ""

        if not self._entered(tag):
            self.depth -= 1

    def handle_data(self, data: str) -> None:
        for _, buffer in self._capture.values():
            buffer.append(data)
        if self._option_depth is not None:
            self._option_text.append(data)
        if self._cell_depth is not None:
            self._cell_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        for key, (start_depth, buffer) in list(self._capture.items()):
            if self.depth == start_depth:
                value = _clean("".join(buffer))
                if key == "title":
                    self.title = value
                    range_match = KEY_RANGE_RE.search(value)
                    if range_match:
                        self.key_range = range_match.group("range").replace(" ", "")
                elif key == "subtitle":
                    self.subtitle = value
                    period_match = PERIOD_RE.search(value)
                    if period_match:
                        self.period_id = period_match.group("period")
                elif key == "role":
                    self.role = ROLE_LABELS.get(value, self.role)
                del self._capture[key]

        if self._option_depth == self.depth:
            label = _clean("".join(self._option_text))
            if self._option_selected or not self.period_name:
                self.period_id = self._option_value or self.period_id
                self.period_name = label
            self._option_depth = None
            self._option_text = []
        if self._period_select_depth == self.depth and tag == "select":
            self._period_select_depth = None

        if self._cell_depth == self.depth:
            self._cells.append((_clean("".join(self._cell_text)), self._cell_title))
            self._cell_depth = None
            self._cell_text = []
        if self._metrics_depth == self.depth:
            self._pending_metrics = self._cells if len(self._cells) == 6 else None
            self._metrics_depth = None
            self._cells = []

        if self._anchor_depth == self.depth:
            self._append_record()
            self._anchor_depth = None
            self._anchor_href = ""
            self._anchor_icon = ""
            self._pending_metrics = None
        self.depth = max(0, self.depth - 1)

    def _append_record(self) -> None:
        if not self.role or self._pending_metrics is None or not self._anchor_href or not self._anchor_icon:
            return
        cells = self._pending_metrics
        try:
            rank = int(cells[0][0])
            tier = cells[2][0].upper()
            average_value = _parse_metric(cells[3][1])
            top_value = _parse_metric(cells[4][1])
            runs_label = cells[5][0]
            runs_estimate = _parse_compact_count(runs_label)
            spec_url = _canonical(self._anchor_href, self.source_url)
            source_slug = urlsplit(spec_url).path.removeprefix("/spec/").strip("/")
            class_name, class_slug, spec_name, spec_slug = _identity(source_slug)
            if TIER_RE.fullmatch(tier) is None:
                return
        except (TypeError, ValueError):
            return
        self.records.append({
            "role": self.role,
            "rank": rank,
            "rank_change": _parse_rank_change(cells[1][0]),
            "tier": tier,
            "average_value": average_value,
            "top_value": top_value,
            "runs_label": runs_label,
            "runs_estimate": runs_estimate,
            "key_range": cells[5][1] or self.key_range,
            "class_name": class_name,
            "class_slug": class_slug,
            "spec_name": spec_name,
            "spec_slug": spec_slug,
            "icon_url": _canonical(self._anchor_icon, self.source_url, image=True),
            "spec_url": spec_url,
            "source_url": self.source_url,
        })


class SpecTierParser(_DepthParser):
    def __init__(self, source_url: str) -> None:
        super().__init__()
        self.source_url = source_url
        self.title = ""
        self.subtitle = ""
        self.category = ""
        self.records: list[dict[str, Any]] = []
        self._capture: dict[str, tuple[int, list[str]]] = {}
        self._anchor_depth: int | None = None
        self._anchor_href = ""
        self._anchor_title = ""
        self._anchor_icon = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.depth += 1
        attributes = dict(attrs)
        classes = _classes(attrs)
        if tag == "h1" and not self.title:
            self._capture["title"] = (self.depth, [])
        elif tag == "p" and "mt-4" in classes and not self.subtitle:
            self._capture["subtitle"] = (self.depth, [])
        elif tag == "h2" and "pb-3" in classes:
            self._capture["category"] = (self.depth, [])

        href = attributes.get("href") or ""
        tier_title = attributes.get("title") or ""
        if tag == "a" and self.category and TIER_TITLE_RE.fullmatch(tier_title):
            path = urlsplit(urljoin(self.source_url, href)).path
            if path.startswith("/spec/"):
                self._anchor_depth = self.depth
                self._anchor_href = href
                self._anchor_title = tier_title
                self._anchor_icon = ""
        elif tag == "img" and self._anchor_depth is not None:
            self._anchor_icon = attributes.get("src") or ""

        if not self._entered(tag):
            self.depth -= 1

    def handle_data(self, data: str) -> None:
        for _, buffer in self._capture.values():
            buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        for key, (start_depth, buffer) in list(self._capture.items()):
            if self.depth == start_depth:
                value = _clean("".join(buffer))
                if key == "title":
                    self.title = value
                elif key == "subtitle":
                    self.subtitle = value
                elif key == "category":
                    self.category = CATEGORY_LABELS.get(value, "")
                del self._capture[key]
        if self._anchor_depth == self.depth:
            self._append_record()
            self._anchor_depth = None
            self._anchor_href = ""
            self._anchor_title = ""
            self._anchor_icon = ""
        self.depth = max(0, self.depth - 1)

    def _append_record(self) -> None:
        title_match = TIER_TITLE_RE.fullmatch(self._anchor_title)
        if title_match is None or not self._anchor_icon:
            return
        spec_url = _canonical(self._anchor_href, self.source_url)
        source_slug = urlsplit(spec_url).path.removeprefix("/spec/").strip("/")
        try:
            class_name, class_slug, spec_name, spec_slug = _identity(source_slug)
            icon_url = _canonical(self._anchor_icon, self.source_url, image=True)
        except ValueError:
            return
        tier = title_match.group("tier").upper()
        rank_in_tier = 1 + sum(
            row["category"] == self.category and row["tier"] == tier for row in self.records
        )
        self.records.append({
            "category": self.category,
            "tier": tier,
            "rank_in_tier": rank_in_tier,
            "class_name": class_name,
            "class_slug": class_slug,
            "spec_name": spec_name,
            "spec_slug": spec_slug,
            "icon_url": icon_url,
            "spec_url": spec_url,
            "source_url": self.source_url,
        })


def parse_performance_page(html: bytes | str) -> dict[str, Any]:
    source_url = f"{BASE_URL}/dps"
    parser = PerformanceParser(source_url)
    parser.feed(html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html)
    parser.close()
    if not parser.title or not parser.period_id or not parser.period_name:
        raise ValueError("MythicStats performance metadata is missing")
    return {
        "context_key": "performance",
        "page_type": "performance",
        "title": parser.title,
        "subtitle": parser.subtitle,
        "source_url": source_url,
        "source_period_id": parser.period_id,
        "source_period_name": parser.period_name,
        "key_range": parser.key_range,
        "record_count": len(parser.records),
        "records": parser.records,
    }


def parse_spec_tier_page(html: bytes | str) -> dict[str, Any]:
    source_url = f"{BASE_URL}/spec"
    parser = SpecTierParser(source_url)
    parser.feed(html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html)
    parser.close()
    if not parser.title:
        raise ValueError("MythicStats specialization tier-list metadata is missing")
    return {
        "context_key": "spec_tiers",
        "page_type": "spec_tiers",
        "title": parser.title,
        "subtitle": parser.subtitle,
        "source_url": source_url,
        "source_period_id": "",
        "source_period_name": "",
        "key_range": "",
        "record_count": len(parser.records),
        "records": parser.records,
    }


def _direct_fetch(source_url: str, contract: ResponseContract) -> tuple[bytes, dict[str, Any]]:
    started = time.monotonic()
    event(logger, "scrape_direct_fallback_started", target_url=safe_url(source_url))
    request = urllib.request.Request(source_url, headers={
        "User-Agent": "GildraDatasetBot/1.0 (+https://gildra.net)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read(2_500_001)
        raw = RawResponse(
            requested_url=source_url,
            final_url=response.geturl(),
            status=response.status,
            headers=dict(response.headers),
            body=body,
            elapsed_ms=0,
            truncated=len(body) > 2_500_000,
        )
    validated = validate_response(raw, contract)
    if not validated.transport_validated:
        raise RuntimeError(f"MythicStats direct response failed validation: {validated.telemetry()['reason']}")
    event(
        logger,
        "scrape_direct_fallback_completed",
        target_url=safe_url(source_url),
        target_status=200,
        body_bytes=len(body),
        duration_ms=int((time.monotonic() - started) * 1_000),
    )
    return body, {
        "provider": "direct",
        "strategy": "https",
        "target_status": 200,
        "body_bytes": len(body),
        "credits_spent": "0",
    }


def collect_mythicstats_dataset() -> dict[str, Any]:
    pages = []
    total_credits = 0.0
    definitions = (
        (
            SOURCES[0],
            parse_performance_page,
            ResponseContract.html(
                canaries=("Top DPS logs in Mythic+", "Damage specs", "Tank specs", "Healer specs"),
                min_body_bytes=30_000,
                stop_signatures=("Just a moment...", "cf-chl-", "Access Denied"),
            ),
        ),
        (
            SOURCES[1],
            parse_spec_tier_page,
            ResponseContract.html(
                canaries=("Mythic+ Spec tier list", "Melee tier list", "Ranged tier list", "Tank tier list", "Healer tier list"),
                min_body_bytes=20_000,
                stop_signatures=("Just a moment...", "cf-chl-", "Access Denied"),
            ),
        ),
    )
    for source, parser, contract in definitions:
        source_url = f"{BASE_URL}{source['path']}"
        try:
            body, fetch = fetch_with_fallback(source_url, contract)
        except RuntimeError:
            body, fetch = _direct_fetch(source_url, contract)
        page = parser(body)
        page["fetch"] = fetch
        pages.append(page)
        try:
            total_credits += float(fetch.get("credits_spent") or 0)
        except (TypeError, ValueError):
            pass
    records = [row for page in pages for row in page["records"]]
    unique_specs = {(row["class_slug"], row["spec_slug"]) for row in records}
    return {
        "schema_version": 1,
        "fetched_at": datetime.now(UTC).isoformat(),
        "pages": pages,
        "page_count": len(pages),
        "record_count": len(records),
        "unique_spec_count": len(unique_specs),
        "credits_spent": str(total_credits),
    }
