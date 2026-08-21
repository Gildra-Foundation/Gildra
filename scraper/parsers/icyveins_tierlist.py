#!/usr/bin/env python3
"""Collect the eight retail WoW tier lists published by Icy Veins."""

from __future__ import annotations

import re
import urllib.request
from datetime import UTC, datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit, urlunsplit

from web_scraper import ResponseContract, validate_response
from web_scraper.fetchers.base import RawResponse

from .wowhead_tier_lists import fetch_with_fallback

BASE_URL = "https://www.icy-veins.com"
SOURCES = (
    {"activity": "mythic_plus", "role": "dps", "path": "/wow/mythic-dps-tier-list"},
    {"activity": "mythic_plus", "role": "tank", "path": "/wow/mythic-tank-tier-list"},
    {"activity": "mythic_plus", "role": "healer", "path": "/wow/mythic-healer-tier-list"},
    {"activity": "raid", "role": "dps", "path": "/wow/dps-rankings-tier-list"},
    {"activity": "raid", "role": "tank", "path": "/wow/tank-rankings-tier-list"},
    {"activity": "raid", "role": "healer", "path": "/wow/healer-rankings-tier-list"},
    {"activity": "pvp", "role": "dps", "path": "/wow/pvp-dps-tier-list"},
    {"activity": "pvp", "role": "healer", "path": "/wow/healer-tier-list-for-pvp"},
)
ICON_RE = re.compile(
    r"/images/wow/spec-icons/round-without-border/(?P<class>[a-z-]+)/(?P<spec>[a-z-]+)[.]webp$"
)
TIER_RE = re.compile(r"^[SABCD][+-]?$", re.I)


def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
    return set((dict(attrs).get("class") or "").split())


def _clean(value: str) -> str:
    return " ".join(value.split())


def _canonical(value: str, source_url: str) -> str:
    parts = urlsplit(urljoin(source_url, value))
    if parts.scheme != "https" or parts.hostname not in {
        "www.icy-veins.com", "icy-veins.com", "static.icy-veins.com"
    }:
        raise ValueError(f"unexpected Icy Veins URL host: {parts.hostname}")
    host = "www.icy-veins.com" if parts.hostname in {"www.icy-veins.com", "icy-veins.com"} else parts.hostname
    return urlunsplit(("https", host, parts.path, parts.query, parts.fragment))


class IcyVeinsParser(HTMLParser):
    def __init__(self, source_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.source_url = source_url
        self.depth = 0
        self.title = ""
        self.updated_text = ""
        self.author_name = ""
        self.records: list[dict[str, Any]] = []
        self._capture: dict[str, tuple[int, list[str]]] = {}
        self._tier_table_depth: int | None = None
        self._row_tier = ""
        self._td_index = -1
        self._td_depth: int | None = None
        self._td_text: list[str] = []
        self._entry: dict[str, Any] | None = None
        self._entry_depth: int | None = None
        self._anchor_depth: int | None = None
        self._anchor_href = ""
        self._anchor_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.depth += 1
        classes = _classes(attrs)
        attributes = dict(attrs)
        if tag == "h1" and "content-header__title" in classes:
            self._capture["title"] = (self.depth, [])
        elif tag == "span" and "content-header__updated-date" in classes:
            self._capture["updated"] = (self.depth, [])
        elif tag == "span" and "content-header__author-name" in classes and not self.author_name:
            self._capture["author"] = (self.depth, [])

        if tag == "table" and "tier-list" in classes and self._tier_table_depth is None:
            self._tier_table_depth = self.depth
        if self._tier_table_depth is None:
            return
        if tag == "tr":
            self._row_tier = ""
            self._td_index = -1
        elif tag == "td":
            self._td_index += 1
            self._td_depth = self.depth
            self._td_text = []
        elif tag == "span" and "tier-list-entry" in classes:
            self._entry_depth = self.depth
            change = attributes.get("data-change") or ""
            self._entry = {
                "change_direction": {"up": "up", "down": "down", "-": "same"}.get(change, "unknown"),
                "guide_url": "",
            }
        elif self._entry is not None:
            if tag == "span" and "details_block__summary-title-wrapper" in classes:
                self._capture["spec"] = (self.depth, [])
            elif tag == "img":
                source = attributes.get("src") or ""
                match = ICON_RE.search(urlsplit(urljoin(self.source_url, source)).path)
                if match:
                    self._entry["class_slug"] = match.group("class")
                    self._entry["spec_slug"] = match.group("spec")
                    self._entry["icon_url"] = _canonical(source, self.source_url)
                    self._entry["spec_name"] = _clean(attributes.get("alt") or "")
            elif tag == "a" and self._anchor_depth is None:
                self._anchor_depth = self.depth
                self._anchor_href = attributes.get("href") or ""
                self._anchor_text = []

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        for _, buffer in self._capture.values():
            buffer.append(data)
        if self._td_depth is not None and self._entry is None:
            self._td_text.append(data)
        if self._anchor_depth is not None:
            self._anchor_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        for key, (start_depth, buffer) in list(self._capture.items()):
            if self.depth == start_depth:
                value = _clean("".join(buffer))
                if key == "title":
                    self.title = value
                elif key == "updated":
                    self.updated_text = value
                elif key == "author":
                    self.author_name = value
                elif key == "spec" and self._entry is not None and value:
                    self._entry["spec_name"] = value
                del self._capture[key]

        if self._anchor_depth == self.depth:
            label = _clean("".join(self._anchor_text))
            if self._entry is not None and self._anchor_href and "guide" in label.lower():
                self._entry["guide_url"] = _canonical(self._anchor_href, self.source_url)
            self._anchor_depth = None
            self._anchor_href = ""
            self._anchor_text = []
        if self._td_depth == self.depth:
            if self._td_index == 0:
                candidate = _clean("".join(self._td_text)).upper()
                if TIER_RE.fullmatch(candidate):
                    self._row_tier = candidate
            self._td_depth = None
            self._td_text = []
        if self._entry_depth == self.depth and self._entry is not None:
            entry = self._entry
            if self._row_tier:
                entry["tier"] = self._row_tier
            entry["description"] = ""
            entry["description_paragraphs"] = []
            entry["source_url"] = self.source_url
            if entry.get("class_slug") and entry.get("spec_slug") and entry.get("tier") and entry.get("guide_url"):
                class_name = str(entry["class_slug"]).replace("-", " ").title()
                entry["class_name"] = class_name
                entry["rank_in_tier"] = 1 + sum(
                    row["tier"] == entry["tier"] for row in self.records
                )
                self.records.append(entry)
            self._entry = None
            self._entry_depth = None
        if self._tier_table_depth == self.depth and tag == "table":
            self._tier_table_depth = None
        self.depth -= 1


def parse_icyveins_page(html: bytes | str, source: dict[str, str]) -> dict[str, Any]:
    source_url = f"{BASE_URL}{source['path']}"
    parser = IcyVeinsParser(source_url)
    parser.feed(html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html)
    parser.close()
    if not parser.title or not parser.updated_text:
        raise ValueError("Icy Veins page metadata is missing")
    try:
        updated_at = datetime.strptime(parser.updated_text, "%b %d, %Y - %I:%M %p").replace(tzinfo=UTC)
    except ValueError as exc:
        raise ValueError(f"unsupported Icy Veins update timestamp: {parser.updated_text!r}") from exc
    records = []
    for row in parser.records:
        records.append({**row, "activity": source["activity"], "role": source["role"], "source_updated_at": updated_at.isoformat()})
    return {
        "context_key": f"{source['activity']}:{source['role']}",
        "activity": source["activity"], "role": source["role"],
        "title": parser.title, "author_name": parser.author_name,
        "source_url": source_url, "source_updated_at": updated_at.isoformat(),
        "record_count": len(records), "records": records,
    }


def _direct_fetch(source_url: str, contract: ResponseContract) -> tuple[bytes, dict[str, Any]]:
    request = urllib.request.Request(source_url, headers={
        "User-Agent": "GildraDatasetBot/1.0 (+https://gildra.net)",
        "Accept": "text/html,application/xhtml+xml", "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read(3_000_001)
        raw = RawResponse(
            requested_url=source_url, final_url=response.geturl(), status=response.status,
            headers=dict(response.headers), body=body, elapsed_ms=0,
            truncated=len(body) > 3_000_000,
        )
    validated = validate_response(raw, contract)
    if not validated.transport_validated:
        raise RuntimeError(f"Icy Veins direct response failed validation: {validated.telemetry()['reason']}")
    return body, {"provider": "direct", "strategy": "https", "target_status": 200,
                  "body_bytes": len(body), "credits_spent": "0"}


def collect_icyveins_dataset() -> dict[str, Any]:
    pages = []
    total_credits = 0.0
    contract = ResponseContract.html(
        canaries=('class="tier-list"', "tier-list-entry", "content-header__updated-date"),
        min_body_bytes=20_000,
        stop_signatures=("Just a moment...", "cf-chl-", "Access Denied"),
    )
    for source in SOURCES:
        source_url = f"{BASE_URL}{source['path']}"
        try:
            body, fetch = fetch_with_fallback(source_url, contract)
        except RuntimeError as provider_error:
            try:
                body, fetch = _direct_fetch(source_url, contract)
            except Exception as direct_error:
                raise RuntimeError(f"Icy Veins fetch failed for {source['path']}") from direct_error
        page = parse_icyveins_page(body, source)
        page["fetch"] = fetch
        pages.append(page)
        try:
            total_credits += float(fetch.get("credits_spent") or 0)
        except (TypeError, ValueError):
            pass
    records = [row for page in pages for row in page["records"]]
    unique_specs = {(row["class_slug"], row["spec_slug"]) for row in records}
    return {
        "schema_version": 1, "source_name": "Icy Veins",
        "fetched_at": datetime.now(UTC).isoformat(), "page_count": len(pages),
        "record_count": len(records), "unique_spec_count": len(unique_specs),
        "credits_spent": str(total_credits), "pages": pages,
    }
