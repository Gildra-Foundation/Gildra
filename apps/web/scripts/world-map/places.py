#!/usr/bin/env python3
"""Maps that show the same place: one per place is drawn.

The client keeps several UiMaps for one place:
  * floors — the levels of a cave, a city or a ship (same name, same parent,
    their rects cover each other): the lowest id is the place, the others are
    its floors;
  * phases — a temporary state with its own map (the Assault on Uldum and on
    the Vale of Eternal Blossoms in 8.3): drawn only inside its patch range;
  * successors — a rebuilt place with its own map (Midnight's Eversong Woods,
    Silvermoon City and Isle of Quel'Danas; Quel'Thalas over the Ghostlands): the
    old map up to 11.2.7, the new one from 12.0.0;
  * alternates — another state or level of one place with its own map, about the
    same size and covering it (Azj-Kahet's lower level, the Emerald Dream over
    Ohn'ahran Plains): not drawn by default;
  * aggregates — a map covering two or more of its siblings (Stranglethorn Vale
    over Northern Stranglethorn and the Cape): its parts are drawn, it is not.

Writes on maps.json nodes ``samePlaceAs`` (the place's main map id),
``placeRole`` ("floor" | "phase" | "successor" | "predecessor" | "alternate" |
"aggregate", with ``parts``) and, where the
place changes with time, ``activeFrom`` / ``activeTo`` (patches); on each
eras.json era ``inactive`` — the ids of its maps that are not drawn by default
in that era (another map of the same place is).

Usage: python places.py   (after build_world_map.py / eras.py / refine_masks.py)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_world_map import DATA_DIR, write_json  # noqa: E402

# one place, a map per period: (old id, new id, the new map's first patch, its last or None, role of the new one)
TIMED = [
    (249, 1527, "8.3.0", "8.3.7", "phase"),      # Uldum — Assault of N'Zoth
    (390, 1530, "8.3.0", "8.3.7", "phase"),      # Vale of Eternal Blossoms — Assault of N'Zoth
    (94, 2395, "12.0.0", None, "successor"),     # Eversong Woods (Midnight)
    (110, 2393, "12.0.0", None, "successor"),    # Silvermoon City (Midnight)
    (122, 2424, "12.0.0", None, "successor"),    # Isle of Quel'Danas (Midnight)
    (95, 2537, "12.0.0", None, "successor"),     # Ghostlands -> Quel'Thalas of Midnight
]


def patch_key(patch: str) -> tuple:
    return tuple(int(p) for p in patch.split("."))


def rect_in(maps: dict, key, ancestor):
    x0, y0, x1, y1 = 0.0, 0.0, 1.0, 1.0
    chain, cursor = [], key
    while cursor != ancestor:
        node = maps.get(cursor)
        if not node or not node.get("rectInParent") or node.get("parentId") is None:
            return None
        chain.append(node["rectInParent"])
        cursor = node["parentId"]
    for r in reversed(chain):
        w, h = x1 - x0, y1 - y0
        x0, y0, x1, y1 = x0 + r[0] * w, y0 + r[1] * h, x0 + r[2] * w, y0 + r[3] * h
    return x0, y0, x1, y1


def cover(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    small = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return ix * iy / small if small > 0 else 0.0


def floors(maps: dict) -> dict:
    """{floor id: main id} — same-named maps under one parent whose rects cover each other."""
    by_place: dict = {}
    for key, node in maps.items():
        if node.get("art") and node.get("rectInParent") and node["type"] in ("zone", "micro", "orphan", "dungeon"):
            by_place.setdefault((node["parentId"], node["name"]["en"]), []).append(key)
    out = {}
    for keys in by_place.values():
        keys.sort()
        for key in keys[1:]:
            main = next((m for m in keys if m < key and cover(maps[m]["rectInParent"], maps[key]["rectInParent"]) > 0.5), None)
            if main is not None:
                out[key] = out.get(main, main)
    # a same-named child sitting on its parent (Orgrimmar's Cleft of Shadow floor 86 on 85)
    for key, node in maps.items():
        parent = maps.get(node.get("parentId"))
        if (key not in out and parent and node.get("art") and node.get("rectInParent") and node["type"] in ("micro", "orphan")
                and parent["name"]["en"] == node["name"]["en"] and cover(node["rectInParent"], [0, 0, 1, 1]) > 0.5):
            out[key] = node["parentId"]
    return out


def overlaps(maps: dict, taken: set):
    """Siblings that are one place drawn twice, judged by their masks (their land).

    alternate: the land of one map lies (> 90 %) in the land of a sibling of a
    — another state or level of one place
    (Azj-Kahet and its lower level, the Emerald Dream over Ohn'ahran Plains, the
    second Maw); the lower id is the place.
    aggregate: a map whose land holds the land (> 70 %) of two or more smaller
    siblings — the whole of which they are the parts (Stranglethorn Vale over its
    north and cape); the parts are drawn, the aggregate is not.
    """
    from build_world_map import CITIES
    from neighbours import claims, load, pairs_of

    cache: dict = {}
    alternates, contains = {}, {}
    for ka, kb in pairs_of(maps):
        if ka in taken or kb in taken or ka in CITIES or kb in CITIES:
            continue
        a, b = maps[ka], maps[kb]
        ma, mb = load(a["mask"], cache), load(b["mask"], cache)
        if ma is None or mb is None:
            continue
        _, _, ca, cb = claims(ma, a["rectInParent"], mb, b["rectInParent"])
        la, lb = float((ca > 0.5).sum()), float((cb > 0.5).sum())
        both = float(((ca > 0.5) & (cb > 0.5)).sum())
        if not la or not lb:
            continue
        small, large = (ka, kb) if la <= lb else (kb, ka)
        share = both / min(la, lb)
        if share > 0.9:
            main, other = sorted((ka, kb))
            alternates[other] = alternates.get(main, main)
        elif share > 0.7:
            contains.setdefault(large, []).append(small)
    aggregates = {k: sorted(v) for k, v in contains.items() if len(v) >= 2 and k not in alternates}
    return alternates, aggregates


def main() -> None:
    maps_list = json.loads((DATA_DIR / "maps.json").read_text())
    eras = json.loads((DATA_DIR / "eras.json").read_text())
    maps = {m["id"]: m for m in maps_list}
    for node in maps_list:
        for field in ("samePlaceAs", "placeRole", "activeFrom", "activeTo", "parts"):
            node.pop(field, None)
    floor_of = floors(maps)
    for key, main in floor_of.items():
        maps[key]["samePlaceAs"], maps[key]["placeRole"] = main, "floor"
    alternates, aggregates = overlaps(maps, set(floor_of) | {k for t in TIMED for k in t[:2]})
    for key, main in alternates.items():
        maps[key]["samePlaceAs"], maps[key]["placeRole"] = main, "alternate"
    for key, parts in aggregates.items():
        maps[key]["placeRole"], maps[key]["parts"] = "aggregate", parts
    for old, new, start, end, role in TIMED:
        if old not in maps or new not in maps:
            continue
        maps[new].update({"samePlaceAs": old, "placeRole": role, "activeFrom": start, **({"activeTo": end} if end else {})})
        if role == "successor":
            maps[old].update({"samePlaceAs": new, "placeRole": "predecessor", "activeTo": "11.2.7"})
    # per era: maps of a place that another map of that place stands for at the era's start
    from composite import resolve_era

    for era in eras:
        start = patch_key(era["patchRange"][0])
        inactive = []
        if not era.get("inherits"):
            # the era's own tree can hold its own duplicates (older clients' aggregates)
            tree = resolve_era(eras, maps, era["id"])
            era_alternates, era_aggregates = overlaps(tree, {k for k in tree if isinstance(k, int) and maps.get(k, {}).get("placeRole")})
            inactive += [k for k in list(era_alternates) + list(era_aggregates) if isinstance(k, int)]
        for key in era["maps"]:
            if not key.isdigit():
                continue
            node = maps.get(int(key))
            value = era["maps"][key]
            if not node or (isinstance(value, dict) and value.get("absent")):
                continue
            role = node.get("placeRole")
            if role in ("floor", "alternate", "aggregate"):
                inactive.append(int(key))
            elif role in ("phase", "successor", "predecessor"):
                lo = patch_key(node.get("activeFrom", "0.0.0"))
                hi = patch_key(node.get("activeTo", "99.0.0"))
                if not lo <= start <= hi:
                    inactive.append(int(key))
        if inactive:
            era["inactive"] = sorted(set(inactive))
        else:
            era.pop("inactive", None)
    write_json(DATA_DIR / "maps.json", maps_list)
    write_json(DATA_DIR / "eras.json", eras)
    roles: dict = {}
    for node in maps_list:
        if node.get("placeRole"):
            roles[node["placeRole"]] = roles.get(node["placeRole"], 0) + 1
    print(f"same-place maps: {roles}; eras with inactive maps: {sum(1 for e in eras if e.get('inactive'))}")


if __name__ == "__main__":
    main()
