#!/usr/bin/env python3
"""Neighbouring maps must not claim the same land.

Zone masks are grown and feathered, so two zones of one continent can both claim
the strip along their border — the viewer then draws it twice (both pictures,
each painting the other's edge).  For every pair of siblings (zones, continents
and cities on one parent) the masks are laid into one window of the parent's
space; where both claim more than 2 % of the smaller one's land, the claimed
strip is split along the line of equal depth (each pixel goes to the map it lies
deeper inside), with a short soft edge.  A city never keeps land of a zone it
does not lie in; a city inside its zone (the zone holds > 60 % of it) is left as
it is — it is drawn over that zone by design.

Run after refine_masks.py (and before validate_eras.py, which checks the result).

Usage: python neighbours.py [--report-only]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from scipy import ndimage  # noqa: E402

from build_world_map import CITIES, DATA_DIR  # noqa: E402
from composite import PUBLIC, resolve_era  # noqa: E402
from masks import carry, save_mask  # noqa: E402

KINDS = ("zone", "continent")
LIMIT = 0.02
WINDOW = 768  # px of the smaller map's width in the pair's window


def load(url: str, cache: dict) -> Image.Image | None:
    if url not in cache:
        path = PUBLIC / url.lstrip("/")
        cache[url] = Image.open(path).convert("L") if path.exists() else None
    return cache[url]


def pair_window(ra, rb):
    """Union of two rects (parent space) and its pixel size: the smaller rect ~WINDOW px wide."""
    x0, y0 = min(ra[0], rb[0]), min(ra[1], rb[1])
    x1, y1 = max(ra[2], rb[2]), max(ra[3], rb[3])
    small = min(ra[2] - ra[0], rb[2] - rb[0])
    scale = WINDOW / max(small, 1e-9)
    w = int(min(4096, max(16, (x1 - x0) * scale)))
    h = int(min(4096, max(16, (y1 - y0) * scale * 0.6667)))  # pictures are 3:2
    return (x0, y0, x1, y1), (w, h)


def claims(ma, ra, mb, rb):
    window, size = pair_window(ra, rb)
    a = np.asarray(carry(ma, tuple(ra), window, size), dtype=np.float32) / 255
    b = np.asarray(carry(mb, tuple(rb), window, size), dtype=np.float32) / 255
    return window, size, a, b


def overlap_share(a, b) -> float:
    both = ((a > 0.5) & (b > 0.5)).sum()
    small = min((a > 0.5).sum(), (b > 0.5).sum())
    return float(both) / small if small else 0.0


def is_city(key, node) -> bool:
    return key in CITIES


def same_place(ka, a, kb, b) -> bool:
    return (a.get("samePlaceAs") == kb or b.get("samePlaceAs") == ka or (a.get("samePlaceAs") is not None and a.get("samePlaceAs") == b.get("samePlaceAs"))
            or kb in (a.get("parts") or []) or ka in (b.get("parts") or []))


def pairs_of(nodes: dict):
    by_parent: dict = {}
    for key, node in nodes.items():
        if node.get("type") in KINDS and node.get("art") and node.get("mask") and node.get("rectInParent"):
            by_parent.setdefault(node.get("parentId"), []).append(key)
    for keys in by_parent.values():
        keys.sort(key=str)
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                a, b = nodes[keys[i]], nodes[keys[j]]
                ra, rb = a["rectInParent"], b["rectInParent"]
                if ra[0] < rb[2] and rb[0] < ra[2] and ra[1] < rb[3] and rb[1] < ra[3]:
                    yield keys[i], keys[j]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    maps = json.loads((DATA_DIR / "maps.json").read_text())
    eras = json.loads((DATA_DIR / "eras.json").read_text())
    retail = {m["id"]: m for m in maps}
    trees = [("today", retail)] + [(e["id"], resolve_era(eras, retail, e["id"])) for e in eras if not e.get("inherits")]
    cache: dict = {}
    seen: set = set()
    before, after = [], []
    for tree_id, nodes in trees:
        for ka, kb in pairs_of(nodes):
            a, b = nodes[ka], nodes[kb]
            if same_place(ka, a, kb, b):
                continue  # one place in two maps: only one of them is drawn (places.py)
            signature = (a["mask"], tuple(a["rectInParent"]), b["mask"], tuple(b["rectInParent"]))
            if signature in seen:
                continue
            seen.add(signature)
            ma, mb = load(a["mask"], cache), load(b["mask"], cache)
            if ma is None or mb is None:
                continue
            window, size, ca, cb = claims(ma, a["rectInParent"], mb, b["rectInParent"])
            share = overlap_share(ca, cb)
            if share <= LIMIT:
                continue
            # a city inside its zone is drawn over it by design
            city_a, city_b = is_city(ka, a), is_city(kb, b)
            if city_a != city_b:
                city, zone = (ca, cb) if city_a else (cb, ca)
                inside = float(((city > 0.5) & (zone > 0.5)).sum()) / max(1, (city > 0.5).sum())
                if inside > 0.6:
                    continue
            before.append((tree_id, ka, kb, round(share, 3)))
            if args.report_only:
                continue
            da = ndimage.distance_transform_edt(ca > 0.5)
            db = ndimage.distance_transform_edt(cb > 0.5)
            soft = max(2.0, 0.004 * size[0])
            if city_a != city_b:
                # the city gives way wherever the other zone claims land
                keep_a = np.where(cb > 0.5, 0.0, 1.0) if city_a else np.ones_like(ca)
                keep_b = np.where(ca > 0.5, 0.0, 1.0) if city_b else np.ones_like(cb)
            else:
                t = np.clip((da - db) / soft * 0.5 + 0.5, 0, 1)
                both = (ca > 0.5) & (cb > 0.5)
                keep_a = np.where(both, t, 1.0)
                keep_b = np.where(both, 1 - t, 1.0)
            for key, node, mask, keep in ((ka, a, ma, keep_a), (kb, b, mb, keep_b)):
                if keep.min() >= 0.999:
                    continue
                keep_img = Image.fromarray((ndimage.gaussian_filter(keep, 1.0) * 255).astype(np.uint8))
                local = carry(keep_img, window, tuple(node["rectInParent"]), mask.size)
                # outside the window (none) the map keeps its land
                trimmed = Image.fromarray((np.asarray(mask, dtype=np.float32) * np.asarray(local, dtype=np.float32) / 255).astype(np.uint8))
                cache[node["mask"]] = trimmed
                save_mask(trimmed, PUBLIC / node["mask"].lstrip("/"))
            ca2 = np.asarray(carry(cache[a["mask"]], tuple(a["rectInParent"]), window, size), dtype=np.float32) / 255
            cb2 = np.asarray(carry(cache[b["mask"]], tuple(b["rectInParent"]), window, size), dtype=np.float32) / 255
            after.append((tree_id, ka, kb, round(overlap_share(ca2, cb2), 3)))
    report = {"limit": LIMIT, "before": before, "after": after}
    (Path("/tmp/mapd6") / "neighbours.json").write_text(json.dumps(report, indent=1))
    print(f"pairs over {LIMIT:.0%}: {len(before)}; after trimming over the limit: {sum(1 for *_, s in after if s > LIMIT)}")


if __name__ == "__main__":
    main()
