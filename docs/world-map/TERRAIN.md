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
