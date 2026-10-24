# Current-season dungeon maps and route data

Verified on 2026-10-19 against Mythic Dungeon Tools revision
`2a2df3bb28471ec9900942f1856215f85fdefe31`:
https://github.com/Nnoggie/MythicDungeonTools/tree/2a2df3bb28471ec9900942f1856215f85fdefe31/Midnight

These are Blizzard game-map tiles distributed with MDT, assembled in their original
15-column, 10-row order. Each 128×128 tile is placed unchanged, then the whole image
is resized to 1260×840 and encoded as WebP. All eight use MDT's complete composite
map, including both Ruby Life Pools areas. Coordinates use MDT's 840×560 canvas,
with the vertical axis inverted for browser percentages.

Map artwork belongs to Blizzard Entertainment. MDT is distributed under GPL-2.0:
https://github.com/Nnoggie/MythicDungeonTools/blob/2a2df3bb28471ec9900942f1856215f85fdefe31/LICENSE

Route references, author versions, NPC identities, clone indices, per-NPC counts
and adjustments are recorded in `components/wow/mythic/mvpRoutes.json`.
Routes originate from Tactyks's public PUG-friendly Midnight Season 2 imports on
Wago, linked by the author's Method guides. No in-game run is claimed by this check.

Current-map adjustments: include newly mapped members of selected packs; remove
two obsolete Temple clone references. Temple also takes Shrouded Fang clone 11
(NPC index 5) near the entrance as a separate pull, bringing its count to 687/687.
Other routes also reach their current MDT required count without invented forces.
