"""Clean patches for painted words that belong to another map.

A zone picture paints the names of the cities and neighbours on it (Dun Morogh's
IRONFORGE banner, Elwynn's STORMWIND).  When the viewer focuses that city, the
parent's banner must not show around it.  For every such word the plaque's box
is refilled from the picture itself: the bands just outside the box (above,
below, left or right — whichever pair holds no other painted word) are mirrored
into it and cross-faded, so the terrain's own texture continues.  The patch is
stored as a small WebP the engine draws over the parent's picture.
"""

from __future__ import annotations

import numpy as np
from PIL import Image


def _overlaps(a, b) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def stamp(picture: np.ndarray, box: tuple[int, int, int, int], avoid: list[tuple[int, int, int, int]], other: np.ndarray | None = None) -> np.ndarray | None:
    """Patch (h, w, 4) filling ``box`` of ``picture`` from its surroundings, or None.

    ``other``: the same picture in the other language; a source band must be the same
    in both (painted words differ between them), so no word is copied into the patch."""
    height, width = picture.shape[:2]
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    if bw < 2 or bh < 2:
        return None
    def wordless(band) -> bool:
        if other is None:
            return False  # without the other language no word can be told from terrain
        a = picture[band[1]:band[3], band[0]:band[2], :3].astype(np.float32)
        b = other[band[1]:band[3], band[0]:band[2], :3].astype(np.float32)
        return a.size > 0 and float(np.abs(a - b).max(axis=2).mean()) < 6

    candidates = []
    # band pairs just outside the box, then one box further out: above/below (mirrored,
    # blended top -> bottom) or left/right; a pair touching another word is not used
    for step in (0, 1):
        above = (x0, y0 - bh * (step + 1), x1, y0 - bh * step)
        below = (x0, y1 + bh * step, x1, y1 + bh * (step + 1))
        if above[1] >= 0 and below[3] <= height and not any(_overlaps(above, o) or _overlaps(below, o) for o in avoid) and wordless(above) and wordless(below):
            candidates.append((step * 2, "v", above, below))
        if bw > 2.5 * bh:
            continue  # a banner: its side bands lie far away and hold other words
        left = (x0 - bw * (step + 1), y0, x0 - bw * step, y1)
        right = (x1 + bw * step, y0, x1 + bw * (step + 1), y1)
        if left[0] >= 0 and right[2] <= width and not any(_overlaps(left, o) or _overlaps(right, o) for o in avoid) and wordless(left) and wordless(right):
            candidates.append((step * 2 + 1, "h", left, right))
    if not candidates:
        # at the picture's top or bottom edge: one band, mirrored
        for band in ((x0, y1, x1, y1 + bh), (x0, y0 - bh, x1, y0)):
            if band[1] >= 0 and band[3] <= height and not any(_overlaps(band, o) for o in avoid) and wordless(band):
                candidates.append((9, "v", band, band))
                break
    if not candidates:
        return None  # every source band holds another word: no clean patch
    _, axis, a, b = min(candidates)
    first = picture[a[1]:a[3], a[0]:a[2]].astype(np.float32)
    second = picture[b[1]:b[3], b[0]:b[2]].astype(np.float32)
    if axis == "v":
        first, second = first[::-1], second[::-1]
        t = np.linspace(0, 1, bh)[:, None, None]
    else:
        first, second = first[:, ::-1], second[:, ::-1]
        t = np.linspace(0, 1, bw)[None, :, None]
    fill = first * (1 - t) + second * t
    # soft edge: the patch fades into the picture over 15% of the box's short side
    yy, xx = np.mgrid[0:bh, 0:bw]
    edge = np.minimum(np.minimum(xx, bw - 1 - xx), np.minimum(yy, bh - 1 - yy)).astype(np.float32)
    alpha = np.clip(edge / max(2.0, 0.15 * min(bw, bh)), 0, 1)
    out = np.dstack([np.clip(fill[..., :3], 0, 255), alpha * 255]).astype(np.uint8)
    return out


def soft_fill(picture: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray | None:
    """Last resort for an ancestor's word: the box filled by a normalized blur of the ring
    around it (smooth, no texture), fading in over its edge."""
    from scipy import ndimage

    height, width = picture.shape[:2]
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    if bw < 2 or bh < 2:
        return None
    pad = max(bw, bh) // 2 + 4
    rx0, ry0, rx1, ry1 = max(0, x0 - pad), max(0, y0 - pad), min(width, x1 + pad), min(height, y1 + pad)
    region = picture[ry0:ry1, rx0:rx1, :3].astype(np.float32)
    ring = np.ones(region.shape[:2], np.float32)
    ring[y0 - ry0:y1 - ry0, x0 - rx0:x1 - rx0] = 0
    sigma = max(3.0, 0.6 * min(bw, bh))
    weight = ndimage.gaussian_filter(ring, sigma)
    fill = np.dstack([ndimage.gaussian_filter(region[..., c] * ring, sigma) for c in range(3)]) / np.maximum(weight, 1e-3)[..., None]
    fill = fill[y0 - ry0:y1 - ry0, x0 - rx0:x1 - rx0]
    yy, xx = np.mgrid[0:bh, 0:bw]
    edge = np.minimum(np.minimum(xx, bw - 1 - xx), np.minimum(yy, bh - 1 - yy)).astype(np.float32)
    alpha = np.clip(edge / max(2.0, 0.15 * min(bw, bh)), 0, 1)
    return np.dstack([np.clip(fill, 0, 255), alpha * 255]).astype(np.uint8)


def save_patch(patch: np.ndarray, path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(patch, "RGBA").save(path, "WEBP", quality=80, method=6)
    return path.stat().st_size
