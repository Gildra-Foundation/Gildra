#!/usr/bin/env python3
"""Composite renders of the published world map, for visual checks.

Draws a map's art with its children laid on top at their rectInParent (through
their masks when present), exactly as the viewer nests them: an era's maps are
resolved the way lib/wow/worldMap/bundle.ts resolves them (listed = existed,
"unchanged" = the current map, an object overrides fields, ``absent`` removes).

Usage:
  python composite.py --era classic --map 12 --depth 2 --out /tmp/mapd2/classic-12.png
  python composite.py --map 947 --depth 1 --out /tmp/mapd2/retail-947.png
"""

from __future__ import annotations

import argparse
import functools
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

WEB = Path(__file__).resolve().parents[2]
DATA_DIR = WEB / "data" / "wow" / "map"
PUBLIC = WEB / "public"


def load_json(name: str):
    return json.loads((DATA_DIR / name).read_text())


def resolve_era(eras: list[dict], retail: dict[int, dict], era_id: str | None) -> dict:
    """{key: node} for an era (keys are ints for retail ids, strings for era-only maps)."""
    if era_id is None:
        return dict(retail)
    by_id = {e["id"]: e for e in eras}
    era = by_id[era_id]
    nodes = dict(resolve_era(eras, retail, era["inherits"])) if era.get("inherits") else {}
    for key, value in era["maps"].items():
        k = int(key) if key.isdigit() else key
        if value == "unchanged":
            if k in retail:
                nodes[k] = retail[k]
            continue
        if value is None or (isinstance(value, dict) and value.get("absent")):
            nodes.pop(k, None)
            continue
        current = nodes.get(k) or retail.get(k) or {"id": k, "children": [], "rectInParent": None, "art": None, "parentId": None}
        node = dict(current)
        for field in ("art", "rectInParent", "parentId", "name", "type", "slug", "mask", "terrain", "children"):
            if field in value:
                node[field] = value[field]
        nodes[k] = node
    return nodes


@functools.lru_cache(maxsize=64)
def art_image(url: str, width: int, height: int, max_zoom: int, tile: int = 256) -> Image.Image:
    canvas = Image.new("RGBA", (math.ceil(width / tile) * tile, math.ceil(height / tile) * tile))
    for ty in range(math.ceil(height / tile)):
        for tx in range(math.ceil(width / tile)):
            path = PUBLIC / url.lstrip("/").replace("{z}", str(max_zoom)).replace("{x}", str(tx)).replace("{y}", str(ty))
            if path.exists():
                canvas.paste(Image.open(path).convert("RGBA"), (tx * tile, ty * tile))
    return canvas.crop((0, 0, width, height))


LANG = "en"


def node_image(node: dict) -> Image.Image | None:
    art = node.get("art")
    if not art:
        return None
    return art_image(art.get("urlRu") if LANG == "ru" and art.get("urlRu") else art["url"], art["width"], art["height"], art["maxZoom"], art.get("tileSize", 256))


MASK_DIR: Path | None = None  # test masks named <map id>.webp, used when a node has none


def mask_image(node: dict) -> Image.Image | None:
    if MASK_DIR is not None and (MASK_DIR / f"{node['id']}.webp").exists():
        return Image.open(MASK_DIR / f"{node['id']}.webp").convert("L")
    url = node.get("mask")
    if not url:
        return None
    path = PUBLIC / url.lstrip("/")
    return Image.open(path).convert("L") if path.exists() else None


def children_of(nodes: dict, key) -> list:
    out = [k for k, n in nodes.items() if n.get("parentId") == key and n.get("rectInParent") and n.get("art")]
    return sorted(out, key=lambda k: (isinstance(k, str), str(k) if isinstance(k, str) else k))


def render(nodes: dict, key, width: int = 2000, depth: int = 1, use_masks: bool = True, outline: bool = False, skip=()) -> Image.Image:
    root = nodes[key]
    base = node_image(root)
    if base is None:
        raise SystemExit(f"map {key} has no art")
    height = round(width * base.height / base.width)
    canvas = base.resize((width, height), Image.LANCZOS)
    draw = ImageDraw.Draw(canvas)

    def place(parent_key, box, level):
        if level > depth:
            return
        bx0, by0, bx1, by1 = box
        for child in children_of(nodes, parent_key):
            if child in skip:
                continue
            node = nodes[child]
            x0, y0, x1, y1 = node["rectInParent"]
            rect = (bx0 + x0 * (bx1 - bx0), by0 + y0 * (by1 - by0), bx0 + x1 * (bx1 - bx0), by0 + y1 * (by1 - by0))
            w, h = round(rect[2] - rect[0]), round(rect[3] - rect[1])
            if w < 2 or h < 2:
                continue
            image = node_image(node)
            if image is None:
                continue
            piece = image.resize((w, h), Image.LANCZOS)
            mask = mask_image(node) if use_masks else None
            if mask is not None:
                piece.putalpha(ImageChops.multiply(piece.getchannel("A"), mask.resize((w, h), Image.BILINEAR)))
            canvas.alpha_composite(piece, (round(rect[0]), round(rect[1])))
            if outline:
                draw.rectangle(rect, outline=(255, 40, 40, 255), width=1)
            place(child, rect, level + 1)

    place(key, (0, 0, width, height), 1)
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--era")
    parser.add_argument("--map", required=True)
    parser.add_argument("--depth", type=int, default=1)
    parser.add_argument("--width", type=int, default=2000)
    parser.add_argument("--no-masks", action="store_true")
    parser.add_argument("--outline", action="store_true")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--mask-dir", type=Path, help="test masks <map id>.webp")
    parser.add_argument("--lang", choices=("en", "ru"), default="en")
    args = parser.parse_args()
    global MASK_DIR, LANG
    MASK_DIR = args.mask_dir
    LANG = args.lang
    retail = {m["id"]: m for m in load_json("maps.json")}
    nodes = resolve_era(load_json("eras.json"), retail, args.era)
    key = int(args.map) if args.map.isdigit() else args.map
    image = render(nodes, key, args.width, args.depth, not args.no_masks, args.outline)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(args.out, quality=88)
    print(args.out, image.size)


if __name__ == "__main__":
    main()
