#!/usr/bin/env python3
"""Painted words of continent, world and Cosmic pictures: whose name each one is.

A continent picture paints its own title (the largest lettering: EASTERN
KINGDOMS, NORTHREND) and its zones' names over the zones; a world picture paints
its continents' names; the Cosmic picture its worlds'.  The title belongs to the
map itself (``kind: "title"``); every other word to the child whose rect holds
it and whose centre it is closest to (``kind: "place"``), else to the map.

Run after refine_masks.py (it rewrites ``labelFor``/``kind`` of those
pictures' ``paintedLabels`` in maps.json and eras.json); refine_masks.py uses
``owner`` for these pictures too.

Usage: python labels.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_world_map import DATA_DIR, write_json  # noqa: E402
from composite import resolve_era  # noqa: E402

BIG_TYPES = ("continent", "world", "cosmic")


def title_index(boxes: list, kind: str) -> int | None:
    """The map's own title: the tallest word, clearly taller than the rest (continents only)."""
    if kind != "continent" or len(boxes) < 2:
        return None
    heights = sorted(((b[3] - b[1], i) for i, b in enumerate(boxes)), reverse=True)
    return heights[0][1] if heights[0][0] >= 1.3 * heights[1][0] else None


def owner(box, key, nodes: dict, is_title: bool):
    if is_title:
        return key, "title"
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    best = None
    for k, n in nodes.items():
        r = n.get("rectInParent")
        if n.get("parentId") != key or not r or not n.get("art") or n.get("type") not in ("world", "continent", "zone"):
            continue
        if not (r[0] <= cx <= r[2] and r[1] <= cy <= r[3]):
            continue
        w, h = r[2] - r[0], r[3] - r[1]
        d = math.hypot((cx - (r[0] + r[2]) / 2) / w, (cy - (r[1] + r[3]) / 2) / h)
        if best is None or d < best[0]:
            best = (d, k)
    return (best[1], "place") if best else (key, "place")


def main() -> None:
    maps = json.loads((DATA_DIR / "maps.json").read_text())
    eras = json.loads((DATA_DIR / "eras.json").read_text())
    retail = {m["id"]: m for m in maps}
    done: dict[str, list] = {}
    trees = [retail] + [resolve_era(eras, retail, e["id"]) for e in eras if not e.get("inherits")]
    for nodes in trees:
        for key, node in nodes.items():
            art = node.get("art")
            if not art or node.get("type") not in BIG_TYPES or art["url"] in done or not art.get("paintedLabels"):
                continue
            labels = [l if isinstance(l, dict) else {"box": l} for l in art["paintedLabels"]]
            title = title_index([l["box"] for l in labels], node["type"])
            for i, label in enumerate(labels):
                label["labelFor"], label["kind"] = owner(label["box"], key, nodes, i == title)
            done[art["url"]] = labels

    def apply(art):
        if isinstance(art, dict) and art.get("url") in done:
            art["paintedLabels"] = done[art["url"]]

    for node in maps:
        apply(node.get("art"))
    for era in eras:
        for value in era["maps"].values():
            if isinstance(value, dict):
                apply(value.get("art"))
    write_json(DATA_DIR / "maps.json", maps)
    write_json(DATA_DIR / "eras.json", eras)
    titles = sum(1 for labels in done.values() if any(l.get("kind") == "title" for l in labels))
    print(f"continent/world/Cosmic pictures: {len(done)}, with a title: {titles}")


if __name__ == "__main__":
    main()
