#!/usr/bin/env python3
"""Collect every currently exposed wow.gg meta filter into one normalized snapshot."""

from __future__ import annotations

import concurrent.futures
import json
import logging
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from typing import Any, Iterable
from urllib.parse import urljoin, urlsplit

from web_scraper import ResponseContract
from web_scraper.providers import ScrapeDoProvider

from .wowhead_tier_lists import fetch_with_fallback
from .observability import event, safe_error, safe_url

BASE_URL = "https://wow.gg"
LANDING_URL = f"{BASE_URL}/ru/meta/mythic-plus/dps"
ROLES = ("dps", "healer", "tank")
KEY_TYPES = ("all", "high", "middle", "low")
PVP_REGIONS = ("all", "eu", "us", "kr", "tw")
ADDONS = (
    {"id": "11", "key": "midnight", "name": "Midnight"},
    {"id": "1007", "key": "classic_mists_of_pandaria", "name": "Mists of Pandaria"},
    {"id": "1050", "key": "fresh_classic", "name": "Fresh Classic"},
    {"id": "1053", "key": "fresh_the_burning_crusade", "name": "Fresh TBC"},
)
PVP_BRACKETS = {
    "11": ("2v2", "3v3", "rbg", "shuffle", "blitz"),
    "1007": ("2v2", "3v3", "5v5", "rbg"),
}
RAID_DIFFICULTIES = {
    "11": ("raid_myth", "raid_hero", "raid_normal"),
    "1007": ("raid_n10", "raid_n25", "raid_h10", "raid_h25"),
    "1050": ("raid_myth",),
    "1053": ("raid_myth",),
}
SCRIPT_RE = re.compile(r'<script[^>]+src="([^"]+)"')
PUBLIC_KEY_RE = re.compile(r'let\s+\w+="([A-Za-z0-9]{32,})",\w+="session_token"')
API_BASE_RE = re.compile(r'https://[A-Za-z0-9.-]+(?:up\.railway\.app|wow\.gg)')
logger = logging.getLogger(__name__)


def _slug(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    if not value:
        raise ValueError("wow.gg returned an empty entity slug")
    return value


def _fetch_landing() -> tuple[bytes, dict[str, Any]]:
    contract = ResponseContract.html(
        canaries=("self.__next_f.push", "initialDungeons", "currentSeasonWeek"),
        min_body_bytes=80_000,
        stop_signatures=("Just a moment...", "cf-chl-", "Access Denied"),
    )
    try:
        return fetch_with_fallback(
            LANDING_URL, contract, providers=[(ScrapeDoProvider(), "normal")]
        )
    except RuntimeError as provider_error:
        started = time.monotonic()
        event(
            logger,
            "scrape_direct_fallback_started",
            target_url=safe_url(LANDING_URL),
        )
        request = urllib.request.Request(
            LANDING_URL,
            headers={
                "User-Agent": "GildraDatasetBot/1.0 (+https://gildra.net)",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Encoding": "identity",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read(3_000_001)
            status = response.status
            final_url = response.geturl()
        if (
            status != 200
            or urlsplit(final_url).hostname != "wow.gg"
            or not 80_000 <= len(body) <= 3_000_000
            or b"self.__next_f.push" not in body
        ):
            raise RuntimeError("wow.gg landing page failed validation") from provider_error
        event(
            logger,
            "scrape_direct_fallback_completed",
            target_url=safe_url(LANDING_URL),
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


def _request_bytes(url: str, *, headers: dict[str, str] | None = None, limit: int = 5_000_000) -> bytes:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in {
        "wow.gg", "wowbackend-production.up.railway.app"
    }:
        raise ValueError(f"refusing unexpected wow.gg dependency host: {parsed.hostname}")
    request_headers = {
        "User-Agent": "GildraDatasetBot/1.0 (+https://gildra.net)",
        "Accept": "application/json,text/javascript,*/*",
        "Accept-Encoding": "identity",
        "Origin": BASE_URL,
        "Referer": f"{BASE_URL}/",
    }
    request_headers.update(headers or {})
    last_error: BaseException | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers=request_headers), timeout=60
            ) as response:
                body = response.read(limit + 1)
                final = urlsplit(response.geturl())
                if final.scheme != "https" or final.hostname not in {
                    "wow.gg", "wowbackend-production.up.railway.app"
                }:
                    raise ValueError("wow.gg dependency redirected to an unexpected host")
                if response.status != 200 or len(body) > limit:
                    raise RuntimeError(
                        f"wow.gg dependency failed validation: status={response.status} bytes={len(body)}"
                    )
                if attempt > 0:
                    event(
                        logger,
                        "wowgg_dependency_retry_recovered",
                        target_url=safe_url(url),
                        attempt=attempt + 1,
                        body_bytes=len(body),
                    )
                return body
        except (urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last_error = exc
            event(
                logger,
                "wowgg_dependency_attempt_failed",
                level=logging.WARNING,
                target_url=safe_url(url),
                attempt=attempt + 1,
                error_type=type(exc).__name__,
                error_summary=safe_error(exc),
            )
            if attempt < 2:
                time.sleep(0.4 * (2**attempt))
    raise RuntimeError(f"wow.gg request failed: {safe_url(url)}") from last_error


def discover_public_api(landing_html: bytes) -> tuple[str, str]:
    """Discover the public browser API configuration instead of persisting its rotating key."""
    text = landing_html.decode("utf-8", errors="replace")
    scripts = list(dict.fromkeys(SCRIPT_RE.findall(text)))
    api_key = ""
    api_base = ""
    for source in scripts:
        if not source.startswith("/_next/static/chunks/"):
            continue
        chunk = _request_bytes(urljoin(BASE_URL, source), limit=2_500_000).decode(
            "utf-8", errors="replace"
        )
        if not api_key:
            match = PUBLIC_KEY_RE.search(chunk)
            if match:
                api_key = match.group(1)
        if not api_base and "META_ENCOUNTERS_BASE" in chunk:
            candidates = API_BASE_RE.findall(chunk)
            api_base = next(
                (item for item in candidates if urlsplit(item).hostname == "wowbackend-production.up.railway.app"),
                "",
            )
        if api_key and api_base:
            break
    if not api_key or not api_base:
        raise ValueError("wow.gg public API configuration was not found in its browser bundle")
    return api_base.rstrip("/"), api_key


def _json_request(api_base: str, api_key: str, path: str, params: dict[str, Any]) -> Any:
    query = urllib.parse.urlencode({key: value for key, value in params.items() if value not in (None, "")})
    body = _request_bytes(
        f"{api_base}{path}?{query}", headers={"X-API-Key": api_key}
    )
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"wow.gg returned invalid JSON for {path}") from exc


def _numeric(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(float(value)) else None
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"\s*(-?\d[\d,]*(?:\.\d+)?)\s*([kmbt])?\s*", value, re.I)
    if not match:
        return None
    multiplier = {"k": 1e3, "m": 1e6, "b": 1e9, "t": 1e12}.get(
        (match.group(2) or "").lower(), 1
    )
    return float(match.group(1).replace(",", "")) * multiplier


def _natural_break_labels(values: Iterable[float]) -> dict[float, str]:
    ordered = sorted(float(value) for value in values if math.isfinite(float(value)))
    if not ordered:
        return {}
    cluster_count = min(5, len(set(ordered)))
    if cluster_count >= len(ordered):
        clusters = [[value] for value in ordered]
    elif cluster_count <= 1:
        clusters = [ordered]
    else:
        size = len(ordered)
        prefix = [0.0]
        squares = [0.0]
        for value in ordered:
            prefix.append(prefix[-1] + value)
            squares.append(squares[-1] + value * value)

        def variance(start: int, end: int) -> float:
            total = prefix[end + 1] - prefix[start]
            return squares[end + 1] - squares[start] - total * total / (end - start + 1)

        costs = [[math.inf] * cluster_count for _ in range(size)]
        splits = [[0] * cluster_count for _ in range(size)]
        for end in range(size):
            costs[end][0] = variance(0, end)
        for group in range(1, cluster_count):
            for end in range(group, size):
                for start in range(group, end + 1):
                    cost = costs[start - 1][group - 1] + variance(start, end)
                    if cost < costs[end][group]:
                        costs[end][group] = cost
                        splits[end][group] = start
        clusters = [[] for _ in range(cluster_count)]
        end = size - 1
        for group in range(cluster_count - 1, -1, -1):
            start = splits[end][group]
            clusters[group] = ordered[start : end + 1]
            end = start - 1
    labels = ("D", "C", "B", "A", "S")[-len(clusters) :]
    return {value: labels[index] for index, cluster in enumerate(clusters) for value in cluster}


def _assign_tiers(rows: list[dict[str, Any]], metrics: dict[str, str]) -> None:
    assignments: dict[str, dict[str, dict[str, Any]]] = {row["entity_slug"]: {} for row in rows}
    for metric, field in metrics.items():
        scored = [(row, _numeric(row.get(field))) for row in rows]
        labels = _natural_break_labels(value for _, value in scored if value is not None)
        ranked = sorted(scored, key=lambda item: item[1] if item[1] is not None else -math.inf, reverse=True)
        for rank, (row, value) in enumerate(ranked, start=1):
            assignments[row["entity_slug"]][metric] = {
                "tier": labels.get(value, "D") if value is not None else "D",
                "rank": rank,
            }
    for row in rows:
        row["tier_assignments"] = assignments[row["entity_slug"]]


def _pve_rows(payload: Any, role: str, source_url: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = next(
            (payload[key] for key in ("items", "specs", "data", "encounters", "results") if isinstance(payload.get(key), list)),
            [],
        )
    else:
        raise ValueError("wow.gg PvE response has an unexpected shape")
    rows = []
    for item in items:
        class_en = str(item.get("class_name_en") or item.get("class_name") or "")
        spec_en = str(item.get("spec_en") or item.get("spec") or "")
        class_slug, spec_slug = _slug(class_en), _slug(spec_en)
        rows.append(
            {
                "entity_type": "specialization", "entity_id": f"{class_slug}:{spec_slug}",
                "entity_name": f"{item.get('spec') or spec_en} {item.get('class_name') or class_en}",
                "entity_slug": f"{class_slug}-{spec_slug}", "class_name": str(item.get("class_name") or class_en),
                "class_slug": class_slug, "spec_name": str(item.get("spec") or spec_en),
                "spec_slug": spec_slug, "role": role,
                "guide_url": f"{BASE_URL}/ru/guides/{class_slug}-{spec_slug}", "source_url": source_url,
                "meta_score": _numeric(item.get("meta")), "average_dps": _numeric(item.get("average_dps")),
                "average_hps": _numeric(item.get("average_hps")), "top_value": _numeric(item.get("top_dps")),
                "popularity": _numeric(item.get("popularity")), "pvp_players": None,
                "pvp_average_rating": None, "pvp_max_rating": None, "pvp_min_rating": None,
                "max_key": item.get("max_key"), "diff_rank": item.get("diff_rank"),
                "iso_year": item.get("iso_year"), "iso_week": item.get("iso_week"),
            }
        )
    return rows


def _pvp_rows(payload: Any, role: str, source_url: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("specs"), list):
        raise ValueError("wow.gg PvP response has an unexpected shape")
    rows = []
    for item in payload["specs"]:
        class_en = str(item.get("class_name_en") or item.get("class_name") or "")
        spec_en = str(item.get("spec_en") or item.get("spec") or "")
        class_slug, spec_slug = _slug(class_en), _slug(spec_en)
        rows.append(
            {
                "entity_type": "specialization", "entity_id": f"{class_slug}:{spec_slug}",
                "entity_name": f"{item.get('spec') or spec_en} {item.get('class_name') or class_en}",
                "entity_slug": f"{class_slug}-{spec_slug}", "class_name": str(item.get("class_name") or class_en),
                "class_slug": class_slug, "spec_name": str(item.get("spec") or spec_en),
                "spec_slug": spec_slug, "role": role,
                "guide_url": f"{BASE_URL}/ru/guides/{class_slug}-{spec_slug}", "source_url": source_url,
                "meta_score": None, "average_dps": None, "average_hps": None, "top_value": None,
                "popularity": None, "pvp_players": item.get("all_players"),
                "pvp_average_rating": _numeric(item.get("avg_rating")),
                "pvp_max_rating": _numeric(item.get("max_rating")),
                "pvp_min_rating": _numeric(item.get("min_rating")), "max_key": None,
                "diff_rank": item.get("diff_rank"), "iso_year": None, "iso_week": None,
            }
        )
    return rows


def _context_key(context: dict[str, Any]) -> str:
    fields = (
        "mode", "role", "addon_key", "selection_type", "selection_id", "key_type",
        "raid_difficulty", "pvp_bracket", "pvp_region",
    )
    return "|".join(str(context.get(field) or "-") for field in fields)


def build_context_plan(catalogs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    for addon in ADDONS:
        catalog = catalogs[addon["id"]]
        dungeons = catalog.get("encounters") or []
        raids = catalog.get("raids") or []
        if dungeons:
            selections = [{"type": "all", "id": "all", "name": "Все подземелья"}] + [
                {"type": "dungeon", "id": str(item["wow_id"]), "name": str(item.get("local_name") or item["name"])}
                for item in dungeons
            ]
            for role in ROLES:
                for key_type in KEY_TYPES:
                    for selection in selections:
                        plan.append({
                            "mode": "mythic_plus", "role": role, "addon": addon,
                            "selection_type": selection["type"], "selection_id": selection["id"],
                            "selection_name": selection["name"], "key_type": key_type,
                            "raid_difficulty": "", "pvp_bracket": "", "pvp_region": "",
                        })
        if raids:
            for raid in raids:
                selections = [{
                    "type": "raid", "id": str(raid["wow_id"]),
                    "name": str(raid.get("local_name") or raid["name"]),
                }]
                if addon["id"] == "11":
                    selections.extend(
                        {
                            "type": "boss", "id": str(item["wow_id"]),
                            "name": str(item.get("local_name") or item.get("name") or item["wow_id"]),
                        }
                        for item in raid.get("raid_bosses") or []
                    )
                for role in ROLES:
                    for difficulty in RAID_DIFFICULTIES[addon["id"]]:
                        for selection in selections:
                            plan.append({
                                "mode": "raid", "role": role, "addon": addon,
                                "selection_type": selection["type"], "selection_id": selection["id"],
                                "selection_name": selection["name"], "key_type": "",
                                "raid_difficulty": difficulty, "pvp_bracket": "", "pvp_region": "",
                            })
        for bracket in PVP_BRACKETS.get(addon["id"], ()):
            for role in ROLES:
                for region in PVP_REGIONS:
                    plan.append({
                        "mode": "pvp", "role": role, "addon": addon,
                        "selection_type": "bracket", "selection_id": bracket,
                        "selection_name": bracket, "key_type": "", "raid_difficulty": "",
                        "pvp_bracket": bracket, "pvp_region": region,
                    })
    for context in plan:
        context["addon_id"] = context["addon"]["id"]
        context["addon_key"] = context["addon"]["key"]
        context["addon_name"] = context["addon"]["name"]
        context["context_key"] = _context_key(context)
    return plan


def _collect_context(api_base: str, api_key: str, context: dict[str, Any], fetched_at: datetime) -> dict[str, Any]:
    mode, role, addon = context["mode"], context["role"], context["addon"]
    source_url = f"{BASE_URL}/ru/meta/{'mythic-plus' if mode == 'mythic_plus' else mode}/{role}"
    if mode == "pvp":
        payload = _json_request(
            api_base, api_key, "/meta/pvp/",
            {"spec_type": role, "bracket": context["pvp_bracket"],
             "region": None if context["pvp_region"] == "all" else context["pvp_region"],
             "addon": addon["key"], "locale": "ru_RU"},
        )
        rows = _pvp_rows(payload, role, source_url)
        source_updated = str(payload.get("last_updated_at") or fetched_at.isoformat())
        metrics = {"players": "pvp_players", "avgRating": "pvp_average_rating", "maxRating": "pvp_max_rating"}
        primary = "players"
    else:
        payload = _json_request(
            api_base, api_key, "/meta/encounters/",
            {"spec_type": role,
             "encounter": None if context["selection_id"] == "all" else context["selection_id"],
             "key_type": None if context["key_type"] == "all" else context["key_type"] or context["raid_difficulty"],
             "addon": addon["key"], "locale": "ru_RU"},
        )
        rows = _pve_rows(payload, role, source_url)
        source_updated = fetched_at.isoformat()
        metrics = {
            "score": "meta_score", "popularity": "popularity", "avgDps": "average_dps",
            "maxDps" if role != "healer" else "maxHps": "top_value",
        }
        if role == "healer":
            metrics["avgHps"] = "average_hps"
        primary = "score" if mode == "mythic_plus" else ("avgHps" if role == "healer" else "avgDps")
    _assign_tiers(rows, metrics)
    rows.sort(key=lambda row: row["tier_assignments"].get(primary, {}).get("rank", 32_767))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
        row["tier"] = row["tier_assignments"].get(primary, {}).get("tier", "D")
        row["metric_values"] = {metric: row.get(field) for metric, field in metrics.items()}
    weeks = {(row.get("iso_year"), row.get("iso_week")) for row in rows if row.get("iso_year") and row.get("iso_week")}
    source_week = (
        f"{next(iter(weeks))[0]}-W{int(next(iter(weeks))[1]):02d}"
        if len(weeks) == 1 else fetched_at.strftime("%G-W%V")
    )
    return {
        **{key: value for key, value in context.items() if key != "addon"},
        "source_url": source_url, "source_updated_at": source_updated,
        "source_week": source_week, "record_count": len(rows), "records": rows,
    }


def _dungeon_ease_context(pages: list[dict[str, Any]], catalogs: dict[str, dict[str, Any]], fetched_at: datetime) -> dict[str, Any]:
    lookup = {
        page["selection_id"]: page for page in pages
        if page["mode"] == "mythic_plus" and page["role"] == "dps"
        and page["key_type"] == "all" and page["selection_type"] == "dungeon"
    }
    rows = []
    for dungeon in catalogs["11"].get("encounters") or []:
        dungeon_id = str(dungeon["wow_id"])
        page = lookup.get(dungeon_id)
        max_key = max((row.get("max_key") or 0 for row in (page or {}).get("records", [])), default=0)
        rows.append({
            "entity_type": "dungeon", "entity_id": dungeon_id,
            "entity_name": str(dungeon.get("local_name") or dungeon["name"]),
            "entity_slug": _slug(str(dungeon.get("name") or dungeon_id)), "class_name": None,
            "class_slug": None, "spec_name": None, "spec_slug": None, "role": "dungeon_ease",
            "guide_url": "", "source_url": f"{BASE_URL}/ru/meta/mythic-plus/dungeon-ease",
            "meta_score": None, "average_dps": None, "average_hps": None, "top_value": None,
            "popularity": None, "pvp_players": None, "pvp_average_rating": None,
            "pvp_max_rating": None, "pvp_min_rating": None, "max_key": max_key,
            "diff_rank": None, "iso_year": None, "iso_week": None,
        })
    _assign_tiers(rows, {"maxKey": "max_key"})
    rows.sort(key=lambda row: row["tier_assignments"]["maxKey"]["rank"])
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
        row["tier"] = row["tier_assignments"]["maxKey"]["tier"]
        row["metric_values"] = {"maxKey": row["max_key"]}
    context = {
        "mode": "mythic_plus", "role": "dungeon_ease", "addon_id": "11",
        "addon_key": "midnight", "addon_name": "Midnight", "selection_type": "all",
        "selection_id": "all", "selection_name": "Все подземелья", "key_type": "all",
        "raid_difficulty": "", "pvp_bracket": "", "pvp_region": "",
    }
    context["context_key"] = _context_key(context)
    return {
        **context, "source_url": f"{BASE_URL}/ru/meta/mythic-plus/dungeon-ease",
        "source_updated_at": fetched_at.isoformat(), "source_week": fetched_at.strftime("%G-W%V"),
        "record_count": len(rows), "records": rows,
    }


def collect_wowgg_dataset(*, max_workers: int = 8) -> dict[str, Any]:
    landing, fetch = _fetch_landing()
    api_base, api_key = discover_public_api(landing)
    fetched_at = datetime.now(UTC)
    catalogs = {
        addon["id"]: _json_request(
            api_base, api_key, f"/api/admin/encounters/{addon['id']}",
            {"status": "active", "locale": "ru_RU"},
        )
        for addon in ADDONS
    }
    plan = build_context_plan(catalogs)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        pages = list(executor.map(
            lambda context: _collect_context(api_base, api_key, context, fetched_at), plan
        ))
    pages.append(_dungeon_ease_context(pages, catalogs, fetched_at))
    records = [row for page in pages for row in page["records"]]
    unique_specs = {
        (row["class_slug"], row["spec_slug"])
        for row in records if row["entity_type"] == "specialization"
    }
    return {
        "schema_version": 1, "source": BASE_URL, "fetched_at": fetched_at.isoformat(),
        "page_count": len(pages), "record_count": len(records),
        "unique_spec_count": len(unique_specs), "credits_spent": fetch.get("credits_spent"),
        "fetch": fetch, "catalogs": {
            addon_id: {
                "addon": catalog.get("addon"), "dungeon_count": len(catalog.get("encounters") or []),
                "raid_count": len(catalog.get("raids") or []),
                "boss_count": sum(len(raid.get("raid_bosses") or []) for raid in catalog.get("raids") or []),
            }
            for addon_id, catalog in catalogs.items()
        },
        "pages": pages,
    }
