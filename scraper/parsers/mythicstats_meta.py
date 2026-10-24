#!/usr/bin/env python3
"""Collect the weekly Mythic+ spec diversity summary from mythicstats.com/meta.

Only numbers are kept: for each week (WoW reset period) of the current
expansion's seasons, the share of the top 2000 keys each specialization
appeared in, the average key level and four Gini coefficients (all roles,
DPS, tank, healer). The latest period page adds that week's affixes and sample
size. Page text, images and markup are never stored.
"""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
from datetime import UTC, datetime
from html.parser import HTMLParser
from typing import Any

from .mythicstats_client import BASE_URL, contract, fetch_mythicstats

META_PATH = "/meta"
ROLES = ("dps", "tank", "healer")
SEASON_HREF_RE = re.compile(r"^https://mythicstats[.]com/season/(?P<slug>[a-z]+[0-9]+)$")
PERIOD_HREF_RE = re.compile(r"^https://mythicstats[.]com/period/(?P<id>[0-9]+)$")
SPEC_TITLE_RE = re.compile(r"^(?P<value>[0-9]+(?:[.][0-9]+)?)% (?P<spec>[a-z][a-z-]*)$")
CLASS_RE = re.compile(r"^bg-(?P<class>[a-z][a-z-]*)$")
NUMBER_RE = re.compile(r"^[0-9]+(?:[.][0-9]+)?$")
PERIOD_TITLE_RE = re.compile(
    r"Period (?P<id>[0-9]+), week (?P<week>[0-9]+) of (?P<season>[A-Za-z]+[0-9]+)\s*\((?P<affixes>[^)]*)\)"
)
PERIOD_SAMPLE_RE = re.compile(
    r"Top (?P<keys>[0-9]+) keys, (?P<characters>[0-9]+) characters \((?P<unique>[0-9]+) unique\), "
    r"(?P<avg>[0-9]+(?:[.][0-9]+)?) average key level"
)
NOT_CLASSES = {"gray", "white", "black"}


def _classes(attrs: list[tuple[str, str | None]]) -> list[str]:
    return (dict(attrs).get("class") or "").split()


class MetaParser(HTMLParser):
    """State machine over the weekly rows: ``<a href=/period/N>`` → 3 role groups + 6 stat cells."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.seasons: list[dict[str, Any]] = []
        self._season: dict[str, Any] | None = None
        self._row: dict[str, Any] | None = None
        self._row_depth = 0
        self._group_depth: int | None = None
        self._stats_depth: int | None = None
        self._cell_depth: int | None = None
        self._cell_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.depth += 1
        attributes = dict(attrs)
        classes = _classes(attrs)
        href = attributes.get("href") or ""
        if tag == "a" and self._row is None:
            season = SEASON_HREF_RE.match(href)
            if season:
                slug = season.group("slug")
                existing = next((item for item in self.seasons if item["slug"] == slug), None)
                if existing is None:
                    existing = {"slug": slug, "source_url": href, "weeks": []}
                    self.seasons.append(existing)
                self._season = existing
                return
            period = PERIOD_HREF_RE.match(href)
            if period and "grid" in classes and self._season is not None:
                self._row = {"period_id": int(period.group("id")), "source_url": href, "groups": [], "stats": []}
                self._row_depth = self.depth
            return
        if self._row is None or tag != "div":
            return
        if self._stats_depth is None and self._group_depth is None:
            if "flex" in classes and "overflow-hidden" in classes:
                self._group_depth = self.depth
                self._row["groups"].append([])
            elif "grid" in classes and "grid-cols-6" in classes:
                self._stats_depth = self.depth
            return
        if self._group_depth is not None and self.depth == self._group_depth + 1:
            title = html_lib.unescape(attributes.get("title") or "").strip()
            match = SPEC_TITLE_RE.match(title)
            class_slug = next(
                (m.group("class") for m in map(CLASS_RE.match, classes) if m and m.group("class") not in NOT_CLASSES),
                None,
            )
            if not match or not class_slug:
                raise ValueError(f"unexpected mythicstats spec cell: class={classes} title={title!r}")
            self._row["groups"][-1].append({
                "class_slug": class_slug,
                "spec_slug": match.group("spec"),
                "presence": float(match.group("value")),
            })
        elif self._stats_depth is not None and self.depth == self._stats_depth + 1:
            self._cell_depth = self.depth
            self._cell_text = []

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if self._cell_depth is not None:
            self._cell_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._row is not None:
            if self._cell_depth is not None and self.depth == self._cell_depth:
                self._row["stats"].append(" ".join("".join(self._cell_text).split()))
                self._cell_depth = None
            elif self._group_depth is not None and self.depth == self._group_depth:
                self._group_depth = None
            elif self._stats_depth is not None and self.depth == self._stats_depth:
                self._stats_depth = None
            elif self.depth == self._row_depth and tag == "a":
                self._finish_row()
        self.depth -= 1

    def _finish_row(self) -> None:
        row, self._row = self._row, None
        assert row is not None and self._season is not None
        if len(row["groups"]) != 3 or len(row["stats"]) != 6:
            raise ValueError(
                f"period {row['period_id']}: expected 3 role groups and 6 stats, "
                f"got {len(row['groups'])} and {len(row['stats'])}"
            )
        if not all(NUMBER_RE.match(value) for value in row["stats"]):
            raise ValueError(f"period {row['period_id']}: non-numeric stats {row['stats']}")
        week, average_key, gini_all, gini_dps, gini_tank, gini_healer = row["stats"]
        specs = [
            {"role": role, **spec}
            for role, group in zip(ROLES, row["groups"], strict=True)
            for spec in group
        ]
        self._season["weeks"].append({
            "period_id": row["period_id"],
            "week": int(week),
            "average_key": float(average_key),
            "gini": {"all": float(gini_all), "dps": float(gini_dps),
                     "tank": float(gini_tank), "healer": float(gini_healer)},
            "source_url": row["source_url"],
            "specs": specs,
        })


def parse_meta_page(html: bytes | str) -> dict[str, Any]:
    text = html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html
    parser = MetaParser()
    parser.feed(text)
    parser.close()
    seasons = [season for season in parser.seasons if season["weeks"]]
    for season in seasons:
        season["label"] = season["slug"].upper()
        season["weeks"].sort(key=lambda week: week["week"], reverse=True)
    return {"seasons": seasons}


def parse_period_header(html: bytes | str, period_id: int) -> dict[str, Any]:
    """Affixes and sample size of one period page (h1 + lede only)."""
    text = html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html
    plain = " ".join(html_lib.unescape(re.sub(r"<[^>]+>", " ", text)).split())
    title = PERIOD_TITLE_RE.search(plain)
    sample = PERIOD_SAMPLE_RE.search(plain)
    if not title or int(title.group("id")) != period_id or not sample:
        raise ValueError(f"period {period_id}: header not recognised")
    affixes = [name.strip() for name in title.group("affixes").split(",") if name.strip()]
    if not 1 <= len(affixes) <= 8:
        raise ValueError(f"period {period_id}: unexpected affix count {len(affixes)}")
    return {
        "period_id": period_id,
        "week": int(title.group("week")),
        "season": title.group("season").lower(),
        "affixes": affixes,
        "keys": int(sample.group("keys")),
        "characters": int(sample.group("characters")),
        "unique_characters": int(sample.group("unique")),
        "average_key": float(sample.group("avg")),
        "source_url": f"{BASE_URL}/period/{period_id}",
    }


def collect_mythicstats_meta() -> dict[str, Any]:
    fetches: list[dict[str, Any]] = []
    body, fetch = fetch_mythicstats(META_PATH, contract("Weekly spec diversity", "/period/", "bg-"))
    fetches.append({"path": META_PATH, **fetch})
    parsed = parse_meta_page(body)
    if not parsed["seasons"]:
        raise ValueError("mythicstats /meta has no weekly rows")
    latest = parsed["seasons"][0]["weeks"][0]
    current_period: dict[str, Any] | None = None
    try:
        period_path = f"/period/{latest['period_id']}"
        period_body, period_fetch = fetch_mythicstats(period_path, contract("Top ", "average key level"))
        fetches.append({"path": period_path, **period_fetch})
        current_period = parse_period_header(period_body, latest["period_id"])
    except (RuntimeError, ValueError):
        # Affixes are an enrichment; the weekly table alone is a complete snapshot.
        current_period = None
    weeks = [week for season in parsed["seasons"] for week in season["weeks"]]
    unique_specs = {(spec["class_slug"], spec["spec_slug"]) for week in weeks for spec in week["specs"]}
    credits = 0.0
    for item in fetches:
        try:
            credits += float(item.get("credits_spent") or 0)
        except (TypeError, ValueError):
            pass
    return {
        "schema_version": 1,
        "source_name": "mythicstats.com",
        "source_url": f"{BASE_URL}{META_PATH}",
        "fetched_at": datetime.now(UTC).isoformat(),
        "seasons": parsed["seasons"],
        "current_period": current_period,
        "page_count": len(fetches),
        "week_count": len(weeks),
        "record_count": sum(len(week["specs"]) for week in weeks),
        "unique_spec_count": len(unique_specs),
        "credits_spent": str(credits),
        "fetch": fetches,
    }


def main() -> int:
    json.dump(collect_mythicstats_meta(), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
