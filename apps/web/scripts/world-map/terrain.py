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

Usage: /tmp/wm-venv/bin/python apps/web/scripts/world-map/terrain.py --work /tmp/wm-work [--maps 12,13] [--quality 85]
"""

from __future__ import annotations

import argparse
import io
import json
import math
import pickle
import shutil
import struct
import sys
import time
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

from geometry import Geometry, world_to_ui, ui_to_world  # noqa: E402
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


def encode_cached_block(task):
    """Decode BLP in a process: Pillow's DXT decoder otherwise holds the GIL."""
    path, block, origin, block_px, level_dir, quality = task
    if not path.exists():
        return []
    with Image.open(path) as source:
        image = source.convert("RGBA")
    if image.size != (block_px, block_px):
        image = image.resize((block_px, block_px), Image.Resampling.BILINEAR)
    split = block_px // TILE
    written = []
    for dx in range(split):
        for dy in range(split):
            crop = image.crop((dx*TILE,dy*TILE,(dx+1)*TILE,(dy+1)*TILE))
            if crop.getchannel("A").getextrema()[1] == 0:
                continue
            x,y = (block[0]-origin[0])*split+dx, (block[1]-origin[1])*split+dy
            crop.save(level_dir/f"{x}_{y}.webp", "WEBP", quality=quality, method=4)
            crop.save(level_dir.parent/".native"/f"{x}_{y}.png", compress_level=1)
            written.append((x,y))
    return written


def build_pyramid(map_id: int, box_row: dict, client, out_dir: Path, quality: int, workers: int, block_px: int) -> dict | None:
    """Pyramid of every block of ``map_id`` overlapping ``box_row``'s world box -> extent and stats."""
    map_row = client.tables["Map"].get(map_id)
    wdt_id = map_row and map_row.get("WdtFileDataID")
    if not wdt_id:
        wdt_id = getattr(client, "named_files", {}).get(f"world/maps/{map_row['Directory']}/{map_row['Directory']}.wdt".lower())
    if not wdt_id:
        return None
    blocks = wdt_minimaps(client.client.read_fdid(wdt_id))
    chosen = sorted({b for row in (box_row if isinstance(box_row, list) else [box_row]) for b in blocks_in(row, blocks)})
    if not chosen:
        return None
    bx0, bx1 = min(b[0] for b in chosen), max(b[0] for b in chosen)
    by0, by1 = min(b[1] for b in chosen), max(b[1] for b in chosen)
    cols, rows = bx1 - bx0 + 1, by1 - by0 + 1
    refs = client.client.resolve({blocks[b] for b in chosen})
    cache = client.cache / f"minimaps-{client.client.product}" if hasattr(client, "cache") else None
    if cache:
        cache.mkdir(exist_ok=True)

    def source_bytes(block):
        fdid = blocks[block]
        path = cache / f"{fdid}.blp" if cache else None
        if path and path.exists():
            return path.read_bytes()
        ref = refs.get(fdid)
        if ref is None:
            return None
        try:
            data = ref.read()
        except (MissingFile, EncryptedFile):
            return None
        if path:
            path.write_bytes(data)
        return data

    def dimensions(block):
        data = source_bytes(block)
        if data is None:
            return 0
        with Image.open(io.BytesIO(data)) as image:
            if image.width != image.height or image.width not in (256, 512, 1024):
                raise ValueError(f"unsupported minimap size {image.size}")
            return image.width

    with ThreadPoolExecutor(max_workers=workers) as pool:
        block_px = max(pool.map(dimensions, chosen))
    if not block_px:
        return None
    split = block_px // TILE  # tiles per block side at the deepest level
    width, height = cols * block_px, rows * block_px
    max_zoom = max(0, math.ceil(math.log2(max(width, height) / TILE)))
    if out_dir.exists():
        shutil.rmtree(out_dir)
    level_dir = out_dir / str(max_zoom)
    level_dir.mkdir(parents=True)
    (out_dir / ".native").mkdir()

    def fetch(block):
        data = source_bytes(block)
        if data is None:
            return []
        image = Image.open(io.BytesIO(data))
        image.load()
        # Mixed source sizes exist (e.g. 5.5 Pandaria). The finest block is
        # texel-exact; lower resolution blocks are sampled onto the same grid.
        if image.size != (block_px, block_px):
            image = image.resize((block_px, block_px), Image.Resampling.BILINEAR)
        image = image.convert("RGBA")
        if image.getchannel("A").getextrema()[1] == 0:
            return []
        written = []
        for dx in range(split):
            for dy in range(split):
                tile = ((block[0] - bx0) * split + dx, (block[1] - by0) * split + dy)
                crop = image.crop((dx * TILE, dy * TILE, (dx + 1) * TILE, (dy + 1) * TILE))
                crop.save(level_dir / f"{tile[0]}_{tile[1]}.webp", "WEBP", quality=quality, method=4)
                crop.save(out_dir / ".native" / f"{tile[0]}_{tile[1]}.png", compress_level=1)
                written.append(tile)
        return written

    present: dict[int, set[tuple[int, int]]] = {max_zoom: set()}
    if cache:
        tasks = [(cache/f"{blocks[b]}.blp", b, (bx0,by0), block_px, level_dir, quality) for b in chosen]
        with ProcessPoolExecutor(max_workers=min(workers, 4)) as pool:
            for tiles in pool.map(encode_cached_block, tasks):
                present[max_zoom].update(tiles)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for tiles in pool.map(fetch, chosen):
                present[max_zoom].update(tiles)
    if not present[max_zoom]:
        shutil.rmtree(out_dir)
        return None
    # Decode native lossless pixels once. Each level averages this source,
    # never a previously compressed/rounded level. Whole-image area sampling
    # has no per-tile filter boundary. Largest supported continent is <2.5 GiB.
    native = present[max_zoom]
    canvas = Image.new("RGBA", (width, height))
    for x, y in sorted(native):
        with Image.open(out_dir / ".native" / f"{x}_{y}.png") as source:
            canvas.paste(source, (x * TILE, y * TILE))
    for z in range(max_zoom - 1, -1, -1):
        factor = 2 ** (max_zoom - z)
        parents = {(x // factor, y // factor) for x, y in native}
        zdir = out_dir / str(z)
        zdir.mkdir(parents=True)
        small = canvas.resize((math.ceil(width / factor), math.ceil(height / factor)), Image.Resampling.BOX)

        def merge(tile):
            tx, ty = tile
            crop = small.crop((tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE))
            crop.save(zdir / f"{tx}_{ty}.webp", "WEBP", quality=80, method=4)
            return tile

        with ThreadPoolExecutor(max_workers=min(workers, 8)) as pool:
            present[z] = set(pool.map(merge, sorted(parents)))
        small.close()
    canvas.close()
    shutil.rmtree(out_dir / ".native")
    index = {str(z): sorted(f"{x}_{y}" for x, y in tiles) for z, tiles in present.items()}
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    empty = {}
    for z in range(max_zoom + 1):
        scale = 2 ** (max_zoom - z)
        nx, ny = math.ceil(width / TILE / scale), math.ceil(height / TILE / scale)
        empty[str(z)] = [f"{x}_{y}" for x in range(nx) for y in range(ny) if (x, y) not in present[z]]
    (out_dir / "empty.json").write_text(json.dumps(empty, separators=(",", ":")))
    size = sum(f.stat().st_size for f in out_dir.rglob("*") if f.is_file())
    # world corners of the stitched picture: top-left of block (bx0, by0), bottom-right of (bx1, by1)
    _, _, top_x, left_y = block_box(bx0, by0)
    bottom_x, right_y, _, _ = block_box(bx1, by1)
    return {
        "mapId": map_id, "corners": (top_x, left_y, bottom_x, right_y), "width": width, "height": height, "maxZoom": max_zoom,
        "blockPixels": block_px, "blocks": sum(1 for _ in chosen), "tiles": sum(len(t) for t in present.values()), "bytes": size,
    }


def terrain_for(ui_map: int, row: dict, pyramid: dict, folder: int) -> dict:
    top_x, left_y, bottom_x, right_y = pyramid["corners"]
    u0, v0 = world_to_ui(row, top_x, left_y)
    u1, v1 = world_to_ui(row, bottom_x, right_y)
    return {
        "url": f"{TERRAIN_URL}/{folder}/{{z}}/{{x}}_{{y}}.webp",
        "index": f"{TERRAIN_URL}/{folder}/index.json",
        "empty": f"{TERRAIN_URL}/{folder}/empty.json",
        "ocean": "#163747",
        "tileSize": TILE,
        "width": pyramid["width"],
        "height": pyramid["height"],
        "maxZoom": pyramid["maxZoom"],
        "rect": [round(u0, 6), round(v0, 6), round(u1, 6), round(v1, 6)],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--product", default="wow")
    parser.add_argument("--region", default="us")
    parser.add_argument("--prefix", default="", help="separate era output namespace")
    parser.add_argument("--manifest", default="terrain-manifest.json")
    parser.add_argument("--listfile", type=Path)
    parser.add_argument("--maps", help="comma separated UiMap IDs (default: the main continents)")
    parser.add_argument("--quality", type=int, default=85)
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--block-px", type=int, default=512, help="legacy hint; source dimensions always determine native resolution")
    args = parser.parse_args()
    client = GameTables(args.product, args.work, region=args.region)
    cache = args.work / f"tables-{args.product}.pkl"
    client.tables = pickle.loads(cache.read_bytes()) if cache.exists() else client.load(("UiMap", "UiMapAssignment", "UiMapLink", "Map"))
    client.named_files = {}
    if args.listfile:
        for line in args.listfile.open():
            fdid, _, name = line.strip().partition(";")
            if name.lower().endswith(".wdt"):
                client.named_files[name.lower()] = int(fdid)
    geometry = Geometry(client.tables["UiMapAssignment"], client.tables["UiMapLink"])
    manifest_path = DATA_DIR / args.manifest
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"maps": {}, "stats": {}}
    manifest["build"] = client.version
    manifest["encoding"] = {"format": "webp", "deepQuality": args.quality, "coarseQuality": 80, "sampling": "native-area", "mixedSourceSampling": "bilinear"}
    ids = [int(m) for m in args.maps.split(",")] if args.maps else CONTINENTS
    built: dict[int, tuple[int, dict]] = {}  # MapID -> (folder, pyramid): continents on one MapID share it
    groups = {}
    for i in ids:
        r = geometry.primary(i)
        if r:
            groups.setdefault(r["MapID"], []).append(r)
    for ui_map in ids:
        started = time.time()
        row = geometry.primary(ui_map)
        name = client.tables["UiMap"][ui_map]["Name_lang"]
        if row is None:
            print(f"{ui_map}: no world box")
            continue
        previous = manifest["maps"].get(str(ui_map))
        if args.resume and previous and (WEB / "public" / previous["index"].lstrip("/")).exists():
            a,b,c,d = previous["rect"]
            corners = (*ui_to_world(row,a,b), *ui_to_world(row,c,d))
            built.setdefault(row["MapID"], (ui_map, {**previous, "corners": corners}))
            print(f"{ui_map} {name}: resumed", flush=True)
            continue
        if row["MapID"] in built:
            folder, pyramid = built[row["MapID"]]
            x0, y0, _, x1, y1, _ = row["Region"]
            ax, ay, bx, by = pyramid["corners"]
            if not (bx <= x0 + 1 and ax >= x1 - 1 and by <= y0 + 1 and ay >= y1 - 1):
                print(f"{ui_map} {name}: outside the shared terrain of map {row['MapID']}")
            manifest["maps"][str(ui_map)] = terrain_for(ui_map, row, pyramid, f"{args.prefix}/{folder}".strip("/"))
            manifest["stats"].pop(str(ui_map), None)
            print(f"{ui_map} {name}: shares terrain {folder}, rect {manifest['maps'][str(ui_map)]['rect']}", flush=True)
        else:
            pyramid = build_pyramid(row["MapID"], groups[row["MapID"]], client, TERRAIN_DIR / args.prefix / str(ui_map), args.quality, args.workers, args.block_px)
            if pyramid is None:
                print(f"{ui_map} {name}: no terrain")
                manifest["maps"].pop(str(ui_map), None)
                continue
            built[row["MapID"]] = (ui_map, pyramid)
            terrain = terrain_for(ui_map, row, pyramid, f"{args.prefix}/{ui_map}".strip("/"))
            manifest["maps"][str(ui_map)] = terrain
            manifest["stats"][str(ui_map)] = {k: pyramid[k] for k in ("mapId", "blockPixels", "blocks", "tiles", "bytes")}
            print(f"{ui_map} {name}: {pyramid['blocks']} blocks, {terrain['width']}x{terrain['height']} z{terrain['maxZoom']}, "
                  f"{pyramid['bytes'] / 1e6:.1f} MB, rect {terrain['rect']}, {time.time() - started:.0f}s", flush=True)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(s["bytes"] for s in manifest["stats"].values())
    print(f"terrain total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
