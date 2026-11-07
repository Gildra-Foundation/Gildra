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
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage  # noqa: E402

from build_world_map import DATA_DIR, write_json  # noqa: E402
from composite import PUBLIC, node_image, resolve_era  # noqa: E402
from masks import FEATHER, binary, carry, coverage, finish, mask_size, save_mask, union  # noqa: E402

from PIL import ImageFilter  # noqa: E402

CONTENT_TYPES = {"zone", "micro", "orphan"}
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


def content_shape(picture: Image.Image, size: tuple[int, int]) -> Image.Image | None:
    """Binary shape of the drawing on a parchment sheet (None when nothing sensible is found)."""
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

    score = 0.6 * norm(colour) + 0.4 * norm(detail)
    shape = score > _otsu(score[by:-by, bx:-bx])
    shape[: by // 2] = shape[-(by // 2) :] = False
    shape[:, : bx // 2] = shape[:, -(bx // 2) :] = False
    shape = ndimage.binary_closing(shape, iterations=6)
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
    return Image.fromarray((result * 255).astype(np.uint8))


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
    maps = json.loads((DATA_DIR / "maps.json").read_text())
    eras = json.loads((DATA_DIR / "eras.json").read_text())
    manifest = json.loads((DATA_DIR / "art-manifest.json").read_text())
    retail = {m["id"]: m for m in maps}
    trees = [("today", retail)] + [(e["id"], resolve_era(eras, retail, e["id"])) for e in eras if not e.get("inherits")]
    variants = [(e["id"], resolve_era(eras, retail, e["id"])) for e in eras if e.get("inherits")]
    done: dict[str, Image.Image] = {}
    counts = {"content": 0, "children": 0, "kept": 0}

    # 1. drawings on parchment
    for _, nodes in trees + variants:
        for node in nodes.values():
            url, art = node.get("mask"), node.get("art")
            if not url or not art or url in done or node.get("type") not in CONTENT_TYPES or art["width"] > 1100:
                continue
            if method_of(manifest, url) not in WEAK:
                continue
            size = mask_size(art["width"], art["height"])
            shape = content_shape(node_image(node), size)
            if shape is None:
                counts["kept"] += 1
                done[url] = Image.open(PUBLIC / url.lstrip("/")).convert("L")
                continue
            mask = finish(binary(shape), close=FEATHER)
            save_mask(mask, PUBLIC / url.lstrip("/"))
            set_method(manifest, url, "content")
            done[url] = mask
            counts["content"] += 1

    # 2. continents, then worlds: their children's land
    for kind in ("continent", "world"):
        for _, nodes in trees:
            for key, node in nodes.items():
                url, art = node.get("mask"), node.get("art")
                if node.get("type") != kind or not url or not art or (url in done and method_of(manifest, url) == "children"):
                    continue
                size = mask_size(art["width"], art["height"])
                shape = children_shape(key, nodes, done, size)
                if shape is None:
                    continue
                mask = finish(shape, close=FEATHER)
                save_mask(mask, PUBLIC / url.lstrip("/"))
                set_method(manifest, url, "children")
                done[url] = mask
                counts["children"] += 1
    write_json(DATA_DIR / "art-manifest.json", manifest)
    print(f"masks refined: {counts}")


if __name__ == "__main__":
    main()
