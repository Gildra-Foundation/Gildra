#!/usr/bin/env python3
"""Build eras.json: how the world map looked in each era, from the game's own files.

Run after build_world_map.py (it reads maps.json and art-manifest.json).

Blizzard's CDN serves only the current build of each product, so the eras are
assembled from the clients that still exist (method: docs/world-map/ERAS.md):

  classic                 Classic Era client 1.15 (wow_classic_era)
  burning-crusade         Anniversary client 2.5 (wow_anniversary)
  wrath-of-the-lich-king  Titan client 3.80 (wow_classic_titan, cn)
  cataclysm               Mists of Pandaria Classic 5.5 without everything of
                          Mists (Pandaria, its zones); the Azeroth picture of 5.5
                          paints Pandaria, so Azeroth is the 3.80 picture (the
                          nearest older real art) and the continents are placed
                          on it through their world coordinates
  cataclysm-pandaria      Mists of Pandaria Classic 5.5 (wow_classic) — Mists
  warlords-of-draenor     5.5 (state after the Siege of Orgrimmar) + Draenor of
                          the retail client as its own world
  legion                  + the Broken Isles (on the 5.5 Azeroth picture) and Argus
  battle-for-azeroth …    the retail client (12.x) without content of later
  the-war-within          expansions, with the phased art of that time; until
                          Dragonflight the Azeroth picture is the 5.5 one (the
                          retail picture paints Dragon Isles and Khaz Algar) and
                          until Shadowlands the Cosmic picture is the 5.5 one
                          (the retail one paints the Shadowlands)
  midnight                the retail client as it is

plus variants: one phase of one map kept by a client next to its default
(Theramore in ruins, the Vale corrupted, …), laid over their parent era.

eras.json entries: {id, name, expansion, patchRange, source, rootMapId,
inherits?, substitutes?, maps, pois?}.  ``maps`` lists every map of the era:
"unchanged" (the map exactly as in maps.json: art, mask, place, parent,
children), an override object {art, mask?, rectInParent, parentId, children,
name?} (era-only maps also carry id, slug and type), or {"absent": true,
"art": null} for maps of maps.json with art that did not exist then.  ``pois``
replaces the current points for that era.

Usage: /tmp/wm-venv/bin/python apps/web/scripts/world-map/eras.py --work /tmp/wm-work
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from art import art_specs, image_digest, localized_refs, stitch, write_localized_pyramid, write_pyramid  # noqa: E402
from build_world_map import (  # noqa: E402
    CITIES,
    DATA_DIR,
    MASKS_DIR,
    MASKS_URL,
    TILES_DIR,
    TILES_URL,
    TYPE_NAMES,
    base_art,
    build_hierarchy,
    build_pois,
    r6,
    write_json,
)
from geometry import Geometry, ui_to_world, world_to_ui  # noqa: E402
from masks import save_mask, tree_masks  # noqa: E402
from sources import GAME_TABLES, CatalogDB, GameTables  # noqa: E402
from tact import LOCALE_RURU  # noqa: E402

TYPE_IDS = {name: number for number, name in TYPE_NAMES.items()}
COSMIC, AZEROTH = 946, 947
QUEL_THALAS_MIDNIGHT = 2537
DRAENOR, BROKEN_ISLES, ARGUS = 572, 619, 905

CLIENTS = {
    "wow_classic_era": {"region": "us"},
    "wow_anniversary": {"region": "us"},
    "wow_classic_titan": {"region": "cn"},
    "wow_classic": {"region": "us"},
}

# Retail phased art from Battle for Azeroth on: Silithus (the Wound), Tirisfal
# (the blight), Darkshore (after the War of the Thorns)
# Theramore stays a crater from Mists on (the retail default art is the city before 5.0.4)
THERAMORE_RUINS = {70: ("wow", 1403)}
RETAIL_PHASES_BFA = {81: ("wow", 9491), 18: ("wow", 11519), 62: ("wow", 12608), **THERAMORE_RUINS}

ERAS = [
    {"id": "classic", "maxExpansion": 0, "name": {"en": "World of Warcraft", "ru": "World of Warcraft"}, "expansion": "classic",
     "patchRange": ["1.0.0", "1.12.3"], "kind": "client", "product": "wow_classic_era"},
    {"id": "burning-crusade", "maxExpansion": 1, "name": {"en": "The Burning Crusade", "ru": "The Burning Crusade"}, "expansion": "tbc",
     "patchRange": ["2.0.1", "2.4.3"], "kind": "client", "product": "wow_anniversary"},
    {"id": "wrath-of-the-lich-king", "maxExpansion": 2, "name": {"en": "Wrath of the Lich King", "ru": "Wrath of the Lich King"}, "expansion": "wotlk",
     "patchRange": ["3.0.2", "3.3.5"], "kind": "client", "product": "wow_classic_titan"},
    {"id": "cataclysm", "name": {"en": "Cataclysm", "ru": "Cataclysm"}, "expansion": "cataclysm",
     "patchRange": ["4.0.1", "4.3.4"], "kind": "cataclysm", "maxExpansion": 3},
    # the Vale before the Siege of Orgrimmar (the client keeps three phases, none default)
    {"id": "cataclysm-pandaria", "name": {"en": "Mists of Pandaria", "ru": "Mists of Pandaria"}, "expansion": "mop",
     "patchRange": ["5.0.4", "5.4.8"], "kind": "client", "product": "wow_classic", "maxExpansion": 4, "phases": {390: ("wow_classic", 25583)}},
    {"id": "warlords-of-draenor", "name": {"en": "Warlords of Draenor", "ru": "Warlords of Draenor"}, "expansion": "wod",
     "patchRange": ["6.0.2", "6.2.4"], "kind": "pre-retail", "maxExpansion": 5,
     "phases": {390: ("wow_classic", 25585), 70: ("wow", 1403)}},
    {"id": "legion", "name": {"en": "Legion", "ru": "Legion"}, "expansion": "legion",
     "patchRange": ["7.0.3", "7.3.5"], "kind": "pre-retail", "maxExpansion": 6,
     "phases": {390: ("wow_classic", 25585), 70: ("wow", 1403)}},
    {"id": "battle-for-azeroth", "name": {"en": "Battle for Azeroth", "ru": "Battle for Azeroth"}, "expansion": "bfa",
     "patchRange": ["8.0.1", "8.3.7"], "kind": "retail", "maxExpansion": 7, "phases": RETAIL_PHASES_BFA,
     "azeroth": "wow_classic", "cosmic": "wow_classic"},
    {"id": "shadowlands", "name": {"en": "Shadowlands", "ru": "Shadowlands"}, "expansion": "shadowlands",
     "patchRange": ["9.0.1", "9.2.7"], "kind": "retail", "maxExpansion": 8, "phases": RETAIL_PHASES_BFA, "azeroth": "wow_classic"},
    {"id": "dragonflight", "name": {"en": "Dragonflight", "ru": "Dragonflight"}, "expansion": "dragonflight",
     "patchRange": ["10.0.0", "10.2.7"], "kind": "retail", "maxExpansion": 9, "phases": RETAIL_PHASES_BFA, "azeroth": "wow_classic"},
    {"id": "the-war-within", "name": {"en": "The War Within", "ru": "The War Within"}, "expansion": "tww",
     "patchRange": ["11.0.0", "11.2.7"], "kind": "retail", "maxExpansion": 10, "phases": RETAIL_PHASES_BFA},
    {"id": "midnight", "name": {"en": "Midnight", "ru": "Midnight"}, "expansion": "midnight",
     "patchRange": ["12.0.0", "12.1.5"], "kind": "retail", "maxExpansion": 11, "phases": RETAIL_PHASES_BFA},
]

VARIANTS = [
    # the Theramore's Fall scenario and the destroyed phase came with 5.0.4 (2012-08-28)
    {"id": "theramore-fall", "name": {"en": "Fall of Theramore", "ru": "Падение Терамора"}, "expansion": "mop",
     "patchRange": ["5.0.4", "5.4.8"], "inherits": "cataclysm-pandaria", "phases": {70: ("wow", 1403)}},
    {"id": "krasarang-landfall", "name": {"en": "Krasarang Wilds: Landfall", "ru": "Красарангские джунгли: высадка"}, "expansion": "mop",
     "patchRange": ["5.1.0", "5.4.8"], "inherits": "cataclysm-pandaria", "phases": {418: ("wow_classic", 1918)}},
    {"id": "vale-corruption", "name": {"en": "Vale of Eternal Blossoms: corruption", "ru": "Вечноцветущий дол: порча"}, "expansion": "mop",
     "patchRange": ["5.4.0", "5.4.8"], "inherits": "cataclysm-pandaria", "phases": {390: ("wow_classic", 25585)}},
    {"id": "iron-horde-incursion", "name": {"en": "Blasted Lands: Iron Horde incursion", "ru": "Выжженные земли: вторжение Железной Орды"}, "expansion": "wod",
     "patchRange": ["6.0.2", "6.2.4"], "inherits": "warlords-of-draenor", "phases": {17: ("wow", 2801)}},
    {"id": "arathi-warfront", "name": {"en": "Battle for Stromgarde", "ru": "Битва за Стромгард"}, "expansion": "bfa",
     "patchRange": ["8.0.1", "8.3.7"], "inherits": "battle-for-azeroth", "phases": {14: ("wow", 11292)}},
]


def same_rect(a, b, tolerance=0.002) -> bool:
    if a is None or b is None:
        return a is b
    return all(abs(x - y) <= tolerance for x, y in zip(a, b))


def rect_from_rows(parent_rows: list[dict], child_row: dict):
    """Rect of a child's world box on a parent, through the parent's assignment rows of that MapID."""
    candidates = [r for r in parent_rows if r["MapID"] == child_row["MapID"]]
    if not candidates:
        return None
    cx0, cy0, _, cx1, cy1, _ = child_row["Region"]

    def overlap(row):
        x0, y0, _, x1, y1, _ = row["Region"]
        return max(0.0, min(x1, cx1) - max(x0, cx0)) * max(0.0, min(y1, cy1) - max(y0, cy0))

    best = max(candidates, key=overlap)
    if overlap(best) <= 0:
        return None
    corners = [ui_to_world(child_row, 0.0, 0.0), ui_to_world(child_row, 1.0, 1.0)]
    (u0, v0), (u1, v1) = (world_to_ui(best, wx, wy) for wx, wy in corners)
    return [r6(min(u0, u1)), r6(min(v0, v1)), r6(max(u0, u1)), r6(max(v0, v1))]


def carry_rect(rect, from_box: dict, to_box: dict):
    """Rect of a picture with world box ``to_box`` where the picture with ``from_box`` sits at ``rect``."""
    x0, y0, x1, y1 = rect
    out = []
    for u, v in ((0.0, 0.0), (1.0, 1.0)):
        wx, wy = ui_to_world(to_box, u, v)
        fu, fv = world_to_ui(from_box, wx, wy)
        out.append((x0 + fu * (x1 - x0), y0 + fv * (y1 - y0)))
    (a, b), (c, d) = out
    return [r6(min(a, c)), r6(min(b, d)), r6(max(a, c)), r6(max(b, d))]


def fit_axes(pairs):
    """Least-squares x' = a x + b, y' = c y + d from [(rect, rect')] -> (transform, rms)."""
    def fit(points):
        n = len(points)
        sx = sum(p for p, _ in points)
        sy = sum(q for _, q in points)
        sxx = sum(p * p for p, _ in points)
        sxy = sum(p * q for p, q in points)
        den = n * sxx - sx * sx
        a = (n * sxy - sx * sy) / den if den else 1.0
        b = (sy - a * sx) / n
        return a, b

    xs = [(r[i], s[i]) for r, s in pairs for i in (0, 2)]
    ys = [(r[i], s[i]) for r, s in pairs for i in (1, 3)]
    (a, b), (c, d) = fit(xs), fit(ys)
    err = [((a * p + b) - q) ** 2 for p, q in xs] + [((c * p + d) - q) ** 2 for p, q in ys]
    rms = (sum(err) / len(err)) ** 0.5

    def apply(rect):
        return [r6(a * rect[0] + b), r6(c * rect[1] + d), r6(a * rect[2] + b), r6(c * rect[3] + d)]

    return apply, rms


def _render_era_art(job):
    """Worker: stitch one era art, write its tiles; returns key, meta (with digest)."""
    key, spec, refs, out_dir, quality, refs_ru, ru_dir = job
    image = stitch(refs, spec)
    meta = write_pyramid(image, Path(out_dir), quality=quality)
    meta["digest"] = image_digest(image)
    if refs_ru:
        # the ruRU client paints the names on this picture in Russian
        ru = stitch(refs_ru, spec)
        if image_digest(ru) != meta["digest"]:
            meta["ru"] = write_localized_pyramid(ru, Path(ru_dir), Path(out_dir), quality=quality)["bytes"]
    return key, meta


class Client:
    """One client's tables, geometry and map ids (era client id <-> retail id)."""

    def __init__(self, product: str, work: Path):
        self.product = product
        self.source = GameTables(product, work, CLIENTS.get(product, {}).get("region", "us"))
        self.version = self.source.version
        self.tables = self.source.load(GAME_TABLES)
        self.geometry = Geometry(self.tables["UiMapAssignment"], self.tables["UiMapLink"])
        self.art_maps = defaultdict(list)
        for row in self.tables["UiMapXMapArt"].values():
            self.art_maps[row["UiMapID"]].append(row)
        self.specs = art_specs(self.tables)

    def expansion(self, ui_map: int) -> int:
        own = self.geometry.primary(ui_map)
        return int((self.tables["Map"].get(own["MapID"]) or {}).get("ExpansionID") or 0) if own else 0

    def phase_art(self, ui_map: int, phase: int) -> int:
        return next(r["UiMapArtID"] for r in self.art_maps[ui_map] if r["PhaseID"] == phase)


class EraBuilder:
    def __init__(self, args):
        self.args = args
        self.work = args.work
        self.retail_maps = {m["id"]: m for m in json.loads((DATA_DIR / "maps.json").read_text())}
        self.retail_pois = json.loads((DATA_DIR / "pois.json").read_text())
        self.manifest = json.loads((DATA_DIR / "art-manifest.json").read_text())
        db = CatalogDB(args.work / "db")
        build_id, _ = db.latest_retail_build()
        self.retail_geometry = Geometry(db.table("UiMapAssignment", build_id), db.table("UiMapLink", build_id))
        self.maps_db = db.table("Map", build_id)
        self.areas_db = db.table("AreaTable", build_id)
        self.journal_en = db.table("JournalInstance", build_id)
        self.journal_ru = db.table("JournalInstance", build_id, "ru_RU")
        self.retail_digest = {int(k): v.get("digest") for k, v in self.manifest.get("retail", {}).items()}
        self.clients: dict[str, Client] = {}
        self.published: dict[tuple[str, str], tuple[dict, str | None]] = {}  # (key, digest) -> (art, mask)
        self.era_manifest: dict[str, dict] = {}
        self.retail_by_key = defaultdict(list)
        for map_id, node in self.retail_maps.items():
            own = self.retail_geometry.primary(map_id)
            if own:
                self.retail_by_key[(own["MapID"], own["AreaID"], TYPE_IDS[node["type"]])].append(map_id)
        self.trees: dict[str, dict] = {}
        self.client_trees: dict[str, dict] = {}
        self.client_pois: dict[str, list] = {}
        self.notes: dict[str, dict] = {}

    def ensure_client(self, product: str) -> dict:
        if product not in self.client_trees:
            self.client_tree(next(e for e in ERAS if e["kind"] == "client" and e["product"] == product))
        return self.client_trees[product]

    def client(self, product: str) -> Client:
        if product not in self.clients:
            self.clients[product] = Client(product, self.work)
        return self.clients[product]

    # -- helpers ----------------------------------------------------------
    def retail_owner(self, map_id: int) -> int | None:
        node = self.retail_maps.get(map_id)
        return int(node["art"]["url"].split("/")[3]) if node and node["art"] and "/era/" not in node["art"]["url"] else None

    def retail_expansion(self, map_id: int) -> int:
        own = self.retail_geometry.primary(map_id)
        return int((self.maps_db.get(own["MapID"]) or {}).get("ExpansionID") or 0) if own else 0

    def render_and_publish(self, era_id: str, items: list[dict]) -> None:
        """items: {key, spec, refs, rect, parent, areas, retailKey?} -> sets item["art"], item["mask"].

        A picture equal to the current one reuses the current tiles and mask; a
        picture already published for this key by another era reuses that one.
        """
        if not items:
            return
        for folder in (TILES_DIR / "era" / era_id / "ru", ):
            folder.mkdir(parents=True, exist_ok=True)
        work = [(it["key"], it["spec"], it["refs"], str(TILES_DIR / "era" / era_id / str(it["key"])), self.args.quality,
                 it.get("refsRu"), str(TILES_DIR / "era" / era_id / "ru" / str(it["key"]))) for it in items]
        from concurrent.futures import ProcessPoolExecutor, as_completed

        results, failures = {}, {}

        with ProcessPoolExecutor(max_workers=self.args.workers) as pool:
            futures = {pool.submit(_render_era_art, job): job[0] for job in work}
            for future in as_completed(futures):
                try:
                    key, meta = future.result()
                    results[key] = meta
                except Exception as error:  # noqa: BLE001
                    failures[futures[future]] = str(error)
        for key, error in failures.items():
            print(f"  {era_id} {key}: {error}")
        fresh = []
        for it in items:
            meta = results.get(it["key"])
            it["art"], it["mask"] = None, None
            if not meta:
                continue
            folder = TILES_DIR / "era" / era_id / str(it["key"])
            ru_folder = TILES_DIR / "era" / era_id / "ru" / str(it["key"])
            retail_key = it.get("retailKey")
            owner = self.retail_owner(retail_key) if isinstance(retail_key, int) else None
            if owner and self.retail_digest.get(owner) == meta["digest"]:
                shutil.rmtree(folder, ignore_errors=True)
                shutil.rmtree(ru_folder, ignore_errors=True)
                retail = self.retail_maps[retail_key]
                it["art"], it["mask"] = retail["art"], retail.get("mask")
                continue
            previous = self.published.get((str(it["key"]), meta["digest"]))
            if previous:
                shutil.rmtree(folder, ignore_errors=True)
                shutil.rmtree(ru_folder, ignore_errors=True)
                it["art"], it["mask"] = previous
                continue
            it["art"] = {
                "width": meta["width"], "height": meta["height"], "tileSize": 256, "maxZoom": meta["maxZoom"],
                "url": f"{TILES_URL}/era/{era_id}/{it['key']}/{{z}}/{{x}}_{{y}}.webp",
            }
            if meta.get("ru") is not None:
                it["art"]["urlRu"] = f"{TILES_URL}/era/{era_id}/ru/{it['key']}/{{z}}/{{x}}_{{y}}.webp"
            it["_meta"] = meta
            fresh.append(it)
        # masks of the new pictures (they may borrow overlays of each other)
        entries = {it["key"]: {"spec": it["spec"], "rect": it["rect"], "parent": it["parent"], "areas": it["areas"]} for it in items if it.get("art")}
        refs = {}
        for it in items:
            refs.update(it["refs"])
        fresh_keys = {it["key"] for it in fresh}
        if fresh_keys:
            masks = tree_masks(entries, refs, self.args.workers)
            for it in fresh:
                if not it["rect"]:
                    continue
                image, method = masks[it["key"]]
                path = MASKS_DIR / "era" / era_id / f"{it['key']}.webp"
                size = save_mask(image, path)
                it["mask"] = f"{MASKS_URL}/era/{era_id}/{it['key']}.webp"
                it["_meta"]["mask"] = {"method": method, "bytes": size}
        for it in fresh:
            self.published[(str(it["key"]), it["_meta"]["digest"])] = (it["art"], it["mask"])
            self.era_manifest.setdefault(era_id, {})[str(it["key"])] = {
                k: it["_meta"][k] for k in ("width", "height", "maxZoom", "bytes", "tiles", "digest", "mask", "ru") if k in it["_meta"]
            }

    # -- trees ----------------------------------------------------------------
    def client_tree(self, era: dict) -> dict:
        """Nodes of one client, keyed by retail id (or "<era>-<id>" for maps of that client only)."""
        import pickle

        cache = self.work / f"era-tree-{era['id']}.pkl"
        if self.args.resume and cache.exists():
            saved = pickle.loads(cache.read_bytes())
            self.client_trees[era["product"]] = saved["tree"]
            self.client_pois[era["product"]] = saved["pois"]
            self.published.update(saved["published"])
            self.era_manifest.update(saved["manifest"])
            print(f"{era['id']}: from {cache.name}")
            return saved["tree"]
        tree = self._client_tree(era)
        cache.write_bytes(pickle.dumps({
            "tree": tree, "pois": self.client_pois[era["product"]],
            "published": {k: v for k, v in self.published.items() if f"/era/{era['id']}/" in v[0]["url"]},
            "manifest": {era["id"]: self.era_manifest.get(era["id"], {})},
        }))
        return tree

    def _client_tree(self, era: dict) -> dict:
        started = time.time()
        client = self.client(era["product"])
        tables, geometry = client.tables, client.geometry
        root = COSMIC if COSMIC in tables["UiMap"] else AZEROTH
        nodes = build_hierarchy(tables["UiMap"], tables["UiMap@ru"], geometry, client.art_maps, root)
        # the open world only: no instance floors, nothing without a place on its parent
        # (older clients file Dalaran under instance maps: keep the hub cities)
        nodes = {m: n for m, n in nodes.items() if (n["type"] != "dungeon" or m in CITIES) and (m == root or n["rectInParent"])}
        changed = True
        while changed:
            changed = False
            for m in list(nodes):
                if m != root and nodes[m]["parentId"] not in nodes:
                    del nodes[m]
                    changed = True

        def depth(m):
            d = 0
            while nodes[m]["parentId"] in nodes:
                m = nodes[m]["parentId"]
                d += 1
            return d

        # era UiMap -> retail UiMap (same id, or same MapID/AreaID/type of the primary assignment)
        mapping: dict[int, int | str] = {}
        taken = set()
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

        phases = {}
        for retail_id, (product, phase) in (era.get("phases") or {}).items():
            if product == era["product"]:
                inverse = {v: k for k, v in mapping.items()}
                if retail_id in inverse:
                    phases[inverse[retail_id]] = phase
        items = []
        all_fdids = set()
        art_of = {}
        for map_id in nodes:
            art_id = client.phase_art(map_id, phases[map_id]) if map_id in phases else base_art(client.art_maps, map_id)
            if art_id in client.specs:
                art_of[map_id] = art_id
                all_fdids |= client.specs[art_id].fdids()
        refs = client.source.client.resolve(all_fdids)
        for map_id, art_id in art_of.items():
            spec = client.specs[art_id]
            own_refs = {f: refs[f] for f in spec.fdids() if f in refs}
            items.append({
                "key": mapping[map_id], "spec": spec, "refs": own_refs,
                "refsRu": localized_refs(client.source.client, spec, own_refs, LOCALE_RURU),
                "rect": nodes[map_id]["rectInParent"], "parent": mapping.get(nodes[map_id]["parentId"]),
                "areas": [r["AreaID"] for r in geometry.by_map.get(map_id, []) if r["AreaID"]],
                "retailKey": mapping[map_id] if isinstance(mapping[map_id], int) else None,
            })
        print(f"{era['id']}: {client.version}, {len(nodes)} maps, {len(items)} arts")
        self.render_and_publish(era["id"], items)
        drawn = {it["key"]: it for it in items}

        tree = {}
        for map_id in order:
            node = nodes[map_id]
            key = mapping[map_id]
            it = drawn.get(key)
            tree[key] = {
                "id": key, "slug": node["slug"], "name": node["name"], "type": node["type"],
                "parentId": mapping.get(node["parentId"]) if node["parentId"] else None,
                "rectInParent": node["rectInParent"],
                "art": it["art"] if it else None, "mask": it["mask"] if it else None,
                "_box": geometry.primary(map_id), "_exp": client.expansion(map_id), "_client": map_id, "_product": era["product"],
            }

        # the client's own points
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
            poi["id"] = f"{era['product']}-{poi['id']}"
        self.client_trees[era["product"]] = tree
        self.client_pois[era["product"]] = pois
        print(f"  {era['id']}: {time.time() - started:.0f}s")
        return tree

    def retail_tree(self) -> dict:
        tree = {}
        for map_id, node in self.retail_maps.items():
            tree[map_id] = {
                "id": map_id, "slug": node["slug"], "name": node["name"], "type": node["type"],
                "parentId": node["parentId"], "rectInParent": node["rectInParent"],
                "art": node["art"], "mask": node.get("mask"),
                "_box": self.retail_geometry.primary(map_id), "_exp": self.retail_expansion(map_id), "_client": map_id, "_product": "wow",
            }
        return tree

    def phase_arts(self, era_id: str, tree: dict, phases: dict) -> None:
        """Replace the art of phased maps: {retail id: (product, PhaseID)}."""
        items = []
        for retail_id, (product, phase) in phases.items():
            node = tree.get(retail_id)
            if node is None:
                continue
            client = self.client(product)
            client_id = retail_id
            if client.tables["UiMap"].get(client_id, {}).get("Name_lang") != self.retail_maps[retail_id]["name"]["en"]:
                raise SystemExit(f"{era_id}: {product} map {client_id} is not the retail map {retail_id}")
            spec = client.specs[client.phase_art(client_id, phase)]
            refs = client.source.client.resolve(spec.fdids())
            items.append({
                "key": retail_id, "spec": spec, "refs": refs, "refsRu": localized_refs(client.source.client, spec, refs, LOCALE_RURU),
                "rect": node["rectInParent"], "parent": node["parentId"],
                "areas": [r["AreaID"] for r in client.geometry.by_map.get(client_id, []) if r["AreaID"]], "retailKey": retail_id,
            })
        self.render_and_publish(era_id, items)
        for it in items:
            if it["art"]:
                tree[it["key"]]["art"], tree[it["key"]]["mask"] = it["art"], it["mask"]

    @staticmethod
    def subtree(tree: dict, root) -> set:
        keys = {root}
        changed = True
        while changed:
            changed = False
            for k, n in tree.items():
                if k not in keys and n["parentId"] in keys:
                    keys.add(k)
                    changed = True
        return keys & set(tree)

    @staticmethod
    def prune(tree: dict, roots: set) -> None:
        """Drop nodes whose parent is gone (tops listed in ``roots`` stay)."""
        changed = True
        while changed:
            changed = False
            for k in list(tree):
                n = tree[k]
                if k not in roots and n["parentId"] is not None and n["parentId"] not in tree:
                    del tree[k]
                    changed = True

    def repaint(self, tree: dict, key: int, source: dict, how: str, fallback_pairs=None) -> dict:
        """Give ``key`` the art of ``source`` (a node of another client) and re-place its children.

        Children on a MapID the source client places on that map get their rect
        from the source's assignment rows (world coordinates); the others through
        a per-axis fit of the old rects onto the new ones.
        """
        node = tree[key]
        old_parent_art = node["art"]
        node["art"], node["mask"] = source["art"], source.get("mask")
        client = self.client(source["_product"])
        rows = client.geometry.by_map.get(source["_client"], [])
        links = {(l["ParentUiMapID"], l["ChildUiMapID"]): l for l in client.tables["UiMapLink"].values()}
        children = [k for k, n in tree.items() if n["parentId"] == key and n["rectInParent"]]
        placed, pairs, report = {}, [], {}
        for child in children:
            cnode = tree[child]
            rect = None
            # same map in the source client: its own link / rect (for links) or world box
            src_child = (self.client_trees.get(source["_product"]) or {}).get(child)
            if src_child and src_child["parentId"] == key and src_child["art"] and cnode["art"] and src_child["art"]["url"] == cnode["art"]["url"]:
                rect, why = src_child["rectInParent"], "source"
            elif (src_child and src_child["parentId"] == key and src_child["rectInParent"] and src_child["_box"] and cnode["_box"]
                  and src_child["_box"]["MapID"] == cnode["_box"]["MapID"]):
                # another picture of the same continent: through the source's own rect and both world boxes
                rect, why = carry_rect(src_child["rectInParent"], src_child["_box"], cnode["_box"]), "via"
            elif cnode["_box"]:
                rect, why = rect_from_rows(rows, cnode["_box"]), "world"
            if rect is None and src_child and src_child["parentId"] == key and (source["_client"], src_child["_client"]) in links:
                link = links[(source["_client"], src_child["_client"])]
                rect, why = [link["UiMin"][0], link["UiMin"][1], link["UiMax"][0], link["UiMax"][1]], "link"
            if rect is not None:
                placed[child] = rect
                pairs.append((cnode["rectInParent"], rect))
                report[child] = why
        if fallback_pairs:
            pairs = fallback_pairs + pairs
        apply, rms = fit_axes(pairs) if len(pairs) >= 2 else (None, None)
        for child in children:
            if child in placed:
                tree[child]["rectInParent"] = placed[child]
            elif apply:
                tree[child]["rectInParent"] = apply(tree[child]["rectInParent"])
                report[child] = "fit"
            else:
                tree[child]["rectInParent"] = None
                report[child] = "none"
        note = {"art": f"{source['_product']} {client.version}", "how": how, "children": {str(k): v for k, v in report.items()}}
        if rms is not None:
            note["fitRms"] = round(rms, 4)
        if old_parent_art and old_parent_art.get("url") == node["art"].get("url"):
            note["same"] = True
        return note

    # -- eras -------------------------------------------------------------------
    def build_era(self, era: dict) -> dict:
        kind = era["kind"]
        notes = {}
        if kind == "client":
            tree = copy.deepcopy(self.client_trees.get(era["product"]) or self.client_tree(era))
            pois = list(self.client_pois[era["product"]])
            source = {"product": era["product"], "build": self.client(era["product"]).version}
        elif kind == "cataclysm":
            self.ensure_client("wow_classic")
            # Mists of Pandaria Classic without everything of Mists (ExpansionID 4)
            tree = {k: copy.deepcopy(n) for k, n in self.client_trees["wow_classic"].items() if n["_exp"] <= 3}
            self.prune(tree, {COSMIC})
            wrath = self.client_trees["wow_classic_titan"]
            notes[str(AZEROTH)] = self.repaint(tree, AZEROTH, wrath[AZEROTH], "nearest older picture: the 5.5 Azeroth paints Pandaria")
            pois = [p for p in self.client_pois["wow_classic"]]
            source = {"product": "wow_classic", "build": self.client("wow_classic").version}
        elif kind == "pre-retail":
            tree = {k: copy.deepcopy(n) for k, n in self.client_trees["wow_classic"].items()}
            pois = [p for p in self.client_pois["wow_classic"]]
            retail = self.retail_tree()
            grafts = [DRAENOR] + ([BROKEN_ISLES, ARGUS] if era["maxExpansion"] >= 6 else [])
            for root in grafts:
                keys = {k for k in self.subtree(retail, root) if retail[k]["_exp"] <= era["maxExpansion"]}
                for k in keys:
                    tree[k] = copy.deepcopy(retail[k])
                pois += [p for p in self.retail_pois if p["mapId"] in keys]
                if root == BROKEN_ISLES:
                    # on the 5.5 Azeroth picture, placed by the fit of the continents both share
                    shared = [(retail[c]["rectInParent"], tree[c]["rectInParent"]) for c in (12, 13, 113, 424)
                              if c in tree and tree[c]["parentId"] == AZEROTH and retail[c]["rectInParent"] and tree[c]["rectInParent"]]
                    apply, rms = fit_axes(shared)
                    tree[root]["parentId"] = AZEROTH
                    tree[root]["rectInParent"] = apply(retail[root]["rectInParent"])
                    notes[str(root)] = {"how": "continent fit on the 5.5 Azeroth picture", "fitRms": round(rms, 4)}
                else:
                    # no picture of the time shows this world on the Cosmic map: its own world
                    tree[root]["parentId"] = None
                    tree[root]["rectInParent"] = None
            self.prune(tree, {COSMIC, *grafts})
            source = {"product": "wow_classic", "build": self.client("wow_classic").version}
        else:  # retail
            tree = self.retail_tree()
            max_exp = era["maxExpansion"]
            for k in list(tree):
                if tree[k]["type"] not in ("cosmic", "world") and tree[k]["_exp"] > max_exp:
                    del tree[k]
            if max_exp < 11:
                for k in self.subtree(tree, QUEL_THALAS_MIDNIGHT):
                    del tree[k]
            self.prune(tree, {COSMIC})
            if era.get("azeroth"):
                mop = self.client_trees[era["azeroth"]]
                notes[str(AZEROTH)] = self.repaint(tree, AZEROTH, mop[AZEROTH], "nearest older picture: the current Azeroth paints later continents")
            if era.get("cosmic"):
                mop = self.client_trees[era["cosmic"]]
                note = self.repaint(tree, COSMIC, mop[COSMIC], "nearest older picture: the current Cosmic map paints the Shadowlands")
                for child, why in list(note["children"].items()):
                    if why in ("fit", "none"):
                        # a world the older picture has no place for: its own world
                        k = int(child) if child.isdigit() else child
                        tree[k]["parentId"], tree[k]["rectInParent"] = None, None
                        note["children"][child] = "own world"
                notes[str(COSMIC)] = note
            pois = [p for p in self.retail_pois if p["mapId"] in tree]
            source = {"product": "wow", "build": self.manifest["sources"]["art"]["build"]}
        if era.get("phases") and kind != "client":
            self.phase_arts(era["id"], tree, {k: v for k, v in era["phases"].items() if k in tree})
        self.trees[era["id"]] = tree
        root = COSMIC if COSMIC in tree else AZEROTH
        out = {
            "id": era["id"], "name": era["name"], "expansion": era["expansion"], "patchRange": era["patchRange"],
            "source": source, "rootMapId": root,
        }
        if notes:
            out["substitutes"] = notes
        out["maps"] = self.serialize(tree)
        if era["id"] != "midnight":
            out["pois"] = self.era_pois(era["id"], tree, pois, era["maxExpansion"])
        changed = sum(1 for v in out["maps"].values() if v != "unchanged" and not v.get("absent"))
        absent = sum(1 for v in out["maps"].values() if v != "unchanged" and v.get("absent"))
        print(f"  {era['id']}: {len(tree)} maps ({changed} own, {absent} absent), {len(out.get('pois', []))} points")
        return out

    def serialize(self, tree: dict) -> dict:
        children = defaultdict(list)
        for k, n in tree.items():
            if n["parentId"] is not None:
                children[n["parentId"]].append(k)
        order = {"cosmic": 0, "world": 1, "continent": 2, "zone": 3, "orphan": 4, "micro": 5, "dungeon": 6}
        out = {}
        for k in sorted(tree, key=lambda k: (isinstance(k, str), str(k) if isinstance(k, str) else k)):
            n = tree[k]
            kids = sorted(children[k], key=lambda c: (order[tree[c]["type"]], tree[c]["name"]["en"], str(c)))
            retail = self.retail_maps.get(k) if isinstance(k, int) else None
            if retail is not None:
                retail_kids = [c for c in retail["children"]]
                same = (
                    (n["art"] or {}).get("url") == (retail["art"] or {}).get("url")
                    and n.get("mask") == retail.get("mask")
                    and n["parentId"] == retail["parentId"]
                    and same_rect(n["rectInParent"], retail["rectInParent"])
                    and sorted(map(str, kids)) == sorted(map(str, retail_kids))
                )
                if same:
                    out[str(k)] = "unchanged"
                    continue
                o = {"art": n["art"], "rectInParent": n["rectInParent"], "parentId": n["parentId"], "children": kids}
                if n.get("mask"):
                    o["mask"] = n["mask"]
                if n["name"]["en"] != retail["name"]["en"] or n["name"]["ru"] != retail["name"]["ru"]:
                    o["name"] = n["name"]
                out[str(k)] = o
            else:
                o = {"id": k, "slug": n["slug"], "type": n["type"], "name": n["name"], "parentId": n["parentId"],
                     "children": kids, "rectInParent": n["rectInParent"], "art": n["art"]}
                if n.get("mask"):
                    o["mask"] = n["mask"]
                out[str(k)] = o
        for k, retail in self.retail_maps.items():
            if k not in tree and retail["art"]:
                out[str(k)] = {"absent": True, "art": None}
        return out

    def poi_expansion(self, poi: dict) -> int | None:
        """Expansion a point belongs to: an instance's MapID, a portal's destination map."""
        if poi.get("journalInstanceId"):
            instance = self.journal_en.get(poi["journalInstanceId"]) or {}
            exp = (self.maps_db.get(instance.get("MapID")) or {}).get("ExpansionID")
            return int(exp) if exp is not None else None
        if poi["kind"] == "portal":
            # "Portal to Dalaran", "Portal to Paw'don Village, Jade Forest": the place or its zone
            dest = re.sub(r"^portal to (the )?", "", poi["name"]["en"], flags=re.I).strip().lower()
            wanted = {dest, dest.split(",")[-1].strip().removeprefix("the ")}
            found = [self.retail_expansion(m) for m, n in self.retail_maps.items()
                     if n["type"] in ("continent", "zone", "world") and n["name"]["en"].lower().removeprefix("the ") in wanted]
            return min(found) if found else None
        return None

    def era_pois(self, era_id: str, tree: dict, pois: list, max_expansion: int) -> list:
        """Points of the era: its sources' points on its maps (none of later content), labels and
        cities re-derived from its rects."""
        kept = []
        for p in pois:
            if p["mapId"] not in tree or p["kind"] in ("zone-label", "capital", "city"):
                continue
            if p.get("targetMapId") is not None and p["targetMapId"] not in tree:
                continue
            exp = self.poi_expansion(p)
            if exp is not None and exp > max_expansion:
                continue  # a portal to / an entrance of a later expansion
            q = dict(p)
            if exp is not None:
                q["expansion"] = exp
            kept.append(q)
        for p in kept:
            if not p["id"].startswith(era_id):
                p["id"] = f"{era_id}-{p['id']}"
        for k, n in tree.items():
            parent = tree.get(n["parentId"])
            if not parent or not parent["art"] or not n["rectInParent"] or not n["art"]:
                continue
            x0, y0, x1, y1 = n["rectInParent"]
            x, y = (x0 + x1) / 2, (y0 + y1) / 2
            if not (0 <= x <= 1 and 0 <= y <= 1):
                continue
            city = CITIES.get(k) if isinstance(k, int) else None
            if city:
                kept.append({"id": f"{era_id}-city-{k}", "mapId": n["parentId"], "kind": city[0], "name": n["name"], "x": r6(x), "y": r6(y), "faction": city[1], "targetMapId": k})
            elif n["type"] in ("world", "continent", "zone"):
                kept.append({"id": f"{era_id}-label-{k}", "mapId": n["parentId"], "kind": "zone-label", "name": n["name"], "x": r6(x), "y": r6(y), "targetMapId": k})
        kept.sort(key=lambda p: (str(p["mapId"]), p["kind"], p["id"]))
        return kept

    def variant(self, era: dict) -> dict:
        parent = self.trees[era["inherits"]]
        tree = {k: copy.deepcopy(parent[k]) for k in era["phases"] if k in parent}
        self.phase_arts(era["id"], tree, era["phases"])
        maps = {}
        for k, n in tree.items():
            o = {"art": n["art"]}
            if n.get("mask"):
                o["mask"] = n["mask"]
            maps[str(k)] = o
        product = next(iter(era["phases"].values()))[0]
        return {
            "id": era["id"], "name": era["name"], "expansion": era["expansion"], "patchRange": era["patchRange"],
            "source": {"product": product, "build": self.client(product).version if product != "wow" else self.manifest["sources"]["art"]["build"]},
            "rootMapId": COSMIC, "inherits": era["inherits"], "maps": maps,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--resume", action="store_true", help="reuse the client trees of the last run (work/era-tree-*.pkl and their tiles)")
    args = parser.parse_args()
    if not args.resume:
        for folder in (TILES_DIR / "era", MASKS_DIR / "era"):
            shutil.rmtree(folder, ignore_errors=True)
    builder = EraBuilder(args)
    out = []
    for era in ERAS:
        out.append(builder.build_era(era))
    for era in VARIANTS:
        out.append(builder.variant(era))
    write_json(DATA_DIR / "eras.json", out)
    manifest_path = DATA_DIR / "art-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["eras"] = builder.era_manifest
    manifest["eraSources"] = {era["id"]: era["source"] for era in out}
    write_json(manifest_path, manifest)
    size = sum(f.stat().st_size for f in (TILES_DIR / "era").rglob("*.webp")) if (TILES_DIR / "era").exists() else 0
    masks = sum(f.stat().st_size for f in (MASKS_DIR / "era").rglob("*.webp")) if (MASKS_DIR / "era").exists() else 0
    print(f"eras {len(out)}, era tiles {size / 1e6:.1f} MB, era masks {masks / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
