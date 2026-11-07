# World map masks — a map's own area

Generator: `apps/web/scripts/world-map/masks.py` (called by
`build_world_map.py` for today's maps and by `eras.py` for era pictures).

The viewer nests a child's picture into its parent at `rectInParent`. Every
picture is a full 1002×668 or 3840×2560 rectangle that also paints the
surroundings (sea, neighbouring zones in muted colours, the frame), so drawn
as is it shows hard rectangle edges and colour jumps. A mask keeps only the
child's own land: white = this map, black = what the parent (or a sibling)
shows.

## Sources (all from the game's own data)

1. **overlays** — `WorldMapOverlay` + `WorldMapOverlayTile`: the "explored
   area" textures of each sub-area, positioned in the picture's own pixels
   (`OffsetX/Y`, `TextureWidth/Height`). Their alpha union is the zone's land.
   Overlays covering ≥ 85 % of the picture are whole-picture repaints (phases),
   not sub-areas, and are ignored.
2. **highlight** — `UiMapArt.HighlightFileDataID` (or `HighlightAtlasID` →
   `UiTextureAtlasMember` region of a `UiTextureAtlas` file): the shape the
   parent lights up under the cursor. The texture spans the child's whole rect
   on the parent (checked against Durotar, the Barrens, Ashenvale, Azshara on
   the 1.15 and 12.x Kalimdor and all continents on Azeroth), so it is already
   in the child's picture space. Old zones have soft blobs; continents have an
   outline, which is closed and filled at the texture's own resolution. A
   highlight that is empty or covers > 90 % of the rect is no shape.
   Both 1 and 2: when the overlays cover < 60 % of the highlight, their union.
3. **footprint** — cities without either (Orgrimmar, Stormwind, Thunder Bluff,
   Darnassus, Silvermoon, the Exodar…): the overlay of the same area
   (`WorldMapOverlay.AreaID` = the city's AreaID) on the parent or a sibling
   zone (the "Orgrimmar" overlay of Durotar), carried into the city's space
   through both rects.
4. **edge** — maps with nothing of the above (caves, scenario and phased
   maps): a rounded rect with a soft 6 % edge, so the rectangle never shows.

## Processing

Binary shape at mask size → close (3 px; overlays: 10 px) → fill holes →
grow by half the feather → Gaussian blur (feather 10 px) → fade to 0 over the
last 10 px of the picture's border. Stored as WebP (grey, quality 70) at most
512 px wide with the picture's aspect: `/maps/masks/<owner>.webp` (maps that
share a picture share its mask) and `/maps/masks/era/<era>/<key>.webp`.
`art-manifest.json` records the method and size of each.

## Checks

`validate_eras.py` (mask files exist, aspect matches the art, capitals lie on
their zone's mask) and composites (`composite.py --map 12 --depth 1`).
