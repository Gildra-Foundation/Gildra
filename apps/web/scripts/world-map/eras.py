#!/usr/bin/env python3
"""Build eras.json: how the world map looked in earlier eras, from the game's own files.

Run after build_world_map.py (it reads maps.json and art-manifest.json).

Every era is the real map art of one game client:
  * classic, burning-crusade, wrath, cataclysm-pandaria: the current builds of the
    Classic Era (1.15), Anniversary (2.5), Titan (3.80, cn) and Mists of Pandaria
    Classic (5.5) clients;
  * warlords-legion, battle-for-azeroth, midnight: the retail client, whose
    phase-0 art of the old world is the pre-Battle-for-Azeroth state and whose
    phased art (UiMapXMapArt.PhaseID) is the later state;
  * variants: one phase of one client that the game keeps next to the default
    (e.g. the Arathi Highlands warfront).

eras.json entries: {id, name, expansion, patchRange, source, rootMapId,
inherits?, maps, pois?}.  ``maps`` lists every map that exists in the era:
"unchanged" (retail art and geometry apply) or an override object
{art, rectInParent?, name?, parentId?, children?} (era-only maps also carry
id, slug and type).  A map not listed did not exist in that era (for an era
with ``inherits``, unlisted maps come from the inherited era).  ``pois``, when
present, replaces the retail points for that era.

Usage: /tmp/wm-venv/bin/python apps/web/scripts/world-map/eras.py --work /tmp/wm-work
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from art import art_specs, write_pyramid  # noqa: E402
from build_world_map import (  # noqa: E402
    CITIES,
    DATA_DIR,
    TILES_DIR,
    TILES_URL,
    TYPE_NAMES,
    base_art,
    build_hierarchy,
    build_pois,
    r6,
    render_arts,
    slugify,
    write_json,
)
from geometry import Geometry  # noqa: E402
from sources import GAME_TABLES, CatalogDB, GameTables  # noqa: E402

TYPE_IDS = {name: number for number, name in TYPE_NAMES.items()}
QUEL_THALAS_MIDNIGHT = 2537

CLIENT_ERAS = [
    {
        "id": "classic",
        "name": {"en": "World of Warcraft", "ru": "World of Warcraft"},
        "expansion": "classic",
        "patchRange": ["1.0.0", "1.12.1"],
        "product": "wow_classic_era",
    },
    {
        "id": "burning-crusade",
        "name": {"en": "The Burning Crusade", "ru": "The Burning Crusade"},
        "expansion": "tbc",
        "patchRange": ["2.0.1", "2.4.3"],
        "product": "wow_anniversary",
    },
    {
        "id": "wrath-of-the-lich-king",
        "name": {"en": "Wrath of the Lich King", "ru": "Wrath of the Lich King"},
        "expansion": "wotlk",
        "patchRange": ["3.0.2", "3.3.5"],
        "product": "wow_classic_titan",
        "region": "cn",
    },
    {
        "id": "cataclysm-pandaria",
        "name": {"en": "Cataclysm — Mists of Pandaria", "ru": "Cataclysm — Mists of Pandaria"},
        "expansion": "mop",
        "patchRange": ["4.0.3", "5.4.8"],
        "product": "wow_classic",
        # the Vale before the Siege of Orgrimmar (the client keeps three phases, none default)
        "phases": {390: 25583},
    },
]

# retail eras: maps whose primary MapID belongs to an expansion up to maxExpansion,
# with the phased art the game shows from that era on
RETAIL_PHASES_BFA = {81: 9491, 18: 11519, 62: 12608}  # Silithus: the Wound; Tirisfal: blight; Darkshore
RETAIL_ERAS = [
    {
        "id": "warlords-legion",
        "name": {"en": "Warlords of Draenor — Legion", "ru": "Warlords of Draenor — Legion"},
        "expansion": "legion",
        "patchRange": ["6.0.2", "7.3.2"],
        "maxExpansion": 6,
        "phases": {},
        "midnightQuelThalas": False,
    },
    {
        "id": "battle-for-azeroth",
        "name": {"en": "Battle for Azeroth — The War Within", "ru": "Battle for Azeroth — The War Within"},
        "expansion": "bfa",
        "patchRange": ["7.3.5", "11.2.7"],
        "maxExpansion": 10,
        "phases": RETAIL_PHASES_BFA,
        "midnightQuelThalas": False,
    },
    {
        "id": "midnight",
        "name": {"en": "Midnight", "ru": "Midnight"},
        "expansion": "midnight",
        "patchRange": ["12.0.0", "12.1.5"],
        "maxExpansion": 11,
        "phases": RETAIL_PHASES_BFA,
        "midnightQuelThalas": True,
    },
]

# one phase kept by a client next to its default art
VARIANTS = [
    {
        "id": "theramore-fall",
        "name": {"en": "Fall of Theramore", "ru": "Падение Терамора"},
        "expansion": "mop",
        "patchRange": ["5.1.0", "5.4.8"],
        "inherits": "cataclysm-pandaria",
        "product": "wow",
        "phases": {70: 1403},
    },
    {
        "id": "krasarang-landfall",
        "name": {"en": "Krasarang Wilds: Landfall", "ru": "Красарангские джунгли: высадка"},
        "expansion": "mop",
        "patchRange": ["5.1.0", "5.4.8"],
        "inherits": "cataclysm-pandaria",
        "product": "wow_classic",
        "phases": {418: 1918},
    },
    {
        "id": "vale-corruption",
        "name": {"en": "Vale of Eternal Blossoms: corruption", "ru": "Вечноцветущий дол: порча"},
        "expansion": "mop",
        "patchRange": ["5.4.0", "5.4.8"],
        "inherits": "cataclysm-pandaria",
        "product": "wow_classic",
        "phases": {390: 25585},
    },
    {
        "id": "iron-horde-incursion",
        "name": {"en": "Blasted Lands: Iron Horde incursion", "ru": "Выжженные земли: вторжение Железной Орды"},
        "expansion": "wod",
        "patchRange": ["6.0.2", "7.3.2"],
        "inherits": "warlords-legion",
        "product": "wow",
        "phases": {17: 2801},
    },
    {
        "id": "arathi-warfront",
        "name": {"en": "Battle for Stromgarde", "ru": "Битва за Стромгард"},
        "expansion": "bfa",
        "patchRange": ["8.0.1", "8.3.7"],
        "inherits": "battle-for-azeroth",
        "product": "wow",
        "phases": {14: 11292},
    },
]


def same_rect(a, b, tolerance=0.002) -> bool:
    if a is None or b is None:
        return a is b
    return all(abs(x - y) <= tolerance for x, y in zip(a, b))


class EraBuilder:
    def __init__(self, args):
        self.args = args
        self.retail_maps = {m["id"]: m for m in json.loads((DATA_DIR / "maps.json").read_text())}
        self.manifest = json.loads((DATA_DIR / "art-manifest.json").read_text())
        db = CatalogDB(args.work / "db")
        build_id, _ = db.latest_retail_build()
        self.retail_geometry = Geometry(db.table("UiMapAssignment", build_id), db.table("UiMapLink", build_id))
        self.maps_db = db.table("Map", build_id)
        self.areas_db = db.table("AreaTable", build_id)
        self.journal_en = db.table("JournalInstance", build_id)
        self.journal_ru = db.table("JournalInstance", build_id, "ru_RU")
        self.retail_digest = {int(k): v["digest"] for k, v in self.manifest.get("retail", {}).items()}
        self.owner_of_url = {}
        for map_id, node in self.retail_maps.items():
            if node["art"]:
                owner = int(node["art"]["url"].split("/")[3])
                self.owner_of_url[map_id] = owner
        self.published: dict[tuple[str, str], dict] = {}  # (key, digest) -> art object
        self.era_manifest = {}
        self.retail_by_key = defaultdict(list)
        for map_id, node in self.retail_maps.items():
            own = self.retail_geometry.primary(map_id)
            if own:
                self.retail_by_key[(own["MapID"], own["AreaID"], TYPE_IDS[node["type"]])].append(map_id)

    # -- helpers ----------------------------------------------------------
    def retail_art_digest(self, map_id: int):
        owner = self.owner_of_url.get(map_id)
        return self.retail_digest.get(owner) if owner else None

    def expansion_of(self, map_id: int) -> int:
        own = self.retail_geometry.primary(map_id)
        if not own:
            return 0
        return int((self.maps_db.get(own["MapID"]) or {}).get("ExpansionID") or 0)

    def render(self, era_id: str, jobs: list[tuple[str, object, dict]]):
        """jobs: (key, spec, refs) -> {key: (art object, digest, bytes)} (deduplicated per key)."""
        out = {}
        work = []
        for key, spec, refs in jobs:
            out_dir = TILES_DIR / "era" / era_id / key
            work.append((key, spec, refs, str(out_dir), self.args.quality, None))
        results, failures = render_arts(work, self.args.workers)
        for key, error in failures.items():
            print(f"  {era_id} {key}: {error}")
        for key, meta in results.items():
            out[key] = meta
        return out

    def publish(self, era_id: str, key: str, meta: dict, retail_digest):
        """Decide unchanged / reuse / new for a rendered era art; returns art object or None."""
        digest = meta["digest"]
        folder = TILES_DIR / "era" / era_id / key
        if retail_digest and digest == retail_digest:
            shutil.rmtree(folder, ignore_errors=True)
            return None
        previous = self.published.get((key, digest))
        if previous:
            shutil.rmtree(folder, ignore_errors=True)
            return previous
        art = {
            "width": meta["width"],
            "height": meta["height"],
            "tileSize": 256,
            "maxZoom": meta["maxZoom"],
            "url": f"{TILES_URL}/era/{era_id}/{key}/{{z}}/{{x}}_{{y}}.webp",
        }
        self.published[(key, digest)] = art
        self.era_manifest.setdefault(era_id, {})[key] = {k: meta[k] for k in ("width", "height", "maxZoom", "bytes", "tiles", "digest")}
        return art

    # -- client eras --------------------------------------------------------
    def client_era(self, era: dict) -> dict:
        started = time.time()
        source = GameTables(era["product"], self.args.work, era.get("region", "us"))
        tables = source.load(GAME_TABLES)
        geometry = Geometry(tables["UiMapAssignment"], tables["UiMapLink"])
        art_maps = defaultdict(list)
        for row in tables["UiMapXMapArt"].values():
            art_maps[row["UiMapID"]].append(row)
        root = 946 if 946 in tables["UiMap"] else 947
        nodes = build_hierarchy(tables["UiMap"], tables["UiMap@ru"], geometry, art_maps, root)
        # the open world only: no instance floors, nothing without a place on its parent
        # (older clients file Dalaran under instance maps: keep the hub cities)
        nodes = {m: n for m, n in nodes.items() if (n["type"] != "dungeon" or m in CITIES) and (m == root or n["rectInParent"])}
        for node in nodes.values():
            node["children"] = [c for c in node["children"] if c in nodes]

        # era UiMap -> retail UiMap (same id, or same MapID/AreaID/type of the primary assignment)
        mapping: dict[int, int | str] = {}
        taken = set()
        def depth(m):
            d = 0
            while nodes[m]["parentId"] in nodes:
                m = nodes[m]["parentId"]
                d += 1
            return d

        order = sorted(nodes, key=lambda m: (depth(m), TYPE_IDS[nodes[m]["type"]], m))  # parents first
        for map_id in order:
            node = nodes[map_id]
            own = geometry.primary(map_id)
            candidates = set()
            if own:
                candidates |= set(self.retail_by_key.get((own["MapID"], own["AreaID"], TYPE_IDS[node["type"]]), []))
            if map_id in self.retail_maps and self.retail_maps[map_id]["name"]["en"] == node["name"]["en"]:
                candidates.add(map_id)
            candidates -= taken
            parent_target = mapping.get(node["parentId"]) if node["parentId"] else None

            def score(c):
                retail = self.retail_maps[c]
                return (retail["parentId"] != parent_target, retail["name"]["en"] != node["name"]["en"], c != map_id, c)

            target = min(candidates, key=score) if candidates else None
            if target is None:
                target = f"{era['id']}-{map_id}"
            else:
                taken.add(target)
            mapping[map_id] = target

        specs = art_specs(tables)
        jobs = []
        all_fdids = set()
        art_of = {}
        phase_of = era.get("phases", {})
        for map_id, node in nodes.items():
            art_id = base_art(art_maps, map_id)
            if map_id in phase_of:
                art_id = next(r["UiMapArtID"] for r in art_maps[map_id] if r["PhaseID"] == phase_of[map_id])
            if art_id in specs:
                art_of[map_id] = art_id
                all_fdids |= specs[art_id].fdids()
        refs = source.client.resolve(all_fdids)
        for map_id, art_id in art_of.items():
            spec = specs[art_id]
            jobs.append((str(mapping[map_id]), spec, {f: refs[f] for f in spec.fdids() if f in refs}))
        print(f"{era['id']}: {source.version}, {len(nodes)} maps, rendering {len(jobs)} arts")
        rendered = self.render(era["id"], jobs)

        maps_out = {}
        for map_id in order:
            node = nodes[map_id]
            key = mapping[map_id]
            retail = self.retail_maps.get(key) if isinstance(key, int) else None
            meta = rendered.get(str(key))
            art = None
            if meta:
                art = self.publish(era["id"], str(key), meta, self.retail_art_digest(key) if retail else None)
            parent = mapping.get(node["parentId"]) if node["parentId"] else None
            children = [mapping[c] for c in node["children"]]
            override = {}
            if retail is None:
                maps_out[str(key)] = {
                    "id": key, "slug": node["slug"], "type": node["type"], "name": node["name"],
                    "parentId": parent, "children": children, "rectInParent": node["rectInParent"], "art": art,
                }
                continue
            if art:
                override["art"] = art
            if parent != retail["parentId"]:
                override["parentId"] = parent
            if parent != retail["parentId"] or not same_rect(node["rectInParent"], retail["rectInParent"]):
                override["rectInParent"] = node["rectInParent"]
            if node["name"]["en"] != retail["name"]["en"]:
                override["name"] = node["name"]
            retail_children = [c for c in retail["children"] if c in mapping.values()]
            if sorted(map(str, children)) != sorted(map(str, retail_children)):
                override["children"] = children
            if override and "art" not in override:
                # geometry or name differ but the picture is the retail one (or the client has none)
                override["art"] = retail["art"] if meta else None
            if not override and meta is None and retail["art"]:
                override["art"] = None  # the client has no picture of this map
            maps_out[str(key)] = override or "unchanged"

        # era points: the era client's own flight paths, portals, cities and labels
        for map_id in nodes:
            nodes[map_id]["art"] = True if map_id in art_of else None
        cities = {m: CITIES[mapping[m]] for m in nodes if isinstance(mapping[m], int) and mapping[m] in CITIES}
        all_names = frozenset(n["name"]["en"] for n in nodes.values())
        all_areas = frozenset(r["AreaID"] for m in nodes for r in geometry.by_map.get(m, []) if r["AreaID"])
        pois = build_pois(nodes, geometry, tables, self.journal_en, self.journal_ru, self.maps_db, self.areas_db, all_names, all_areas, cities)
        for poi in pois:
            poi["mapId"] = mapping[poi["mapId"]]
            if "targetMapId" in poi:
                poi["targetMapId"] = mapping[poi["targetMapId"]]
            poi["id"] = f"{era['id']}-{poi['id']}"
        print(f"  {era['id']}: {sum(1 for v in maps_out.values() if v != 'unchanged')} changed, {sum(1 for v in maps_out.values() if v == 'unchanged')} unchanged, {len(pois)} points, {time.time() - started:.0f}s")
        return {
            "id": era["id"],
            "name": era["name"],
            "expansion": era["expansion"],
            "patchRange": era["patchRange"],
            "source": {"product": era["product"], "build": source.version},
            "rootMapId": mapping[root],
            "maps": maps_out,
            "pois": pois,
        }

    # -- retail eras ----------------------------------------------------------
    def retail_phase_arts(self, era_id: str, phases: dict[int, int], product: str = "wow", explicit: bool = False) -> dict[int, dict]:
        """Phased art of one client; UiMap IDs of that client must equal the retail ones."""
        if not phases:
            return {}
        cache = self.__dict__.setdefault("_phase_sources", {})
        if product not in cache:
            src = GameTables(product, self.args.work)
            cache[product] = (src, src.load(("UiMap", "UiMapArt", "UiMapArtTile", "UiMapXMapArt", "UiMapArtStyleLayer", "WorldMapOverlay", "WorldMapOverlayTile")))
        source, tables = cache[product]
        for map_id in phases:
            if tables["UiMap"][map_id]["Name_lang"] != self.retail_maps[map_id]["name"]["en"]:
                raise SystemExit(f"{era_id}: {product} map {map_id} is not the retail map")
        specs = art_specs(tables)
        chosen = {}
        for row in tables["UiMapXMapArt"].values():
            if phases.get(row["UiMapID"]) == row["PhaseID"]:
                chosen[row["UiMapID"]] = row["UiMapArtID"]
        missing = set(phases) - set(chosen)
        if missing:
            raise SystemExit(f"{era_id}: phases not found for maps {sorted(missing)}")
        refs = source.client.resolve({f for a in chosen.values() for f in specs[a].fdids()})
        jobs = [(str(m), specs[a], {f: refs[f] for f in specs[a].fdids() if f in refs}) for m, a in chosen.items()]
        rendered = self.render(era_id, jobs)
        out = {}
        for map_id in chosen:
            meta = rendered.get(str(map_id))
            if not meta:
                raise SystemExit(f"{era_id}: phase art of {map_id} failed")
            art = self.publish(era_id, str(map_id), meta, self.retail_art_digest(map_id))
            if art:
                out[map_id] = art
            elif explicit:
                out[map_id] = self.retail_maps[map_id]["art"]  # same picture as retail
        self.versions = getattr(self, "versions", {})
        self.versions[product] = source.version
        return out

    def retail_era(self, era: dict) -> dict:
        excluded = set()
        if not era["midnightQuelThalas"]:
            stack = [QUEL_THALAS_MIDNIGHT]
            while stack:
                m = stack.pop()
                if m in self.retail_maps:
                    excluded.add(m)
                    stack.extend(self.retail_maps[m]["children"])
        phase_art = self.retail_phase_arts(era["id"], era["phases"])
        included = set()
        for map_id, node in self.retail_maps.items():
            if map_id in excluded:
                continue
            if node["type"] not in ("cosmic", "world") and self.expansion_of(map_id) > era["maxExpansion"]:
                continue
            included.add(map_id)
        changed = True
        while changed:  # a map exists only if its parent does
            changed = False
            for map_id in list(included):
                parent = self.retail_maps[map_id]["parentId"]
                if parent is not None and parent not in included:
                    included.discard(map_id)
                    changed = True
        maps_out = {str(m): ({"art": phase_art[m]} if m in phase_art else "unchanged") for m in sorted(included)}
        print(f"  {era['id']}: {len(maps_out)} maps, {len(phase_art)} phased")
        return {
            "id": era["id"],
            "name": era["name"],
            "expansion": era["expansion"],
            "patchRange": era["patchRange"],
            "source": {"product": "wow", "build": self.manifest["sources"]["art"]["build"]},
            "rootMapId": 946,
            "maps": maps_out,
        }

    def variant(self, era: dict) -> dict:
        phase_art = self.retail_phase_arts(era["id"], era["phases"], era["product"], explicit=True)
        return {
            "id": era["id"],
            "name": era["name"],
            "expansion": era["expansion"],
            "patchRange": era["patchRange"],
            "source": {"product": era["product"], "build": self.versions[era["product"]]},
            "rootMapId": 946,
            "inherits": era["inherits"],
            "maps": {str(m): {"art": art} for m, art in phase_art.items()},
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--only", help="comma separated era ids")
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    builder = EraBuilder(args)
    only = set(args.only.split(",")) if args.only else None
    eras_path = DATA_DIR / "eras.json"
    existing = {e["id"]: e for e in json.loads(eras_path.read_text())} if eras_path.exists() and only else {}
    out = dict(existing)
    for era in CLIENT_ERAS:
        if only is None or era["id"] in only:
            out[era["id"]] = builder.client_era(era)
    for era in RETAIL_ERAS:
        if only is None or era["id"] in only:
            out[era["id"]] = builder.retail_era(era)
    for era in VARIANTS:
        if only is None or era["id"] in only:
            out[era["id"]] = builder.variant(era)
    order = [e["id"] for e in CLIENT_ERAS + RETAIL_ERAS + VARIANTS]
    eras = [out[i] for i in order if i in out]
    write_json(eras_path, eras)
    manifest_path = DATA_DIR / "art-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest.setdefault("eras", {})
    for era_id, arts in builder.era_manifest.items():
        manifest["eras"][era_id] = arts
    for era in eras:
        manifest.setdefault("eraSources", {})[era["id"]] = era["source"]
    write_json(manifest_path, manifest)
    size = sum(f.stat().st_size for f in (TILES_DIR / "era").rglob("*.webp")) if (TILES_DIR / "era").exists() else 0
    print(f"eras {len(eras)}, era tiles {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
