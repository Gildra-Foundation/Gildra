# World map terrain — deep zoom from the minimap

Generator: `apps/web/scripts/world-map/terrain.py` → `public/maps/terrain/<id>/`
and `data/wow/map/terrain-manifest.json` (merged into maps.json as `terrain` by
`build_world_map.py`).

* Source: the continent's `Map.WdtFileDataID` → WDT `MAID` chunk → for each of
  the 64×64 terrain blocks (533⅓ yards) the FileDataID of its minimap texture
  (512×512 BLP, the top-down picture of the in-game minimap). Only blocks that
  overlap the continent map's world box (primary `UiMapAssignment`) are used.
* Pyramid: 256 px WebP tiles (q85 native, q80 coarse); the deepest level keeps
  the client texture resolution (256/512/1024 px per block). Every coarse level
  is an area average of native pixels. Open sea has
  no block and no tile; `index.json` lists the tiles that exist per level.
* Placement: block (x, y) covers world X ∈ [(31−y)·S, (32−y)·S] (north) and
  Y ∈ [(31−x)·S, (32−x)·S] (west), S = 533⅓; the corners of the stitched
  picture go through the continent's assignment row (`world_to_ui`) into the
  continent's normalized space → `rect` (may exceed 0..1).
* Continents on one MapID share one pyramid (Quel'Thalas of Midnight, 2537,
  uses the Eastern Kingdoms' `/maps/terrain/13`, with its own rect).
* Checked by overlaying the terrain on the continent art (`/tmp/mapd2/c/terrain-*.jpg`):
  Southfury River and Orgrimmar on Kalimdor, Stormwind's canals on the Eastern
  Kingdoms.

`terrain: {url, index, tileSize, width, height, maxZoom, rect}` — width/height
are the deepest level's pixels.

## Native terrain expansion (2026-11-09)

`terrain.py --product <product> --prefix <namespace> --manifest <file>
--listfile /tmp/mapd2/work/listfile.csv --work /tmp/mapd2/work --maps <ids>`
can read Classic-family builds as well. Classic `Map` has no WdtFileDataID:
the community listfile supplies only the FileDataID for
`world/maps/<Directory>/<Directory>.wdt`; **all pixels still come from that
product's own TACT/CASC files**. WDT MAID supplies the minimap IDs as in retail.
No community renders are used.

All readable minimaps are inspected before encoding. The largest source
determines native block resolution (usually 256 in Classic, 512 in retail;
5.5 Pandaria also has 1024 px blocks). The finest sources remain texel-exact;
the initial MAPD3 generation used nearest sampling on that shared grid and
q70 deep/q80 coarse. MAPD4 below replaces it with bilinear mixed-source
reconstruction and q85 native encoding. A union of the
requested UiMapAssignment world boxes selects the blocks when several zones
share one MapID (Shadowlands zones, Argus, Outland with the TBC islands).
Each UiMap gets its own rect through its own assignment; the shared pyramid
is never positioned using another zone's rectangle.

Optional backward compatible fields:

```json
{
  "terrain": {
    "url": "/maps/terrain/classic/1414/{z}/{x}_{y}.webp",
    "index": "/maps/terrain/classic/1414/index.json",
    "empty": "/maps/terrain/classic/1414/empty.json",
    "ocean": "#163747",
    "tileSize": 256,
    "width": 7680,
    "height": 11520,
    "maxZoom": 6,
    "rect": [0.275362, 0.021735, 0.710147, 1.000001]
  }
}
```

`index.json` remains a level → array of `x_y` keys for existing files.
`empty.json` is the disjoint complement within the rectangular level extent:
`ceil(width / 256 / 2^(maxZoom-z))` by the analogous height. These tiles
must never be fetched. Missing blocks and completely transparent source
images are omitted. Partial source alpha is retained. `ocean` supplies a
background under sparse terrain; absence preserves the previous rendering.
Terrain is also allowed on zones whose instance differs from their parent.

`publish_terrain.py --work /tmp/mapd2/work` runs after the terrain and era
builders. It projects source terrain through world coordinates into each
era's assignment, so Classic and TBC Eastern Kingdoms can have different
frames without changing the terrain. The early three eras use 1.15.9.70576
Kalimdor/Eastern Kingdoms, TBC uses 2.5.6.70577 Outland/islands and Wrath uses
3.80.2.70522 Northrend. Cataclysm–Legion use 5.5.4 terrain for the old world
(the available post-Cataclysm client); this is a documented substitute,
not an assertion that 5.5 exactly reconstructs 4.x. Later new continents
use the available 12.1.5 build. `terrain-*.json` record actual build and sizes.

An era override may set `terrain: null` to clear inherited modern terrain.
Phase-specific minimaps are not present as separate WDT MAID textures;
phase art overrides explicitly clear their direct terrain rather than
claiming a phase-correct reconstruction. The engine must respect this cap
when considering an ancestor terrain beneath a phased zone.

Verification: `test_terrain.py` checks MAID axes, disjoint same-instance
coverage, preserved native texels, ocean holes and era coordinate projection;
`tests/atlas/worldMapTerrain.test.ts` checks actual sparse tile completeness,
era sources and separate-instance coverage. Generated size/coverage report:
`docs/world-map/TERRAIN-COVERAGE.md`.

After publishing, `terrain_metadata.py` adds the same sparse complement to
previously shipped pyramids and enforces both the 1,000,000,000-byte logical
asset safeguard and the owner’s 1,100,000,000-byte on-disk budget. It also
rejects unfinished `.native` intermediates.
Ocean tone is the most frequent quantized blue pixel of the painted map's
level-zero tile (B > 1.15R and B ≥ 0.95G, 8-step RGB bins); maps without a
blue sea retain `#163747`. This is a blending hint, not a re-colouring of the
game's minimap textures. Byte sizes are logical file sizes; filesystem usage
is reported separately because these thousands of small files use blocks.

Current CDN geometry was checked against the cached DB2 tables for all five
products: primary assignment rows and WDT FileDataIDs have zero differences.
The retail source for this generation is **12.1.5.70783**, Mists is
**5.5.4.70631**; Classic/TBC/Wrath versions above are unchanged. MAPD4 now regenerates every pyramid from these verified clients. Source
namespaces and actual builds are listed in TERRAIN-COVERAGE.md.

## MAPD4 — native reconstruction and bilingual terrain labels (2026-11-09)

The new generation encodes deepest tiles at **WebP q85**, coarse tiles at q80.
Every coarse level is a BOX/area average of the **native lossless pixels**,
not a decoded WebP or the previous pyramid level. The complete native image
is decoded once; area sampling over it avoids independent filter edges at
256 px boundaries. Mixed-resolution blocks use bilinear reconstruction on
the finest native grid rather than nearest-neighbour pixel replication.
This adds no synthetic terrain detail. The temporary `.native` PNG directory
is removed after each pyramid; downloaded minimap BLPs are removed between
shared instances by the generation runner.

The dot/checker pattern near Ashenvale/Orgrimmar exists in the original
512 px DXT BLP itself. Source block (38,28), retail MapID 1, was decoded
without WebP and visually checked. Adjacent native ADTs have real texture
changes (mean RGB edge delta 6.46 horizontal / 5.68 vertical on the checked
four-block sample). No pixels are duplicated as gutters or deleted at edges.
A q70→q85 comparison on that native sample improved PSNR 33.38→35.95 dB;
compression-induced boundary error MAE decreased 7.06→5.10 RGB levels.
Lossless WebP was 289,526 bytes, WebP q85 51,520 and AVIF q85 71,063 for the
512 px sample. Chromium createImageBitmap decoded the AVIF smoke sample at 512×512; the
engine uses that same generic URL/bitmap path. This generation keeps WebP,
whose tested q85 result is smaller.
The benchmark is sample-specific, not a guarantee that all native ADT seams
vanish: the client's own DXT texture discontinuities remain.

`test_terrain.py` checks a continuous generated source across ADT/256 px
boundaries, opaque alpha, and sampled horizontal/vertical neighbours in the
actual Kalimdor package. The real-data tolerance compares the edge delta
against the neighbouring texture gradients, not equality of different
texels; duplicated borders would shift the world grid.

`painted-label-text.json` records verified `{en,ru}` text anchored by client
picture URL, label index and exact normalized box. Source names come from
AreaTable and WMOAreaTable in the TACT/CASC client files. Zone sub-areas use
WorldMapOverlay hit boxes; texture-bounds matches also require strong OCR
agreement. Capitals and a zone sample were manually compared with client
art; current and historical capital layouts are reviewed separately.
No automatic nearest-name guesses are published for unresolved boxes.

Run `label_text.py` **after** annotate.py, labels.py and mask refinements.
It rejects missing/moved boxes rather than attaching names to changed
artwork. The registry's source metadata is build documentation; only `text`
is copied into runtime art. `test_label_text.py` checks both languages in
capitals, exact Dornogal names and registry agreement across every era.
Unresolved boxes and overall coverage are reported in TERRAIN-COVERAGE.md.

Asset URLs are retained. The application caches `/maps/*` for 24 hours plus
stale revalidation. An authorized release must purge updated terrain URLs
or version them; this data task performs neither cache purges nor deployment.

Every detected word region now has text. Reviewed non-word regions retain
`kind: "ornament"` and no invented text. When annotation merged adjoining
words into one region, `text` joins the actual place names with a middle dot;
the existing region geometry is retained.
