# World map terrain — deep zoom from the minimap

Generator: `apps/web/scripts/world-map/terrain.py` → `public/maps/terrain/<id>/`
and `data/wow/map/terrain-manifest.json` (merged into maps.json as `terrain` by
`build_world_map.py`).

* Source: the continent's `Map.WdtFileDataID` → WDT `MAID` chunk → for each of
  the 64×64 terrain blocks (533⅓ yards) the FileDataID of its minimap texture
  (512×512 BLP, the top-down picture of the in-game minimap). Only blocks that
  overlap the continent map's world box (primary `UiMapAssignment`) are used.
* Pyramid: 256 px WebP tiles (quality 72); the deepest level keeps 512 px per
  block (≈ 1 yard per pixel); each level above merges 2×2 tiles. Open sea has
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
smaller sources use nearest sampling on that shared grid, adding no detail. Deep tiles use q70, coarser levels q80. A union of the
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
previously shipped pyramids and enforces the 1,000,000,000-byte asset budget.
Ocean tone is the most frequent quantized blue pixel of the painted map's
level-zero tile (B > 1.15R and B ≥ 0.95G, 8-step RGB bins); maps without a
blue sea retain `#163747`. This is a blending hint, not a re-colouring of the
game's minimap textures. Byte sizes are logical file sizes; filesystem usage
is reported separately because these thousands of small files use blocks.

Current CDN geometry was checked against the cached DB2 tables for all five
products: primary assignment rows and WDT FileDataIDs have zero differences.
The retail source for this generation is **12.1.5.70783**, Mists is
**5.5.4.70631**; Classic/TBC/Wrath versions above are unchanged. The original
ten retail continent pyramids remain from their previously recorded build;
only the new pyramids use the new source. Source namespaces and actual builds
are listed in TERRAIN-COVERAGE.md.
