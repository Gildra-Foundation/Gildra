#!/usr/bin/env python3
"""Collect the simulated DPS tier list from mythistone.com/pages/tierlist.

The page publishes SimulationCraft throughput per specialization at 1, 3, 5
and 8 targets, separately for damage specs and tanks, for three gear sets
(the spec's popular set, the best set the simulator found, the top-50 players'
set), with the site's own S–F tier per row. Only those numbers and the spec
identity are kept; page text, images and markup are never stored.

robots.txt allows /pages/tierlist (only /pages/search is disallowed). The site
answers a direct request, so the paid provider chain is a fallback only.
"""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any

from web_scraper import ResponseContract, validate_response
from web_scraper.fetchers.base import RawResponse

from .wowhead_tier_lists import fetch_with_fallback

BASE_URL = "https://mythistone.com"
TIERLIST_PATH = "/pages/tierlist"
SOURCE_URL = f"{BASE_URL}{TIERLIST_PATH}"
USER_AGENT = "GildraDatasetBot/1.0 (+https://gildra.net)"
MAX_BODY_BYTES = 4_000_000
ROLES = {"dps": "dps", "tanks": "tank"}
TARGETS = (1, 3, 5, 8)
GEAR_SETS = ("popular", "simcbis", "top50")
TIERS = ("S", "A", "B", "C", "D", "F")

CARD_RE = re.compile(r'<div class="card" id="tier-(?P<role>dps|tanks)-(?P<targets>[0-9]+)t"')
SIMMED_COUNT_RE = re.compile(r"(?P<simmed>[0-9]+) of (?P<total>[0-9]+) specs simmed")
SIMMED_ON_RE = re.compile(r"Simmed (?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2}) on SimulationCraft (?P<version>[0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)")
ROW_SPLIT = '<tr class="tierlist-row">'
RANK_RE = re.compile(r'^\s*<td class="text-sm font-weight-bold">(?P<rank>[0-9]+)</td>')
TIER_RE = re.compile(r'<span class="tier-badge tier-(?P<tier>[A-Z])">')
BUTTON_RE = re.compile(r"<button\b(?P<attrs>[^>]*)>(?P<body>.*?)</button>", re.S)
ATTR_RE = re.compile(r'(data-[a-z-]+)="([^"]*)"')
VALUE_RE = re.compile(r'<span class="gear-val[^"]*">\s*(?P<value>[0-9][0-9,]*)\s*</span>')
BEHIND_RE = re.compile(r'<td class="text-sm text-end">\s*(?P<behind>-?[0-9]+(?:[.][0-9]+)?%|&mdash;|—)\s*</td>')
SLUG_RE = re.compile(r"[^a-z]+")


class SimTierParseError(ValueError):
    """The page layout changed: never publish a partial parse."""


def slugify(name: str) -> str:
    return SLUG_RE.sub("-", name.lower()).strip("-")


def _desktop_table(card: str) -> str:
    start = card.find("d-none d-lg-block")
    end = card.find('<div class="d-lg-none">', start)
    if start < 0 or end < 0:
        raise SimTierParseError("tier card has no desktop table")
    return card[start:end]


def _parse_row(row: str, role: str) -> dict[str, Any]:
    rank = RANK_RE.match(row)
    tier = TIER_RE.search(row)
    behind = BEHIND_RE.search(row)
    if not rank or not tier or not behind:
        raise SimTierParseError("tier row lost its rank, tier or gap cell")
    if tier.group("tier") not in TIERS:
        raise SimTierParseError(f"unknown tier {tier.group('tier')!r}")
    dps: dict[str, int] = {}
    identity: dict[str, str] = {}
    for button in BUTTON_RE.finditer(row):
        attrs = {key: html_lib.unescape(value).strip() for key, value in ATTR_RE.findall(button.group("attrs"))}
        gear_set = attrs.get("data-gearset")
        if gear_set is None:
            continue
        if gear_set not in GEAR_SETS or gear_set in dps:
            raise SimTierParseError(f"unexpected gear set {gear_set!r}")
        value = VALUE_RE.search(button.group("body"))
        if not value:
            raise SimTierParseError(f"gear set {gear_set} has no number")
        dps[gear_set] = int(value.group("value").replace(",", ""))
        current = {key: attrs.get(f"data-{key}", "") for key in ("spec-id", "spec-name", "class-name")}
        if identity and identity != current:
            raise SimTierParseError("gear sets of one row disagree on the spec")
        identity = current
    if not dps or not identity.get("spec-id", "").isdigit():
        raise SimTierParseError("tier row has no simulated gear set")
    raw_behind = behind.group("behind")
    return {
        "rank": int(rank.group("rank")),
        "tier": tier.group("tier"),
        "role": role,
        "spec_id": int(identity["spec-id"]),
        "class_name": identity["class-name"],
        "class_slug": slugify(identity["class-name"]),
        "spec_name": identity["spec-name"],
        "spec_slug": slugify(identity["spec-name"]),
        "dps": dps,
        "best": max(dps.values()),
        "behind_pct": 0.0 if raw_behind in {"&mdash;", "—"} else float(raw_behind.rstrip("%")),
    }


def parse_tierlist_page(body: bytes | str) -> dict[str, Any]:
    """Return ``{"simmed_on", "sim_version", "tables": [...]}`` or raise ``SimTierParseError``."""
    text = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body
    simmed = SIMMED_ON_RE.search(text)
    cards = list(CARD_RE.finditer(text))
    if not cards:
        raise SimTierParseError("no tier cards on the page")
    tables: list[dict[str, Any]] = []
    for index, card in enumerate(cards):
        end = cards[index + 1].start() if index + 1 < len(cards) else len(text)
        segment = text[card.start():end]
        role = ROLES[card.group("role")]
        targets = int(card.group("targets"))
        counts = SIMMED_COUNT_RE.search(segment)
        rows = _desktop_table(segment).split(ROW_SPLIT)[1:]
        entries = [_parse_row(row, role) for row in rows]
        tables.append({
            "role": role,
            "targets": targets,
            "specs_total": int(counts.group("total")) if counts else len(entries),
            "entries": entries,
        })
    return {
        "simmed_on": simmed.group("date") if simmed else None,
        "sim_version": simmed.group("version") if simmed else None,
        "tables": tables,
    }


def contract() -> ResponseContract:
    return ResponseContract.html(
        canaries=("tier-dps-1t", "tierlist-row", "data-gearset"),
        min_body_bytes=50_000,
        stop_signatures=("Just a moment...", "cf-chl-", "Access denied", "Attention Required"),
    )


def _direct_fetch(source_url: str, response_contract: ResponseContract) -> tuple[bytes, dict[str, Any]]:
    request = urllib.request.Request(source_url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
    })
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read(MAX_BODY_BYTES + 1)
        raw = RawResponse(
            requested_url=source_url, final_url=response.geturl(), status=response.status,
            headers=dict(response.headers), body=body, elapsed_ms=int((time.monotonic() - started) * 1000),
            truncated=len(body) > MAX_BODY_BYTES,
        )
    validated = validate_response(raw, response_contract)
    if not validated.transport_validated:
        raise RuntimeError(f"mythistone direct response failed validation: {validated.telemetry()['reason']}")
    return body, {"provider": "direct", "strategy": "https", "target_status": raw.status,
                  "body_bytes": len(body), "credits_spent": "0"}


def fetch_tierlist() -> tuple[bytes, dict[str, Any]]:
    """Direct HTTPS first (free); Scrape.do and the other providers only when it fails."""
    response_contract = contract()
    try:
        return _direct_fetch(SOURCE_URL, response_contract)
    except (urllib.error.URLError, TimeoutError, OSError, RuntimeError) as direct_error:
        try:
            return fetch_with_fallback(SOURCE_URL, response_contract)
        except RuntimeError as provider_error:
            raise RuntimeError(
                f"mythistone fetch failed: direct={direct_error}; providers={provider_error}"
            ) from provider_error


def build_payload(parsed: dict[str, Any], fetch: dict[str, Any], fetched_at: datetime) -> dict[str, Any]:
    entries = [entry for table in parsed["tables"] for entry in table["entries"]]
    try:
        credits = float(fetch.get("credits_spent") or 0)
    except (TypeError, ValueError):
        credits = 0.0
    return {
        "schema_version": 1,
        "source_name": "mythistone.com",
        "source_url": SOURCE_URL,
        "fetched_at": fetched_at.isoformat(),
        "simmed_on": parsed["simmed_on"],
        "sim_version": parsed["sim_version"],
        "gear_sets": list(GEAR_SETS),
        "tables": parsed["tables"],
        "page_count": 1,
        "record_count": len(entries),
        "unique_spec_count": len({(entry["class_slug"], entry["spec_slug"]) for entry in entries}),
        "credits_spent": str(credits),
        "fetch": [{"path": TIERLIST_PATH, **fetch}],
    }


def collect_mythistone_simtier() -> dict[str, Any]:
    body, fetch = fetch_tierlist()
    return build_payload(parse_tierlist_page(body), fetch, datetime.now(UTC))


def main() -> int:
    json.dump(collect_mythistone_simtier(), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
