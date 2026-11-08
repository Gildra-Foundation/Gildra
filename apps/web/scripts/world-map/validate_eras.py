#!/usr/bin/env python3
"""Checks eras.json against the history of the world, and renders composites.

For every era (resolved like the viewer resolves it):
  (a) every child's rect sits plausibly on its parent's art (mostly inside it,
      not larger than it);
  (b) no map newer than the era: landmark maps are absent before their
      expansion and present from it on, every retail map's expansion is at most
      the era's, and the Azeroth and Cosmic pictures come from that era or an
      older one;
  (c) in the old world (classic … wrath) the capitals sit inside their zones:
      the city's centre lies within the zone's rect, on or by its land (mask) and the
      city's flight master lies inside the city's rect;
  (d) masks exist and match the art's aspect ratio;
  (e) the era's points: none on absent maps, no portal to a map of a later
      expansion, no entrance of a later instance;
  (f) every continent/world/Cosmic picture with a ruRU version has its painted words;
  (g) of maps marked as one place (samePlaceAs), at most one is drawn in the era;
  (h) with --overlaps: sibling masks do not claim the same land (> 2 % of the smaller).
Composites (parent + children through their masks) go to --out for a visual check.

Usage: python validate_eras.py [--out /tmp/mapd2] [--no-render]
Exit code 1 when a check fails.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from composite import PUBLIC, load_json, mask_image, render, resolve_era  # noqa: E402

ORDER = ["classic", "burning-crusade", "wrath-of-the-lich-king", "cataclysm", "cataclysm-pandaria", "warlords-of-draenor",
         "legion", "battle-for-azeroth", "shadowlands", "dragonflight", "the-war-within", "midnight"]
EXP_IDS = {e: i for i, e in enumerate(["vanilla", "tbc", "wrath", "cataclysm", "mop", "wod", "legion", "bfa", "shadowlands", "dragonflight", "tww", "midnight"])}
# landmark maps -> first era they exist in
LANDMARKS = {101: "burning-crusade", 113: "wrath-of-the-lich-king", 948: "cataclysm", 424: "cataclysm-pandaria",
             572: "warlords-of-draenor", 619: "legion", 905: "legion", 875: "battle-for-azeroth", 876: "battle-for-azeroth",
             1550: "shadowlands", 1978: "dragonflight", 2274: "the-war-within", 2537: "midnight"}
# Azeroth / Cosmic pictures of the current client: first era they may be shown in
CURRENT_PICTURE = {947: "the-war-within", 946: "shadowlands"}
# capital -> zone it lies in (retail ids; the eras keep them)
CAPITALS = {85: 1, 88: 7, 90: 18, 84: 37, 87: 27}
CAPITAL_FLIGHT = {85: "Orgrimmar", 88: "Thunder Bluff", 90: "Undercity", 84: "Stormwind", 87: "Ironforge"}


def inside_share(rect) -> float:
    x0, y0, x1, y1 = rect
    w, h = max(0.0, min(1, x1) - max(0, x0)), max(0.0, min(1, y1) - max(0, y0))
    return (w * h) / max(1e-12, (x1 - x0) * (y1 - y0))


def overlapping(nodes: dict, inactive: set):
    """Sibling pairs whose masks claim the same land beyond neighbours.LIMIT."""
    from neighbours import LIMIT, claims, is_city, load, overlap_share, pairs_of, same_place

    cache: dict = {}
    out = []
    for ka, kb in pairs_of(nodes):
        a, b = nodes[ka], nodes[kb]
        if ka in inactive or kb in inactive or same_place(ka, a, kb, b) or a.get("parts") or b.get("parts"):
            continue
        ma, mb = load(a["mask"], cache), load(b["mask"], cache)
        if ma is None or mb is None:
            continue
        _, _, ca, cb = claims(ma, a["rectInParent"], mb, b["rectInParent"])
        share = overlap_share(ca, cb)
        if share <= LIMIT:
            continue
        if is_city(ka, a) != is_city(kb, b):
            city, zone = (ca, cb) if is_city(ka, a) else (cb, ca)
            if float(((city > 0.5) & (zone > 0.5)).sum()) / max(1, (city > 0.5).sum()) > 0.6:
                continue  # a city inside its zone
        out.append((ka, kb, share))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=Path("/tmp/mapd2"))
    parser.add_argument("--no-render", action="store_true")
    parser.add_argument("--overlaps", action="store_true", help="also check neighbouring masks (slow)")
    args = parser.parse_args()
    retail = {m["id"]: m for m in load_json("maps.json")}
    eras = load_json("eras.json")
    failures: list[str] = []
    summary = []
    by_id = {e["id"]: e for e in eras}

    for era in eras:
        nodes = resolve_era(eras, retail, era["id"])
        index = ORDER.index(era["id"]) if era["id"] in ORDER else ORDER.index(era["inherits"])
        problems = []
        # (a) rects
        for key, node in nodes.items():
            parent = nodes.get(node.get("parentId"))
            rect = node.get("rectInParent")
            if not rect or not parent or not node.get("art") or not parent.get("art"):
                continue
            share = inside_share(rect)
            w, h = rect[2] - rect[0], rect[3] - rect[1]
            if share < 0.35 or w > 1.6 or h > 1.6 or w <= 0 or h <= 0:
                problems.append(f"rect of {key} on {node['parentId']}: {rect} (inside {share:.2f})")
        # (b) history
        for key, first in LANDMARKS.items():
            present = key in nodes and bool(nodes[key].get("art"))
            should = index >= ORDER.index(first)
            if present != should:
                problems.append(f"map {key} {'present' if present else 'absent'} (exists from {first})")
        for key, first in CURRENT_PICTURE.items():
            node = nodes.get(key)
            if not node or not node.get("art"):
                continue
            url = node["art"]["url"]
            if "/era/" in url:
                source = url.split("/era/")[1].split("/")[0]
                if source in ORDER and ORDER.index(source) > index:
                    problems.append(f"picture of {key} from a later era ({source})")
            elif index < ORDER.index(first):
                problems.append(f"current picture of {key} shown before {first}")
        # (c) capitals in the old world
        if index <= ORDER.index("wrath-of-the-lich-king"):
            pois = era.get("pois") or []
            for city, zone in CAPITALS.items():
                c, z = nodes.get(city), nodes.get(zone)
                if not c or not z or not c.get("rectInParent") or not z.get("rectInParent"):
                    continue
                if c["parentId"] != z["parentId"]:
                    continue
                cx = (c["rectInParent"][0] + c["rectInParent"][2]) / 2
                cy = (c["rectInParent"][1] + c["rectInParent"][3]) / 2
                zx0, zy0, zx1, zy1 = z["rectInParent"]
                u, v = (cx - zx0) / (zx1 - zx0), (cy - zy0) / (zy1 - zy0)
                if not (0 <= u <= 1 and 0 <= v <= 1):
                    problems.append(f"capital {city} outside zone {zone}")
                    continue
                mask = mask_image(z)
                if mask is not None:
                    # on the zone's land or at its edge (old capitals are zones of their own,
                    # so the zone's overlays stop at the city wall)
                    px, py = int(u * mask.width), int(v * mask.height)
                    r = max(2, int(0.08 * mask.width))
                    window = mask.crop((max(0, px - r), max(0, py - r), min(mask.width, px + r), min(mask.height, py + r)))
                    value = window.getextrema()[1]
                    if value < 128:
                        problems.append(f"capital {city} not by the land of zone {zone} (mask {value})")
                flight = [p for p in pois if p["kind"] == "flight" and p["name"]["en"].startswith(CAPITAL_FLIGHT[city]) and p["mapId"] in (city, zone)]
                for p in flight:
                    holder = nodes[p["mapId"]]
                    hx0, hy0, hx1, hy1 = holder["rectInParent"]
                    px, py = hx0 + p["x"] * (hx1 - hx0), hy0 + p["y"] * (hy1 - hy0)
                    x0, y0, x1, y1 = c["rectInParent"]
                    if not (x0 - 0.01 <= px <= x1 + 0.01 and y0 - 0.01 <= py <= y1 + 0.01):
                        problems.append(f"flight master {p['id']} outside capital {city}")
        # (e) points of the era: none on absent maps, none of later content (portals to
        # maps of a later expansion, entrances of later instances)
        era_max = index  # ORDER index == expansion id (vanilla 0 … midnight 11)
        names = {}
        for m in retail.values():
            if m.get("expansion") in EXP_IDS and m["type"] in ("continent", "zone", "world"):
                key = m["name"]["en"].lower().removeprefix("the ")
                names[key] = min(names.get(key, 99), EXP_IDS[m["expansion"]])
        for p in era.get("pois") or []:
            if p["mapId"] not in nodes:
                problems.append(f"point {p['id']} on a map absent in the era")
            if p.get("expansion") is not None and p["expansion"] > era_max:
                problems.append(f"point {p['id']} of a later expansion ({p['expansion']})")
            if p["kind"] == "portal":
                dest = re.sub(r"^portal to (the )?", "", p["name"]["en"], flags=re.I).strip().lower()
                exp = max(names.get(dest, -1), names.get(dest.split(",")[-1].strip().removeprefix("the "), -1))
                if exp > era_max:
                    problems.append(f"portal {p['id']} to a later map ({p['name']['en']})")
        # (f) every continent, world and Cosmic picture knows its painted words
        for key, node in nodes.items():
            if node.get("type") in ("continent", "world", "cosmic") and node.get("art") and node["art"].get("urlRu") and not node["art"].get("paintedLabels"):
                problems.append(f"no painted words on {key}")
        # (g) one map per place: of maps marked as the same place, at most one is drawn
        inactive = set(era.get("inactive") or [])
        if era.get("inherits"):
            inactive |= set(by_id[era["inherits"]].get("inactive") or [])
        groups: dict = {}
        for key, node in nodes.items():
            main = node.get("samePlaceAs")
            if main is not None and node.get("art") and key not in inactive:
                groups.setdefault(main, set()).add(key)
        for main, members in groups.items():
            if main in nodes and nodes[main].get("art") and main not in inactive:
                members = members | {main}
            if len(members) > 1:
                problems.append(f"place {main} drawn {len(members)} times: {sorted(members, key=str)}")
        # (h) neighbours do not claim the same land
        if args.overlaps and not era.get("inherits"):
            for ka, kb, share in overlapping(nodes, inactive):
                problems.append(f"masks of {ka} and {kb} overlap by {share:.0%}")
        # (d) masks
        for key, node in nodes.items():
            if node.get("mask") and node.get("art"):
                path = PUBLIC / node["mask"].lstrip("/")
                if not path.exists():
                    problems.append(f"mask of {key} missing")
                    continue
                m = mask_image(node)
                if abs(m.width / m.height - node["art"]["width"] / node["art"]["height"]) > 0.02:
                    problems.append(f"mask of {key} aspect")
        drawn = sum(1 for n in nodes.values() if n.get("art"))
        masked = sum(1 for n in nodes.values() if n.get("art") and n.get("mask"))
        summary.append(f"{era['id']}: {drawn} maps with art, {masked} masked, {len(problems)} problems")
        failures += [f"{era['id']}: {p}" for p in problems]
        if not args.no_render and not era.get("inherits"):
            out = args.out / "eras"
            out.mkdir(parents=True, exist_ok=True)
            for key, depth in ((era["rootMapId"], 1), (947, 1), (12, 1), (13, 1)):
                if key in nodes and nodes[key].get("art"):
                    image = render(nodes, key, 1600, depth)
                    image.convert("RGB").save(out / f"{index:02d}-{era['id']}-{key}.jpg", quality=86)
    print("\n".join(summary))
    if failures:
        print(f"\n{len(failures)} problems:")
        print("\n".join(failures))
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
