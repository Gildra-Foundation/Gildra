"""Masks of a map's own area: white = this map, black = what its parent shows.

The viewer lays a child map's art over its parent at rectInParent; the art is a
full rectangle that also paints the surroundings.  A mask cuts the child down to
its own land so children blend into the parent and into each other.

Sources, from the game's own data, in order of preference (method and checks:
docs/world-map/MASKS.md):

1. ``overlays``: the map's exploration overlays (WorldMapOverlay /
   WorldMapOverlayTile), the client's "explored area" textures of every
   sub-area in the art's own pixel space; their union is the zone's land;
2. ``highlight``: the map's hover highlight (UiMapArt.HighlightFileDataID or
   HighlightAtlasID), the shape its parent lights up under the cursor.  The
   texture spans the child's whole rect on the parent, so it is already in the
   child's art space (soft blobs for old zones, outlines for continents, which
   are filled);
3. ``footprint``: cities and other maps without both: the exploration overlay
   of the same area (WorldMapOverlay.AreaID = the map's AreaID) drawn on a
   sibling zone or on the parent, carried into the child's space through both
   rects (Orgrimmar = the "Orgrimmar" overlay of Durotar);
4. ``edge``: none of these (caves, scenario maps): a soft-edged rounded rect, so
   at least the rectangle's edge never shows.

Every mask is closed, hole-filled, grown by half the feather, blurred and faded
out at the art's border, stored at most MASK_WIDTH wide with the art's aspect.
"""

from __future__ import annotations

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

MASK_WIDTH = 512
FEATHER = 10  # px at mask resolution (gaussian radius ~ feather / 2)


def mask_size(width: int, height: int) -> tuple[int, int]:
    w = min(MASK_WIDTH, width)
    return w, max(1, round(w * height / width))


def _odd(n: float) -> int:
    n = max(1, int(round(n)))
    return n if n % 2 else n + 1


def binary(image: Image.Image, size: tuple[int, int] | None = None) -> Image.Image:
    image = image.convert("L")
    if size and image.size != size:
        image = image.resize(size, Image.BILINEAR)
    return image.point(lambda v: 255 if v >= 128 else 0)


def coverage(image: Image.Image) -> float:
    hist = image.histogram()
    return sum(hist[128:]) / max(1, image.width * image.height)


def fill_holes(shape: Image.Image) -> Image.Image:
    """Everything not reachable from the border through black becomes white."""
    w, h = shape.size
    padded = Image.new("L", (w + 2, h + 2), 0)
    padded.paste(shape, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    outside = padded.point(lambda v: 255 if v == 128 else 0).crop((1, 1, w + 1, h + 1))
    return ImageOps.invert(outside)


def border_fade(size: tuple[int, int]) -> Image.Image:
    """1 inside, falling to 0 over FEATHER px at the art's edges."""
    w, h = size
    ramp = Image.new("L", size, 255)
    draw = ImageDraw.Draw(ramp)
    for i in range(FEATHER):
        draw.rectangle((i, i, w - 1 - i, h - 1 - i), outline=round(255 * (i + 0.5) / FEATHER))
    return ramp


def finish(shape: Image.Image, close: int = 3) -> Image.Image:
    """Binary shape at mask size -> closed, filled, feathered, edge-faded mask."""
    if close:
        k = _odd(close)
        shape = shape.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
    shape = fill_holes(shape)
    shape = shape.filter(ImageFilter.MaxFilter(_odd(FEATHER / 2)))
    soft = shape.filter(ImageFilter.GaussianBlur(FEATHER / 2))
    return ImageChops.multiply(soft, border_fade(soft.size))


def overlay_pieces(spec, images: dict) -> list[tuple[tuple[int, ...], Image.Image]]:
    """[(AreaIDs, binary alpha at mask size)] of every exploration overlay of ``spec``."""
    size = mask_size(spec.width, spec.height)
    sx, sy = size[0] / spec.width, size[1] / spec.height
    areas = getattr(spec, "overlay_areas", None) or [()] * len(spec.overlays)
    out = []
    for i, (x, y, w, h, tiles) in enumerate(spec.overlays):
        if w * h >= 0.85 * spec.width * spec.height:
            continue  # a repaint of the whole art (a phase), not a sub-area
        pieces = {rc: images.get((i, rc)) for rc in tiles}
        if not pieces or any(p is None for p in pieces.values()):
            continue
        full = Image.new("L", (max(1, w), max(1, h)), 0)
        for (row, col), piece in pieces.items():
            piece = piece.convert("RGBA")
            piece = piece.crop((0, 0, min(piece.width, w - col * 256), min(piece.height, h - row * 256)))
            full.paste(piece.getchannel("A"), (col * 256, row * 256))
        layer = Image.new("L", size, 0)
        scaled = full.resize((max(1, round(w * sx)), max(1, round(h * sy))), Image.BILINEAR)
        layer.paste(scaled, (round(x * sx), round(y * sy)))
        layer = layer.point(lambda v: 255 if v >= 96 else 0)
        if layer.getbbox():
            out.append((tuple(a for a in areas[i] if a), layer))
    return out


def highlight_shape(image: Image.Image | None, size: tuple[int, int]) -> Image.Image | None:
    """Hover highlight (additive: brightness = shape) -> binary shape at ``size``."""
    if image is None:
        return None
    rgba = image.convert("RGBA")
    lum = rgba.convert("L")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 250:  # textures with real alpha: the alpha is the shape
        lum = ImageChops.multiply(lum, alpha) if lum.getextrema()[1] > 16 else alpha
    high = lum.getextrema()[1]
    if high < 8:
        return None
    # at the texture's own resolution: close the gaps of outlines, fill them
    shape = lum.point(lambda v: 255 if v >= max(6, high * 0.3) else 0)
    k = _odd(max(3, shape.width / 128))
    shape = fill_holes(shape.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)))
    shape = binary(shape, size)
    if not shape.getbbox() or coverage(shape) > 0.9:
        return None  # nothing, or the whole rect: no shape to cut by
    return shape


def union(images) -> Image.Image | None:
    out = None
    for image in images:
        out = image if out is None else ImageChops.lighter(out, image)
    return out


def own_mask(spec, pieces, highlight) -> tuple[Image.Image, str] | None:
    """Mask from the map's own data (overlays, highlight) -> (mask, method) or None."""
    size = mask_size(spec.width, spec.height)
    land = union(p for _, p in pieces)
    hl = highlight_shape(highlight, size)
    if land is not None and coverage(land) > 0.92:
        land = None
    if land is not None:
        if hl is not None:
            # overlays leave out sub-areas without one: when the highlight covers
            # much more than the overlays, take both
            inside = coverage(ImageChops.multiply(land, hl)) / max(1e-9, coverage(hl))
            if inside < 0.6:
                return finish(ImageChops.lighter(land, hl)), "overlays+highlight"
        return finish(land, close=FEATHER), "overlays"
    if hl is not None:
        return finish(hl), "highlight"
    return None


def carry(piece: Image.Image, from_rect, to_rect, size: tuple[int, int]) -> Image.Image:
    """A mask-space image of one map -> mask space of another (both rects in one parent space)."""
    fw, fh = piece.size
    tw, th = size
    fx0, fy0, fx1, fy1 = from_rect
    tx0, ty0, tx1, ty1 = to_rect
    a = (tx1 - tx0) / tw / (fx1 - fx0) * fw
    c = (tx0 - fx0) / (fx1 - fx0) * fw
    e = (ty1 - ty0) / th / (fy1 - fy0) * fh
    f = (ty0 - fy0) / (fy1 - fy0) * fh
    return piece.transform(size, Image.AFFINE, (a, 0, c, 0, e, f), resample=Image.BILINEAR)


def footprint(spec, rect, area_ids, neighbours) -> Image.Image | None:
    """Overlays of the same area on the parent or a sibling, carried into this map's space.

    neighbours: [(rect of that map in the same parent space, its overlay pieces)].
    """
    wanted = set(area_ids) - {0}
    if not wanted or not rect:
        return None
    size = mask_size(spec.width, spec.height)
    parts = []
    for other_rect, pieces in neighbours:
        for areas, piece in pieces:
            if wanted & set(areas):
                parts.append(binary(carry(piece, other_rect, rect, size)))
    shape = union(parts)
    if shape is None or coverage(shape) < 0.02:
        return None
    return finish(shape, close=FEATHER)


def rounded_rect(size: tuple[int, int]) -> Image.Image:
    w, h = size
    inset = max(2, round(min(w, h) * 0.06))
    shape = Image.new("L", size, 0)
    ImageDraw.Draw(shape).rounded_rectangle((inset, inset, w - 1 - inset, h - 1 - inset), radius=inset * 2, fill=255)
    return shape.filter(ImageFilter.GaussianBlur(inset * 0.8))


def save_mask(mask: Image.Image, path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    mask.convert("L").save(path, "WEBP", quality=70, method=6)
    return path.stat().st_size


# -- whole trees ---------------------------------------------------------------


def _load_inputs(job):
    """Worker: (key, spec, refs) -> (key, overlay pieces, highlight image)."""
    from art import load_highlight, load_overlays

    key, spec, refs = job
    pieces = overlay_pieces(spec, load_overlays(refs, spec, workers=4)) if spec.overlays else []
    return key, pieces, load_highlight(refs, spec)


def tree_masks(entries: dict, refs: dict, workers: int = 6) -> dict:
    """Masks of a set of maps that may borrow each other's overlays.

    entries: key -> {"spec": ArtSpec, "rect": rectInParent | None, "parent": key | None,
    "areas": AreaIDs of the map}.  refs: FileDataID -> FileRef.
    Returns key -> (mask image, method).
    """
    from concurrent.futures import ProcessPoolExecutor

    jobs = []
    for key, entry in entries.items():
        spec = entry["spec"]
        need = {f for *_, tiles in spec.overlays for f in tiles.values()}
        if spec.highlight:
            need.add(spec.highlight[1])
        jobs.append((key, spec, {f: refs[f] for f in need if f in refs}))
    loaded = {}
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for key, pieces, highlight in pool.map(_load_inputs, jobs, chunksize=4):
            loaded[key] = (pieces, highlight)
    by_parent: dict = {}
    for key, entry in entries.items():
        by_parent.setdefault(entry["parent"], []).append(key)
    out = {}
    for key, entry in entries.items():
        spec = entry["spec"]
        pieces, highlight = loaded[key]
        result = own_mask(spec, pieces, highlight)
        if result is None and entry["rect"]:
            neighbours = []
            parent = entry["parent"]
            if parent in loaded:
                neighbours.append(((0.0, 0.0, 1.0, 1.0), loaded[parent][0]))
            for sibling in by_parent.get(parent, []):
                if sibling != key and entries[sibling]["rect"]:
                    neighbours.append((entries[sibling]["rect"], loaded[sibling][0]))
            shape = footprint(spec, entry["rect"], entry["areas"], neighbours)
            if shape is not None:
                result = (shape, "footprint")
        out[key] = result or (rounded_rect(mask_size(spec.width, spec.height)), "edge")
    return out
