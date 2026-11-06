#!/usr/bin/env python3
"""Collect top Mythic+ runs with their rosters and the season's rating cutoffs from Raider.IO.

Raider.IO publishes a documented public API (https://raider.io/api, OpenAPI at
/openapi.json). Its terms ask for a link back to raider.io on every public page
that shows the data and forbid scraping beyond the published endpoints, so only
these endpoints are read:

- ``/api/v1/mythic-plus/static-data`` — the current season and its dungeons;
- ``/api/v1/mythic-plus/runs`` — the leaderboard of timed runs per dungeon and
  region, 20 runs a page (pages 0..100 without an access key);
- ``/api/v1/mythic-plus/season-cutoffs`` — rating percentiles per region;
- ``/api/v1/mythic-plus/cutoff-analysis/summary`` — the world's rating
  percentiles and their daily history (one request);
- ``/api/v1/mythic-plus/cutoff-analysis`` (``category=specs``) — every
  specialization's rated characters: count, how many sit in the region's top
  0.1 %, the spec's own 0.1/1/10 % cutoffs and the weekly top-1 % trend
  (one request per region and one for the world).

The sample is the top of every dungeon's leaderboard: ``PAGES`` pages per
region and dungeon (defaults: 15 for US and EU, 4 for KR and TW), i.e. about
6 000 runs and ~310 requests a refresh at one request per second, zero paid
credits. The leaderboard lists timed runs only, so the payload carries the
upgrade count and the time left instead of a "timed %" that the sample cannot
measure. Only numbers and game identifiers are stored: run id, dungeon, key
level, upgrades, clear time, completion time, region, the five specializations
and whether the run has a video. Character names never leave this module.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

API_BASE = "https://raider.io/api/v1/mythic-plus"
SITE_URL = "https://raider.io"
USER_AGENT = "GildraDatasetBot/1.0 (+https://gildra.net)"
EXPANSION_ID = 11
REGIONS = ("us", "eu", "kr", "tw")
DEFAULT_PAGES = {"us": 15, "eu": 15, "kr": 4, "tw": 4}
PAGE_SIZE = 20
MAX_PAGE = 100
MAX_BODY_BYTES = 4_000_000
CUTOFF_TIERS = (("p999", 0.1), ("p990", 1.0), ("p900", 10.0), ("p750", 25.0), ("p600", 40.0))
COHORT_PERCENTILES = (("p01", 0.1), ("p1", 1.0), ("p10", 10.0))
TREND_WEEKS = 12
MILESTONES = ("keystoneMaster", "keystoneHero", "keystoneLegend", "keystoneMyth")
ROLE_SLOTS = {"tank": 1, "healer": 1, "dps": 3}
# One request per second; a 429 is honoured with its Retry-After.
_MIN_INTERVAL_SECONDS = 1.0
_MAX_RETRIES = 4
_last_request_at = 0.0

Fetch = Callable[[str, dict[str, Any]], Any]


def _polite_wait() -> None:
    global _last_request_at
    delay = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
    if delay > 0:
        time.sleep(delay)
    _last_request_at = time.monotonic()


def fetch_json(path: str, params: dict[str, Any]) -> Any:
    """GET a Raider.IO API path politely; retries 429/5xx with backoff."""
    if not path.startswith("/") or "//" in path:
        raise ValueError(f"invalid Raider.IO path: {path!r}")
    url = f"{API_BASE}{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(_MAX_RETRIES + 1):
        _polite_wait()
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read(MAX_BODY_BYTES + 1)
            if len(body) > MAX_BODY_BYTES:
                raise RuntimeError(f"Raider.IO response too large for {path}")
            return json.loads(body)
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503, 504) and attempt < _MAX_RETRIES:
                retry_after = error.headers.get("Retry-After") if error.headers else None
                try:
                    wait = min(120.0, float(retry_after)) if retry_after else 2.0 * (attempt + 1)
                except ValueError:
                    wait = 2.0 * (attempt + 1)
                time.sleep(wait)
                continue
            raise RuntimeError(f"Raider.IO {path} returned HTTP {error.code}") from error
    raise RuntimeError(f"Raider.IO {path} kept failing")


def _iso(value: str) -> str:
    """Normalise Raider.IO timestamps to second precision UTC ``Z``."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    return parsed.strftime("%Y-%m-%dT%H:%M:%SZ")


def current_season(static: dict[str, Any], now: datetime) -> dict[str, Any]:
    """The main season that runs now (the newest one if several overlap)."""
    candidates = []
    for season in static.get("seasons") or []:
        if not season.get("is_main_season") or not season.get("dungeons"):
            continue
        starts = (season.get("starts") or {}).get("us")
        ends = (season.get("ends") or {}).get("us")
        if not starts:
            continue
        start = datetime.fromisoformat(starts.replace("Z", "+00:00"))
        end = datetime.fromisoformat(ends.replace("Z", "+00:00")) if ends else None
        if start <= now and (end is None or now < end):
            candidates.append((start, season))
    if not candidates:
        raise ValueError("Raider.IO static data has no running main season")
    season = max(candidates, key=lambda item: item[0])[1]
    return {
        "slug": season["slug"],
        "name": season["name"],
        "short_name": season.get("short_name") or season["slug"],
        "starts": _iso(season["starts"]["us"]),
        "dungeons": [
            {
                "id": int(dungeon["challenge_mode_id"]),
                "slug": dungeon["slug"],
                "name": dungeon["name"],
                "short_name": dungeon.get("short_name") or "",
                "timer_ms": int(dungeon["keystone_timer_seconds"]) * 1000,
            }
            for dungeon in season["dungeons"]
        ],
    }


def parse_run(ranking: dict[str, Any], region: str, specs: dict[int, dict[str, Any]]) -> dict[str, Any] | None:
    """One leaderboard entry → compact run row; None when the roster is not 1 tank, 1 healer, 3 DPS."""
    run = ranking.get("run") or {}
    roster = run.get("roster") or []
    by_role: dict[str, list[int]] = {"tank": [], "healer": [], "dps": []}
    for member in roster:
        role = member.get("role")
        character = member.get("character") or {}
        spec = character.get("spec") or {}
        klass = character.get("class") or {}
        if role not in by_role or not isinstance(spec.get("id"), int):
            return None
        by_role[role].append(spec["id"])
        specs.setdefault(spec["id"], {
            "id": spec["id"],
            "class_slug": klass.get("slug", ""),
            "spec_slug": spec.get("slug", ""),
            "class_name": klass.get("name", ""),
            "spec_name": spec.get("name", ""),
            "role": role,
        })
    if any(len(by_role[role]) != size for role, size in ROLE_SLOTS.items()):
        return None
    dungeon = run.get("dungeon") or {}
    if run.get("status") not in (None, "finished") or run.get("deleted_at"):
        return None
    return {
        "id": int(run["keystone_run_id"]),
        "dg": int(dungeon["map_challenge_mode_id"]),
        "lv": int(run["mythic_level"]),
        "ch": int(run.get("num_chests") or 0),
        "ms": int(run["clear_time_ms"]),
        "tm": int(run["keystone_time_ms"]),
        "at": _iso(run["completed_at"]),
        "rg": region,
        "t": by_role["tank"][0],
        "h": by_role["healer"][0],
        "d": sorted(by_role["dps"]),
        "v": bool(run.get("videos")),
    }


def _all(block: Any) -> dict[str, Any]:
    if not isinstance(block, dict):
        return {}
    inner = block.get("cutoffs") if isinstance(block.get("cutoffs"), dict) else block
    return inner.get("all") or {}


def parse_cutoffs(payload: dict[str, Any]) -> dict[str, Any]:
    """Season cutoffs of one region: percentiles, their daily history, score milestones, "all timed at +N"."""
    cutoffs = payload.get("cutoffs") or {}
    tiers = []
    players = 0
    for key, percent in CUTOFF_TIERS:
        entry = _all(cutoffs.get(key))
        if not entry:
            continue
        players = max(players, int(entry.get("totalPopulationCount") or 0))
        tiers.append({
            "key": key,
            "percent": percent,
            "score": round(float(entry["quantileMinValue"]), 1),
            "players": int(entry.get("quantilePopulationCount") or 0),
        })
    history = []
    for key, _ in CUTOFF_TIERS:
        series = ((cutoffs.get("graphData") or {}).get(key) or {}).get("data") or []
        daily: dict[str, float] = {}
        for point in sorted(series, key=lambda item: item.get("x") or 0):
            if not isinstance(point.get("x"), (int, float)) or not isinstance(point.get("y"), (int, float)):
                continue
            day = datetime.fromtimestamp(point["x"] / 1000, UTC).strftime("%Y-%m-%d")
            daily[day] = round(float(point["y"]), 1)
        if daily:
            history.append({"key": key, "points": [[day, score] for day, score in sorted(daily.items())]})
    milestones = []
    for key in MILESTONES:
        block = cutoffs.get(key) or {}
        entry = _all(block)
        if entry and isinstance(block.get("score"), (int, float)):
            milestones.append({
                "score": int(block["score"]),
                "players": int(entry.get("quantilePopulationCount") or 0),
                "share": round(float(entry.get("quantilePopulationFraction") or 0) * 100, 2),
            })
    all_timed = []
    for level in range(2, 41):
        block = cutoffs.get(f"allTimed{level}")
        entry = _all(block)
        if entry and isinstance((block or {}).get("score"), (int, float)):
            all_timed.append({
                "level": level,
                "score": int(block["score"]),
                "players": int(entry.get("quantilePopulationCount") or 0),
                "share": round(float(entry.get("quantilePopulationFraction") or 0) * 100, 2),
            })
    updated = cutoffs.get("updatedAt")
    try:
        updated_at = datetime.strptime(str(updated)[:24], "%a %b %d %Y %H:%M:%S").replace(tzinfo=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        updated_at = None
    return {"updated_at": updated_at, "players": players, "tiers": tiers, "history": history,
            "milestones": milestones, "all_timed": all_timed}


def _day(value: Any) -> str | None:
    text = str(value or "")[:10]
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None
    return text


def parse_world_cutoffs(payload: dict[str, Any]) -> dict[str, Any]:
    """World rating percentiles (all factions) and their daily history, shaped like a region's cutoffs."""
    overall = next((item for item in payload.get("populations") or []
                    if item.get("key") == "overall" and item.get("faction", "all") == "all"), None)
    if not overall:
        raise ValueError("cutoff summary has no overall population")
    tiers = []
    for key, percent in CUTOFF_TIERS:
        entry = next((item for item in overall.get("percentiles") or [] if item.get("percentile") == percent), None)
        if entry and isinstance(entry.get("cutoffScore"), (int, float)):
            tiers.append({"key": key, "percent": percent, "score": round(float(entry["cutoffScore"]), 1),
                          "players": int(entry.get("tailSize") or 0)})
    keys = {percent: key for key, percent in CUTOFF_TIERS}
    series: dict[str, list[list[Any]]] = {key: [] for key, _ in CUTOFF_TIERS}
    for point in sorted(payload.get("history") or [], key=lambda item: str(item.get("date"))):
        day = _day(point.get("date"))
        for cutoff in point.get("cutoffs") or []:
            key = keys.get(cutoff.get("percentile"))
            if day and key and isinstance(cutoff.get("score"), (int, float)):
                series[key].append([day, round(float(cutoff["score"]), 1)])
    return {"updated_at": _iso(payload["updatedAt"]) if payload.get("updatedAt") else None,
            "players": int(overall.get("population") or 0), "tiers": tiers,
            "history": [{"key": key, "points": points} for key, points in series.items() if points]}


def parse_spec_cohorts(payload: dict[str, Any]) -> dict[str, Any]:
    """Rated characters per spec: count, title-range count, own cutoffs and the weekly top-1% trend."""
    trends: dict[int, list[tuple[str, float]]] = {}
    for series in (payload.get("chart") or {}).get("series") or []:
        key = str(series.get("cohortKey") or "")
        if not key.startswith("spec:") or series.get("percentile") != 1:
            continue
        points = [(day, float(item["score"])) for item in series.get("observations") or []
                  if (day := _day(item.get("date"))) and isinstance(item.get("score"), (int, float))]
        trends[int(key[5:])] = sorted(points)
    end = max((points[-1][0] for points in trends.values() if points), default=None)
    specs = []
    for cohort in payload.get("cohorts") or []:
        if cohort.get("semantics") != "spec" or not isinstance(cohort.get("specId"), int):
            continue
        cutoffs = {item.get("percentile"): item.get("cutoffScore") for item in cohort.get("percentiles") or []}
        if not all(isinstance(cutoffs.get(percent), (int, float)) for _, percent in COHORT_PERCENTILES):
            continue
        row = {"id": cohort["specId"], "population": int(cohort.get("population") or 0),
               "title": int((cohort.get("titleContext") or {}).get("tailSize") or 0)}
        for key, percent in COHORT_PERCENTILES:
            row[key] = round(float(cutoffs[percent]), 1)
        # Weekly points counted back from the common last day, oldest first.
        daily = dict(trends.get(cohort["specId"]) or [])
        weekly = []
        if end:
            cursor = datetime.strptime(end, "%Y-%m-%d")
            for _ in range(TREND_WEEKS):
                day = cursor.strftime("%Y-%m-%d")
                if day not in daily:
                    break
                weekly.append(round(daily[day], 1))
                cursor -= timedelta(days=7)
        row["trend"] = list(reversed(weekly))
        specs.append(row)
    specs.sort(key=lambda item: item["id"])
    updated = payload.get("updatedAt")
    return {"updated_at": _iso(updated) if updated else None, "trend_end": end, "specs": specs}


def _pages() -> dict[str, int]:
    pages = dict(DEFAULT_PAGES)
    raw = os.environ.get("RAIDERIO_MPLUS_PAGES", "")
    for part in filter(None, (item.strip() for item in raw.split(","))):
        region, _, count = part.partition("=")
        if region in pages and count.isdigit():
            pages[region] = max(0, min(MAX_PAGE + 1, int(count)))
    return pages


def collect_raiderio_mplus(fetch: Fetch = fetch_json, *, now: datetime | None = None,
                           pages: dict[str, int] | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    pages = pages or _pages()
    request_count = 0

    def get(path: str, params: dict[str, Any]) -> Any:
        nonlocal request_count
        request_count += 1
        return fetch(path, params)

    season = current_season(get("/static-data", {"expansion_id": EXPANSION_ID}), now)
    known = {dungeon["id"] for dungeon in season["dungeons"]}
    specs: dict[int, dict[str, Any]] = {}
    runs: dict[int, dict[str, Any]] = {}
    dropped = 0
    for region in REGIONS:
        for dungeon in season["dungeons"]:
            for page in range(pages.get(region, 0)):
                body = get("/runs", {"season": season["slug"], "region": region, "dungeon": dungeon["slug"],
                                     "affixes": "all", "page": page})
                rankings = body.get("rankings") if isinstance(body, dict) else None
                if not isinstance(rankings, list):
                    raise ValueError(f"runs {region}/{dungeon['slug']}/{page}: no rankings")
                for ranking in rankings:
                    row = parse_run(ranking, region, specs)
                    if row is None or row["dg"] not in known:
                        dropped += 1
                        continue
                    runs[row["id"]] = row
                if len(rankings) < PAGE_SIZE:
                    break
    cutoffs: dict[str, Any] = {}
    for region in REGIONS:
        try:
            cutoffs[region] = parse_cutoffs(get("/season-cutoffs", {"season": season["slug"], "region": region}))
        except (RuntimeError, ValueError, KeyError):
            # Cutoffs enrich the stats page; the run sample alone is still a complete snapshot.
            continue
    world_cutoffs = None
    try:
        world_cutoffs = parse_world_cutoffs(get("/cutoff-analysis/summary", {"season": season["slug"], "region": "world"}))
    except (RuntimeError, ValueError, KeyError):
        pass
    spec_cohorts: dict[str, Any] = {}
    for region in (*REGIONS, "world"):
        try:
            cohorts = parse_spec_cohorts(get("/cutoff-analysis", {"season": season["slug"], "region": region,
                                                                  "category": "specs", "percentile": 1, "density": "false"}))
        except (RuntimeError, ValueError, KeyError):
            continue
        if cohorts["specs"]:
            spec_cohorts[region] = cohorts
    if "world" in spec_cohorts:
        # The title range (top 0.1%) is regional: the world's count is the sum of the regions read.
        titles: dict[int, int] = {}
        for region in REGIONS:
            for spec in (spec_cohorts.get(region) or {}).get("specs") or []:
                titles[spec["id"]] = titles.get(spec["id"], 0) + spec["title"]
        for spec in spec_cohorts["world"]["specs"]:
            spec["title"] = titles.get(spec["id"], 0)
    ordered = sorted(runs.values(), key=lambda row: (row["dg"], -row["lv"], row["ms"], row["id"]))
    return {
        "schema_version": 1,
        "source_name": "Raider.IO",
        "source_url": SITE_URL,
        "fetched_at": now.isoformat(),
        "season": season,
        "dungeons": season.pop("dungeons"),
        "specs": sorted(specs.values(), key=lambda spec: spec["id"]),
        "regions": [region for region in REGIONS if pages.get(region, 0) > 0],
        "sample": {"page_size": PAGE_SIZE, "pages": {region: pages.get(region, 0) for region in REGIONS}},
        "runs": ordered,
        "cutoffs": cutoffs,
        **({"world_cutoffs": world_cutoffs} if world_cutoffs else {}),
        "spec_cohorts": spec_cohorts,
        "page_count": request_count,
        "record_count": len(ordered),
        "dropped_runs": dropped,
        "unique_spec_count": len(specs),
        "credits_spent": "0",
    }


def main() -> int:
    json.dump(collect_raiderio_mplus(), sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
