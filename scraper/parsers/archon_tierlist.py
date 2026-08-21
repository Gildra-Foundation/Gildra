#!/usr/bin/env python3
"""Collect and normalize the twelve Archon WoW tier-list slices."""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.request
from datetime import UTC, datetime
from typing import Any, Iterator
from urllib.parse import urlsplit

from web_scraper import ResponseContract
from web_scraper.providers import ScrapeDoProvider

from .wowhead_tier_lists import fetch_with_fallback
from .observability import event, safe_url

BASE_URL = "https://www.archon.gg"
NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.DOTALL
)
BUILD_PATH_RE = re.compile(
    r"^/wow/builds/(?P<spec>[a-z-]+)/(?P<class>[a-z-]+)/"
    r"(?:mythic-plus|raid)/overview/"
)
ACTOR_RE = re.compile(
    r"<ActorIcon\s+type=['\"](?P<icon>[^'\"]+)['\"]>(?P<name>.*?)</ActorIcon>"
)
TIER_RE = re.compile(r"^[A-FS][+]?$")
logger = logging.getLogger(__name__)

_CLASS_NAMES = {
    "death-knight": "Death Knight",
    "demon-hunter": "Demon Hunter",
}


def _sources() -> list[dict[str, str]]:
    sources = [
        {
            "activity": "mythic_plus",
            "difficulty": "10",
            "role": role,
            "url": f"{BASE_URL}/wow/tier-list/{role}-rankings/mythic-plus/10/all-dungeons/this-week",
        }
        for role in ("dps", "tank", "healer")
    ]
    sources.extend(
        {
            "activity": "raid",
            "difficulty": difficulty,
            "role": role,
            "url": f"{BASE_URL}/wow/tier-list/{role}-rankings/raid/{difficulty}/all-bosses",
        }
        for difficulty in ("normal", "heroic", "mythic")
        for role in ("dps", "tank", "healer")
    )
    return sources


SOURCES = _sources()


def _fetch_archon(source_url: str, contract: ResponseContract) -> tuple[bytes, dict[str, Any]]:
    """Keep Scrape.do first, with direct HTTPS as a zero-credit Archon fallback."""
    try:
        return fetch_with_fallback(
            source_url,
            contract,
            providers=[(ScrapeDoProvider(), "normal")],
        )
    except RuntimeError as provider_error:
        started = time.monotonic()
        event(logger, "scrape_direct_fallback_started", target_url=safe_url(source_url))
        request = urllib.request.Request(
            source_url,
            headers={
                "User-Agent": "GildraDatasetBot/1.0 (+https://gildra.net)",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Encoding": "identity",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            final_url = response.geturl()
            body = response.read(2_000_001)
            status = response.status
        final = urlsplit(final_url)
        if final.scheme != "https" or final.hostname != "www.archon.gg":
            raise RuntimeError("Archon direct fetch redirected to an unexpected host") from provider_error
        required = (b"__NEXT_DATA__", b"specTierListSection", b"specRankingsSection")
        if status != 200 or not 20_000 <= len(body) <= 2_000_000 or not all(marker in body for marker in required):
            raise RuntimeError(
                f"Archon direct response failed validation: status={status} bytes={len(body)}"
            ) from provider_error
        event(
            logger,
            "scrape_direct_fallback_completed",
            target_url=safe_url(source_url),
            target_status=status,
            body_bytes=len(body),
            duration_ms=int((time.monotonic() - started) * 1_000),
        )
        return body, {
            "provider": "direct",
            "strategy": "https",
            "target_status": status,
            "body_bytes": len(body),
            "credits_spent": "0",
        }


def _objects(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _objects(item)


def _class_and_spec(item_path: str, display_name: str) -> tuple[str, str, str, str]:
    match = BUILD_PATH_RE.match(item_path)
    if match is None:
        raise ValueError(f"unexpected Archon build path: {item_path}")
    class_slug = match.group("class")
    spec_slug = match.group("spec")
    class_name = _CLASS_NAMES.get(class_slug, class_slug.replace("-", " ").title())
    spec_name = display_name
    suffix = f" {class_name}"
    if display_name.endswith(suffix):
        spec_name = display_name[: -len(suffix)]
    if not spec_name:
        spec_name = spec_slug.replace("-", " ").title()
    return class_name, class_slug, spec_name, spec_slug


def parse_archon_page(
    page_html: bytes | str,
    *,
    source_url: str,
    activity: str,
    difficulty: str,
    role: str,
) -> dict[str, Any]:
    text = page_html.decode("utf-8", errors="replace") if isinstance(page_html, bytes) else page_html
    match = NEXT_DATA_RE.search(text)
    if match is None:
        raise ValueError("Archon __NEXT_DATA__ payload was not found")
    try:
        next_data = json.loads(match.group(1))
        page = next_data["props"]["pageProps"]["page"]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ValueError("Archon page data has an unexpected structure") from exc

    section = page.get("specTierListSection") or {}
    tier_lists = section.get("tierLists") or []
    rankings = ((page.get("specRankingsSection") or {}).get("table") or {}).get("data") or []
    if not isinstance(tier_lists, list) or not isinstance(rankings, list):
        raise ValueError("Archon tier lists or rankings are not arrays")

    tier_assignments: dict[str, dict[str, dict[str, Any]]] = {}
    spec_ids: dict[str, int] = {}
    for tier_list in tier_lists:
        metric = str(tier_list.get("metric") or "")
        if not metric:
            continue
        for tier in tier_list.get("tiers") or []:
            label = str(tier.get("tier") or "")
            if TIER_RE.fullmatch(label) is None:
                raise ValueError(f"invalid Archon tier label: {label!r}")
            rank_in_tier = 0
            for entry in _objects(tier.get("entries") or []):
                item_path = entry.get("url")
                if not isinstance(item_path, str) or not item_path.startswith("/wow/builds/"):
                    continue
                rank_in_tier += 1
                tier_assignments.setdefault(item_path, {})[metric] = {
                    "tier": label,
                    "rank": rank_in_tier,
                }
                if isinstance(entry.get("id"), int):
                    spec_ids[item_path] = entry["id"]

    primary_metric = str(tier_lists[0].get("metric") or "") if tier_lists else ""
    records: list[dict[str, Any]] = []
    for rank, row in enumerate(rankings, start=1):
        if not isinstance(row, dict):
            raise ValueError("Archon ranking row is not an object")
        item_path = str(row.get("itemPath") or "")
        actor = ACTOR_RE.fullmatch(str(row.get("item") or ""))
        if actor is None:
            raise ValueError(f"Archon actor markup is invalid for {item_path}")
        class_name, class_slug, spec_name, spec_slug = _class_and_spec(
            item_path, actor.group("name").strip()
        )
        assignments = tier_assignments.get(item_path, {})
        primary = assignments.get(primary_metric, {})
        records.append(
            {
                "activity": activity,
                "difficulty": difficulty,
                "role": role,
                "rank": rank,
                "tier": str(primary.get("tier") or ""),
                "tier_assignments": assignments,
                "spec_id": spec_ids.get(item_path),
                "class_name": class_name,
                "class_slug": class_slug,
                "spec_name": spec_name,
                "spec_slug": spec_slug,
                "icon_slug": actor.group("icon"),
                "build_url": f"{BASE_URL}{item_path}",
                "source_url": source_url,
                "score": row.get("score"),
                "dps": row.get("dps"),
                "hps": row.get("hps"),
                "survivability": row.get("survivability"),
                "popularity": row.get("popularity"),
                "parses": row.get("parses"),
                "max_key": int(row["maxKey"]) if row.get("maxKey") not in (None, "") else None,
            }
        )

    source_updated_at = page.get("lastUpdated")
    if not isinstance(source_updated_at, str):
        raise ValueError("Archon lastUpdated timestamp is missing")
    return {
        "source_url": source_url,
        "activity": activity,
        "difficulty": difficulty,
        "role": role,
        "title": str(page.get("title") or ""),
        "description": str(section.get("description") or page.get("description") or ""),
        "source_updated_at": source_updated_at,
        "total_parses": int(page.get("totalParses") or 0),
        "primary_metric": primary_metric,
        "available_metrics": [str(item.get("metric") or "") for item in tier_lists],
        "record_count": len(records),
        "records": records,
    }


def collect_archon_dataset() -> dict[str, Any]:
    pages: list[dict[str, Any]] = []
    fetches: list[dict[str, Any]] = []
    contract = ResponseContract.html(
        canaries=("__NEXT_DATA__", "specTierListSection", "specRankingsSection"),
        min_body_bytes=20_000,
        stop_signatures=("Just a moment...", "cf-chl-", "Access Denied"),
    )
    for source in SOURCES:
        body, fetch = _fetch_archon(source["url"], contract)
        page = parse_archon_page(
            body,
            source_url=source["url"],
            activity=source["activity"],
            difficulty=source["difficulty"],
            role=source["role"],
        )
        page["fetch"] = fetch
        pages.append(page)
        fetches.append(fetch)

    records = [record for page in pages for record in page["records"]]
    unique_specs = {(record["class_slug"], record["spec_slug"]) for record in records}
    attributed = all(fetch["credits_spent"] is not None for fetch in fetches)
    credits = sum(int(fetch["credits_spent"]) for fetch in fetches) if attributed else None
    return {
        "schema_version": 1,
        "source": BASE_URL,
        "fetched_at": datetime.now(UTC).isoformat(),
        "page_count": len(pages),
        "record_count": len(records),
        "unique_spec_count": len(unique_specs),
        "credits_spent": credits,
        "pages": pages,
    }
