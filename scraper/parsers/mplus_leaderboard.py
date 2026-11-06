#!/usr/bin/env python3
"""Collect the Mythic+ character leaderboard of one region from the Blizzard APIs.

Blizzard has no character-rating ranking for Mythic+, so the list is built the
way the game builds the rating itself:

1. Discovery — the official Mythic+ leaderboards (top runs per connected realm,
   dungeon and week) of the latest weeks name every character who timed a high
   key. Their best observed run per dungeon gives a lower-bound estimate of the
   rating. Characters of the previous snapshot are carried over, so a player
   who stopped running keys keeps his place.
2. Rating — the season Mythic+ profile of the strongest candidates (overall and
   per specialization) gives the exact rating, the specialization of the best
   runs and the highest timed key.
3. Details — for the final list (overall top 500 + top 100 of every
   specialization): equipped item level, active hero talent tree and talent
   loadout; for the top players of each specialization also trinkets and
   weapons, summarised as "what the top players use".

Only facts are stored (names, realms, ratings, levels, ids, loadout strings).
"""

from __future__ import annotations

import re
import threading
import urllib.parse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any, Callable, Iterable

from .blizzard_api import REGIONS, BlizzardApiError, BlizzardClient

SCHEMA_VERSION = 1
OVERALL_SIZE = 500
SPEC_SIZE = 100
# Discovery margins: the estimate is a lower bound, so more candidates than places are rated.
OVERALL_CANDIDATES = 700
SPEC_CANDIDATES = 130
MAX_CANDIDATES = 7000
EQUIPMENT_PER_SPEC = 30
DISCOVERY_PERIODS = 3
BOOTSTRAP_PERIODS = 16
WORKERS = 8
SUMMARY_TRINKETS = 6
SUMMARY_WEAPONS = 4

# Playable specializations: id -> (class id, role). Midnight has 40.
SPECS: dict[int, tuple[int, str]] = {
    71: (1, "dps"), 72: (1, "dps"), 73: (1, "tank"),
    65: (2, "healer"), 66: (2, "tank"), 70: (2, "dps"),
    253: (3, "dps"), 254: (3, "dps"), 255: (3, "dps"),
    259: (4, "dps"), 260: (4, "dps"), 261: (4, "dps"),
    256: (5, "healer"), 257: (5, "healer"), 258: (5, "dps"),
    250: (6, "tank"), 251: (6, "dps"), 252: (6, "dps"),
    262: (7, "dps"), 263: (7, "dps"), 264: (7, "healer"),
    62: (8, "dps"), 63: (8, "dps"), 64: (8, "dps"),
    265: (9, "dps"), 266: (9, "dps"), 267: (9, "dps"),
    268: (10, "tank"), 269: (10, "dps"), 270: (10, "healer"),
    102: (11, "dps"), 103: (11, "dps"), 104: (11, "tank"), 105: (11, "healer"),
    577: (12, "dps"), 581: (12, "tank"), 1480: (12, "dps"),
    1467: (13, "dps"), 1468: (13, "healer"), 1473: (13, "dps"),
}
TRINKET_SLOTS = {"TRINKET_1", "TRINKET_2"}
WEAPON_SLOTS = {"MAIN_HAND"}
LOADOUT_RE = re.compile(r"^[A-Za-z0-9+/=_-]{20,512}$")
CONNECTED_REALM_RE = re.compile(r"/connected-realm/(\d+)")
SEASON_NAME_RE = re.compile(r"\(([^()]+)\)\s*$")

Key = tuple[str, str]  # (realm slug, lower-case name)


def character_key(realm_slug: str, name: str) -> Key:
    return (realm_slug, name.casefold())


# ---------------------------------------------------------------- discovery


def parse_leaderboard(document: dict[str, Any], dungeon_id: int) -> list[dict[str, Any]]:
    """Runs of one connected-realm leaderboard: level, rating and members."""
    runs = []
    for group in document.get("leading_groups") or []:
        rating = float(((group.get("mythic_rating") or {}).get("rating")) or 0)
        members = []
        for member in group.get("members") or []:
            profile = member.get("profile") or {}
            realm = (profile.get("realm") or {}).get("slug")
            spec = (member.get("specialization") or {}).get("id")
            if not realm or not profile.get("name") or spec not in SPECS:
                continue
            members.append({"name": str(profile["name"]), "realm": str(realm), "spec": int(spec)})
        if rating > 0 and members:
            runs.append({
                "dungeon": dungeon_id,
                "completed": int(group.get("completed_timestamp") or 0),
                "level": int(group.get("keystone_level") or 0),
                "rating": rating,
                "members": members,
            })
    return runs


class CandidateAccumulator:
    """Lower-bound rating per character: best observed run per dungeon, summed.

    Runs are folded in as boards arrive, so a crawl of half a million runs
    keeps only one small record per character. A run is listed on the board of
    every member's realm; taking the maximum makes those repeats harmless.
    """

    def __init__(self) -> None:
        self.best: dict[Key, dict[int, tuple[float, int]]] = {}
        self.names: dict[Key, str] = {}
        self.runs = 0
        self.lock = threading.Lock()

    def add(self, runs: Iterable[dict[str, Any]]) -> None:
        with self.lock:
            for run in runs:
                self.runs += 1
                for member in run["members"]:
                    key = character_key(member["realm"], member["name"])
                    dungeons = self.best.get(key)
                    if dungeons is None:
                        dungeons = self.best[key] = {}
                        self.names[key] = member["name"]
                    current = dungeons.get(run["dungeon"])
                    if current is None or run["rating"] > current[0]:
                        dungeons[run["dungeon"]] = (run["rating"], member["spec"])

    def estimates(self) -> dict[Key, dict[str, Any]]:
        estimates = {}
        for key, dungeons in self.best.items():
            weights: Counter[int] = Counter()
            for rating, spec in dungeons.values():
                weights[spec] += rating
            estimates[key] = {
                "name": self.names[key],
                "realm": key[0],
                "estimate": round(sum(rating for rating, _ in dungeons.values()), 1),
                "spec": weights.most_common(1)[0][0],
            }
        return estimates


def estimate_candidates(runs: Iterable[dict[str, Any]]) -> dict[Key, dict[str, Any]]:
    accumulator = CandidateAccumulator()
    accumulator.add(runs)
    return accumulator.estimates()


def select_candidates(estimates: dict[Key, dict[str, Any]], carried: Iterable[dict[str, Any]] = (), *,
                      overall: int = OVERALL_CANDIDATES, per_spec: int = SPEC_CANDIDATES,
                      limit: int = MAX_CANDIDATES) -> list[dict[str, Any]]:
    ordered = sorted(estimates.values(), key=lambda item: (-item["estimate"], item["realm"], item["name"]))
    chosen: dict[Key, dict[str, Any]] = {}
    for item in ordered[:overall]:
        chosen[character_key(item["realm"], item["name"])] = item
    by_spec: dict[int, int] = Counter()
    for item in ordered:
        if by_spec[item["spec"]] < per_spec:
            by_spec[item["spec"]] += 1
            chosen.setdefault(character_key(item["realm"], item["name"]), item)
    for item in carried:
        key = character_key(str(item["realm"]), str(item["name"]))
        chosen.setdefault(key, {"name": str(item["name"]), "realm": str(item["realm"]), "estimate": 0.0, "spec": item.get("spec")})
    return sorted(chosen.values(), key=lambda item: (-item["estimate"], item["realm"], item["name"]))[:limit]


# ---------------------------------------------------------------- rating and details


def parse_season_profile(document: dict[str, Any] | None) -> dict[str, Any] | None:
    """Exact rating, main specialization (of the counted runs) and highest timed key."""
    if not document:
        return None
    rating = float(((document.get("mythic_rating") or {}).get("rating")) or 0)
    character = document.get("character") or {}
    if rating <= 0 or not character.get("name"):
        return None
    character_id = character.get("id")
    counted: dict[int, tuple[float, int | None]] = {}
    timed_key = 0
    for run in document.get("best_runs") or []:
        dungeon = (run.get("dungeon") or {}).get("id")
        run_rating = float(((run.get("mythic_rating") or {}).get("rating")) or 0)
        if run.get("is_completed_within_time"):
            timed_key = max(timed_key, int(run.get("keystone_level") or 0))
        spec = None
        for member in run.get("members") or []:
            if (member.get("character") or {}).get("id") == character_id:
                spec = (member.get("specialization") or {}).get("id")
        if dungeon is not None and (dungeon not in counted or run_rating > counted[dungeon][0]):
            counted[dungeon] = (run_rating, spec)
    weights: Counter[int] = Counter()
    for run_rating, spec in counted.values():
        if spec in SPECS:
            weights[spec] += run_rating
    return {
        "name": str(character["name"]),
        "realm": str((character.get("realm") or {}).get("slug") or ""),
        "score": round(rating, 1),
        "key": timed_key or None,
        "spec": weights.most_common(1)[0][0] if weights else None,
    }


def parse_summary(document: dict[str, Any] | None) -> dict[str, Any]:
    if not document:
        return {}
    ilvl = document.get("equipped_item_level") or document.get("average_item_level")
    faction = ((document.get("faction") or {}).get("type") or "").upper()
    active = (document.get("active_spec") or {}).get("id")
    return {
        "ilvl": int(ilvl) if isinstance(ilvl, (int, float)) and 0 < ilvl < 2000 else None,
        "faction": "h" if faction == "HORDE" else "a" if faction == "ALLIANCE" else None,
        "active_spec": active if active in SPECS else None,
    }


def parse_specializations(document: dict[str, Any] | None, spec_id: int) -> dict[str, Any]:
    """Hero talent tree and loadout string of the given specialization (its active loadout)."""
    if not document:
        return {}
    for entry in document.get("specializations") or []:
        if (entry.get("specialization") or {}).get("id") != spec_id:
            continue
        loadouts = entry.get("loadouts") or []
        loadout = next((item for item in loadouts if item.get("is_active")), loadouts[0] if loadouts else None)
        if not loadout:
            return {}
        hero = loadout.get("selected_hero_talent_tree") or {}
        code = str(loadout.get("talent_loadout_code") or "")
        return {
            "hero": int(hero["id"]) if isinstance(hero.get("id"), int) else None,
            "hero_name": str(hero.get("name") or "") or None,
            "loadout": code if LOADOUT_RE.fullmatch(code) else None,
        }
    return {}


def parse_equipment(document: dict[str, Any] | None) -> dict[str, list[int]]:
    trinkets: list[int] = []
    weapons: list[int] = []
    for item in (document or {}).get("equipped_items") or []:
        slot = (item.get("slot") or {}).get("type")
        item_id = (item.get("item") or {}).get("id")
        if not isinstance(item_id, int):
            continue
        if slot in TRINKET_SLOTS:
            trinkets.append(item_id)
        elif slot in WEAPON_SLOTS:
            weapons.append(item_id)
    return {"trinkets": trinkets, "weapons": weapons}


def select_final(rated: Iterable[dict[str, Any]], *, overall: int = OVERALL_SIZE, per_spec: int = SPEC_SIZE) -> list[dict[str, Any]]:
    """Overall top N plus top M of every specialization, ordered by rating."""
    ordered = sorted((item for item in rated if item.get("spec") in SPECS),
                     key=lambda item: (-item["score"], item["realm"], item["name"].casefold()))
    chosen: dict[Key, dict[str, Any]] = {}
    for item in ordered[:overall]:
        chosen[character_key(item["realm"], item["name"])] = item
    counts: Counter[int] = Counter()
    for item in ordered:
        if counts[item["spec"]] < per_spec:
            counts[item["spec"]] += 1
            chosen.setdefault(character_key(item["realm"], item["name"]), item)
    return sorted(chosen.values(), key=lambda item: (-item["score"], item["realm"], item["name"].casefold()))


def summarize_specs(characters: list[dict[str, Any]], equipment: dict[Key, dict[str, list[int]]], *,
                    per_spec: int = SPEC_SIZE) -> list[dict[str, Any]]:
    """Per specialization: hero tree split with the top player's build, trinkets and weapons."""
    by_spec: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for character in characters:  # already ordered by rating
        if len(by_spec[character["spec"]]) < per_spec:
            by_spec[character["spec"]].append(character)
    summaries = []
    for spec_id, (class_id, role) in sorted(SPECS.items()):
        players = by_spec.get(spec_id, [])
        heroes: dict[int, dict[str, Any]] = {}
        known_hero = [player for player in players if player.get("hero")]
        for player in known_hero:
            entry = heroes.setdefault(player["hero"], {"id": player["hero"], "name": player.get("hero_name") or "", "count": 0, "top": None})
            entry["count"] += 1
            if entry["top"] is None and player.get("loadout"):
                entry["top"] = {"name": player["name"], "realm": player["realm"], "score": player["score"], "loadout": player["loadout"]}
        hero_list = sorted(heroes.values(), key=lambda item: (-item["count"], item["id"]))
        for entry in hero_list:
            entry["share"] = round(entry["count"] / len(known_hero), 3)
        sample = [equipment[character_key(p["realm"], p["name"])] for p in players if character_key(p["realm"], p["name"]) in equipment]
        summaries.append({
            "id": spec_id,
            "class_id": class_id,
            "role": role,
            "count": len(players),
            "top_score": players[0]["score"] if players else None,
            "hero": hero_list,
            "gear_sample": len(sample),
            "trinkets": _shares((item for gear in sample for item in set(gear["trinkets"])), len(sample), SUMMARY_TRINKETS),
            "weapons": _shares((item for gear in sample for item in set(gear["weapons"])), len(sample), SUMMARY_WEAPONS),
        })
    return summaries


def _shares(values: Iterable[int], sample: int, limit: int) -> list[dict[str, Any]]:
    if not sample:
        return []
    counts = Counter(values)
    return [{"id": item_id, "count": count, "share": round(count / sample, 3)}
            for item_id, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]]


def season_label(season_name: str) -> str:
    """'Mythic+ Dungeons (Midnight Season 2)' -> 'Midnight Season 2'."""
    match = SEASON_NAME_RE.search(season_name or "")
    return (match.group(1) if match else season_name or "").strip()


def _locale_names(value: Any) -> dict[str, str]:
    if isinstance(value, str):
        return {"en": value}
    if isinstance(value, dict):
        names = {"en": str(value.get("en_US") or value.get("en_GB") or "")}
        if value.get("ru_RU"):
            names["ru"] = str(value["ru_RU"])
        return names
    return {"en": ""}


# ---------------------------------------------------------------- collection


def _profile_path(realm: str, name: str, suffix: str = "") -> str:
    return f"/profile/wow/character/{urllib.parse.quote(realm)}/{urllib.parse.quote(name.casefold())}{suffix}"


# A few requests may keep failing (a realm in maintenance); more than this share fails the run.
MAX_FAILED_SHARE = 0.03


def _parallel(function: Callable[[Any], Any], items: list[Any], workers: int, *, fallback: Any = None) -> list[Any]:
    """Run ``function`` over ``items``; a request that keeps failing yields ``fallback``."""
    if not items:
        return []
    failed = 0

    def guarded(item: Any) -> Any:
        nonlocal failed
        try:
            return function(item)
        except BlizzardApiError:
            failed += 1
            return fallback(item) if callable(fallback) else fallback

    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(guarded, items))
    if failed > max(2, len(items) * MAX_FAILED_SHARE):
        raise BlizzardApiError(f"{failed} of {len(items)} requests failed")
    return results


def collect_region(region: str, client: BlizzardClient, *, previous: dict[str, Any] | None = None,
                   item_cache: dict[int, dict[str, Any]] | None = None, workers: int = WORKERS,
                   periods: int | None = None, overall: int = OVERALL_SIZE, per_spec: int = SPEC_SIZE,
                   equipment_per_spec: int = EQUIPMENT_PER_SPEC,
                   log: Callable[[str], None] = lambda _message: None) -> dict[str, Any]:
    if region not in REGIONS:
        raise ValueError(f"unknown region {region}")
    started = datetime.now(UTC)
    item_cache = item_cache if item_cache is not None else {}
    get = client.get
    first_request = client.request_count

    season_index = get(region, "/data/wow/mythic-keystone/season/index", "dynamic", allow_missing=False)
    season_id = int(season_index["current_season"]["id"])
    season = get(region, f"/data/wow/mythic-keystone/season/{season_id}", "dynamic", allow_missing=False)
    period_index = get(region, "/data/wow/mythic-keystone/period/index", "dynamic", allow_missing=False)
    current_period = int(period_index["current_period"]["id"])
    season_periods = sorted(int(item["id"]) for item in season.get("periods") or [] if int(item["id"]) <= current_period)
    wanted = periods or (DISCOVERY_PERIODS if previous and previous.get("characters") else BOOTSTRAP_PERIODS)
    crawl_periods = season_periods[-wanted:] or [current_period]

    realm_index = get(region, "/data/wow/realm/index", "dynamic", locale=None, allow_missing=False)
    realm_names = {str(realm["slug"]): _locale_names(realm.get("name")) for realm in realm_index.get("realms") or [] if realm.get("slug")}
    connected = get(region, "/data/wow/connected-realm/index", "dynamic", allow_missing=False)
    connected_ids = sorted({int(match.group(1)) for item in connected.get("connected_realms") or []
                            if (match := CONNECTED_REALM_RE.search(str(item.get("href") or "")))})
    if not connected_ids:
        raise ValueError(f"{region}: no connected realms")
    board_index = get(region, f"/data/wow/connected-realm/{connected_ids[0]}/mythic-leaderboard/index", "dynamic", allow_missing=False)
    dungeons = sorted({int(item["id"]) for item in board_index.get("current_leaderboards") or []})
    if not dungeons:
        raise ValueError(f"{region}: no Mythic+ leaderboards")
    log(f"{region}: season {season_id}, periods {crawl_periods}, {len(connected_ids)} realms, {len(dungeons)} dungeons")

    accumulator = CandidateAccumulator()

    def board(task: tuple[int, int, int]) -> None:
        realm_id, dungeon_id, period = task
        document = get(region, f"/data/wow/connected-realm/{realm_id}/mythic-leaderboard/{dungeon_id}/period/{period}", "dynamic")
        accumulator.add(parse_leaderboard(document or {}, dungeon_id))

    tasks = [(realm_id, dungeon_id, period) for period in crawl_periods for realm_id in connected_ids for dungeon_id in dungeons]
    _parallel(board, tasks, workers)
    estimates = accumulator.estimates()
    runs = accumulator.runs
    del accumulator
    carried = (previous or {}).get("characters") or []
    candidates = select_candidates(estimates, carried, overall=round(overall * OVERALL_CANDIDATES / OVERALL_SIZE),
                                   per_spec=round(per_spec * SPEC_CANDIDATES / SPEC_SIZE))
    log(f"{region}: {runs} runs, {len(estimates)} characters seen, {len(candidates)} candidates")

    def rate(candidate: dict[str, Any]) -> dict[str, Any] | None:
        document = get(region, _profile_path(candidate["realm"], candidate["name"], f"/mythic-keystone-profile/season/{season_id}"), "profile")
        rated = parse_season_profile(document)
        if rated and not rated["realm"]:
            rated["realm"] = candidate["realm"]
        if rated and rated["spec"] is None:
            rated["spec"] = candidate.get("spec") if candidate.get("spec") in SPECS else None
        return rated

    rated = [item for item in _parallel(rate, candidates, workers) if item]
    final = select_final(rated, overall=overall, per_spec=per_spec)
    log(f"{region}: {len(rated)} rated, {len(final)} on the leaderboard")

    def details(character: dict[str, Any]) -> dict[str, Any]:
        summary = parse_summary(get(region, _profile_path(character["realm"], character["name"]), "profile"))
        talents = parse_specializations(get(region, _profile_path(character["realm"], character["name"], "/specializations"), "profile"), character["spec"])
        return {**character, **summary, **talents}

    final = _parallel(details, final, workers, fallback=lambda character: character)

    spec_rank: Counter[int] = Counter()
    gear_targets = []
    for character in final:
        spec_rank[character["spec"]] += 1
        if spec_rank[character["spec"]] <= equipment_per_spec:
            gear_targets.append(character)

    def gear(character: dict[str, Any]) -> tuple[Key, dict[str, list[int]]]:
        document = get(region, _profile_path(character["realm"], character["name"], "/equipment"), "profile")
        return character_key(character["realm"], character["name"]), parse_equipment(document)

    equipment = dict(pair for pair in _parallel(gear, gear_targets, workers) if pair)
    specs = summarize_specs(final, equipment, per_spec=per_spec)

    wanted_items = sorted({entry["id"] for spec in specs for entry in spec["trinkets"] + spec["weapons"]} - set(item_cache))

    def item_info(item_id: int) -> tuple[int, dict[str, Any] | None]:
        document = get(region, f"/data/wow/item/{item_id}", "static", locale=None)
        media = get(region, f"/data/wow/media/item/{item_id}", "static", locale=None)
        if not document:
            return item_id, None
        icon = next((asset.get("value") for asset in (media or {}).get("assets") or [] if asset.get("key") == "icon"), "")
        icon_name = str(icon).rsplit("/", 1)[-1].removesuffix(".jpg") if icon else ""
        return item_id, {
            "name": _locale_names(document.get("name")),
            "quality": str(((document.get("quality") or {}).get("type")) or "").lower() or None,
            "icon": icon_name if re.fullmatch(r"[a-z0-9_-]{1,120}", icon_name) else None,
        }

    for item_id, info in _parallel(item_info, wanted_items, workers, fallback=lambda item_id: (item_id, None)):
        if info:
            item_cache[item_id] = info
    items = {str(item_id): item_cache[item_id] for item_id in sorted({entry["id"] for spec in specs for entry in spec["trinkets"] + spec["weapons"]}) if item_id in item_cache}

    characters = []
    for character in final:
        characters.append({
            "name": character["name"],
            "realm": character["realm"],
            "spec": character["spec"],
            "hero": character.get("hero"),
            "score": character["score"],
            "key": character.get("key"),
            "ilvl": character.get("ilvl"),
            "faction": character.get("faction"),
            "loadout": character.get("loadout"),
        })
    used_realms = sorted({character["realm"] for character in characters})
    realms = {slug: realm_names.get(slug) or {"en": slug.replace("-", " ").title()} for slug in used_realms}
    return {
        "schema_version": SCHEMA_VERSION,
        "region": region,
        "season": {"id": season_id, "name": season_label(str(season.get("season_name") or ""))},
        "period": current_period,
        "fetched_at": datetime.now(UTC).isoformat(),
        "specs": specs,
        "items": items,
        "realms": realms,
        "characters": characters,
        "record_count": len(characters),
        "unique_spec_count": len({character["spec"] for character in characters}),
        "page_count": client.request_count - first_request,
        "credits_spent": "0",
        "fetch": {
            "periods": crawl_periods,
            "connected_realms": len(connected_ids),
            "runs": runs,
            "seen": len(estimates),
            "candidates": len(candidates),
            "rated": len(rated),
            "seconds": int((datetime.now(UTC) - started).total_seconds()),
        },
    }
