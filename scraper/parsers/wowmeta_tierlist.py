#!/usr/bin/env python3
"""Collect the statistical Mythic+ tier lists of wowmeta.com.

wowmeta ranks specs by the lower bound of a 95 % confidence interval of the
Blizzard Mythic+ rating of their players and cuts tiers with Ckmeans. Its
server-rendered table carries rank, tier, that bound, the mean and maximum
rating, the sample size and the highest key per spec; only those numbers are
kept (three pages a run, direct HTTPS, robots.txt allows everything, the
terms of use forbid no automated reading). Its raid page has too few records
to rank and its PvP pages do not say which bracket they cover, so neither is
collected.
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
from .wow_specs import ROLES, by_full_name

HOST = "wowmeta.com"
BASE_URL = f"https://{HOST}"
PAGES = {role: f"/wow/mythic-plus-{role}-tier-list" for role in ROLES}
ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.S)
CELL_RE = re.compile(r"<td\b[^>]*>(.*?)</td>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
TITLE_RE = re.compile(r'<span title="(-?[0-9.]+)"')
SPEC_RE = re.compile(r'<a href="/wow/mythic-plus-[a-z-]+" title="([^"]+?) Meta Build"')
RECORDS_RE = re.compile(r"Data based on:\s*(?:<[^>]+>\s*)*([0-9][0-9,]*)\s*(?:<[^>]+>\s*)*records")


def _text(cell: str) -> str:
    return " ".join(html.unescape(TAG_RE.sub(" ", cell)).split())


def _number(cell: str) -> float:
    titled = TITLE_RE.search(cell)
    raw = titled.group(1) if titled else _text(cell).replace(",", "").lstrip("+")
    try:
        return float(raw)
    except ValueError as exc:
        raise TierParseError(f"not a number: {raw!r}") from exc


def parse_page(body: bytes, role: str) -> dict[str, Any]:
    page = body.decode("utf-8", "replace")
    start = page.find('<tbody slot="body"')
    end = page.find("</tbody>", start)
    if start < 0 or end < 0:
        raise TierParseError("ranking table not found")
    entries: list[dict[str, Any]] = []
    for row in ROW_RE.finditer(page[start:end]):
        cells = CELL_RE.findall(row.group(1))
        name = SPEC_RE.search(row.group(1))
        if len(cells) < 8 or not name:
            raise TierParseError("ranking row lost a cell")
        spec = by_full_name(html.unescape(name.group(1)))
        if spec is None:
            raise TierParseError(f"unknown spec {name.group(1)!r}")
        tier = _text(cells[1])
        if tier == "X":  # unranked: too few records for the confidence bound
            continue
        entries.append(entry(spec, len(entries) + 1, tier, {
            "score": round(_number(cells[2]), 2),
            "rating": round(_number(cells[3]), 2),
            "players": int(_number(cells[5])),
            "max_key": int(_number(cells[6])),
        }))
    if not entries:
        raise TierParseError("ranking table is empty")
    records = RECORDS_RE.search(page)
    return {
        "activity": "mythic_plus", "role": role, "bracket": "", "region": "",
        "source_url": f"{BASE_URL}{PAGES[role]}", "tiers_derived": False,
        "sample": int(records.group(1).replace(",", "")) if records else None, "entries": entries,
    }


def collect_wowmeta(fetcher: PoliteFetcher | None = None) -> dict[str, Any]:
    fetcher = fetcher or PoliteFetcher(HOST)
    lists, fetches = [], []
    for role, path in PAGES.items():
        body, fetch = fetcher.get(f"{BASE_URL}{path}", html_contract("lb_ci", "Meta Build"))
        lists.append(parse_page(body, role))
        fetches.append(fetch)
    return build_payload("wowmeta", HOST, BASE_URL, lists, fetches, datetime.now(UTC))


DATASET = PayloadDataset(
    slug="tierlist-wowmeta", name="Tierlist — wowmeta", source_name=HOST, refresh_hours=24,
    lock_id=0x47696C6457574D54,
    expect=Expectation("wowmeta", HOST, tuple(("mythic_plus", role, "", "") for role in ROLES), min_coverage=0.6),
    collect=collect_wowmeta,
)


def refresh_tierlist_wowmeta(scheduled_for: date, *, trigger: str = "scheduled"):
    return publish(DATASET, scheduled_for, trigger=trigger)


if __name__ == "__main__":
    json.dump(collect_wowmeta(), sys.stdout, ensure_ascii=False, indent=2)
