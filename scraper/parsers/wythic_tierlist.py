#!/usr/bin/env python3
"""Collect the Mythic+ spec tiers of wythic.com.

Wythic groups specs into S/A/B/C by how often they appear in the season's top
Mythic+ runs (run data from Raider.IO) and prints each spec's share. One
server-rendered page (``/en``) carries the all-roles tiers; only tier, order
and share are kept. robots.txt allows everything except ``/api/``; the terms
forbid no automated reading.
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
    split_by_role,
)
from .wow_specs import ROLES, by_parts

HOST = "wythic.com"
BASE_URL = f"https://{HOST}"
PAGE = "/en"
TOKEN_RE = re.compile(
    r'<span class="text-\[38px\][^"]*"[^>]*>(?P<tier>[SABCDF])</span>'
    r'|<a title="(?P<title>[^"]+)"[^>]*href="/en/class/(?P<class>[a-z-]+)/(?P<spec>[a-z-]+)"'
)
SHARE_RE = re.compile(r"·\s*([0-9]+(?:[.][0-9]+)?)%\s*$")


def parse_page(body: bytes) -> list[dict[str, Any]]:
    page = body.decode("utf-8", "replace")
    start = page.find(">Spec Tiers<")
    end = page.find(">Comp tier<", start)
    if start < 0 or end < 0:
        raise TierParseError("spec tier section not found")
    tier = ""
    ranked: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for token in TOKEN_RE.finditer(page[start:end]):
        if token.group("tier"):
            tier = token.group("tier")
            continue
        if not tier:
            raise TierParseError("spec listed before any tier")
        spec = by_parts(token.group("class"), token.group("spec"))
        if spec is None:
            raise TierParseError(f"unknown spec {token.group('class')}/{token.group('spec')}")
        if (spec.class_slug, spec.spec_slug) in seen:
            raise TierParseError(f"spec listed twice: {spec.class_slug}/{spec.spec_slug}")
        seen.add((spec.class_slug, spec.spec_slug))
        share = SHARE_RE.search(html.unescape(token.group("title")))
        ranked.append(entry(spec, len(ranked) + 1, tier, {"popularity": round(float(share.group(1)) / 100, 5) if share else None}))
    if len(ranked) < 30:
        raise TierParseError(f"only {len(ranked)} specs in the tier section")
    roles = split_by_role(ranked)
    return [
        {"activity": "mythic_plus", "role": role, "bracket": "", "region": "", "source_url": f"{BASE_URL}{PAGE}",
         "tiers_derived": False, "entries": roles[role]}
        for role in ROLES
    ]


def collect_wythic(fetcher: PoliteFetcher | None = None) -> dict[str, Any]:
    fetcher = fetcher or PoliteFetcher(HOST)
    body, fetch = fetcher.get(f"{BASE_URL}{PAGE}", html_contract("Spec Tiers", "/en/class/"))
    return build_payload("wythic", HOST, BASE_URL, parse_page(body), [fetch], datetime.now(UTC))


DATASET = PayloadDataset(
    slug="tierlist-wythic", name="Tierlist — Wythic", source_name=HOST, refresh_hours=12,
    lock_id=0x47696C6457595448,
    expect=Expectation("wythic", HOST, tuple(("mythic_plus", role, "", "") for role in ROLES), min_coverage=0.8),
    collect=collect_wythic,
)


def refresh_tierlist_wythic(scheduled_for: date, *, trigger: str = "scheduled"):
    return publish(DATASET, scheduled_for, trigger=trigger)


if __name__ == "__main__":
    json.dump(collect_wythic(), sys.stdout, ensure_ascii=False, indent=2)
