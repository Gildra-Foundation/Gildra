#!/usr/bin/env python3
"""Collect the editorial Mythic+ spec tier list of method.gg.

The guide page renders one S/A/B/C list of all specs (plus a dungeon
difficulty list, which is ignored). Only tier, order inside the tier and the
up/down marker of the latest change are kept; the authors' text never is.
robots.txt disallows only /admin and /board; the terms forbid no automated
reading.
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
from .wow_specs import ROLES, by_full_name

HOST = "www.method.gg"
BASE_URL = f"https://{HOST}"
PAGE = "/guides/tier-list/mythic-plus"
TOKEN_RE = re.compile(
    r'<div class="tier__tier (?P<tier>[sabcdf])-tier">'
    r'|<a href="/guides/[a-z-]+" class="tier__icon"[^>]*data-original-title="(?P<name>[^"]+)">(?P<inner>.*?)</a>',
    re.S,
)


def parse_page(body: bytes) -> list[dict[str, Any]]:
    page = body.decode("utf-8", "replace")
    start = page.find("Mythic+ Spec Tier List</h2>")
    end = page.find("<h2>", start + 10)
    if start < 0:
        raise TierParseError("spec tier list not found")
    tier = ""
    ranked: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for token in TOKEN_RE.finditer(page[start:end if end > 0 else len(page)]):
        if token.group("tier"):
            tier = token.group("tier").upper()
            continue
        if not tier:
            raise TierParseError("spec listed before any tier")
        spec = by_full_name(html.unescape(token.group("name")))
        if spec is None:
            raise TierParseError(f"unknown spec {token.group('name')!r}")
        if (spec.class_slug, spec.spec_slug) in seen:
            raise TierParseError(f"spec listed twice: {token.group('name')!r}")
        seen.add((spec.class_slug, spec.spec_slug))
        inner = token.group("inner")
        change = "up" if "change-up" in inner else "down" if "change-down" in inner else ""
        ranked.append(entry(spec, len(ranked) + 1, tier, change=change))
    if len(ranked) < 30:
        raise TierParseError(f"only {len(ranked)} specs in the tier list")
    roles = split_by_role(ranked)
    return [
        {"activity": "mythic_plus", "role": role, "bracket": "", "region": "", "source_url": f"{BASE_URL}{PAGE}",
         "tiers_derived": False, "entries": roles[role]}
        for role in ROLES
    ]


def collect_method(fetcher: PoliteFetcher | None = None) -> dict[str, Any]:
    fetcher = fetcher or PoliteFetcher(HOST)
    body, fetch = fetcher.get(f"{BASE_URL}{PAGE}", html_contract("tier__tier", "Spec Tier List"))
    return build_payload("method", "method.gg", f"{BASE_URL}{PAGE}", parse_page(body), [fetch], datetime.now(UTC))


DATASET = PayloadDataset(
    slug="tierlist-method", name="Tierlist — Method", source_name="method.gg", refresh_hours=24,
    lock_id=0x47696C644D455448,
    expect=Expectation("method", HOST, tuple(("mythic_plus", role, "", "") for role in ROLES), min_coverage=0.8),
    collect=collect_method,
)


def refresh_tierlist_method(scheduled_for: date, *, trigger: str = "scheduled"):
    return publish(DATASET, scheduled_for, trigger=trigger)


if __name__ == "__main__":
    json.dump(collect_method(), sys.stdout, ensure_ascii=False, indent=2)
