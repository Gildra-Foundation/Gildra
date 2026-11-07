#!/usr/bin/env python3
"""Build the Gildra world map: maps.json, pois.json, eras.json and WebP tile pyramids.

Sources (read-only):
  * catalog DB (catalog_db2_rows, latest retail build, enUS + ruRU): UiMap,
    UiMapAssignment, UiMapLink, AreaTable, Map, JournalInstance;
  * the game's own files from Blizzard's public CDN (tact.py, no login):
    UiMapArt / UiMapXMapArt / UiMapArtTile / UiMapArtStyleLayer, TaxiNodes,
    AreaPOI, JournalInstanceEntrance, UiMapGroupMember and the BLP map tiles of
    retail ("wow") and of older clients for eras (see eras.py).

Usage (needs Pillow; raw downloads stay in --work, delete it afterwards):
  python3 -m venv /tmp/wm-venv && /tmp/wm-venv/bin/pip install Pillow
  /tmp/wm-venv/bin/python apps/web/scripts/world-map/build_world_map.py --work /tmp/wm-work
  ... --maps 946,947,12,1,85      # sample subset (data + tiles of those maps only)
  ... --skip-tiles                # data only, keep existing tiles
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
import unicodedata
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from art import art_specs, image_digest, stitch, write_pyramid  # noqa: E402
from geometry import Geometry  # noqa: E402
from sources import CatalogDB, GameTables  # noqa: E402

WEB = Path(__file__).resolve().parents[2]
DATA_DIR = WEB / "data" / "wow" / "map"
TILES_DIR = WEB / "public" / "maps" / "tiles"
TILES_URL = "/maps/tiles"
COSMIC = 946

TYPE_NAMES = {0: "cosmic", 1: "world", 2: "continent", 3: "zone", 4: "dungeon", 5: "micro", 6: "orphan"}
HIDDEN_NAME = re.compile(
    r"\[|\]|\bDNT\b|\btest\b|\bdev\b|unused|disabled|deprecated|placeholder|\btemp\b|\bcopy\b|\bdebug\b|^\d+\.\d+|^\s*$|\bzz",
    re.I,
)

# Faction capitals and major hub cities (UiMap IDs of the city maps).
CITIES = {
    85: ("capital", "horde"),  # Orgrimmar
    88: ("capital", "horde"),  # Thunder Bluff
    90: ("capital", "horde"),  # Undercity
    110: ("capital", "horde"),  # Silvermoon City (Burning Crusade)
    84: ("capital", "alliance"),  # Stormwind City
    87: ("capital", "alliance"),  # Ironforge
    89: ("capital", "alliance"),  # Darnassus
    103: ("capital", "alliance"),  # The Exodar
    1161: ("capital", "alliance"),  # Boralus
    1165: ("capital", "horde"),  # Dazar'alor
    2393: ("city", "neutral"),  # Silvermoon City (Midnight)
    111: ("city", "neutral"),  # Shattrath City
    125: ("city", "neutral"),  # Dalaran (Northrend)
    627: ("city", "neutral"),  # Dalaran (Broken Isles)
    391: ("city", "horde"),  # Shrine of Two Moons
    393: ("city", "alliance"),  # Shrine of Seven Stars
    622: ("city", "alliance"),  # Stormshield
    624: ("city", "horde"),  # Warspear
    1670: ("city", "neutral"),  # Oribos
    2112: ("city", "neutral"),  # Valdrakken
    2339: ("city", "neutral"),  # Dornogal
}

# Instance pages on the site, matched by the journal's English instance name.
INSTANCE_PAGES = {
    "Ruby Life Pools": "/wow/dungeons/ruby-life-pools",
    "Altar of Fangs": "/wow/dungeons/altar-of-fangs",
    "Murder Row": "/wow/dungeons/murder-row",
    "Den of Nalorakk": "/wow/dungeons/den-of-nalorakk",
    "The Blinding Vale": "/wow/dungeons/the-blinding-vale",
    "Voidscar Arena": "/wow/dungeons/voidscar-arena",
    "Kings' Rest": "/wow/dungeons/kings-rest",
    "Temple of Sethraliss": "/wow/dungeons/temple-of-sethraliss",
    "The Voidspire": "/wow/raids/the-voidspire",
    "The Dreamrift": "/wow/raids/the-dreamrift",
    "March on Quel'Danas": "/wow/raids/march-on-queldanas",
}


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    text = re.sub(r"['’`]", "", text.lower())
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "map"


def r6(value: float) -> float:
    return round(value, 6)


def write_json(path: Path, items) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    if isinstance(items, list):
        body = "[\n" + ",\n".join(json.dumps(item, ensure_ascii=False, separators=(",", ":")) for item in items) + "\n]\n"
    else:
        body = json.dumps(items, ensure_ascii=False, indent=2) + "\n"
    tmp.write_text(body)
    os.replace(tmp, path)


# -- hierarchy ---------------------------------------------------------------


def build_hierarchy(uimap_en, uimap_ru, geometry: Geometry, art_maps: dict[int, list[dict]]):
    """Playable public maps reachable from Cosmic, with children and rects."""

    def chain(map_id):
        seen = []
        while map_id and map_id in uimap_en and map_id not in seen:
            seen.append(map_id)
            map_id = uimap_en[map_id]["ParentUiMapID"]
        return seen

    kept: dict[int, dict] = {}
    for map_id, row in uimap_en.items():
        path = chain(map_id)
        if not path or path[-1] != COSMIC:
            continue
        if any(HIDDEN_NAME.search(uimap_en[m]["Name_lang"] or "") for m in path):
            continue
        kept[map_id] = row
    nodes: dict[int, dict] = {}
    for map_id, row in sorted(kept.items()):
        parent = row["ParentUiMapID"] if map_id != COSMIC else None
        rect, how = (None, None) if parent is None else geometry.rect_in_parent(map_id, parent)
        if rect and how == "assignment" and row["Type"] in (4, 6):
            # instances and phased copies live on their own MapID: a world box on the
            # parent is only meaningful when both maps share the same MapID
            own, outer = geometry.primary(map_id), geometry.primary(parent)
            if not own or not outer or own["MapID"] != outer["MapID"]:
                rect = None
        name_en = row["Name_lang"]
        name_ru = (uimap_ru.get(map_id) or {}).get("Name_lang") or name_en
        nodes[map_id] = {
            "id": map_id,
            "slug": slugify(name_en),
            "name": {"en": name_en, "ru": name_ru},
            "type": TYPE_NAMES.get(row["Type"], "orphan"),
            "parentId": parent,
            "children": [],
            "rectInParent": [r6(v) for v in rect] if rect else None,
            "art": None,
        }
    for map_id, node in nodes.items():
        parent = node["parentId"]
        if parent in nodes:
            nodes[parent]["children"].append(map_id)
    order = {"cosmic": 0, "world": 1, "continent": 2, "zone": 3, "orphan": 4, "micro": 5, "dungeon": 6}
    for node in nodes.values():
        node["children"].sort(key=lambda c: (order[nodes[c]["type"]], nodes[c]["name"]["en"], c))
    return nodes


def base_art(art_maps: dict[int, list[dict]], map_id: int) -> int | None:
    rows = [r for r in art_maps.get(map_id, []) if r["PhaseID"] == 0] or art_maps.get(map_id, [])
    return min(rows, key=lambda r: r["ID"])["UiMapArtID"] if rows else None


# -- tiles -------------------------------------------------------------------


def _render(job):
    key, spec, refs, out_dir, quality, max_side = job
    image = stitch(refs, spec)
    digest = image_digest(image)
    meta = write_pyramid(image, Path(out_dir), quality=quality, max_side=max_side)
    meta["digest"] = digest
    return key, meta


def render_arts(jobs, workers: int):
    results = {}
    failures = {}
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_render, job): job[0] for job in jobs}
        done = 0
        for future in as_completed(futures):
            key = futures[future]
            done += 1
            try:
                k, meta = future.result()
                results[k] = meta
            except Exception as error:  # noqa: BLE001 - report every failed art, keep going
                failures[key] = str(error)
            if done % 25 == 0 or done == len(futures):
                print(f"  tiles {done}/{len(futures)}", flush=True)
    return results, failures


def dir_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


# -- POIs --------------------------------------------------------------------


def build_pois(nodes, geometry: Geometry, game, journal_en, journal_ru, maps_db, areas_db, all_names=frozenset(), all_areas=frozenset()):
    allowed = {m: {"cosmic": 0, "world": 1, "continent": 2, "zone": 3, "dungeon": 4, "micro": 5, "orphan": 6}[n["type"]] for m, n in nodes.items() if n["art"]}
    pois = []
    names = {m: n["name"]["en"] for m, n in nodes.items()}

    def area_chain(area_id):
        chain = []
        while area_id and area_id in areas_db and area_id not in chain:
            chain.append(area_id)
            area_id = areas_db[area_id].get("ParentAreaID")
        return chain

    # points sit on zone-level maps (never on a continent or world map)
    poi_maps = {m: kind for m, kind in allowed.items() if kind in (3, 4, 5, 6)}

    def located(map_id, x, y, z, area_id):
        chain = area_chain(area_id)
        hit = geometry.locate(map_id, x, y, z, poi_maps, areas=chain)
        if not hit:
            return None
        ui_map, u, v, area_hit, _ = hit
        if not area_hit and any(a in all_areas for a in chain):
            return None  # its zone is not part of this build
        return ui_map, u, v

    def add(poi):
        if not (0 <= poi["x"] <= 1 and 0 <= poi["y"] <= 1):
            return
        poi["x"], poi["y"] = r6(poi["x"]), r6(poi["y"])
        pois.append(poi)

    # capitals and cities: centre of the city map on its parent
    for map_id, (kind, faction) in CITIES.items():
        node = nodes.get(map_id)
        if not node or not node["rectInParent"] or node["parentId"] not in nodes:
            continue
        x0, y0, x1, y1 = node["rectInParent"]
        add({"id": f"city-{map_id}", "mapId": node["parentId"], "kind": kind, "name": node["name"], "x": (x0 + x1) / 2, "y": (y0 + y1) / 2, "faction": faction, "targetMapId": map_id})

    # zone labels on every parent with art
    for map_id, node in nodes.items():
        if node["type"] not in ("world", "continent", "zone") or map_id in CITIES:
            continue
        parent = nodes.get(node["parentId"])
        if not parent or not parent["art"] or not node["rectInParent"]:
            continue
        x0, y0, x1, y1 = node["rectInParent"]
        add({"id": f"label-{map_id}", "mapId": parent["id"], "kind": "zone-label", "name": node["name"], "x": (x0 + x1) / 2, "y": (y0 + y1) / 2, "targetMapId": map_id})

    # flight paths
    taxi_ru = game["TaxiNodes@ru"]
    for node_id, row in sorted(game["TaxiNodes"].items()):
        flags = row["Flags"]
        if not flags & 0x3 or flags & 0x80:
            continue
        name = row["Name_lang"] or ""
        if not name or HIDDEN_NAME.search(name) or re.search(r"quest|transport|\(.*(?:test|dev).*\)", name, re.I):
            continue
        x, y, z = row["Pos"]
        hint = tuple(part.strip() for part in name.split(", ", 1))
        hit = geometry.locate(row["ContinentID"], x, y, z, poi_maps, hint=hint, names=names)
        if not hit:
            continue
        map_id, u, v, _, named = hit
        if named == 2 and any(part in all_names for part in hint):
            continue  # its zone is not part of this build
        faction = "neutral" if flags & 0x3 == 0x3 else ("alliance" if flags & 0x1 else "horde")
        add({"id": f"taxi-{node_id}", "mapId": map_id, "kind": "flight", "name": {"en": name, "ru": (taxi_ru.get(node_id) or {}).get("Name_lang") or name}, "x": u, "y": v, "faction": faction})

    # portals
    poi_ru = game["AreaPOI@ru"]
    for poi_id, row in sorted(game["AreaPOI"].items()):
        name = row["Name_lang"] or ""
        if not re.match(r"portal to ", name, re.I) or HIDDEN_NAME.search(name):
            continue
        x, y, z = row["Pos"]
        hit = located(row["ContinentID"], x, y, z, row["AreaID"])
        if not hit:
            continue
        map_id, u, v = hit
        add({"id": f"portal-{poi_id}", "mapId": map_id, "kind": "portal", "name": {"en": name, "ru": (poi_ru.get(poi_id) or {}).get("Name_lang") or name}, "x": u, "y": v})

    # dungeon and raid entrances
    seen = set()
    for entrance_id, row in sorted(game["JournalInstanceEntrance"].items()):
        instance = journal_en.get(row["JournalInstanceID"])
        if not instance:
            continue
        name = instance["Name_lang"]
        if HIDDEN_NAME.search(name or ""):
            continue
        instance_map = maps_db.get(instance["MapID"]) or {}
        kind = "raid" if instance_map.get("InstanceType") == 2 else "dungeon"
        x, y, z = row["Position"]
        hit = located(row["MapID"], x, y, z, row["AreaTableID"])
        if not hit:
            continue
        map_id, u, v = hit
        key = (row["JournalInstanceID"], map_id)
        if key in seen:
            continue
        seen.add(key)
        faction = {0: "horde", 1: "alliance"}.get(row.get("Faction"))
        poi = {"id": f"instance-{row['JournalInstanceID']}-{map_id}", "mapId": map_id, "kind": kind, "name": {"en": name, "ru": (journal_ru.get(row["JournalInstanceID"]) or {}).get("Name_lang") or name}, "x": u, "y": v, "journalInstanceId": row["JournalInstanceID"]}
        if faction:
            poi["faction"] = faction
        if name in INSTANCE_PAGES:
            poi["href"] = INSTANCE_PAGES[name]
        add(poi)
    pois.sort(key=lambda p: (p["mapId"], p["kind"], p["id"]))
    return pois


# -- main --------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, required=True, help="cache for raw downloads (e.g. /tmp/wm-work)")
    parser.add_argument("--maps", help="comma separated UiMap IDs: build only these maps (sample)")
    parser.add_argument("--skip-tiles", action="store_true")
    parser.add_argument("--dungeon-art", choices=("none", "linked", "all"), default="linked")
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    started = time.time()
    db = CatalogDB(args.work / "db")
    build_id, hierarchy_version = db.latest_retail_build()
    print(f"hierarchy: catalog build {build_id} ({hierarchy_version})")
    uimap_en = db.table("UiMap", build_id, "en_US")
    uimap_ru = db.table("UiMap", build_id, "ru_RU")
    assignments = db.table("UiMapAssignment", build_id, "en_US")
    links = db.table("UiMapLink", build_id, "en_US")
    journal_en = db.table("JournalInstance", build_id, "en_US")
    journal_ru = db.table("JournalInstance", build_id, "ru_RU")
    maps_db = db.table("Map", build_id, "en_US")
    areas_db = db.table("AreaTable", build_id, "en_US")

    game_source = GameTables("wow", args.work)
    print(f"art: game files {game_source.version}")
    game = game_source.load()
    geometry = Geometry(assignments, links)
    art_maps: dict[int, list[dict]] = {}
    for row in game["UiMapXMapArt"].values():
        art_maps.setdefault(row["UiMapID"], []).append(row)
    specs = art_specs(game)

    nodes = build_hierarchy(uimap_en, uimap_ru, geometry, art_maps)
    selected = set(nodes)
    all_names = frozenset(n["name"]["en"] for n in nodes.values() if n["type"] != "dungeon")
    all_areas = frozenset(r["AreaID"] for m in nodes for r in geometry.by_map.get(m, []) if r["AreaID"])
    if args.maps:
        selected = {int(m) for m in args.maps.split(",")}
        nodes = {m: n for m, n in nodes.items() if m in selected}
        for node in nodes.values():
            node["children"] = [c for c in node["children"] if c in nodes]

    # dungeon maps that belong to an instance with a page on the site
    instance_by_map = {}
    for instance in journal_en.values():
        instance_by_map.setdefault(instance["MapID"], instance)
    for map_id, node in nodes.items():
        if node["type"] != "dungeon":
            continue
        own = geometry.primary(map_id)
        instance = instance_by_map.get(own["MapID"]) if own else None
        if instance and instance["Name_lang"] in INSTANCE_PAGES:
            node["href"] = INSTANCE_PAGES[instance["Name_lang"]]

    def wants_art(node) -> bool:
        if node["type"] != "dungeon":
            return True
        return args.dungeon_art == "all" or (args.dungeon_art == "linked" and "href" in node)

    # one tile pyramid per distinct art; maps sharing an art share its tiles
    art_owner: dict[int, int] = {}
    for map_id in sorted(nodes):
        art_id = base_art(art_maps, map_id)
        if art_id is None or art_id not in specs or not wants_art(nodes[map_id]):
            continue
        art_owner.setdefault(art_id, map_id)
        nodes[map_id]["_art"] = art_id

    manifest_path = DATA_DIR / "art-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    retail = manifest.setdefault("retail", {})
    if not args.skip_tiles:
        all_fdids = {fdid for art_id in art_owner for fdid in specs[art_id].tiles.values()}
        print(f"resolving {len(all_fdids)} tile files for {len(art_owner)} arts")
        refs = game_source.client.resolve(all_fdids)
        jobs = []
        for art_id, owner in sorted(art_owner.items()):
            spec = specs[art_id]
            fingerprint = ",".join(str(spec.tiles[k]) for k in sorted(spec.tiles))
            out_dir = TILES_DIR / str(owner)
            previous = retail.get(str(owner))
            if previous and previous.get("artId") == art_id and previous.get("fingerprint") == fingerprint and out_dir.exists():
                continue
            jobs.append((art_id, spec, {f: refs[f] for f in spec.tiles.values() if f in refs}, str(out_dir), args.quality, None))
        print(f"rendering {len(jobs)} arts ({len(art_owner) - len(jobs)} unchanged)")
        results, failures = render_arts(jobs, args.workers)
        for art_id, meta in results.items():
            owner = art_owner[art_id]
            spec = specs[art_id]
            retail[str(owner)] = {
                "artId": art_id,
                "fingerprint": ",".join(str(spec.tiles[k]) for k in sorted(spec.tiles)),
                **{k: meta[k] for k in ("width", "height", "maxZoom", "bytes", "tiles", "digest")},
            }
        for art_id, error in sorted(failures.items()):
            print(f"  art {art_id} (map {art_owner[art_id]}) failed: {error}")
            retail.pop(str(art_owner[art_id]), None)
    for map_id, node in nodes.items():
        art_id = node.pop("_art", None)
        if art_id is None:
            continue
        owner = art_owner[art_id]
        meta = retail.get(str(owner))
        if not meta or not (TILES_DIR / str(owner)).exists():
            continue
        node["art"] = {
            "width": meta["width"],
            "height": meta["height"],
            "tileSize": 256,
            "maxZoom": meta["maxZoom"],
            "url": f"{TILES_URL}/{owner}/{{z}}/{{x}}_{{y}}.webp",
        }

    pois = build_pois(nodes, geometry, game, journal_en, journal_ru, maps_db, areas_db, all_names, all_areas)
    maps = [nodes[m] for m in sorted(nodes)]
    write_json(DATA_DIR / "maps.json", maps)
    write_json(DATA_DIR / "pois.json", pois)
    manifest["sources"] = {
        "hierarchy": {"catalogBuildId": build_id, "build": hierarchy_version},
        "art": {"product": "wow", "build": game_source.version},
    }
    write_json(manifest_path, manifest)
    used = {str(art_owner[a]) for a in art_owner}
    total = sum(v["bytes"] for k, v in retail.items() if k in used)
    print(f"maps {len(maps)}, with art {sum(1 for m in maps if m['art'])}, pois {len(pois)}, retail tiles {total / 1e6:.1f} MB, {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
