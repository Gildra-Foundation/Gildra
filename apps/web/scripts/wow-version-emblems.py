"""Emblems of the game versions in the site's top strip, cut from the game files.

    python -I scripts/wow-version-emblems.py <cache-dir>

Reads interface/shop/catalogshopproductlogos2x.blp (FileDataID 7312237, the
shop's product logos) from the live client over TACT (scripts/world-map/tact.py)
and writes public/assets/wow/versions/{retail,forever,mists}.png:

- retail:  the yellow World of Warcraft medallion;
- forever: the Forever medallion with the infinity W;
- mists:   the Classic medallion recoloured in the jade of Mists of Pandaria
           Classic's own icon (interface/glues/common/wow_mists_of_pandaria_classic_icon_01.blp,
           FileDataID 7118961, product wow_classic), so the three read as one set.

The atlas bakes a black drop shadow under each medallion; it is removed.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "world-map"))
from tact import TactClient  # noqa: E402

OUT = HERE.parent / "public" / "assets" / "wow" / "versions"
SIZE = 48  # 18-20 px in the strip, sharp at DPR 2+
ATLAS = 7312237
# Medallion boxes in the 2048² atlas (left, top, right, bottom), before trimming.
BOXES = {"retail": (1400, 120, 1800, 520), "forever": (740, 90, 1180, 560), "classic": (100, 110, 540, 540)}
# The Classic medallion's two colours and the jade/ink of the Mists of Pandaria Classic icon.
CLASSIC_BRIGHT, CLASSIC_DARK = (0, 176, 228), (18, 26, 50)
MISTS_BRIGHT, MISTS_DARK = (76, 188, 124), (4, 22, 20)


def read_blp(data: bytes) -> Image.Image:
    _, _, encoding, _, _, _, width, height = struct.unpack_from("<4sIBBBBII", data, 0)
    offset = struct.unpack_from("<16I", data, 20)[0]
    if encoding != 3:  # the shop atlas is stored as plain BGRA
        raise ValueError(f"unexpected BLP encoding {encoding}")
    return Image.frombytes("RGBA", (width, height), data[offset:offset + width * height * 4], "raw", "BGRA")


def without_shadow(image: Image.Image) -> Image.Image:
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if max(pixels[x, y][:3]) < 14:
                pixels[x, y] = (0, 0, 0, 0)
    return image.crop(image.getbbox())


def classic_medallion(image: Image.Image) -> Image.Image:
    """The medallion without its CLASSIC caption and trademark sign."""
    alpha = image.split()[3].point(lambda value: 255 if value > 8 else 0)
    rows = [y for y in range(image.height) if alpha.crop((0, y, image.width, y + 1)).getbbox()]
    bottom = next(rows[i] + 1 for i in range(len(rows) - 1) if rows[i + 1] - rows[i] > 3)
    medallion = image.crop((0, 0, image.width, bottom))
    # Keep only the shape connected to the centre: the trademark sign floats beside it.
    mask = medallion.split()[3].load()
    width, height = medallion.size
    seen = {(width // 2, height // 2)}
    stack = list(seen)
    while stack:
        x, y = stack.pop()
        for near in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if near not in seen and 0 <= near[0] < width and 0 <= near[1] < height and mask[near] > 8:
                seen.add(near)
                stack.append(near)
    pixels = medallion.load()
    for y in range(height):
        for x in range(width):
            if (x, y) not in seen:
                pixels[x, y] = (0, 0, 0, 0)
    return medallion.crop(medallion.getbbox())


def recolour(image: Image.Image) -> Image.Image:
    span = [b - d for b, d in zip(CLASSIC_BRIGHT, CLASSIC_DARK)]
    norm = sum(s * s for s in span)
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if not a:
                continue
            t = sum((c - d) * s for c, d, s in zip((r, g, b), CLASSIC_DARK, span)) / norm
            t = min(1.0, max(0.0, t))
            pixels[x, y] = (*(round(d + (bright - d) * t) for bright, d in zip(MISTS_BRIGHT, MISTS_DARK)), a)
    return image


def square(image: Image.Image) -> Image.Image:
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    cache = Path(sys.argv[1])
    client = TactClient("wow", cache / "wow", index_dir=cache / "wow" / "indexes", cdn_region="us")
    atlas = read_blp(client.read_fdid(ATLAS))
    OUT.mkdir(parents=True, exist_ok=True)
    cut = {name: without_shadow(atlas.crop(box)) for name, box in BOXES.items()}
    emblems = {
        "retail": cut["retail"],
        "forever": cut["forever"],
        "mists": recolour(classic_medallion(cut["classic"])),
    }
    for name, image in emblems.items():
        square(image).save(OUT / f"{name}.png", optimize=True)
        print(name, client.build_id, (OUT / f"{name}.png").stat().st_size)


if __name__ == "__main__":
    main()
