#!/usr/bin/env python3
"""Annotate maps.json and eras.json pictures (run last, after build_world_map.py and eras.py).

* ``art.namesPainted`` / ``art.paintedLabels``: the client paints place names
  into the map pictures and localizes them (CASC files with a ruRU-only
  version).  Where the enUS and ruRU pictures differ is exactly where words
  are painted: the bounding boxes of those regions (0..1 of the picture) are
  ``paintedLabels``; ``namesPainted`` is true when there are any.  Pictures
  without a ruRU version get neither field.
* ``expansion`` on every map: the expansion of the map's primary MapID
  (Map.ExpansionID), as the timeline's era id (vanilla … midnight).

Usage: /tmp/wm-venv/bin/python apps/web/scripts/world-map/annotate.py --work /tmp/wm-work
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from PIL import Image, ImageFilter  # noqa: E402

from build_world_map import DATA_DIR, write_json  # noqa: E402
from geometry import Geometry  # noqa: E402
from sources import CatalogDB  # noqa: E402

PUBLIC = DATA_DIR.parents[2] / "public"
EXPANSIONS = ["vanilla", "tbc", "wrath", "cataclysm", "mop", "wod", "legion", "bfa", "shadowlands", "dragonflight", "tww", "midnight"]


def picture(url: str, width: int, height: int, max_zoom: int, scale: int) -> np.ndarray | None:
    """The picture at maxZoom (downscaled by ``scale``) as a float array, from its tiles."""
    canvas = Image.new("RGB", (math.ceil(width / 256) * 256, math.ceil(height / 256) * 256))
    for ty in range(math.ceil(height / 256)):
        for tx in range(math.ceil(width / 256)):
            path = PUBLIC / url.lstrip("/").replace("{z}", str(max_zoom)).replace("{x}", str(tx)).replace("{y}", str(ty))
            if not path.exists():
                return None
            canvas.paste(Image.open(path).convert("RGB"), (tx * 256, ty * 256))
    image = canvas.crop((0, 0, width, height))
    if scale > 1:
        image = image.resize((width // scale, height // scale), Image.BOX)
    return np.asarray(image, dtype=np.float32)


def painted_labels(job):
    from scipy import ndimage

    key, art = job
    scale = 2 if art["width"] > 1500 else 1
    en = picture(art["url"], art["width"], art["height"], art["maxZoom"], scale)
    ru = picture(art["urlRu"], art["width"], art["height"], art["maxZoom"], scale)
    if en is None or ru is None:
        return key, None
    diff = np.abs(en - ru).max(axis=2) > 48
    if not diff.any():
        return key, []
    grown = np.asarray(Image.fromarray((diff * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    labels, count = ndimage.label(grown)
    h, w = diff.shape
    boxes = []
    for sl in ndimage.find_objects(labels):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (x1 - x0) * (y1 - y0) < 60 or diff[sl].sum() < 25:
            continue  # webp noise, not a word
        boxes.append([round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4)])
    boxes.sort(key=lambda b: (b[1], b[0]))
    return key, boxes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    maps = json.loads((DATA_DIR / "maps.json").read_text())
    eras = json.loads((DATA_DIR / "eras.json").read_text())

    # every picture with a ruRU version, once per url
    arts: dict[str, dict] = {}
    for node in maps:
        if node.get("art") and node["art"].get("urlRu"):
            arts[node["art"]["url"]] = node["art"]
    for era in eras:
        for value in era["maps"].values():
            art = value.get("art") if isinstance(value, dict) else None
            if art and art.get("urlRu"):
                arts[art["url"]] = art
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        found = dict(pool.map(painted_labels, list(arts.items()), chunksize=4))

    def annotate(art):
        if not art or not art.get("urlRu"):
            return
        boxes = found.get(art["url"])
        if boxes is None:
            return
        art["namesPainted"] = bool(boxes)
        art["paintedLabels"] = boxes

    for node in maps:
        annotate(node.get("art"))
    for era in eras:
        for value in era["maps"].values():
            if isinstance(value, dict):
                annotate(value.get("art"))

    db = CatalogDB(args.work / "db")
    build_id, _ = db.latest_retail_build()
    geometry = Geometry(db.table("UiMapAssignment", build_id), db.table("UiMapLink", build_id))
    maps_db = db.table("Map", build_id)
    for node in maps:
        own = geometry.primary(node["id"])
        exp = (maps_db.get(own["MapID"]) or {}).get("ExpansionID") if own else None
        if node["type"] not in ("cosmic", "world") and isinstance(exp, int) and 0 <= exp < len(EXPANSIONS):
            node["expansion"] = EXPANSIONS[exp]
        else:
            node.pop("expansion", None)
    write_json(DATA_DIR / "maps.json", maps)
    write_json(DATA_DIR / "eras.json", eras)
    print(f"pictures with ruRU names: {len(arts)}, with painted words: {sum(1 for b in found.values() if b)}, "
          f"maps with expansion: {sum(1 for n in maps if 'expansion' in n)}")


if __name__ == "__main__":
    main()
