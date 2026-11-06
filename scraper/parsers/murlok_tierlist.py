#!/usr/bin/env python3
"""Collect the PvP spec rankings of murlok.io.

murlok.io ranks specs per role for Solo Shuffle, 2v2, 3v3, Blitz and rated
battlegrounds from top-rated players (refreshed every 8 hours) and prints one
score per spec. The pages are server-rendered; only position and score are
kept. murlok publishes no tiers, so the tiers here are derived from its score
by natural breaks (``wow_specs.ckmeans_tiers``) and the list is marked
``tiers_derived``. robots.txt allows everything; 15 pages a run, direct
HTTPS, one request every 1.5 s.
"""

from __future__ import annotations

import html
import json
import re
import sys
from datetime import UTC, date, datetime
from typing import Any

from .tierlist_payload import (
    Expectation, PayloadDataset, PoliteFetcher, TierParseError, build_payload, entry, html_contract, publish,
)
from .wow_specs import ROLES, by_parts, ckmeans_tiers

HOST = "murlok.io"
BASE_URL = f"https://{HOST}"
# murlok's path segment → the bracket key the API uses (wow.gg's names).
BRACKETS = {"solo": "shuffle", "2v2": "2v2", "3v3": "3v3", "blitz": "blitz", "rbg": "rbg"}
ITEM_RE = re.compile(
    r'<a class="vi-box meta-item[^"]*" href="/(?P<class>[a-z-]+)/(?P<spec>[a-z-]+)/(?P<bracket>[a-z0-9]+)">(?P<body>.*?)</a>',
    re.S,
)
H3_RE = re.compile(r'<div class="h3">([^<]+)</div>')
SCORE_RE = re.compile(r"</svg>\s*([0-9][0-9,]*)\s*</li>")


def parse_page(body: bytes, role: str, bracket: str) -> dict[str, Any]:
    page = body.decode("utf-8", "replace")
    rows: list[tuple[int, Any, int]] = []
    for item in ITEM_RE.finditer(page):
        if item.group("bracket") != bracket:
            continue
        spec = by_parts(item.group("class"), item.group("spec"))
        heads = H3_RE.findall(item.group("body"))
        score = SCORE_RE.search(item.group("body"))
        if spec is None or len(heads) < 2 or not score:
            raise TierParseError(f"ranking row lost its spec, position or score: {item.group('class')}/{item.group('spec')}")
        if spec.role != role:
            raise TierParseError(f"{spec.class_slug}/{spec.spec_slug} is not a {role} spec")
        rows.append((int(html.unescape(heads[0]).strip()), spec, int(score.group(1).replace(",", ""))))
    if not rows:
        raise TierParseError(f"no {role} {bracket} rows")
    rows.sort(key=lambda row: row[0])
    if [row[0] for row in rows] != list(range(1, len(rows) + 1)):
        raise TierParseError("positions are not 1..n")
    tiers = ckmeans_tiers([row[2] for row in rows])
    return {
        "activity": "pvp", "role": role, "bracket": BRACKETS[bracket], "region": "",
        "source_url": f"{BASE_URL}/meta/{role}/{bracket}", "tiers_derived": True,
        "entries": [entry(spec, position, tier, {"score": score}) for (position, spec, score), tier in zip(rows, tiers)],
    }


def collect_murlok(fetcher: PoliteFetcher | None = None) -> dict[str, Any]:
    fetcher = fetcher or PoliteFetcher(HOST)
    lists, fetches = [], []
    for bracket in BRACKETS:
        for role in ROLES:
            body, fetch = fetcher.get(f"{BASE_URL}/meta/{role}/{bracket}", html_contract("meta-item", min_body_bytes=10_000))
            lists.append(parse_page(body, role, bracket))
            fetches.append(fetch)
    return build_payload("murlok", HOST, BASE_URL, lists, fetches, datetime.now(UTC))


DATASET = PayloadDataset(
    slug="tierlist-murlok", name="Tierlist — Murlok PvP", source_name=HOST, refresh_hours=12,
    lock_id=0x47696C644D524C4B,
    expect=Expectation("murlok", HOST, tuple(("pvp", role, bracket, "") for bracket in BRACKETS.values() for role in ROLES), min_coverage=0.6),
    collect=collect_murlok,
)


def refresh_tierlist_murlok(scheduled_for: date, *, trigger: str = "scheduled"):
    return publish(DATASET, scheduled_for, trigger=trigger)


if __name__ == "__main__":
    json.dump(collect_murlok(), sys.stdout, ensure_ascii=False, indent=2)
