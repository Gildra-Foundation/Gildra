#!/usr/bin/env python3
"""Deep-zoom terrain of continents from the client's minimap textures.

Every continent map (Map.db2) has a WDT whose MAID chunk lists, for each of its
64 x 64 terrain blocks (ADT, 533 1/3 yards square), the FileDataID of the
block's minimap texture (the top-down picture the in-game minimap shows, 512 px).
The blocks are stitched into a WebP pyramid of 256 px tiles whose deepest level
keeps the texture's own 512 px per block, and placed in the continent map's normalized space through the
continent's UiMapAssignment world box (``rect`` may exceed 0..1).

Writes public/maps/terrain/<uiMapId>/{z}/{x}_{y}.webp (tiles of open sea, where
the game has no block, are not written; ``index`` lists the tiles that exist)
and data/wow/map/terrain-manifest.json, which build_world_map.py merges into
maps.json as ``terrain``.

Usage: /tmp/wm-venv/bin/python apps/web/scripts/world-map/terrain.py --work /tmp/wm-work [--maps 12,13] [--quality 72]
"""

from __future__ import annotations

import argparse
import io
import json
import math
import shutil
import struct
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

from geometry import Geometry, world_to_ui  # noqa: E402
from sources import GameTables  # noqa: E402
from tact import EncryptedFile, MissingFile  # noqa: E402

WEB = Path(__file__).resolve().parents[2]
DATA_DIR = WEB / "data" / "wow" / "map"
TERRAIN_DIR = WEB / "public" / "maps" / "terrain"
TERRAIN_URL = "/maps/terrain"
BLOCK = 1600.0 / 3.0  # yards per terrain block
TILE = 256

# current-era main continents (UiMap IDs); Quel'Thalas of Midnight lies on the
# Eastern Kingdoms' MapID and shares its terrain
CONTINENTS = [12, 13, 113, 424, 619, 875, 876, 1978, 2274, 2537]


def wdt_minimaps(data: bytes) -> dict[tuple[int, int], int]:
    """WDT -> {(x, y): minimap FileDataID} from the MAID chunk."""
    cursor = 0
    while cursor + 8 <= len(data):
        magic, size = data[cursor : cursor + 4], struct.unpack("<I", data[cursor + 4 : cursor + 8])[0]
        body = data[cursor + 8 : cursor + 8 + size]
        if magic == b"DIAM":  # 'MAID' stored reversed
            out = {}
            for index in range(64 * 64):
                fields = struct.unpack("<8I", body[index * 32 : index * 32 + 32])
                minimap = fields[7]
                if minimap:
                    y, x = divmod(index, 64)
                    out[(x, y)] = minimap
            return out
        cursor += 8 + size
    raise ValueError("WDT has no MAID chunk")


def block_box(x: int, y: int) -> tuple[float, float, float, float]:
    """World box of block (x, y): (minX, minY, maxX, maxY); +X north, +Y west."""
    max_x = (32 - y) * BLOCK
    max_y = (32 - x) * BLOCK
    return max_x - BLOCK, max_y - BLOCK, max_x, max_y


def blocks_in(row: dict, blocks) -> list[tuple[int, int]]:
    """Blocks that overlap the assignment's world box."""
    x0, y0, _, x1, y1, _ = row["Region"]
    out = []
    for bx, by in blocks:
        a0, b0, a1, b1 = block_box(bx, by)
        if a1 > x0 and a0 < x1 and b1 > y0 and b0 < y1:
            out.append((bx, by))
    return out


def build_pyramid(map_id: int, box_row: dict, client, out_dir: Path, quality: int, workers: int, block_px: int) -> dict | None:
    """Pyramid of every block of ``map_id`` overlapping ``box_row``'s world box -> extent and stats."""
    map_row = client.tables["Map"].get(map_id)
    wdt_id = map_row and map_row.get("WdtFileDataID")
    if not wdt_id:
        return None
    blocks = wdt_minimaps(client.client.read_fdid(wdt_id))
    chosen = blocks_in(box_row, blocks)
    if not chosen:
        return None
    bx0, bx1 = min(b[0] for b in chosen), max(b[0] for b in chosen)
    by0, by1 = min(b[1] for b in chosen), max(b[1] for b in chosen)
    cols, rows = bx1 - bx0 + 1, by1 - by0 + 1
    split = block_px // TILE  # tiles per block side at the deepest level
    width, height = cols * block_px, rows * block_px
    max_zoom = max(0, math.ceil(math.log2(max(width, height) / TILE)))
    refs = client.client.resolve({blocks[b] for b in chosen})
    if out_dir.exists():
        shutil.rmtree(out_dir)
    level_dir = out_dir / str(max_zoom)
    level_dir.mkdir(parents=True)

    def fetch(block):
        ref = refs.get(blocks[block])
        if ref is None:
            return []
        try:
            image = Image.open(io.BytesIO(ref.read()))
            image.load()
        except (MissingFile, EncryptedFile, OSError):
            return []
        image = image.convert("RGB")
        if image.size != (block_px, block_px):
            image = image.resize((block_px, block_px), Image.LANCZOS)
        written = []
        for dx in range(split):
            for dy in range(split):
                tile = ((block[0] - bx0) * split + dx, (block[1] - by0) * split + dy)
                image.crop((dx * TILE, dy * TILE, (dx + 1) * TILE, (dy + 1) * TILE)).save(level_dir / f"{tile[0]}_{tile[1]}.webp", "WEBP", quality=quality, method=6)
                written.append(tile)
        return written

    present: dict[int, set[tuple[int, int]]] = {max_zoom: set()}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for tiles in pool.map(fetch, chosen):
            present[max_zoom].update(tiles)
    if not present[max_zoom]:
        shutil.rmtree(out_dir)
        return None
    # lower levels: 2 x 2 tiles of the level below -> one tile
    for z in range(max_zoom - 1, -1, -1):
        below = present[z + 1]
        parents = {(x // 2, y // 2) for x, y in below}
        zdir = out_dir / str(z)
        zdir.mkdir(parents=True)

        def merge(tile, z=z, below=below, zdir=zdir):
            tx, ty = tile
            canvas = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
            for dx in (0, 1):
                for dy in (0, 1):
                    child = (tx * 2 + dx, ty * 2 + dy)
                    if child in below:
                        canvas.paste(Image.open(out_dir / str(z + 1) / f"{child[0]}_{child[1]}.webp").convert("RGBA"), (dx * TILE, dy * TILE))
            small = canvas.resize((TILE, TILE), Image.LANCZOS)
            path = zdir / f"{tx}_{ty}.webp"
            if small.getchannel("A").getextrema() == (255, 255):
                small.convert("RGB").save(path, "WEBP", quality=quality, method=6)
            else:
                small.save(path, "WEBP", quality=quality, method=6, exact=False)
            return tile

        with ThreadPoolExecutor(max_workers=workers) as pool:
            present[z] = set(pool.map(merge, sorted(parents)))
    index = {str(z): sorted(f"{x}_{y}" for x, y in tiles) for z, tiles in present.items()}
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    size = sum(f.stat().st_size for f in out_dir.rglob("*") if f.is_file())
    # world corners of the stitched picture: top-left of block (bx0, by0), bottom-right of (bx1, by1)
    _, _, top_x, left_y = block_box(bx0, by0)
    bottom_x, right_y, _, _ = block_box(bx1, by1)
    return {
        "mapId": map_id, "corners": (top_x, left_y, bottom_x, right_y), "width": width, "height": height, "maxZoom": max_zoom,
        "blocks": sum(1 for _ in chosen), "tiles": sum(len(t) for t in present.values()), "bytes": size,
    }


def terrain_for(ui_map: int, row: dict, pyramid: dict, folder: int) -> dict:
    top_x, left_y, bottom_x, right_y = pyramid["corners"]
    u0, v0 = world_to_ui(row, top_x, left_y)
    u1, v1 = world_to_ui(row, bottom_x, right_y)
    return {
        "url": f"{TERRAIN_URL}/{folder}/{{z}}/{{x}}_{{y}}.webp",
        "index": f"{TERRAIN_URL}/{folder}/index.json",
        "tileSize": TILE,
        "width": pyramid["width"],
        "height": pyramid["height"],
        "maxZoom": pyramid["maxZoom"],
        "rect": [round(u0, 6), round(v0, 6), round(u1, 6), round(v1, 6)],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--maps", help="comma separated UiMap IDs (default: the main continents)")
    parser.add_argument("--quality", type=int, default=72)
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--block-px", type=int, default=512, help="pixels per terrain block at the deepest level (256 or 512)")
    args = parser.parse_args()
    client = GameTables("wow", args.work)
    client.tables = client.load(("UiMap", "UiMapAssignment", "UiMapLink", "Map"))
    geometry = Geometry(client.tables["UiMapAssignment"], client.tables["UiMapLink"])
    manifest_path = DATA_DIR / "terrain-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"maps": {}, "stats": {}}
    manifest["build"] = client.version
    ids = [int(m) for m in args.maps.split(",")] if args.maps else CONTINENTS
    built: dict[int, tuple[int, dict]] = {}  # MapID -> (folder, pyramid): continents on one MapID share it
    for ui_map in ids:
        started = time.time()
        row = geometry.primary(ui_map)
        name = client.tables["UiMap"][ui_map]["Name_lang"]
        if row is None:
            print(f"{ui_map}: no world box")
            continue
        if row["MapID"] in built:
            folder, pyramid = built[row["MapID"]]
            x0, y0, _, x1, y1, _ = row["Region"]
            ax, ay, bx, by = pyramid["corners"]
            if not (bx <= x0 + 1 and ax >= x1 - 1 and by <= y0 + 1 and ay >= y1 - 1):
                print(f"{ui_map} {name}: outside the shared terrain of map {row['MapID']}")
            manifest["maps"][str(ui_map)] = terrain_for(ui_map, row, pyramid, folder)
            manifest["stats"].pop(str(ui_map), None)
            print(f"{ui_map} {name}: shares terrain {folder}, rect {manifest['maps'][str(ui_map)]['rect']}", flush=True)
        else:
            pyramid = build_pyramid(row["MapID"], row, client, TERRAIN_DIR / str(ui_map), args.quality, args.workers, args.block_px)
            if pyramid is None:
                print(f"{ui_map} {name}: no terrain")
                manifest["maps"].pop(str(ui_map), None)
                continue
            built[row["MapID"]] = (ui_map, pyramid)
            terrain = terrain_for(ui_map, row, pyramid, ui_map)
            manifest["maps"][str(ui_map)] = terrain
            manifest["stats"][str(ui_map)] = {k: pyramid[k] for k in ("mapId", "blocks", "tiles", "bytes")}
            print(f"{ui_map} {name}: {pyramid['blocks']} blocks, {terrain['width']}x{terrain['height']} z{terrain['maxZoom']}, "
                  f"{pyramid['bytes'] / 1e6:.1f} MB, rect {terrain['rect']}, {time.time() - started:.0f}s", flush=True)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(s["bytes"] for s in manifest["stats"].values())
    print(f"terrain total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
