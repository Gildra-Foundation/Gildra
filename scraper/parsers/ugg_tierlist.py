#!/usr/bin/env python3
"""Collect and normalize the u.gg WoW raid and Mythic+ tier lists.

u.gg renders its tier lists from public JSON files on stats2.u.gg, so the
collector reads those files directly over HTTPS (zero Scrape.do credits). Only
ranking facts are kept: spec, tier letter, position, hero-talent split and the
sample size, with a link back to the u.gg page they came from.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

DATA_HOST = "stats2.u.gg"
DATA_BASE = f"https://{DATA_HOST}/wow/builds"
PAGE_BASE = "https://u.gg/wow/tier-list"
USER_AGENT = "GildraDatasetBot/1.0 (+https://gildra.net)"
# Highest data version seen on 2026-10-24; discovery only walks upward from it.
MIN_DATA_VERSION = 37
MAX_VERSION_PROBES = 12
MAX_SOURCE_AGE = timedelta(days=7)
MAX_BODY_BYTES = 2_000_000

ROLE_LISTS = {"dps": "dps_list", "healer": "healing_tier_list", "tank": "tank_tier_list"}
ROLE_PAGES = {"dps": "dps-rankings", "healer": "healer-rankings", "tank": "tank-rankings"}
TIER_RE = re.compile(r"^[SABCDF]$")
CAMEL_RE = re.compile(r"(?<=[a-z])(?=[A-Z])")

# (activity, difficulty, u.gg game mode, u.gg difficulty path, data file).
CONTEXTS = (
    ("mythic_plus", "all", "mythic", "all", "mythic-default-tierlist.json"),
    ("raid", "all", "raid", "all", "raid-default-tierlist.json"),
    ("raid", "normal", "raid", "3", "raid-default-tierlist.json"),
    ("raid", "heroic", "raid", "4", "raid-default-tierlist.json"),
    ("raid", "mythic", "raid", "5", "raid-default-tierlist.json"),
)


def slugify(value: str) -> str:
    """DeathKnight -> death-knight, BeastMastery -> beast-mastery."""
    return CAMEL_RE.sub("-", value.strip()).lower()


def _title(value: str) -> str:
    return CAMEL_RE.sub(" ", value.strip())


def page_url(activity: str, difficulty: str, role: str) -> str:
    base = f"{PAGE_BASE}/{ROLE_PAGES[role]}"
    if activity == "mythic_plus":
        return base
    url = f"{base}/raid"
    return url if difficulty == "all" else f"{url}?difficulty={difficulty}"


def data_url(version: int, difficulty_path: str, filename: str) -> str:
    return f"{DATA_BASE}/v{version}/{difficulty_path}/{filename}"


def _request(url: str, method: str = "GET") -> urllib.request.Request:
    return urllib.request.Request(
        url,
        method=method,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Encoding": "identity"},
    )


def _probe(url: str) -> bool:
    try:
        with urllib.request.urlopen(_request(url, "HEAD"), timeout=30) as response:
            return response.status == 200
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 404):
            return False
        raise


def discover_version(start: int = MIN_DATA_VERSION) -> int:
    """Walk v{start}, v{start+1}, ... and return the newest published data version.

    u.gg bumps the version prefix when it ships a new data build; unpublished
    versions answer 403/404. The newest one that answers 200 is current.
    """
    if not _probe(data_url(start, "all", "mythic-default-tierlist.json")):
        raise RuntimeError(f"u.gg data version v{start} is no longer published")
    version = start
    for candidate in range(start + 1, start + MAX_VERSION_PROBES + 1):
        if not _probe(data_url(candidate, "all", "mythic-default-tierlist.json")):
            break
        version = candidate
    return version


def fetch_ugg_json(url: str) -> tuple[bytes, dict[str, Any]]:
    with urllib.request.urlopen(_request(url), timeout=60) as response:
        final = urlsplit(response.geturl())
        body = response.read(MAX_BODY_BYTES + 1)
        status = response.status
    if final.scheme != "https" or final.hostname != DATA_HOST:
        raise RuntimeError("u.gg data fetch redirected to an unexpected host")
    if status != 200 or not 1_000 <= len(body) <= MAX_BODY_BYTES:
        raise RuntimeError(f"u.gg data response failed validation: status={status} bytes={len(body)}")
    return body, {
        "provider": "direct",
        "strategy": "https",
        "target_status": status,
        "body_bytes": len(body),
        "credits_spent": "0",
    }


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_ugg_tierlist(
    body: bytes | str,
    *,
    activity: str,
    difficulty: str,
    game_mode: str,
    data_source_url: str,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Return one page per role, each with one record per specialization.

    u.gg ranks spec + hero-talent rows. A spec takes the tier and position of
    its best hero-talent row; the full split is kept under ``hero_talents``.
    """
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("u.gg tier list is not valid JSON") from exc
    if not isinstance(data, dict) or not isinstance(data.get(game_mode), dict):
        raise ValueError(f"u.gg tier list has no {game_mode!r} section")
    try:
        updated_at = datetime.fromisoformat(str(data.get("timestamp")).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("u.gg tier list timestamp is missing") from exc
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=UTC)
    if (now or datetime.now(UTC)) - updated_at > MAX_SOURCE_AGE:
        raise ValueError(f"u.gg tier list is stale: {updated_at.isoformat()}")

    section = data[game_mode]
    pages: list[dict[str, Any]] = []
    for role, list_key in ROLE_LISTS.items():
        rows = section.get(list_key)
        if not isinstance(rows, list):
            raise ValueError(f"u.gg {game_mode}/{difficulty} has no {list_key}")
        by_spec: dict[tuple[str, str], dict[str, Any]] = {}
        for row in sorted(rows, key=lambda item: -(_number(item.get("ranking")) or 0)):
            if not isinstance(row, dict):
                raise ValueError("u.gg tier row is not an object")
            tier = str(row.get("tier_letter") or "")
            if TIER_RE.fullmatch(tier) is None:
                raise ValueError(f"invalid u.gg tier letter: {tier!r}")
            class_key, spec_key = str(row.get("class") or ""), str(row.get("spec") or "")
            if not class_key or not spec_key:
                raise ValueError("u.gg tier row has no class or spec")
            identity = (slugify(class_key), slugify(spec_key))
            hero = {
                "slug": slugify(str(row.get("subspec") or "")),
                "name": str(row.get("subspec_display_name") or _title(str(row.get("subspec") or ""))),
                "tier": tier,
                "score": _number(row.get("ranking")),
                "count": int(row.get("count") or 0),
            }
            record = by_spec.get(identity)
            if record is None:
                by_spec[identity] = {
                    "activity": activity,
                    "difficulty": difficulty,
                    "role": role,
                    "rank": len(by_spec) + 1,
                    "tier": tier,
                    "class_name": str(row.get("display_name") or _title(class_key)),
                    "class_slug": identity[0],
                    "spec_name": str(row.get("spec_display_name") or _title(spec_key)),
                    "spec_slug": identity[1],
                    "score": hero["score"],
                    "dps": _number(row.get("dps")),
                    "hps": _number(row.get("hps")),
                    "parses": hero["count"],
                    "hero_talents": [hero],
                    "source_url": page_url(activity, difficulty, role),
                }
            else:
                record["parses"] += hero["count"]
                record["hero_talents"].append(hero)
        records = list(by_spec.values())
        total = sum(record["parses"] for record in records)
        for record in records:
            record["popularity"] = round(record["parses"] / total, 6) if total else None
        pages.append(
            {
                "activity": activity,
                "difficulty": difficulty,
                "role": role,
                "source_url": page_url(activity, difficulty, role),
                "data_url": data_source_url,
                "source_updated_at": updated_at.astimezone(UTC).isoformat(),
                "total_parses": total,
                "record_count": len(records),
                "records": records,
            }
        )
    return pages


def collect_ugg_dataset(start_version: int = MIN_DATA_VERSION) -> dict[str, Any]:
    version = discover_version(start_version)
    pages: list[dict[str, Any]] = []
    fetches: list[dict[str, Any]] = []
    for activity, difficulty, game_mode, difficulty_path, filename in CONTEXTS:
        url = data_url(version, difficulty_path, filename)
        body, fetch = fetch_ugg_json(url)
        for page in parse_ugg_tierlist(
            body, activity=activity, difficulty=difficulty, game_mode=game_mode, data_source_url=url
        ):
            page["fetch"] = fetch
            pages.append(page)
        fetches.append(fetch)

    records = [record for page in pages for record in page["records"]]
    unique_specs = {(record["class_slug"], record["spec_slug"]) for record in records}
    return {
        "schema_version": 1,
        "source": "https://u.gg",
        "data_version": version,
        "fetched_at": datetime.now(UTC).isoformat(),
        "page_count": len(pages),
        "record_count": len(records),
        "unique_spec_count": len(unique_specs),
        "credits_spent": "0",
        "request_count": len(fetches),
        "pages": pages,
    }
