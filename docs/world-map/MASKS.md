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
   through both rects. When that picture ends inside the city (vanilla
   Durotar stops at Orgrimmar's gate, so its overlay is cut there), the
   soft-edged rect of 4 is added so the city stays whole.
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

## Second pass (refine_masks.py)

Run after `eras.py` (pipeline: build_world_map → eras → refine_masks → annotate):

* **content** — parchment pictures (≤ 1100 px: old capitals, caves, scenario
  maps) whose first-pass mask was only a borrowed footprint or the soft rect:
  the drawing on the sheet. Sheet colour = median of the inner border band;
  score = 0.6 · Lab colour distance from the sheet + 0.4 · line detail (Sobel),
  thresholded by Otsu over the inner picture; closed, small regions and corner
  crests (faction emblem) dropped, holes filled. Classic Orgrimmar, Undercity,
  Thunder Bluff, Darnassus, Ironforge and Stormwind now keep their streets and
  drop the sheet, frame and emblem.
* **children** — continents and worlds: union of their zones' (and
  continents') masks carried through each child's rect, grown by a round 2 %
  coastal margin. The hover highlights of continents are outlines drawn for an
  older parent picture (the Eastern Kingdoms one missed the south) and the
  world's is the Cosmic globe ring — neither is the map's land.

## Round 5: words, decor, composition (refine_masks.py)

Pipeline: build_world_map → eras → annotate → **refine_masks** (run it on the
first-pass masks; it recomputes content/children masks and composes the rest).

* **Whose word** (`art.paintedLabels[] = {box, plaque, labelFor, patch?}`): the
  enUS/ruRU difference boxes, pieces of one banner joined into lines. Parchment
  pictures (cities, caves) paint only their own words. On zone pictures a word
  inside a small sibling's rect (a city), or a word painted larger than the
  picture's typical name and near a city (within 1.6 city sizes), is the city's;
  a word on this map's land (mask) is this map's or its smallest child's; on a
  sibling's land the sibling's; elsewhere (sea, surroundings) the parent's.
  `plaque` = the word with its banner/scroll (banners: 1.6 heights each side).
* **patch**: for words of another map, `/maps/patches/<picture>/<i>.webp` — the
  plaque refilled from the picture itself (the bands just above and below,
  mirrored and cross-faded; side bands for short words; one band at the
  picture's edge). A source band is used only if it holds no other word and is
  the same in the enUS and ruRU pictures (painted words differ), so no word is
  ever copied. Draw the patch over the parent picture at `plaque` when
  `labelFor` is the focused map; without a patch let the word give way.
* **decor** (`art.decor[] = {box, kind}`): `ornament` — the frame corners and
  knots the pictures of one size share (per-pixel median of the family; present
  where the picture matches it); `crest` — faction crests of city sheets (sepia
  line art without colour in a corner). Both are cut out of the masks.
* **Composition** of zone/city masks: ragged inward fade over 6 % of the short
  side at the picture's border (no straight line where a drawing runs into the
  sheet's edge); decor and crests cut out; the map's own words kept whole as soft
  clouds (zones: only words at least partly on their land). Phased pictures
  (Theramore 5.0.4, Silithus, Tirisfal, Darkshore, Vale, Krasarang, Blasted
  Lands, Arathi) take the land of their default picture — a phase repaints part
  of a zone, not its outline.

## Round 6: one map per place, neighbours, ancestor lettering

Pipeline: build_world_map → eras → annotate → refine_masks → **labels → places →
neighbours** → validate_eras (`--overlaps`).

* **labels.py** — continent, world and Cosmic pictures: the tallest word
  (clearly taller than the rest) is the map's own title (`kind: "title"`,
  `labelFor` = the map); every other word belongs to the child whose rect holds
  it and whose centre it is closest to (`kind: "place"`). On zone pictures the
  city rules of refine_masks.py now apply to real cities only (CITIES), not to
  any small neighbour. Every word of a continent/world/Cosmic picture has a
  `patch`, so the engine can remove an ancestor's lettering around the focused
  map without opening a hole.
* **places.py** — maps of one place (see its docstring): floors, 8.3 assault
  phases, Midnight successors, alternates (mask of one inside the other's,
  > 90 %), aggregates. Node fields `samePlaceAs`, `placeRole`, `activeFrom`,
  `activeTo`, `parts`; per era `inactive` = maps another map of the same place
  stands for at the era's start.
* **neighbours.py** — sibling masks claiming the same land (> 2 % of the smaller,
  same-place pairs and a city inside its zone excepted) are split along the line
  of equal depth; a city gives way wherever another zone claims land. Report
  before/after: `/tmp/mapd6/neighbours-before.json`, `/tmp/mapd6/neighbours.json`.

Lettering the enUS/ruRU difference cannot see (words the ruRU client paints the
same, digits) is not detected yet: no stroke/plaque detector is implemented —
mountain and coast hatching are painted with the same strokes as letters, so a
detector needs its own validation round.

Pages QA4 listed as PARENT-TEXT / DUPLICATE-PLACE are checked by
`/tmp/mapd6/qa4-coverage.txt` (ancestors' words with patches; place roles).
A picture that is the parent of a drawn zone or city gets a patch for every one
of its words (`patchKind` "stamp", or "blur" where no wordless band exists).
