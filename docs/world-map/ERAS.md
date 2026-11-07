# World map eras — how each era is built

Generator: `apps/web/scripts/world-map/eras.py` (after `build_world_map.py`), check:
`apps/web/scripts/world-map/validate_eras.py` (composites in `/tmp/mapd2/eras`).

## What the CDN still serves

Blizzard's patch service and CDN keep **only the current build** of each
product. Every older build config listed by wago.tools (7.3.5 … 11.2.7 retail,
4.4.2 Cataclysm Classic, 1.14 Classic Era …) answers 404 on
`us.cdn.blizzard.com` and `level3.blizzard.com` (checked 2026-11-07). The
clients available are:

| product | build | era it shows |
|---|---|---|
| `wow_classic_era` | 1.15.9 | vanilla (pre-Cataclysm Azeroth, no Outland) |
| `wow_anniversary` | 2.5.6 | The Burning Crusade |
| `wow_classic_titan` (region cn, files on the US CDN) | 3.80.2 | Wrath of the Lich King |
| `wow_classic` | 5.5.4 | Mists of Pandaria (post-Cataclysm world) |
| `wow` | 12.1.5 | today (old world in its pre-Battle-for-Azeroth phase 0, later phases as UiMapXMapArt.PhaseID) |

The community listfile shows one set of FileDataIDs per world-map picture
(e.g. `interface/worldmap/azeroth/azeroth1..12.blp`), whose content each client
replaces; no client keeps an older Azeroth picture next to its own.

## Eras

Every era is a full, self-consistent tree: each map's art, mask, parent, rect
and children come from the same client, so a child always sits on the parent
picture it was placed on.

| era (art id) | patches | tree | Azeroth picture | Cosmic picture |
|---|---|---|---|---|
| classic | 1.0–1.12 | 1.15 client | 1.15 | — (root = Azeroth) |
| burning-crusade | 2.0–2.4 | 2.5 client | 2.5 | 2.5 |
| wrath-of-the-lich-king | 3.0–3.3 | 3.80 client | 3.80 | 3.80 |
| cataclysm | 4.0–4.3 | 5.5 client without Mists content (Map.ExpansionID ≥ 4: Pandaria, the Wandering Isle…) | **3.80** (the 5.5 picture paints Pandaria) | 5.5 |
| cataclysm-pandaria | 5.0–5.4 | 5.5 client, Vale before the Siege | 5.5 | 5.5 |
| warlords-of-draenor | 6.0–6.2 | 5.5 client (Vale corrupted, Theramore in ruins) + Draenor of 12.x as its own world | 5.5 | 5.5 |
| legion | 7.0–7.3 | as WoD + Broken Isles and Argus of 12.x | 5.5 + Broken Isles | 5.5 |
| battle-for-azeroth | 8.0–8.3 | 12.x without later content, BfA phases | **5.5** | **5.5** |
| shadowlands | 9.0–9.2 | 12.x without later content | **5.5** | 12.x |
| dragonflight | 10.0–10.2 | 12.x without later content | **5.5** | 12.x |
| the-war-within | 11.0–11.2 | 12.x without Midnight content | 12.x | 12.x |
| midnight | 12.0– | 12.x | 12.x | 12.x |

Bold = the era's own picture is not available, so the nearest **older real**
picture is used (never a later one, never a painted one); `eras.json`
records each such case under `substitutes` with how its children were placed.

* "without later content": maps whose primary assignment's MapID has
  `Map.ExpansionID` above the era's, plus Quel'Thalas of Midnight (2537 and its
  children) before 12.0; their descendants go too.
* Phases from Battle for Azeroth on: Silithus (the Wound, PhaseID 9491),
  Tirisfal (blight, 11519), Darkshore (after the War of the Thorns, 12608).

## Placing children on a borrowed picture

When an era shows a picture of another client (Azeroth 3.80 in Cataclysm,
Azeroth 5.5 in BfA–Dragonflight, Cosmic 5.5 in BfA), its children are re-placed:

1. **source** — the same child picture exists in that client: its rect there;
2. **world** — the child's world box (primary UiMapAssignment) mapped through
   that client's assignment rows of the parent for the same MapID (exact:
   continents are placed linearly by world coordinates);
3. **link** — that client's UiMapLink rect for the same child;
4. **fit** — maps the older picture has no data for (Maelstrom on 3.80, Broken
   Isles / Zandalar / Kul Tiras / Dragon Isles on 5.5): a per-axis least-squares
   fit of the shared continents' old rects onto their new ones (RMS in
   `substitutes`);
5. worlds on the Cosmic map with no place in the older picture (Draenor, Argus
   before Shadowlands) become their own top-level worlds.

## Output (eras.json)

`maps[id]` is `"unchanged"` (exactly the maps.json node: art, mask, rect,
parent, children), an override `{art, mask?, rectInParent, parentId, children,
name?}` (era-only maps also `id, slug, type`), or `{"absent": true, "art": null}`
for maps of maps.json with art that did not exist then. Variants (`inherits`)
list only the phased maps `{art, mask?}`. Every main era but midnight has
`pois` (its client's flight/portal/instance points; labels and capitals
re-derived from its rects).

## Validation (validate_eras.py)

(a) child rects mostly inside the parent art; (b) landmark maps absent before
their expansion and present from it on, Azeroth/Cosmic pictures not from a
later era; (c) classic–wrath capitals (Orgrimmar, Thunder Bluff, Undercity,
Stormwind, Ironforge) on the land of their zone's mask and their flight master
inside the city rect; (d) masks exist with the art's aspect. Composites of
each era's root, Azeroth, Kalimdor and the Eastern Kingdoms are rendered for a
visual check.
