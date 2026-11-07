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


FOCUS = None  # a map the viewer focuses: other maps' painted words for it and decor over it are hidden


def suppressed(node: dict, image: Image.Image, focus_rect=None) -> Image.Image:
    """The picture with its painted words for FOCUS (and its decor over FOCUS) erased, as the engine would."""
    art = node.get("art") or {}
    if FOCUS is None or node.get("id") == FOCUS:
        return image
    mine = [l for l in art.get("paintedLabels", []) if isinstance(l, dict) and l.get("labelFor") == FOCUS]
    patched = [l for l in mine if l.get("patch") and (PUBLIC / l["patch"].lstrip("/")).exists()]
    if patched:
        image = image.copy().convert("RGBA")
        w, h = image.size
        for l in patched:
            x0, y0, x1, y1 = l["plaque"]
            box = (round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))
            patch = Image.open(PUBLIC / l["patch"].lstrip("/")).convert("RGBA").resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
            image.alpha_composite(patch, box[:2])
    boxes = [l.get("plaque", l["box"]) for l in mine if l not in patched]
    if focus_rect is not None:
        # decor near the focused map: hidden (cut out), as the engine does
        fx0, fy0, fx1, fy1 = focus_rect
        near = [d["box"] for d in art.get("decor", []) if d["box"][0] < fx1 and d["box"][2] > fx0 and d["box"][1] < fy1 and d["box"][3] > fy0]
        if near:
            image = image.copy().convert("RGBA")
            hole = Image.new("L", image.size, 255)
            draw = ImageDraw.Draw(hole)
            w, h = image.size
            for x0, y0, x1, y1 in near:
                draw.rectangle((x0 * w, y0 * h, x1 * w, y1 * h), fill=0)
            from PIL import ImageFilter
            image.putalpha(ImageChops.multiply(image.getchannel("A"), hole.filter(ImageFilter.GaussianBlur(6))))
    if not boxes:
        return image
    # words without a clean patch: the engine lets them give way (cut out, feathered)
    out = image.copy().convert("RGBA")
    hole = Image.new("L", out.size, 255)
    draw = ImageDraw.Draw(hole)
    w, h = out.size
    for x0, y0, x1, y1 in boxes:
        draw.rectangle((x0 * w, y0 * h, x1 * w, y1 * h), fill=0)
    from PIL import ImageFilter
    out.putalpha(ImageChops.multiply(out.getchannel("A"), hole.filter(ImageFilter.GaussianBlur(4))))
    return out


def render(nodes: dict, key, width: int = 2000, depth: int = 1, use_masks: bool = True, outline: bool = False, skip=()) -> Image.Image:
    root = nodes[key]
    base = node_image(root)
    if FOCUS is not None:
        base = suppressed(root, base)
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
            piece = suppressed(node, image.resize((w, h), Image.LANCZOS))
            mask = mask_image(node) if use_masks else None
            if mask is not None:
                piece.putalpha(ImageChops.multiply(piece.getchannel("A"), mask.resize((w, h), Image.BILINEAR)))
            canvas.alpha_composite(piece, (round(rect[0]), round(rect[1])))
            if outline:
                draw.rectangle(rect, outline=(255, 40, 40, 255), width=1)
            place(child, rect, level + 1)

    place(key, (0, 0, width, height), 1)
    return canvas


def render_focus(nodes: dict, focus, width: int = 1600, margin: float = 0.6, use_masks: bool = True) -> Image.Image:
    """The focused map at ``width`` px with its surroundings: its parent's region (and the
    parent's other children over it) around it, as the viewer composes a focused city."""
    node = nodes[focus]
    parent_key = node["parentId"]
    parent = nodes[parent_key]
    fx0, fy0, fx1, fy1 = node["rectInParent"]
    fw, fh = fx1 - fx0, fy1 - fy0
    view = (fx0 - margin * fw, fy0 - margin * fh, fx1 + margin * fw, fy1 + margin * fh)
    vw, vh = view[2] - view[0], view[3] - view[1]
    pimg = node_image(parent)
    height = round(width * vh / vw * pimg.height / pimg.width)
    scale_x, scale_y = width / vw, height / vh  # px per parent unit

    def project(rect):
        return ((rect[0] - view[0]) * scale_x, (rect[1] - view[1]) * scale_y, (rect[2] - view[0]) * scale_x, (rect[3] - view[1]) * scale_y)

    canvas = Image.new("RGBA", (width, height), (20, 20, 24, 255))
    crop = (view[0] * pimg.width, view[1] * pimg.height, view[2] * pimg.width, view[3] * pimg.height)
    region = suppressed(parent, pimg, node["rectInParent"]).crop(tuple(round(v) for v in crop)).resize((width, height), Image.LANCZOS)
    canvas.alpha_composite(region)
    siblings = [k for k in children_of(nodes, parent_key) if k != focus]
    for key in siblings + [focus]:
        other = nodes[key]
        x0, y0, x1, y1 = project(other["rectInParent"])
        if x1 < 0 or y1 < 0 or x0 > width or y0 > height:
            continue
        w, h = round(x1 - x0), round(y1 - y0)
        if w < 2 or h < 2 or w > 12 * width:
            continue
        image = node_image(other)
        if image is None:
            continue
        # the sibling's picture, cut to the view first (it can be far larger than the canvas)
        sx0, sy0 = max(0.0, -x0 / w), max(0.0, -y0 / h)
        sx1, sy1 = min(1.0, (width - x0) / w), min(1.0, (height - y0) / h)
        if sx1 <= sx0 or sy1 <= sy0:
            continue

        frect = None if key == focus else [
            (fx0 - other["rectInParent"][0]) / (other["rectInParent"][2] - other["rectInParent"][0]),
            (fy0 - other["rectInParent"][1]) / (other["rectInParent"][3] - other["rectInParent"][1]),
            (fx1 - other["rectInParent"][0]) / (other["rectInParent"][2] - other["rectInParent"][0]),
            (fy1 - other["rectInParent"][1]) / (other["rectInParent"][3] - other["rectInParent"][1]),
        ]

        image = suppressed(other, image, frect)
        mask = mask_image(other) if use_masks else None
        if mask is not None:
            image = image.copy()
            image.putalpha(ImageChops.multiply(image.getchannel("A"), mask.resize(image.size, Image.BILINEAR)))
        piece = image.crop((round(sx0 * image.width), round(sy0 * image.height), round(sx1 * image.width), round(sy1 * image.height)))
        pw, ph = round((sx1 - sx0) * w), round((sy1 - sy0) * h)
        if pw < 1 or ph < 1:
            continue
        canvas.alpha_composite(piece.resize((pw, ph), Image.LANCZOS), (round(x0 + sx0 * w), round(y0 + sy0 * h)))
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
    parser.add_argument("--focus", help="map the viewer focuses (hide others' words for it)")
    parser.add_argument("--crop", type=float, help="crop around --focus with this margin (share of its rect)")
    args = parser.parse_args()
    global MASK_DIR, LANG, FOCUS
    FOCUS = (int(args.focus) if args.focus.isdigit() else args.focus) if args.focus else None
    MASK_DIR = args.mask_dir
    LANG = args.lang
    retail = {m["id"]: m for m in load_json("maps.json")}
    nodes = resolve_era(load_json("eras.json"), retail, args.era)
    key = int(args.map) if args.map.isdigit() else args.map
    if FOCUS is not None and args.crop is not None and nodes.get(FOCUS, {}).get("parentId") == key:
        image = render_focus(nodes, FOCUS, args.width, args.crop, not args.no_masks)
        args.crop = None
    else:
        image = render(nodes, key, args.width, args.depth, not args.no_masks, args.outline)
    if FOCUS is not None and args.crop is not None:
        # the focused map's box in the rendered picture, through its chain of rects
        x0, y0, x1, y1 = 0.0, 0.0, 1.0, 1.0
        chain, k = [], FOCUS
        while k != key and k in nodes and nodes[k].get("rectInParent"):
            chain.append(nodes[k]["rectInParent"])
            k = nodes[k].get("parentId")
        for r in reversed(chain):
            w, h = x1 - x0, y1 - y0
            x0, y0, x1, y1 = x0 + r[0] * w, y0 + r[1] * h, x0 + r[2] * w, y0 + r[3] * h
        m = args.crop
        w, h = x1 - x0, y1 - y0
        box = (max(0, (x0 - m * w)) * image.width, max(0, (y0 - m * h)) * image.height, min(1, (x1 + m * w)) * image.width, min(1, (y1 + m * h)) * image.height)
        image = image.crop(tuple(round(v) for v in box))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(args.out, quality=88)
    print(args.out, image.size)


if __name__ == "__main__":
    main()
