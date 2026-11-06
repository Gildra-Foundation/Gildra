#!/usr/bin/env python3
"""Gildra's own PvP tier list from the official Blizzard PvP leaderboards.

For every bracket the collector measures how strongly each spec is represented
among the top-rated players of EU and US, then cuts tiers by natural breaks
(``wow_specs.ckmeans_tiers``) on that share:

- Solo Shuffle and Blitz keep a leaderboard per spec
  (``pvp-leaderboard/shuffle-<class>-<spec>``). A spec's sample is its players
  rated at or above the overall board's #``SPEC_CUTOFF_RANK``.
- 2v2, 3v3 and rated battlegrounds have one board without specs; the top N
  characters of each are looked up (``/profile/wow/character``) and counted by
  their active specialization.

Per spec the payload keeps the share inside its role, the number of players,
their average rating and win rate — numbers only, never character names.
Credentials come from ``BATTLENET_CLIENT_ID`` / ``BATTLENET_CLIENT_SECRET``;
about 2 000–2 800 requests a run at the shared polite rate (≈ 6–8 minutes).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from typing import Any, Callable, Iterable

from .blizzard_api import BlizzardApiError, BlizzardClient
from .tierlist_payload import Expectation, PayloadDataset, build_payload, entry, publish
from .wow_specs import BY_ID, ROLES, SPECS, Spec, by_parts, ckmeans_tiers

LADDER_REGIONS = ("eu", "us")
SPEC_BRACKETS = ("shuffle", "blitz")
TEAM_BRACKETS = ("3v3", "2v2", "rbg")
SPEC_CUTOFF_RANK = 1000
DEFAULT_TOP = {"3v3": 500, "2v2": 500, "rbg": 300}
MIN_ROLE_PLAYERS = 10
WORKERS = 6
MAX_FAILED_SHARE = 0.03
SOURCE_URL = "https://worldofwarcraft.blizzard.com/en-gb/game/pvp/leaderboards"

Counts = dict[int, dict[str, float]]  # spec id -> players, rating_sum, played, won


def team_sizes() -> dict[str, int]:
    sizes = dict(DEFAULT_TOP)
    for part in os.environ.get("PVP_LADDER_TOP", "").split(","):
        key, _, value = part.partition("=")
        if key.strip() in sizes and value.strip().isdigit():
            sizes[key.strip()] = max(50, min(2000, int(value)))
    return sizes


def _add(counts: Counts, spec_id: int, row: dict[str, Any]) -> None:
    stats = row.get("season_match_statistics") or {}
    bucket = counts.setdefault(spec_id, {"players": 0, "rating_sum": 0.0, "played": 0, "won": 0})
    bucket["players"] += 1
    bucket["rating_sum"] += float(row.get("rating") or 0)
    bucket["played"] += int(stats.get("played") or 0)
    bucket["won"] += int(stats.get("won") or 0)


def _entries(document: dict[str, Any] | None) -> list[dict[str, Any]]:
    rows = [row for row in (document or {}).get("entries") or [] if isinstance(row, dict) and isinstance(row.get("rating"), int)]
    return sorted(rows, key=lambda row: (int(row.get("rank") or 0), -row["rating"]))


def spec_board_name(bracket: str, spec: Spec) -> str:
    return f"{bracket}-{spec.class_slug.replace('-', '')}-{spec.spec_slug.replace('-', '')}"


def spec_from_board(name: str, bracket: str) -> Spec | None:
    prefix = f"{bracket}-"
    if not name.startswith(prefix):
        return None
    class_part, _, spec_part = name[len(prefix):].partition("-")
    return by_parts(class_part, spec_part)


def count_spec_bracket(overall: dict[str, Any] | None, boards: dict[int, dict[str, Any] | None],
                       *, cutoff_rank: int = SPEC_CUTOFF_RANK) -> tuple[Counts, int]:
    """Shuffle/Blitz: players of each spec board rated at or above the overall #cutoff_rank."""
    ranked = _entries(overall)
    if len(ranked) < 50:
        raise BlizzardApiError("overall board is too small to set a cutoff")
    cutoff = ranked[min(cutoff_rank, len(ranked)) - 1]["rating"]
    counts: Counts = {}
    for spec_id, document in boards.items():
        for row in _entries(document):
            if row["rating"] >= cutoff:
                _add(counts, spec_id, row)
    return counts, cutoff


def count_team_bracket(board: dict[str, Any] | None, top: int,
                       active_spec: Callable[[str, str], int | None]) -> tuple[Counts, int]:
    """2v2/3v3/RBG: the top ``top`` characters counted by their active specialization."""
    counts: Counts = {}
    rows = _entries(board)[:top]
    if len(rows) < min(50, top):
        raise BlizzardApiError("team board is too small")
    for row in rows:
        character = row.get("character") or {}
        realm = ((character.get("realm") or {}).get("slug")) or ""
        name = character.get("name") or ""
        spec_id = active_spec(realm, name) if realm and name else None
        if spec_id in BY_ID:
            _add(counts, spec_id, row)
    return counts, rows[-1]["rating"]


def merge(*parts: Counts) -> Counts:
    merged: Counts = {}
    for part in parts:
        for spec_id, bucket in part.items():
            target = merged.setdefault(spec_id, {"players": 0, "rating_sum": 0.0, "played": 0, "won": 0})
            for key, value in bucket.items():
                target[key] += value
    return merged


def ranked_lists(counts: Counts, bracket: str, region: str) -> list[dict[str, Any]]:
    """One list per role with every spec of the role; specs nobody plays at the top are F."""
    lists = []
    for role in ROLES:
        specs = [spec for spec in SPECS if spec.role == role]
        total = sum(counts.get(spec.spec_id, {}).get("players", 0) for spec in specs)
        if total < MIN_ROLE_PLAYERS:
            continue
        rows = []
        for spec in specs:
            bucket = counts.get(spec.spec_id) or {"players": 0, "rating_sum": 0.0, "played": 0, "won": 0}
            players = int(bucket["players"])
            rows.append((spec, players, bucket["rating_sum"] / players if players else 0.0,
                         bucket["won"] / bucket["played"] if bucket["played"] else None))
        rows.sort(key=lambda row: (-row[1], -row[2], row[0].spec_id))
        present = [row for row in rows if row[1] > 0]
        tiers = ckmeans_tiers([row[1] / total for row in present]) + ["F"] * (len(rows) - len(present))
        lists.append({
            "activity": "pvp", "role": role, "bracket": bracket, "region": region, "source_url": SOURCE_URL,
            "tiers_derived": True, "sample": total,
            "entries": [entry(spec, position, tier, {
                "popularity": round(players / total, 5), "players": players,
                "rating": round(rating, 1) if players else None,
                "win_rate": round(win_rate, 4) if win_rate is not None and players else None,
            }) for position, ((spec, players, rating, win_rate), tier) in enumerate(zip(rows, tiers), start=1)],
        })
    return lists


def _parallel(function: Callable[[Any], Any], items: list[Any]) -> list[Any]:
    failed = 0

    def guarded(item: Any) -> Any:
        nonlocal failed
        try:
            return function(item)
        except BlizzardApiError:
            failed += 1
            return None

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(guarded, items))
    if failed > max(2, len(items) * MAX_FAILED_SHARE):
        raise BlizzardApiError(f"{failed} of {len(items)} requests failed")
    return results


def collect_region(region: str, client: BlizzardClient, sizes: dict[str, int]) -> tuple[dict[str, Counts], dict[str, Any]]:
    index = client.get(region, "/data/wow/pvp-season/index", "dynamic", locale=None, allow_missing=False) or {}
    season_id = int(((index.get("current_season") or {}).get("id")) or 0)
    if season_id <= 0:
        raise BlizzardApiError(f"{region}: no current PvP season")
    base = f"/data/wow/pvp-season/{season_id}/pvp-leaderboard"
    available = {item.get("name") for item in (client.get(region, f"{base}/index", "dynamic", locale=None, allow_missing=False) or {}).get("leaderboards") or []}

    def board(name: str) -> dict[str, Any] | None:
        return client.get(region, f"{base}/{name}", "dynamic", locale=None) if name in available else None

    counts: dict[str, Counts] = {}
    cutoffs: dict[str, int] = {}
    for bracket in SPEC_BRACKETS:
        specs = [spec for spec in SPECS if spec_board_name(bracket, spec) in available]
        documents = _parallel(lambda spec: board(spec_board_name(bracket, spec)), specs)
        counts[bracket], cutoffs[bracket] = count_spec_bracket(board(f"{bracket}-overall"), dict(zip((spec.spec_id for spec in specs), documents)))

    cache: dict[tuple[str, str], int | None] = {}
    team_boards = {bracket: board(bracket) for bracket in TEAM_BRACKETS}
    wanted = sorted({(((row.get("character") or {}).get("realm") or {}).get("slug") or "", (row.get("character") or {}).get("name") or "")
                     for bracket, document in team_boards.items() for row in _entries(document)[:sizes[bracket]]} - {("", "")})

    def lookup(key: tuple[str, str]) -> int | None:
        realm, name = key
        document = client.get(region, f"/profile/wow/character/{urllib.parse.quote(realm)}/{urllib.parse.quote(name.casefold())}", "profile", locale=None)
        return int(((document or {}).get("active_spec") or {}).get("id") or 0) or None

    for key, spec_id in zip(wanted, _parallel(lookup, wanted)):
        cache[key] = spec_id
    for bracket, document in team_boards.items():
        counts[bracket], cutoffs[bracket] = count_team_bracket(document, sizes[bracket], lambda realm, name: cache.get((realm, name)))
    return counts, {"season_id": season_id, "cutoffs": cutoffs}


def build_lists(by_region: dict[str, dict[str, Counts]]) -> list[dict[str, Any]]:
    lists: list[dict[str, Any]] = []
    for bracket in (*SPEC_BRACKETS, *TEAM_BRACKETS):
        regional = {region: counts[bracket] for region, counts in by_region.items() if bracket in counts}
        lists.extend(ranked_lists(merge(*regional.values()), bracket, "all"))
        for region, counts in regional.items():
            lists.extend(ranked_lists(counts, bracket, region))
    return lists


def collect_pvp_ladder(client: BlizzardClient | None = None, regions: Iterable[str] = LADDER_REGIONS) -> dict[str, Any]:
    client = client or BlizzardClient()
    sizes = team_sizes()
    by_region: dict[str, dict[str, Counts]] = {}
    meta: dict[str, Any] = {}
    for region in regions:
        by_region[region], meta[region] = collect_region(region, client, sizes)
    fetches = [{"provider": "blizzard-api", "requests": client.request_count, "not_found": client.not_found_count, "credits_spent": "0"}]
    payload = build_payload("ladder", "Blizzard", SOURCE_URL, build_lists(by_region), fetches, datetime.now(UTC),
                            season_id=max(item["season_id"] for item in meta.values()),
                            cutoffs={region: item["cutoffs"] for region, item in meta.items()},
                            sample_sizes={"spec_cutoff_rank": SPEC_CUTOFF_RANK, **sizes})
    payload["page_count"] = client.request_count
    return payload


DATASET = PayloadDataset(
    slug="tierlist-pvp-ladder", name="Tierlist — PvP ladder (Blizzard)", source_name="Blizzard API", refresh_hours=12,
    lock_id=0x47696C64504C4144,
    expect=Expectation("ladder", "worldofwarcraft.blizzard.com",
                       tuple(("pvp", role, bracket, "all") for bracket in (*SPEC_BRACKETS, "3v3", "2v2") for role in ("dps", "healer")),
                       min_coverage=1.0),
    collect=collect_pvp_ladder,
)


def refresh_tierlist_pvp_ladder(scheduled_for: date, *, trigger: str = "scheduled"):
    return publish(DATASET, scheduled_for, trigger=trigger)


if __name__ == "__main__":
    json.dump(collect_pvp_ladder(), sys.stdout, ensure_ascii=False, indent=2)
