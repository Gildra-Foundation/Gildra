#!/usr/bin/env python3
"""Second pass over the published masks (run after build_world_map.py and eras.py).

1. ``content`` — parchment-style pictures (≤ 1100 px: old cities, caves,
   scenario maps) whose first-pass mask was only a borrowed footprint or a soft
   rect: the map's own drawing is found on its sheet.  The sheet colour is the
   median of the picture's inner border band; a pixel belongs to the drawing when
   its colour (Lab chroma, some lightness) differs from the sheet and/or it
   carries line detail (Sobel energy), thresholded by Otsu over the inner
   picture.  Regions are closed, small ones and corner crests (the faction
   emblem, the name banner's ornaments) dropped, holes filled.
2. ``children`` — continents and worlds: the union of their zones' and
   continents' masks carried into their space through each child's rect, grown
   by a coastal margin.  (A continent's hover highlight is an outline drawn for
   the parent's picture, and a world's is the Cosmic globe — neither is the
   map's land.)  Continents first, then worlds; each mask file is derived from
   the first tree that uses it (today's maps, then the eras in order).

Usage: /tmp/wm-venv/bin/python apps/web/scripts/world-map/refine_masks.py
"""

from __future__ import annotations

import json
import math
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage  # noqa: E402

from build_world_map import CITIES, DATA_DIR, write_json  # noqa: E402
from composite import PUBLIC, art_image, node_image, resolve_era  # noqa: E402
from plaques import save_patch, soft_fill, stamp  # noqa: E402
from masks import FEATHER, binary, carry, coverage, finish, mask_size, save_mask, union  # noqa: E402

from PIL import ImageFilter  # noqa: E402

CONTENT_TYPES = {"zone", "micro", "orphan"}
PATCHES_DIR = PUBLIC / "maps" / "patches"
PATCHES_URL = "/maps/patches"
# maps whose era pictures are phases of their default picture (eras.py phases / variants)
PHASED = {14, 17, 18, 62, 70, 81, 390, 418}
WEAK = {"footprint", "edge", None}


def _otsu(values: np.ndarray) -> float:
    hist, edges = np.histogram(values, 128)
    centres = (edges[:-1] + edges[1:]) / 2
    best, threshold = -1.0, float(centres[0])
    total = hist.sum()
    cum, cum_mean = np.cumsum(hist), np.cumsum(hist * centres)
    for i in range(1, 128):
        w0, w1 = cum[i - 1], total - cum[i - 1]
        if not w0 or not w1:
            continue
        m0, m1 = cum_mean[i - 1] / w0, (cum_mean[-1] - cum_mean[i - 1]) / w1
        between = w0 * w1 * (m0 - m1) ** 2
        if between > best:
            best, threshold = between, float(centres[i])
    return threshold


def content_shape(picture: Image.Image, size: tuple[int, int]):
    """(binary shape of the drawing on a parchment sheet, crest boxes) — None when nothing sensible is found."""
    image = picture.convert("RGB").resize(size, Image.LANCZOS)
    lab = np.asarray(image.convert("LAB"), dtype=np.float32).copy()
    lab[..., 1:] = np.where(lab[..., 1:] > 127, lab[..., 1:] - 256, lab[..., 1:])  # a, b are signed
    h, w = lab.shape[:2]
    bx, by = max(2, int(w * 0.07)), max(2, int(h * 0.07))
    band = np.concatenate([
        lab[by : by * 2].reshape(-1, 3), lab[-by * 2 : -by].reshape(-1, 3),
        lab[by:-by, bx : bx * 2].reshape(-1, 3), lab[by:-by, -bx * 2 : -bx].reshape(-1, 3),
    ])
    sheet = np.median(band, axis=0)
    colour = np.hypot(lab[..., 1] - sheet[1], lab[..., 2] - sheet[2]) + 0.25 * np.abs(lab[..., 0] - sheet[0])
    colour = ndimage.gaussian_filter(colour, 3)
    light = ndimage.gaussian_filter(lab[..., 0], 1)
    detail = ndimage.gaussian_filter(np.hypot(ndimage.sobel(light, 0), ndimage.sobel(light, 1)), 6)

    def norm(x):
        inner = x[by:-by, bx:-bx]
        lo, hi = np.percentile(inner, 5), np.percentile(inner, 95)
        return np.clip((x - lo) / max(1e-6, hi - lo), 0, 1)

    chroma = norm(colour)
    score = 0.6 * chroma + 0.4 * norm(detail)
    shape = score > _otsu(score[by:-by, bx:-bx])
    # crests: sepia line drawings (detail without colour) in the sheet's corners
    yy, xx = np.mgrid[0:h, 0:w]
    corner = ((xx < 0.3 * w) | (xx > 0.7 * w)) & ((yy < 0.35 * h) | (yy > 0.65 * h))
    sepia = corner & (chroma < 0.35) & (norm(detail) > 0.45)
    sepia = ndimage.binary_closing(sepia, iterations=4)
    crests = []
    labels_s, count_s = ndimage.label(sepia)
    for sl in ndimage.find_objects(labels_s):
        area = (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start)
        if area >= 0.006 * w * h:
            crests.append([round(sl[1].start / w, 4), round(sl[0].start / h, 4), round(sl[1].stop / w, 4), round(sl[0].stop / h, 4)])
            shape[sl] &= ~ndimage.binary_dilation(labels_s[sl] > 0, iterations=3)
    shape[: by // 2] = shape[-(by // 2) :] = False
    shape[:, : bx // 2] = shape[:, -(bx // 2) :] = False
    shape = ndimage.binary_closing(shape, iterations=3)
    labels, count = ndimage.label(shape)
    if not count:
        return None
    sizes = ndimage.sum(shape, labels, range(1, count + 1))
    biggest = sizes.max()
    keep = []
    for i, area in enumerate(sizes):
        if area < 0.01 * w * h or area < 0.2 * biggest:
            continue
        ys, xs = np.nonzero(labels == i + 1)
        cx, cy = xs.mean() / w, ys.mean() / h
        if (cx < 0.3 or cx > 0.7) and (cy > 0.6 or cy < 0.3) and area < 0.35 * biggest:
            continue  # a crest in a corner of the sheet
        keep.append(i + 1)
    result = ndimage.binary_fill_holes(np.isin(labels, keep))
    share = result.mean()
    if not 0.06 <= share <= 0.85:
        return None
    return Image.fromarray((result * 255).astype(np.uint8)), crests


def children_shape(node_key, nodes: dict, masks: dict, size: tuple[int, int]) -> Image.Image | None:
    """Union of the children's masks in the parent's mask space, grown by a coastal margin."""
    parts = []
    for key, child in nodes.items():
        if child.get("parentId") != node_key or child.get("type") not in ("zone", "continent", "world"):
            continue
        if not child.get("art") or not child.get("rectInParent") or not child.get("mask"):
            continue
        mask = masks.get(child["mask"])
        if mask is None:
            path = PUBLIC / child["mask"].lstrip("/")
            if not path.exists():
                continue
            mask = Image.open(path).convert("L")
        parts.append(binary(carry(mask, tuple(child["rectInParent"]), (0.0, 0.0, 1.0, 1.0), size)))
    shape = union(parts)
    if shape is None or coverage(shape) < 0.01:
        return None
    # round growth: blur, then a low threshold (a square max filter leaves steps)
    radius = size[0] * 0.02
    return shape.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: 255 if v >= 40 else 0)


# -- r5: shared decor, painted labels, composition ------------------------------

DECOR_SAMPLE = 334  # width the pictures are compared at


def picture_array(art: dict, width: int = DECOR_SAMPLE) -> np.ndarray:
    image = node_image({"art": art}).convert("RGB")
    return np.asarray(image.resize((width, round(width * image.height / image.width)), Image.BOX), dtype=np.int16)


def find_decor(arts: dict) -> dict:
    """Frame corners and ornaments every picture of one family shares.

    Pictures of the same size are stacked; their per-pixel median is the common
    sheet with its corner ornaments and curled edges.  In the four corners the
    pixels where that median differs from the sheet's own colour form the
    decor; a picture carries it where it matches the median there.
    Returns url -> {"boxes": [[x0,y0,x1,y1], …], "pixels": bool array at DECOR_SAMPLE width}.
    """
    groups: dict = {}
    for url, art in arts.items():
        groups.setdefault((art["width"], art["height"]), []).append(url)
    out = {}
    for (width, height), urls in groups.items():
        if len(urls) < 12:
            continue
        stack = np.stack([picture_array(arts[u]) for u in urls])
        _, h, w, _ = stack.shape
        median = np.median(stack, axis=0)
        sheet = np.median(median[int(h * .35):int(h * .65), int(w * .35):int(w * .65)].reshape(-1, 3), axis=0)
        yy, xx = np.mgrid[0:h, 0:w]
        corner = ((xx < 0.2 * w) | (xx > 0.8 * w)) & ((yy < 0.3 * h) | (yy > 0.7 * h))
        decor = ndimage.binary_opening(corner & (np.abs(median - sheet).max(axis=2) > 30), iterations=1)
        labels, _ = ndimage.label(ndimage.binary_dilation(decor, iterations=3))
        regions = [sl for sl in ndimage.find_objects(labels) if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) >= 0.004 * w * h]
        close = np.abs(stack - median).max(axis=3) < 40
        for i, url in enumerate(urls):
            boxes, pixels = [], np.zeros((h, w), bool)
            for sl in regions:
                region = decor[sl]
                if not region.any() or close[i][sl][region].mean() < 0.45:
                    continue
                boxes.append([round(sl[1].start / w, 4), round(sl[0].start / h, 4), round(sl[1].stop / w, 4), round(sl[0].stop / h, 4)])
                pixels[sl] |= region & close[i][sl]
            if boxes:
                out[url] = {"boxes": boxes, "pixels": ndimage.binary_dilation(pixels, iterations=2)}
    return out


def label_owner(box, key, nodes: dict, land, drawing: bool, big: bool = False):
    """The map a painted word belongs to.

    Parchment pictures (cities, caves: ``drawing``) paint only their own words.
    Zone and continent pictures also paint their neighbours' and the parent's
    names: a word on this map's land (its mask) is this map's — or the smallest
    child whose rect holds it; on a sibling's land it is that sibling's; on
    neither (sea, the surroundings) it is the parent's.
    ``land(key, x, y)`` -> mask value 0..1 of a map at a point of its own space.
    """
    node = nodes[key]
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    children = [(k, n["rectInParent"]) for k, n in nodes.items() if n.get("parentId") == key and n.get("rectInParent") and n.get("art")]
    inside = [(k, r) for k, r in children if r[0] <= cx <= r[2] and r[1] <= cy <= r[3] and land(k, (cx - r[0]) / (r[2] - r[0]), (cy - r[1]) / (r[3] - r[1])) > 0.5]
    if inside:
        return min(inside, key=lambda kr: (kr[1][2] - kr[1][0]) * (kr[1][3] - kr[1][1]))[0]
    if drawing or node.get("parentId") is None or not node.get("rectInParent"):
        return key
    x0, y0, x1, y1 = node["rectInParent"]
    px, py = x0 + cx * (x1 - x0), y0 + cy * (y1 - y0)
    # a city (a sibling much smaller than this map) whose rect holds the word: its name
    # painted on the zone ("IRONFORGE" on Dun Morogh)
    mine = (x1 - x0) * (y1 - y0)
    cities = [(k, n["rectInParent"]) for k, n in nodes.items()
              if k != key and k in CITIES and n.get("parentId") == node["parentId"] and n.get("rectInParent") and n.get("art")
              and (n["rectInParent"][2] - n["rectInParent"][0]) * (n["rectInParent"][3] - n["rectInParent"][1]) < 0.25 * mine
              and n["rectInParent"][0] <= px <= n["rectInParent"][2] and n["rectInParent"][1] <= py <= n["rectInParent"][3]]
    if cities:
        return min(cities, key=lambda kr: (kr[1][2] - kr[1][0]) * (kr[1][3] - kr[1][1]))[0]
    # a city's name is painted larger than the place names around it and next to the city
    # (a child city in this map's space, a sibling city in the parent's)
    if big:
        near = []
        for k, n in nodes.items():
            r = n.get("rectInParent")
            if k == key or k not in CITIES or not r or not n.get("art"):
                continue
            if n.get("parentId") == key:
                qx, qy, limit = cx, cy, 0.25
            elif n.get("parentId") == node["parentId"]:
                qx, qy, limit = px, py, 0.25 * mine
            else:
                continue
            if (r[2] - r[0]) * (r[3] - r[1]) >= limit:
                continue
            mx, my = max(1.6 * (r[2] - r[0]), 0.03), max(1.6 * (r[3] - r[1]), 0.03)
            if r[0] - mx <= qx <= r[2] + mx and r[1] - my <= qy <= r[3] + my:
                near.append((math.hypot(qx - (r[0] + r[2]) / 2, qy - (r[1] + r[3]) / 2) / max(r[2] - r[0], 1e-9), k))
        if near:
            return min(near)[1]
    if land(key, cx, cy) > 0.5:
        return key
    best, best_area = None, None
    for other_key, other in nodes.items():
        rect = other.get("rectInParent")
        if other_key == key or other.get("parentId") != node["parentId"] or not rect or not other.get("art"):
            continue
        if rect[0] <= px <= rect[2] and rect[1] <= py <= rect[3] and land(other_key, (px - rect[0]) / (rect[2] - rect[0]), (py - rect[1]) / (rect[3] - rect[1])) > 0.5:
            area = (rect[2] - rect[0]) * (rect[3] - rect[1])
            if best_area is None or area < best_area:
                best, best_area = other_key, area
    return best if best is not None else node["parentId"]


def merge_lines(boxes: list, aspect: float) -> list:
    """Pieces of one painted word or line (the enUS/ruRU difference splits a banner where both
    languages share letters) joined: boxes on one line closer than 1.2 heights."""
    boxes = [list(b) for b in boxes]
    changed = True
    while changed:
        changed = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                ha, hb = a[3] - a[1], b[3] - b[1]
                overlap = min(a[3], b[3]) - max(a[1], b[1])
                gap = (max(a[0], b[0]) - min(a[2], b[2])) * aspect
                if overlap > 0.6 * min(ha, hb) and gap < 1.2 * max(ha, hb):
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                    del boxes[j]
                    changed = True
                    break
            if changed:
                break
    return [[round(v, 4) for v in b] for b in sorted(boxes, key=lambda b: (b[1], b[0]))]


def plaque_of(box, aspect: float, scroll: bool = True):
    """The word with the plaque it is painted on: banner-shaped words (much wider than tall)
    sit on a scroll whose curled ends reach about 1.6 heights beyond the text."""
    x0, y0, x1, y1 = box
    h = y1 - y0
    w = x1 - x0
    if scroll and w * aspect > 3 * h:
        gx, gy = 1.6 * h / aspect, 0.45 * h
    else:
        gx, gy = 0.25 * h / aspect, 0.25 * h
    return [round(max(0.0, x0 - gx), 4), round(max(0.0, y0 - gy), 4), round(min(1.0, x1 + gx), 4), round(min(1.0, y1 + gy), 4)]


def descendants(key, nodes: dict) -> set:
    out, stack = set(), [key]
    while stack:
        k = stack.pop()
        for other_key, other in nodes.items():
            if other.get("parentId") == k and other_key not in out:
                out.add(other_key)
                stack.append(other_key)
    return out


def edge_fade(size, share: float, ragged: bool = False, seed: int = 0) -> Image.Image:
    """1 inside, smoothly to 0 over ``share`` of the shorter side at the picture's border;
    ``ragged``: the fade's depth wanders along the border (no straight line where a
    drawing runs into the edge of its sheet)."""
    w, h = size
    d = max(2.0, share * min(w, h))
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.minimum(np.minimum(xx + 0.5, w - 0.5 - xx), np.minimum(yy + 0.5, h - 0.5 - yy))
    if ragged:
        rng = np.random.default_rng(seed)
        wobble = ndimage.gaussian_filter(rng.standard_normal((h, w)), max(3.0, min(w, h) * 0.04))
        wobble /= max(1e-6, np.abs(wobble).max())
        dist = dist - d * 0.9 * (0.5 + 0.5 * wobble)
        d = d * 0.8
    t = np.clip(dist / d, 0, 1)
    return Image.fromarray((255 * t * t * (3 - 2 * t)).astype(np.uint8))


def compose(mask: Image.Image, own_boxes: list, decor_pixels, crest_boxes=(), seed: int = 0) -> Image.Image:
    """Mask with a soft, ragged inward fade at the picture's border, the shared decor and the
    sheet's crests cut out and the map's own painted words kept whole."""
    from PIL import ImageChops, ImageDraw

    size = mask.size
    out = ImageChops.darker(mask.convert("L"), edge_fade(size, 0.06, ragged=True, seed=seed))
    if crest_boxes:
        cut = Image.new("L", size, 0)
        cd = ImageDraw.Draw(cut)
        for x0, y0, x1, y1 in crest_boxes:
            cd.ellipse((x0 * size[0], y0 * size[1], x1 * size[0], y1 * size[1]), fill=255)
        out = ImageChops.subtract(out, cut.filter(ImageFilter.GaussianBlur(4)))
    if decor_pixels is not None:
        cut = Image.fromarray((decor_pixels * 255).astype(np.uint8)).resize(size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(2))
        out = ImageChops.subtract(out, cut)
    if own_boxes:
        words = Image.new("L", size, 0)
        draw = ImageDraw.Draw(words)
        w, h = size
        soft = 0.0
        for x0, y0, x1, y1 in own_boxes:
            bh = (y1 - y0) * h
            g = max(2.0, 0.35 * bh)
            soft = max(soft, g)
            draw.rounded_rectangle((x0 * w - g, y0 * h - g, x1 * w + g, y1 * h + g), radius=g * 1.5, fill=255)
        # a soft cloud around each word, its core opaque
        words = words.filter(ImageFilter.GaussianBlur(soft * 0.6)).point(lambda v: min(255, int(v * 1.6)))
        words = ImageChops.darker(words, edge_fade(size, 0.015))
        out = ImageChops.lighter(out, words)
    return out


def method_of(manifest: dict, url: str) -> str | None:
    """First-pass method of a mask url from art-manifest.json."""
    parts = url.split("/")
    if parts[3] == "era":
        return ((manifest.get("eras", {}).get(parts[4], {}).get(parts[5].removesuffix(".webp"), {}) or {}).get("mask") or {}).get("method")
    return ((manifest.get("retail", {}).get(parts[3].removesuffix(".webp"), {}) or {}).get("mask") or {}).get("method")


def set_method(manifest: dict, url: str, method: str) -> None:
    parts = url.split("/")
    if parts[3] == "era":
        entry = manifest.setdefault("eras", {}).setdefault(parts[4], {}).setdefault(parts[5].removesuffix(".webp"), {})
    else:
        entry = manifest.setdefault("retail", {}).setdefault(parts[3].removesuffix(".webp"), {})
    entry.setdefault("mask", {})["method"] = method
    entry["mask"]["bytes"] = (PUBLIC / url.lstrip("/")).stat().st_size


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--labels-only", action="store_true", help="re-derive words, owners and patches; keep the masks")
    args = parser.parse_args()
    maps = json.loads((DATA_DIR / "maps.json").read_text())
    eras = json.loads((DATA_DIR / "eras.json").read_text())
    manifest = json.loads((DATA_DIR / "art-manifest.json").read_text())
    retail = {m["id"]: m for m in maps}
    trees = [("today", retail)] + [(e["id"], resolve_era(eras, retail, e["id"])) for e in eras if not e.get("inherits")]
    variants = [(e["id"], resolve_era(eras, retail, e["id"])) for e in eras if e.get("inherits")]
    done: dict[str, Image.Image] = {}
    counts = {"content": 0, "children": 0, "kept": 0, "composed": 0}
    composed: set = set()
    crests_of: dict[str, list] = {}

    # 1. drawings on parchment
    for _, nodes in ([] if args.labels_only else trees + variants):
        for node in nodes.values():
            url, art = node.get("mask"), node.get("art")
            if not url or not art or url in done or node.get("type") not in CONTENT_TYPES or art["width"] > 1100:
                continue
            if method_of(manifest, url) not in WEAK | {"content"}:
                continue
            size = mask_size(art["width"], art["height"])
            found = content_shape(node_image(node), size)
            shape = found[0] if found else None
            if found and found[1]:
                crests_of[art["url"]] = found[1]
            if shape is None:
                counts["kept"] += 1
                done[url] = Image.open(PUBLIC / url.lstrip("/")).convert("L")
                continue
            mask = finish(binary(shape), close=FEATHER)
            save_mask(mask, PUBLIC / url.lstrip("/"))
            set_method(manifest, url, "content")
            done[url] = mask
            counts["content"] += 1

    # 2. painted words (whose they are) and the shared decor of each picture
    def mask_of(url):
        if url not in done:
            path = PUBLIC / url.lstrip("/")
            done[url] = Image.open(path).convert("L") if path.exists() else None
        return done[url]

    def land_in(nodes):
        def land(key, x, y):
            node = nodes.get(key)
            mask = mask_of(node["mask"]) if node and node.get("mask") else None
            if mask is None or not (0 <= x <= 1 and 0 <= y <= 1):
                return 0.0
            return mask.getpixel((min(mask.width - 1, int(x * mask.width)), min(mask.height - 1, int(y * mask.height)))) / 255
        return land

    arts = {}
    for _, nodes in trees:
        for node in nodes.values():
            if node.get("art") and node.get("type") != "cosmic":
                arts.setdefault(node["art"]["url"], node["art"])
    decor = find_decor(arts)
    labels_of: dict[str, list] = {}
    owner_of: dict[str, tuple] = {}
    for _, nodes in trees:
        land = land_in(nodes)
        for key, node in nodes.items():
            art = node.get("art")
            if not art or art["url"] in labels_of or not art.get("paintedLabels"):
                continue
            drawing = method_of(manifest, node["mask"]) in WEAK | {"content"} if node.get("mask") else False
            aspect = art["width"] / art["height"]
            boxes = merge_lines([l["box"] if isinstance(l, dict) else l for l in art["paintedLabels"]], aspect)
            heights = sorted(b[3] - b[1] for b in boxes)
            typical = heights[len(heights) // 2] if heights else 0
            scroll = node.get("type") not in ("continent", "world", "cosmic")  # continent titles have no scroll
            labels_of[art["url"]] = [{"box": box, "plaque": plaque_of(box, aspect, scroll),
                                      "labelFor": label_owner(box, key, nodes, land, drawing, big=(box[3] - box[1]) > 1.25 * typical)} for box in boxes]
            owner_of[art["url"]] = (key, nodes)

    # 2b. clean patches for words of other maps (a city's banner on its zone)
    import shutil

    shutil.rmtree(PATCHES_DIR, ignore_errors=True)
    patches = 0
    for url, labels in labels_of.items():
        key, nodes = owner_of[url]
        mine = {key} | descendants(key, nodes)
        # every word of a continent/world/Cosmic picture (the engine removes an ancestor's
        # lettering around the focused map); on other pictures the words of other maps
        big = nodes[key].get("type") in ("continent", "world", "cosmic") or any(
            n.get("parentId") == key and n.get("art") and n.get("rectInParent") and n.get("type") in ("zone", "continent", "orphan")
            for n in nodes.values())  # an ancestor of a drawn zone/city: all its lettering may give way
        foreign = [i for i, l in enumerate(labels) if big or l["labelFor"] not in mine]
        if not foreign:
            continue
        picture = np.asarray(node_image(nodes[key]).convert("RGBA"))
        art = nodes[key]["art"]
        other = None
        if art.get("urlRu"):
            ru = art_image(art["urlRu"], art["width"], art["height"], art["maxZoom"], art.get("tileSize", 256))
            other = np.asarray(ru.convert("RGBA"))
        h, w = picture.shape[:2]
        px = [tuple(round(v * s) for v, s in zip(l["plaque"], (w, h, w, h))) for l in labels]
        folder = url.split("/maps/tiles/")[1].split("/{z}")[0].replace("/", "-")
        for i in foreign:
            patch = stamp(picture, px[i], [b for j, b in enumerate(px) if j != i], other)
            kind = "stamp"
            if patch is None and big:
                patch, kind = soft_fill(picture, px[i]), "blur"
            if patch is None:
                continue
            labels[i]["patchKind"] = kind
            path = PATCHES_DIR / folder / f"{i}.webp"
            save_patch(patch, path)
            labels[i]["patch"] = f"{PATCHES_URL}/{folder}/{i}.webp"
            patches += 1
    counts["patches"] = patches

    # 3. zone-level masks: soft inward border, decor cut out, own words kept whole
    for _, nodes in ([] if args.labels_only else trees + variants):
        for key, node in nodes.items():
            url, art = node.get("mask"), node.get("art")
            if not url or not art or node.get("type") in ("continent", "world", "cosmic") or url in composed:
                continue
            mine = {key} | descendants(key, nodes)
            own = [l["box"] for l in labels_of.get(art["url"], []) if l["labelFor"] in mine]
            base = mask_of(url)
            drawing = method_of(manifest, url) in WEAK | {"content"}
            if base is not None and not drawing:
                # a zone keeps a word whole only where it lies (at least partly) on its land:
                # its words over the surroundings belong to what the parent shows there
                def on_land(b, m=base):
                    w, h = m.size
                    crop = m.crop((int(b[0] * w), int(b[1] * h), max(int(b[0] * w) + 1, int(b[2] * w)), max(int(b[1] * h) + 1, int(b[3] * h))))
                    return np.asarray(crop, dtype=np.float32).mean() / 255 >= 0.3
                own = [b for b in own if on_land(b)]
            retail_node = retail.get(key) if isinstance(key, int) else None
            if (key in PHASED and retail_node and retail_node.get("mask") and retail_node["mask"] != url
                    and retail_node.get("art") and retail_node["art"]["width"] == art["width"]):
                # a phase repaints part of the zone, not its outline: the default picture's land
                base = mask_of(retail_node["mask"]) or base
            if base is None:
                continue
            mask = compose(base, own, (decor.get(art["url"]) or {}).get("pixels"), crests_of.get(art["url"], ()), seed=zlib.crc32(url.encode()))
            save_mask(mask, PUBLIC / url.lstrip("/"))
            done[url] = mask
            composed.add(url)
            counts["composed"] += 1

    # 4. continents, then worlds: their children's land
    for kind in (() if args.labels_only else ("continent", "world")):
        for _, nodes in trees:
            for key, node in nodes.items():
                url, art = node.get("mask"), node.get("art")
                if node.get("type") != kind or not url or not art or url in composed:
                    continue
                size = mask_size(art["width"], art["height"])
                shape = children_shape(key, nodes, done, size)
                if shape is None:
                    continue
                mask = finish(shape, close=FEATHER)
                own = [l["box"] for l in labels_of.get(art["url"], []) if l["labelFor"] in {key} | descendants(key, nodes)]
                mask = compose(mask, own, (decor.get(art["url"]) or {}).get("pixels"), (), seed=zlib.crc32(url.encode()))
                save_mask(mask, PUBLIC / url.lstrip("/"))
                set_method(manifest, url, "children")
                composed.add(url)
                done[url] = mask
                counts["children"] += 1
    # 5. labels and decor on every copy of each picture in maps.json / eras.json
    def annotate(art):
        if not art or not isinstance(art, dict) or "url" not in art:
            return
        art.pop("labels", None)
        if art["url"] in labels_of:
            # objects: {box (the word), plaque (with its banner), labelFor, patch?}
            art["paintedLabels"] = labels_of[art["url"]]
        items = [{"box": b, "kind": "ornament"} for b in (decor.get(art["url"]) or {}).get("boxes", [])]
        crests = crests_of.get(art["url"])
        if crests is None:  # not re-derived this run (--labels-only): keep the known crests
            crests = [d["box"] for d in art.get("decor", []) if isinstance(d, dict) and d.get("kind") == "crest"]
        items += [{"box": b, "kind": "crest"} for b in crests]
        if items:
            art["decor"] = items
        else:
            art.pop("decor", None)

    for node in maps:
        annotate(node.get("art"))
    for era in eras:
        for value in era["maps"].values():
            if isinstance(value, dict):
                annotate(value.get("art"))
    write_json(DATA_DIR / "maps.json", maps)
    write_json(DATA_DIR / "eras.json", eras)
    write_json(DATA_DIR / "art-manifest.json", manifest)
    print(f"masks refined: {counts}; pictures with labels {len(labels_of)}, with decor {len(decor)}")


if __name__ == "__main__":
    main()
