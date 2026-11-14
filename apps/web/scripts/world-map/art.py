"""World-map art: BLP tiles from the game files -> stitched image -> WebP pyramid."""

from __future__ import annotations

import hashlib
import io
import math
import shutil
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from tact import EncryptedFile, MissingFile

TILE = 256


@dataclass
class ArtSpec:
    art_id: int
    width: int
    height: int
    tile_width: int
    tile_height: int
    tiles: dict[tuple[int, int], int]  # (row, col) -> FileDataID, layer 0
    # exploration overlays drawn by the game on top of the base art once an area is
    # explored: (offset_x, offset_y, width, height, {(row, col): FileDataID})
    overlays: list = field(default_factory=list)
    # hover highlight of the map on its parent: ("file", fdid) or
    # ("atlas", fdid, left, top, right, bottom) — a region of an atlas texture
    highlight: tuple | None = None
    overlay_areas: list = field(default_factory=list)  # AreaIDs of each overlay

    def fdids(self) -> set[int]:
        out = set(self.tiles.values())
        if self.highlight:
            out.add(self.highlight[1])
        for *_, tiles in self.overlays:
            out |= set(tiles.values())
        return out

    def fingerprint(self) -> str:
        base = ",".join(str(self.tiles[k]) for k in sorted(self.tiles))
        extra = ";".join(f"{x},{y},{w},{h}:" + ",".join(str(t[k]) for k in sorted(t)) for x, y, w, h, t in self.overlays)
        return base + ("|" + extra if extra else "")


def art_specs(tables: dict[str, dict[int, dict]]) -> dict[int, ArtSpec]:
    layers = {}
    for layer in tables["UiMapArtStyleLayer"].values():
        if layer["LayerIndex"] == 0:
            layers[layer["UiMapArtStyleID"]] = layer
    tiles: dict[int, dict[tuple[int, int], int]] = {}
    for tile in tables["UiMapArtTile"].values():
        if tile["LayerIndex"] != 0:
            continue
        tiles.setdefault(tile["UiMapArtID"], {})[(tile["RowIndex"], tile["ColIndex"])] = tile["FileDataID"]
    overlay_tiles: dict[int, dict[tuple[int, int], int]] = {}
    for tile in tables.get("WorldMapOverlayTile", {}).values():
        if tile["LayerIndex"] == 0:
            overlay_tiles.setdefault(tile["WorldMapOverlayID"], {})[(tile["RowIndex"], tile["ColIndex"])] = tile["FileDataID"]
    overlays: dict[int, list] = {}
    overlay_areas: dict[int, list] = {}
    for overlay_id, overlay in sorted(tables.get("WorldMapOverlay", {}).items()):
        # conditional overlays belong to quest phases; the explored map shows the rest
        if overlay.get("PlayerConditionID") or overlay_id not in overlay_tiles:
            continue
        overlays.setdefault(overlay["UiMapArtID"], []).append(
            (overlay["OffsetX"], overlay["OffsetY"], overlay["TextureWidth"], overlay["TextureHeight"], overlay_tiles[overlay_id])
        )
        area = overlay.get("AreaID") or []
        overlay_areas.setdefault(overlay["UiMapArtID"], []).append(tuple(area if isinstance(area, list) else [area]))
    atlas_members = tables.get("UiTextureAtlasMember", {})
    atlases = tables.get("UiTextureAtlas", {})

    def highlight_of(art):
        if art.get("HighlightFileDataID"):
            return ("file", art["HighlightFileDataID"])
        member = atlas_members.get(art.get("HighlightAtlasID") or 0)
        atlas = atlases.get(member["UiTextureAtlasID"]) if member else None
        if member and atlas and atlas.get("FileDataID"):
            return ("atlas", atlas["FileDataID"], member["CommittedLeft"], member["CommittedTop"], member["CommittedRight"], member["CommittedBottom"])
        return None

    specs = {}
    for art_id, art in tables["UiMapArt"].items():
        layer = layers.get(art["UiMapArtStyleID"])
        if not layer or art_id not in tiles:
            continue
        specs[art_id] = ArtSpec(
            art_id,
            layer["LayerWidth"],
            layer["LayerHeight"],
            layer["TileWidth"],
            layer["TileHeight"],
            tiles[art_id],
            overlays.get(art_id, []),
            highlight_of(art),
            overlay_areas.get(art_id, []),
        )
    return specs


def stitch(refs: dict, spec: ArtSpec, workers: int = 8, keep: dict | None = None) -> Image.Image:
    """Download every layer-0 tile of ``spec`` (refs: FileDataID -> FileRef) and stitch them."""
    rows = max(r for r, _ in spec.tiles) + 1
    cols = max(c for _, c in spec.tiles) + 1
    canvas = Image.new("RGBA", (cols * spec.tile_width, rows * spec.tile_height), (0, 0, 0, 0))

    def load(item):
        (row, col), fdid = item
        ref = refs.get(fdid)
        if ref is None:
            return row, col, None
        try:
            data = ref.read()
        except (MissingFile, EncryptedFile):
            return row, col, None
        image = Image.open(io.BytesIO(data))
        image.load()
        return row, col, image.convert("RGBA")

    missing = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for row, col, image in pool.map(load, spec.tiles.items()):
            if image is None:
                missing += 1
                continue
            if image.size != (spec.tile_width, spec.tile_height):
                image = image.resize((spec.tile_width, spec.tile_height), Image.LANCZOS)
            canvas.paste(image, (col * spec.tile_width, row * spec.tile_height))
    if missing:
        raise MissingFile(f"art {spec.art_id}: {missing} of {len(spec.tiles)} tiles unavailable")
    overlay_items = [((i, rc), fdid) for i, (*_, tiles) in enumerate(spec.overlays) for rc, fdid in tiles.items()]
    if overlay_items:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            loaded = dict(pool.map(lambda item: (item[0], load((item[0][1], item[1]))[2]), overlay_items))
        if keep is not None:
            keep.update(loaded)
        for i, (x, y, w, h, tiles) in enumerate(spec.overlays):
            if any(loaded.get((i, rc)) is None for rc in tiles):
                # an overlay of content the client keeps encrypted (not yet released): skip it
                continue
            layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            for (row, col) in tiles:
                piece = loaded.get((i, (row, col)))
                # each overlay texture is cut into 256 px tiles; the last row/column is partial
                piece = piece.crop((0, 0, min(piece.width, w - col * 256), min(piece.height, h - row * 256)))
                layer.paste(piece, (x + col * 256, y + row * 256))
            canvas.alpha_composite(layer)
    return canvas.crop((0, 0, spec.width, spec.height))


def load_highlight(refs: dict, spec: ArtSpec) -> Image.Image | None:
    """The map's hover highlight texture (an atlas region cut out)."""
    if not spec.highlight or spec.highlight[1] not in refs:
        return None
    try:
        image = Image.open(io.BytesIO(refs[spec.highlight[1]].read()))
        image.load()
    except (MissingFile, EncryptedFile, OSError):
        return None
    if spec.highlight[0] == "atlas":
        _, _, left, top, right, bottom = spec.highlight
        if right <= left or bottom <= top:
            return None
        image = image.crop((left, top, right, bottom))
    return image


def load_overlays(refs: dict, spec: ArtSpec, workers: int = 8) -> dict:
    """{(overlay index, (row, col)): image} of every exploration overlay tile."""
    items = [((i, rc), fdid) for i, (*_, tiles) in enumerate(spec.overlays) for rc, fdid in tiles.items()]

    def load(item):
        key, fdid = item
        ref = refs.get(fdid)
        if ref is None:
            return key, None
        try:
            image = Image.open(io.BytesIO(ref.read()))
            image.load()
            return key, image.convert("RGBA")
        except (MissingFile, EncryptedFile, OSError):
            return key, None

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(load, items))


def image_digest(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def max_zoom_for(width: int, height: int) -> int:
    return max(0, math.ceil(math.log2(max(width, height) / TILE)))


def write_pyramid(image: Image.Image, out_dir: Path, quality: int = 80, max_side: int | None = None) -> dict:
    """Write {z}/{x}_{y}.webp tiles; returns {width,height,tileSize,maxZoom,bytes,tiles}."""
    if max_side and max(image.size) > max_side:
        scale = max_side / max(image.size)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    width, height = image.size
    max_zoom = max_zoom_for(width, height)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    total = count = 0
    level = image
    for z in range(max_zoom, -1, -1):
        if z != max_zoom:
            factor = 2 ** (max_zoom - z)
            level = image.resize((max(1, math.ceil(width / factor)), max(1, math.ceil(height / factor))), Image.LANCZOS)
        zdir = out_dir / str(z)
        zdir.mkdir(parents=True, exist_ok=True)
        for ty in range(math.ceil(level.height / TILE)):
            for tx in range(math.ceil(level.width / TILE)):
                tile = level.crop((tx * TILE, ty * TILE, min(level.width, (tx + 1) * TILE), min(level.height, (ty + 1) * TILE)))
                if tile.size != (TILE, TILE):
                    padded = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
                    padded.paste(tile, (0, 0))
                    tile = padded
                path = zdir / f"{tx}_{ty}.webp"
                if tile.getchannel("A").getextrema() == (255, 255):
                    tile.convert("RGB").save(path, "WEBP", quality=quality, method=6)
                else:
                    tile.save(path, "WEBP", quality=quality, method=6, exact=False)
                total += path.stat().st_size
                count += 1
    return {"width": width, "height": height, "tileSize": TILE, "maxZoom": max_zoom, "bytes": total, "tiles": count}


def localized_refs(client, spec: ArtSpec, refs_en: dict, locale: int) -> dict | None:
    """refs of ``spec`` for another locale when any of its files differ there, else None."""
    from tact import LOCALE_ENUS

    differs = [f for f in spec.fdids() if client.root.ckey(f, locale) not in (None, client.root.ckey(f, LOCALE_ENUS))]
    if not differs:
        return None
    local = client.resolve(differs, locale)
    return {**refs_en, **local}


def write_localized_pyramid(image: Image.Image, out_dir: Path, base_dir: Path, quality: int = 80) -> dict:
    """Pyramid of a localized picture; tiles identical to the base locale's become hard links."""
    import os

    meta = write_pyramid(image, out_dir, quality=quality)
    linked = 0
    for path in out_dir.rglob("*.webp"):
        twin = base_dir / path.relative_to(out_dir)
        if twin.exists() and twin.stat().st_size == path.stat().st_size and twin.read_bytes() == path.read_bytes():
            path.unlink()
            os.link(twin, path)
            linked += 1
    meta["linked"] = linked
    meta["bytes"] = sum(p.stat().st_size for p in out_dir.rglob("*.webp") if p.stat().st_nlink == 1)
    return meta
